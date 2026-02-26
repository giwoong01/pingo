import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface AiReport {
  title?: string;
  summary?: string;
  probable_causes?: string[];
  probable_causes_detail?: AiFinding[];
  next_checks?: string[];
  next_checks_detail?: AiFinding[];
  mitigations?: string[];
  mitigations_detail?: AiFinding[];
  evidence?: AiEvidence[];
  quality?: {
    source: 'llm' | 'fallback';
    reasons: string[];
  };
  confidence?: number;
  raw?: any;
}

interface AiFinding {
  text: string;
  evidence_ids?: string[];
  expected_outcome?: string;
  runbook_step?: string;
}

interface AiEvidence {
  id: string;
  label?: string;
  value?: number | null;
  expr?: string;
  reason?: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly providerFailureState = new Map<string, { fails: number; backoffUntil: number }>();

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  async analyzeAlert(context: any): Promise<AiReport | null> {
    const provider = (this.config.get<string>('AI_PROVIDER', 'none') || 'none').toLowerCase();
    if (provider === 'none') return null;

    let raw: any | null = null;
    let providerFailureReason: string | null = null;
    if (provider === 'ollama') {
      const result = await this.analyzeWithOllama(context);
      raw = result.raw;
      providerFailureReason = result.failureReason;
      return this.normalizeReport(raw, context, 'ollama', providerFailureReason || undefined);
    }
    if (provider === 'openai') {
      const result = await this.analyzeWithOpenAi(context);
      raw = result.raw;
      providerFailureReason = result.failureReason;
      return this.normalizeReport(raw, context, 'openai', providerFailureReason || undefined);
    }

    this.logger.warn(`Unknown AI_PROVIDER=${provider}; skipping AI analysis.`);
    return null;
  }

  private buildPrompt(context: any): { system: string; user: string } {
    const evidenceCatalog = this.buildEvidenceCatalog(context);
    const system =
      '당신은 온콜 SRE 어시스턴트입니다. 반드시 JSON만 출력하세요. ' +
      '허용 키: title, summary, probable_causes, next_checks, mitigations, evidence, confidence. ' +
      '모든 설명은 한국어만 사용하세요(중국어/영어 문장 금지). ' +
      '일반론 금지: 모든 원인/점검/조치는 evidence id를 최소 1개 이상 참조해야 합니다. ' +
      'probable_causes/next_checks/mitigations는 문자열 배열 또는 {text,evidence_ids[]} 객체 배열 허용. ' +
      'evidence는 [{id,reason}] 배열이어야 하며 id는 제공된 evidence_catalog의 키만 사용하세요. ' +
      'confidence는 0~1 사이 숫자입니다. 마크다운/코드펜스/추가 텍스트를 출력하지 마세요.';

    const user = JSON.stringify({
      app: context?.app,
      rule: context?.rule,
      firedAt: context?.firedAt,
      firingSince: context?.firingSince,
      snapshot: {
        primary: context?.snapshot?.primary ?? null,
        evidence: evidenceCatalog,
      },
      output_contract: {
        probable_causes_example: [{ text: 'heap_ratio가 임계치를 초과했습니다', evidence_ids: ['heap_ratio'] }],
        next_checks_example: [{ text: 'heap_ratio 추세를 60분 범위로 확인하세요', evidence_ids: ['heap_ratio'] }],
        mitigations_example: [{ text: '힙 덤프를 수집해 상위 객체를 분석하세요', evidence_ids: ['heap_ratio'] }],
        evidence_example: [{ id: 'heap_ratio', reason: '현재 비율이 높음' }],
      },
    });
    return { system, user };
  }

  private buildOllamaPrompt(context: any): { system: string; user: string } {
    const appName = String(context?.app?.name || 'unknown');
    const job = String(context?.app?.job || '-');
    const ruleName = String(context?.rule?.name || 'rule');
    const kind = String(context?.rule?.kind || 'CUSTOM');
    const severity = String(context?.rule?.severity || 'MEDIUM');
    const primaryVal = Number(context?.snapshot?.primary?.value);
    const primaryValue = Number.isFinite(primaryVal) ? String(primaryVal) : '-';
    const primaryExpr = String(context?.snapshot?.primary?.expr || '').slice(0, 220);
    const evidenceCatalog = this.buildEvidenceCatalog(context);
    const evidenceLines = Object.entries(evidenceCatalog)
      .slice(0, 6)
      .map(([id, ev]) => {
        const v = Number(ev?.value);
        const value = Number.isFinite(v) ? String(v) : '-';
        return `${id}=${value}`;
      })
      .join(', ');

    const system =
      '온콜 SRE 어시스턴트입니다. 한국어 JSON 객체만 출력하세요. ' +
      '키는 title, summary, probable_causes, next_checks, mitigations, confidence만 사용하세요. ' +
      'probable_causes/next_checks/mitigations는 문자열 배열(각 1~3개)로만 출력하세요. ' +
      '입력 JSON을 그대로 복사하지 마세요.';
    const user =
      `app=${appName} job=${job}\n` +
      `rule=${ruleName} kind=${kind} severity=${severity}\n` +
      `primary_value=${primaryValue}\n` +
      `primary_expr=${primaryExpr}\n` +
      `evidence=${evidenceLines}`;
    return { system, user };
  }

  private async analyzeWithOllama(context: any): Promise<{ raw: any | null; failureReason?: string }> {
    if (this.isProviderBackoffActive('ollama')) {
      return { raw: null, failureReason: 'provider_backoff_active' };
    }
    const baseUrl = this.config.get<string>('OLLAMA_URL', 'http://host.docker.internal:11434');
    const model = this.config.get<string>('OLLAMA_MODEL', 'qwen2.5:3b');
    const { system, user } = this.buildOllamaPrompt(context);
    const timeoutMs = Math.max(5000, Number(this.config.get<number>('AI_OLLAMA_TIMEOUT_MS', 20_000) || 20_000));
    const retries = Math.max(0, Math.min(2, Number(this.config.get<number>('AI_OLLAMA_RETRIES', 0) || 0)));
    const numPredict = Math.max(64, Math.min(512, Number(this.config.get<number>('AI_OLLAMA_NUM_PREDICT', 180) || 180)));

    let lastFailureReason: string | undefined;
    let lastErrMsg = '';
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const resp = await firstValueFrom(
          this.http.post(
            `${baseUrl.replace(/\/$/, '')}/api/chat`,
            {
              stream: false,
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
              ],
              options: { temperature: 0.2, num_predict: numPredict },
            },
            { timeout: timeoutMs },
          ),
        );
        const content = resp.data?.message?.content;
        const parsed = this.parseJson(content);
        if (parsed && typeof parsed === 'object') {
          this.resetProviderFailure('ollama');
          return { raw: parsed };
        }
        const coerced = this.coerceTextReport(content);
        if (coerced) {
          this.resetProviderFailure('ollama');
          this.logger.warn('Ollama returned non-JSON content; coerced text response into structured report.');
          return { raw: coerced };
        }
        if (typeof content === 'string' && (this.looksLikePromptEcho(content) || this.looksLikePromptEchoFragment(content))) {
          this.resetProviderFailure('ollama');
          this.logger.warn('Ollama response looked like prompt echo/fragment; using context-derived structured report.');
          return { raw: this.contextDerivedReport(context) };
        }
        if (typeof content === 'string' && content.trim().length > 0) {
          this.resetProviderFailure('ollama');
          this.logger.warn('Ollama returned malformed JSON text; using context-derived structured report.');
          return { raw: this.contextDerivedReport(context) };
        }
        lastFailureReason = 'provider_invalid_json';
        const sample = typeof content === 'string' ? content.slice(0, 220).replace(/\s+/g, ' ') : String(content);
        this.logger.warn(`Ollama returned non-object JSON content. sample="${sample}"`);
        lastErrMsg = 'invalid JSON response';
        this.recordProviderFailure('ollama', lastFailureReason);
      } catch (e: any) {
        lastFailureReason = this.classifyProviderError(e);
        lastErrMsg = String(e?.message || e);
        this.recordProviderFailure('ollama', lastFailureReason);
      }
      if (attempt < retries) {
        this.logger.warn(`Ollama AI analysis retrying (${attempt + 1}/${retries}) reason=${lastFailureReason || 'unknown'}`);
      }
    }
    this.logger.warn(`Ollama AI analysis failed: ${lastErrMsg || 'unknown error'}`);
    return { raw: null, failureReason: lastFailureReason || 'provider_request_failed' };
  }

  private async analyzeWithOpenAi(context: any): Promise<{ raw: any | null; failureReason?: string }> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY', '');
    if (!apiKey) return { raw: null, failureReason: 'provider_missing_api_key' };
    const model = this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
    const { system, user } = this.buildPrompt(context);

    try {
      const resp = await firstValueFrom(
        this.http.post(
          'https://api.openai.com/v1/chat/completions',
          {
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            temperature: 0.2,
          },
          {
            timeout: 20_000,
            headers: { Authorization: `Bearer ${apiKey}` },
          },
        ),
      );
      const content = resp.data?.choices?.[0]?.message?.content;
      return { raw: this.parseJson(content) };
    } catch (e: any) {
      this.logger.warn(`OpenAI analysis failed: ${e?.message || e}`);
      return { raw: null, failureReason: this.classifyProviderError(e) };
    }
  }

  private parseJson(text: string | undefined): any | null {
    if (!text) return null;
    const parseNested = (input: any, depth = 0): any | null => {
      if (depth > 3) return null;
      if (input && typeof input === 'object') {
        if (Array.isArray(input)) {
          const firstObj = input.find((x) => x && typeof x === 'object' && !Array.isArray(x));
          return firstObj || null;
        }
        return input;
      }
      if (typeof input !== 'string') return null;
      const s = input.trim();
      if (!s) return null;
      const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      const candidate = fenced ? fenced[1].trim() : s;
      try {
        const parsed = JSON.parse(candidate);
        return parseNested(parsed, depth + 1);
      } catch {
        const start = candidate.indexOf('{');
        const end = candidate.lastIndexOf('}');
        if (start >= 0 && end > start) {
          try {
            const parsed = JSON.parse(candidate.slice(start, end + 1));
            return parseNested(parsed, depth + 1);
          } catch {
            return null;
          }
        }
        return null;
      }
    };
    try {
      return parseNested(text, 0);
    } catch {
      return null;
    }
  }

  private normalizeReport(raw: any | null, context: any, provider: string, failureReason?: string): AiReport {
    const fallbackReason = failureReason || 'ai_response_invalid_or_empty';
    const fallback = this.fallbackReport(context, provider, [fallbackReason]);
    if (!raw || typeof raw !== 'object') return fallback;
    const evidenceCatalog = this.buildEvidenceCatalog(context);
    const allowedEvidenceIds = new Set(Object.keys(evidenceCatalog));
    const qualityReasons: string[] = [];

    const toText = (v: any, max = 240) => {
      if (typeof v !== 'string') return '';
      const s = v.trim().replace(/\s+/g, ' ');
      if (!s) return '';
      return s.length > max ? s.slice(0, max - 1) + '…' : s;
    };
    const sanitizeEvidenceIds = (v: any, maxItems = 3): string[] => {
      if (!Array.isArray(v)) return [];
      const out: string[] = [];
      for (const item of v) {
        const id = toText(item, 80);
        if (!id || !allowedEvidenceIds.has(id)) continue;
        if (!out.includes(id)) out.push(id);
        if (out.length >= maxItems) break;
      }
      return out;
    };
    const normalizeFindings = (v: any, maxItems = 5): AiFinding[] => {
      if (!Array.isArray(v)) return [];
      const out: AiFinding[] = [];
      const seen = new Set<string>();
      const fallbackEvidenceIds = Object.keys(evidenceCatalog).slice(0, 2);
      for (const item of v) {
        let text = '';
        let evidence_ids: string[] = [];
        let expected_outcome = '';
        let runbook_step = '';

        if (typeof item === 'string') {
          text = toText(item, 200);
          evidence_ids = this.extractEvidenceIdsFromText(text).filter((id) => allowedEvidenceIds.has(id));
          text = text.replace(/\[evidence:[^\]]+\]/gi, '').trim();
        } else if (item && typeof item === 'object') {
          text = toText(item.text ?? item.reason ?? item.title, 200);
          evidence_ids = sanitizeEvidenceIds(item.evidence_ids ?? item.evidenceIds ?? item.evidence);
          expected_outcome = toText(item.expected_outcome ?? item.expectedOutcome, 160);
          runbook_step = toText(item.runbook_step ?? item.runbookStep, 160);
        }

        if (!text) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({
          text,
          evidence_ids: evidence_ids.length ? evidence_ids : fallbackEvidenceIds.length ? fallbackEvidenceIds.slice(0, 1) : undefined,
          expected_outcome: expected_outcome || undefined,
          runbook_step: runbook_step || undefined,
        });
        if (out.length >= maxItems) break;
      }
      return out;
    };
    const clamp01 = (n: any, d = 0.45) => {
      const x = Number(n);
      if (!Number.isFinite(x)) return d;
      return Math.max(0, Math.min(1, x));
    };
    const hasHan = (s: string) => /[\u3400-\u9FFF]/u.test(s);

    const title = toText(raw.title, 120) || fallback.title;
    const summary = toText(raw.summary, 500) || fallback.summary;
    const probable_causes_detail = normalizeFindings(raw.probable_causes ?? raw.probableCauses);
    const next_checks_detail = normalizeFindings(raw.next_checks ?? raw.nextChecks);
    const mitigations_detail = normalizeFindings(raw.mitigations ?? raw.recommended_actions ?? raw.recommendedActions);
    const confidence = clamp01(raw.confidence, fallback.confidence ?? 0.45);

    const evidenceById = new Map<string, AiEvidence>();
    const pushEvidenceId = (id: string, reason?: string) => {
      const info = evidenceCatalog[id];
      if (!info) return;
      const existing = evidenceById.get(id);
      if (existing) return;
      evidenceById.set(id, {
        id,
        label: info.label,
        value: info.value,
        expr: info.expr,
        reason: toText(reason, 160) || undefined,
      });
    };

    for (const f of [...probable_causes_detail, ...next_checks_detail, ...mitigations_detail]) {
      for (const id of f.evidence_ids || []) pushEvidenceId(id);
    }
    if (Array.isArray(raw.evidence)) {
      for (const ev of raw.evidence) {
        if (!ev || typeof ev !== 'object') continue;
        const id = toText(ev.id, 80);
        if (!id || !allowedEvidenceIds.has(id)) continue;
        pushEvidenceId(id, ev.reason);
      }
    }

    const probable_causes = probable_causes_detail.map((x) => x.text);
    const next_checks = next_checks_detail.map((x) => x.text);
    const mitigations = mitigations_detail.map((x) => x.text);
    const evidence = Array.from(evidenceById.values()).slice(0, 8);
    const findings = [...probable_causes_detail, ...next_checks_detail, ...mitigations_detail];
    const findingsMissingEvidence = findings.some((f) => !Array.isArray(f.evidence_ids) || f.evidence_ids.length === 0);

    const joinedText = [title, summary, ...probable_causes, ...next_checks, ...mitigations].join(' ');
    if (!summary || summary.length < 20) qualityReasons.push('summary_too_short');
    if (!probable_causes.length) qualityReasons.push('empty_probable_causes');
    if (!next_checks.length) qualityReasons.push('empty_next_checks');
    if (!mitigations.length) qualityReasons.push('empty_mitigations');
    if (findingsMissingEvidence) qualityReasons.push('findings_missing_evidence_ids');
    if (!evidence.length) qualityReasons.push('missing_evidence_links');
    if (hasHan(joinedText)) qualityReasons.push('contains_non_korean_cjk_text');

    const fallbackFromQuality = this.fallbackReport(context, provider, qualityReasons, raw);
    const resolvedTitle = title || fallbackFromQuality.title;
    const resolvedSummary = summary && summary.length >= 20 ? summary : fallbackFromQuality.summary;
    const resolvedProbableCauses = probable_causes.length ? probable_causes : fallbackFromQuality.probable_causes || [];
    const resolvedProbableCausesDetail = probable_causes_detail.length
      ? probable_causes_detail
      : fallbackFromQuality.probable_causes_detail || [];
    const resolvedNextChecks = next_checks.length ? next_checks : fallbackFromQuality.next_checks || [];
    const resolvedNextChecksDetail = next_checks_detail.length ? next_checks_detail : fallbackFromQuality.next_checks_detail || [];
    const resolvedMitigations = mitigations.length ? mitigations : fallbackFromQuality.mitigations || [];
    const resolvedMitigationsDetail = mitigations_detail.length ? mitigations_detail : fallbackFromQuality.mitigations_detail || [];
    const resolvedEvidence = evidence.length ? evidence : fallbackFromQuality.evidence || [];
    const resolvedConfidence = qualityReasons.length ? Math.min(confidence, 0.5) : confidence;

    return {
      title: resolvedTitle,
      summary: resolvedSummary,
      probable_causes: resolvedProbableCauses,
      probable_causes_detail: resolvedProbableCausesDetail,
      next_checks: resolvedNextChecks,
      next_checks_detail: resolvedNextChecksDetail,
      mitigations: resolvedMitigations,
      mitigations_detail: resolvedMitigationsDetail,
      evidence: resolvedEvidence,
      quality: { source: 'llm', reasons: qualityReasons },
      confidence: resolvedConfidence,
    };
  }

  private fallbackReport(context: any, provider: string, reasons: string[] = [], raw: any = null): AiReport {
    const appName = String(context?.app?.name || '서비스');
    const job = String(context?.app?.job || '-');
    const ruleName = String(context?.rule?.name || '룰');
    const kind = String(context?.rule?.kind || 'CUSTOM');
    const val = context?.snapshot?.primary?.value;
    const valueText = Number.isFinite(Number(val)) ? String(Number(val)) : '-';
    const reasonText = reasons.length ? reasons.join(', ') : 'unknown';
    const evidence = this.buildFallbackEvidence(context);

    const causeByKind: Record<string, string> = {
      INSTANCE_DOWN: '타겟 up 메트릭이 0으로 감지되었습니다.',
      HEAP_RATIO_HIGH: 'JVM heap 사용률이 임계치를 초과했을 가능성이 큽니다.',
      GC_PAUSE_AVG_HIGH: 'GC pause 시간이 증가한 것으로 보입니다.',
      CPU_CORES_HIGH: 'CPU 사용량이 높게 유지되고 있습니다.',
      RSS_BYTES_HIGH: '프로세스 메모리(RSS) 사용량이 높습니다.',
      HTTP_5XX_RATIO_HIGH: 'HTTP 5xx 비율이 상승했습니다.',
      HTTP_LATENCY_P95_HIGH: '응답 지연(p95)이 증가했습니다.',
      HTTP_RPS_DROP: '요청량(RPS)이 평소 대비 감소했습니다.',
      SLO_BURN_RATE_HIGH: 'SLO 에러버짓 소진 속도(Burn Rate)가 임계치를 초과했습니다.',
      CUSTOM: '사용자 정의 룰 조건이 충족되었습니다.',
    };
    const probable = causeByKind[kind] || causeByKind.CUSTOM;
    const providerFailureMessage = this.describeProviderFailure(provider, reasons);
    const hasProviderFailure = reasons.some((r) => {
      const t = String(r || '');
      return t.startsWith('provider_') || t.includes('provider_') || t.includes('ai_response_invalid_or_empty');
    });
    const summaryBase = `${appName}(${job})에서 룰 '${ruleName}'가 발화했습니다. 현재 값: ${valueText}.`;
    const summary = hasProviderFailure ? `${summaryBase} (${providerFailureMessage})` : summaryBase;

    return {
      title: `${appName} ${ruleName} 알림 분석`,
      probable_causes: [probable],
      probable_causes_detail: [
        { text: probable, evidence_ids: evidence.slice(0, 1).map((e) => e.id) },
      ],
      next_checks: ['앱 상세 View에서 최근 60분 그래프와 Prometheus Target 상태를 확인하세요.', '같은 시각의 CPU/Heap/GC/5xx/Latency 지표 변화를 비교하세요.'],
      next_checks_detail: [
        { text: '앱 상세 View에서 최근 60분 그래프와 Prometheus Target 상태를 확인하세요.', evidence_ids: evidence.slice(0, 2).map((e) => e.id) },
        { text: '같은 시각의 CPU/Heap/GC/5xx/Latency 지표 변화를 비교하세요.', evidence_ids: evidence.slice(0, 3).map((e) => e.id) },
      ],
      mitigations: ['임계치와 forSeconds/cooldownSeconds를 현재 트래픽 패턴에 맞게 조정하세요.', '문제가 지속되면 룰을 임시 완화하고 원인 지표를 우선 수집하세요.'],
      mitigations_detail: [
        { text: '임계치와 forSeconds/cooldownSeconds를 현재 트래픽 패턴에 맞게 조정하세요.', evidence_ids: evidence.slice(0, 1).map((e) => e.id), runbook_step: 'tune_rule_thresholds' },
        { text: '문제가 지속되면 룰을 임시 완화하고 원인 지표를 우선 수집하세요.', evidence_ids: evidence.slice(0, 1).map((e) => e.id), runbook_step: 'collect_diagnostics' },
      ],
      quality: { source: 'fallback', reasons: [`provider=${provider}`, `gate=${reasonText}`] },
      confidence: 0.35,
    };
  }

  private extractEvidenceIdsFromText(text: string): string[] {
    const out: string[] = [];
    const re = /\[evidence:([a-zA-Z0-9_\-]+)\]/g;
    let m: RegExpExecArray | null = null;
    while ((m = re.exec(text))) {
      const id = String(m[1] || '').trim();
      if (!id) continue;
      if (!out.includes(id)) out.push(id);
    }
    return out;
  }

  private buildEvidenceCatalog(context: any): Record<string, { label: string; value: number | null; expr: string }> {
    const out: Record<string, { label: string; value: number | null; expr: string }> = {};
    const labelMap: Record<string, string> = {
      primary: '룰 주요 값',
      up_sum: '업 인스턴스 수',
      cpu_cores: 'CPU 사용 코어',
      rss_bytes: 'RSS 메모리 바이트',
      rps: '초당 요청 수',
      http_5xx_ratio: 'HTTP 5xx 비율',
      error_ratio_5m: '5분 에러 비율',
      burn_rate_5m: '5분 에러버짓 소진 속도',
      latency_p95_s: 'P95 지연(초)',
      heap_ratio: 'Heap 사용률',
      gc_pause_avg_ms: '평균 GC 일시중지(ms)',
    };
    const toNum = (v: any): number | null => {
      const x = Number(v);
      return Number.isFinite(x) ? x : null;
    };
    const primary = context?.snapshot?.primary;
    out.primary = {
      label: labelMap.primary,
      value: toNum(primary?.value),
      expr: String(primary?.expr || ''),
    };
    const evidence = context?.snapshot?.evidence || {};
    for (const [id, ev] of Object.entries<any>(evidence)) {
      out[id] = {
        label: labelMap[id] || id,
        value: toNum(ev?.value),
        expr: String(ev?.expr || ''),
      };
    }
    return out;
  }

  private buildFallbackEvidence(context: any): AiEvidence[] {
    const catalog = this.buildEvidenceCatalog(context);
    const ids = Object.keys(catalog);
    const out: AiEvidence[] = [];
    for (const id of ids) {
      const ev = catalog[id];
      if (ev.value === null) continue;
      out.push({ id, label: ev.label, value: ev.value, expr: ev.expr });
      if (out.length >= 4) break;
    }
    if (!out.length && ids.length) {
      const id = ids[0];
      const ev = catalog[id];
      out.push({ id, label: ev.label, value: ev.value, expr: ev.expr });
    }
    return out;
  }

  private classifyProviderError(e: any): string {
    const message = String(e?.message || '').toLowerCase();
    const code = String(e?.code || '').toUpperCase();
    const status = Number(e?.response?.status);
    if (code === 'ECONNABORTED' || message.includes('timeout')) return 'provider_timeout';
    if (status >= 500) return 'provider_http_5xx';
    if (status >= 400) return 'provider_http_4xx';
    if (message.includes('econnrefused') || message.includes('enotfound') || message.includes('network')) return 'provider_network_error';
    return 'provider_request_failed';
  }

  private describeProviderFailure(provider: string, reasons: string[]): string {
    const joined = reasons.join(',');
    if (joined.includes('provider_backoff_active')) {
      return `AI 서버가 불안정해 일시 백오프 중입니다. 기본 분석(${provider})으로 대체했습니다.`;
    }
    if (joined.includes('provider_timeout')) {
      return `AI 응답 시간 초과로 기본 분석(${provider})으로 대체했습니다.`;
    }
    if (joined.includes('provider_http_5xx')) {
      return `AI 서버 오류(5xx)로 기본 분석(${provider})으로 대체했습니다.`;
    }
    if (joined.includes('provider_http_4xx')) {
      return `AI 요청 오류(4xx)로 기본 분석(${provider})으로 대체했습니다.`;
    }
    if (joined.includes('provider_network_error')) {
      return `AI 네트워크 오류로 기본 분석(${provider})으로 대체했습니다.`;
    }
    if (joined.includes('provider_missing_api_key')) {
      return `AI API 키가 없어 기본 분석(${provider})으로 대체했습니다.`;
    }
    if (joined.includes('provider_invalid_json') || joined.includes('ai_response_invalid_or_empty')) {
      return `AI 응답이 비정상 형식이어서 기본 분석(${provider})으로 대체했습니다.`;
    }
    return `기본 점검 가이드를 보완해 제공합니다.`;
  }

  private coerceTextReport(text: any): Record<string, any> | null {
    if (typeof text !== 'string') return null;
    const raw = text.trim();
    if (!raw) return null;
    if ((raw.startsWith('{') || raw.startsWith('[')) && /"app"\s*:\s*\{/.test(raw) && /"output_contract"\s*:/.test(raw)) {
      return null;
    }

    const lines = raw
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!lines.length) return null;
    const cleanLine = (line: string) =>
      line
        .replace(/\\"/g, '"')
        .replace(/\\n/g, ' ')
        .replace(/```(?:json)?/gi, '')
        .replace(/^["']+/, '')
        .replace(/["',]+$/, '')
        .trim();
    const isNoiseLine = (line: string) => {
      if (!line) return true;
      if (/^(probable causes?|next checks?|mitigations?|원인|가능 원인|점검|확인|대응|조치)\s*:?\s*$/i.test(line)) return false;
      if (/^[[\]{}(),:]+$/.test(line)) return true;
      if (/^"(title|summary|probable_causes|next_checks|mitigations|confidence)"\s*:/i.test(line)) return true;
      if (/^(title|summary|probable_causes|next_checks|mitigations|confidence)\s*:/i.test(line)) return true;
      if (/^[a-zA-Z0-9_]+\"?\s*:\s*/.test(line)) return true;
      if (/^"?[a-zA-Z0-9_]+"?\s*:\s*/.test(line)) return true;
      return false;
    };
    const isPromptEcho = (line: string) =>
      /"app"\s*:\s*\{/.test(line) ||
      /"rule"\s*:\s*\{/.test(line) ||
      /"snapshot"\s*:\s*\{/.test(line) ||
      /"output_contract"\s*:/.test(line);
    const usableLines = lines
      .map((x) => cleanLine(x))
      .filter((x) => !isPromptEcho(x))
      .filter((x) => x.length <= 240)
      .filter((x) => !isNoiseLine(x));
    if (!usableLines.length) return null;

    const sections: Record<string, string[]> = {
      probable_causes: [],
      next_checks: [],
      mitigations: [],
    };
    let current: keyof typeof sections | null = null;
    const headingMap: Array<{ re: RegExp; key: keyof typeof sections }> = [
      { re: /^(probable causes?|원인|가능 원인)/i, key: 'probable_causes' },
      { re: /^(next checks?|점검|확인)/i, key: 'next_checks' },
      { re: /^(mitigations?|대응|조치)/i, key: 'mitigations' },
    ];

    for (const line of usableLines) {
      const heading = headingMap.find((h) => h.re.test(line.replace(/[:：]\s*$/, '')));
      if (heading) {
        current = heading.key;
        continue;
      }
      const bullet = cleanLine(line.replace(/^[-*•]\s*/, '').trim());
      if (!bullet) continue;
      if (current) {
        sections[current].push(bullet);
      }
    }

    const summary = usableLines[0];
    const probable_causes = sections.probable_causes.slice(0, 5);
    const next_checks = sections.next_checks.slice(0, 5);
    const mitigations = sections.mitigations.slice(0, 5);

    if (!probable_causes.length && !next_checks.length && !mitigations.length) {
      const fallbackItems = usableLines
        .map((x) => cleanLine(x.replace(/^[-*•]\s*/, '').trim()))
        .filter((x) => x.length > 0 && x.length <= 240)
        .filter((x) => !isPromptEcho(x))
        .filter((x) => !isNoiseLine(x))
        .slice(0, 6);
      if (!fallbackItems.length) return null;
      return {
        title: 'AI 분석 결과',
        probable_causes: fallbackItems.slice(0, 2),
        next_checks: fallbackItems.slice(2, 4),
        mitigations: fallbackItems.slice(4, 6),
      };
    }

    return {
      title: 'AI 분석 결과',
    };
  }

  private looksLikePromptEcho(text: string): boolean {
    const s = String(text || '');
    if (!s) return false;
    const hit = /"app"\s*:\s*\{/.test(s) && /"rule"\s*:\s*\{/.test(s);
    const contract = /"output_contract"\s*:/.test(s) || /"snapshot"\s*:\s*\{/.test(s);
    return hit && contract;
  }

  private looksLikePromptEchoFragment(text: string): boolean {
    const s = String(text || '');
    if (!s) return false;
    const hasApp = /"app"\s*:\s*\{/.test(s);
    const hasRule = /"rule"\s*:\s*\{/.test(s);
    const hasSnapshot = /"snapshot"\s*:\s*\{/.test(s) || /primary_expr=/.test(s) || /evidence=/.test(s);
    return hasApp || (hasRule && hasSnapshot);
  }

  private contextDerivedReport(context: any): Record<string, any> {
    const appName = String(context?.app?.name || '서비스');
    const job = String(context?.app?.job || '-');
    const ruleName = String(context?.rule?.name || '룰');
    const kind = String(context?.rule?.kind || 'CUSTOM');
    const val = context?.snapshot?.primary?.value;
    const valueText = Number.isFinite(Number(val)) ? String(Number(val)) : '-';
    const causeByKind: Record<string, string> = {
      INSTANCE_DOWN: '타겟 up 메트릭이 0으로 감지되었습니다.',
      HEAP_RATIO_HIGH: 'JVM heap 사용률이 임계치를 초과했을 가능성이 큽니다.',
      GC_PAUSE_AVG_HIGH: 'GC pause 시간이 증가한 것으로 보입니다.',
      CPU_CORES_HIGH: 'CPU 사용량이 높게 유지되고 있습니다.',
      RSS_BYTES_HIGH: '프로세스 메모리(RSS) 사용량이 높습니다.',
      HTTP_5XX_RATIO_HIGH: 'HTTP 5xx 비율이 상승했습니다.',
      HTTP_LATENCY_P95_HIGH: '응답 지연(p95)이 증가했습니다.',
      HTTP_RPS_DROP: '요청량(RPS)이 평소 대비 감소했습니다.',
      SLO_BURN_RATE_HIGH: 'SLO 에러버짓 소진 속도(Burn Rate)가 임계치를 초과했습니다.',
      CUSTOM: '사용자 정의 룰 조건이 충족되었습니다.',
    };
    const probable = causeByKind[kind] || causeByKind.CUSTOM;
    return {
      title: `${appName} ${ruleName} 알림 분석`,
      summary: `${appName}(${job})에서 룰 '${ruleName}'가 발화했습니다. 현재 값: ${valueText}.`,
      probable_causes: [probable],
      next_checks: ['앱 상세 View에서 최근 60분 그래프와 Prometheus Target 상태를 확인하세요.', '같은 시각의 CPU/Heap/GC/5xx/Latency 지표 변화를 비교하세요.'],
      mitigations: ['임계치와 forSeconds/cooldownSeconds를 현재 트래픽 패턴에 맞게 조정하세요.', '문제가 지속되면 룰을 임시 완화하고 원인 지표를 우선 수집하세요.'],
    };
  }

  private isProviderBackoffActive(provider: string): boolean {
    const s = this.providerFailureState.get(provider);
    return Boolean(s && Date.now() < s.backoffUntil);
  }

  private resetProviderFailure(provider: string): void {
    this.providerFailureState.delete(provider);
  }

  private recordProviderFailure(provider: string, reason: string): void {
    if (!['provider_timeout', 'provider_http_5xx', 'provider_network_error', 'provider_request_failed'].includes(reason)) {
      return;
    }
    const baseMs = Math.max(1000, Number(this.config.get<number>('AI_PROVIDER_BACKOFF_BASE_MS', 30_000) || 30_000));
    const maxMs = Math.max(baseMs, Number(this.config.get<number>('AI_PROVIDER_BACKOFF_MAX_MS', 300_000) || 300_000));
    const prev = this.providerFailureState.get(provider) || { fails: 0, backoffUntil: 0 };
    const fails = prev.fails + 1;
    const backoffMs = Math.min(maxMs, baseMs * 2 ** Math.max(0, fails - 1));
    const backoffUntil = Date.now() + backoffMs;
    this.providerFailureState.set(provider, { fails, backoffUntil });
    this.logger.warn(`AI provider backoff set. provider=${provider} reason=${reason} fails=${fails} backoffMs=${backoffMs}`);
  }

}
