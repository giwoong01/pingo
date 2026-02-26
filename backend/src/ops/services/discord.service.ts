import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import type { RuleKind } from '../entities/rule.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DiscordService {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async sendWebhook(discordUrl: string, payload: any): Promise<void> {
    await firstValueFrom(this.http.post(discordUrl, payload, { timeout: 10_000 }));
  }

  buildAlertMessage(input: {
    title: string;
    url?: string;
    summary?: string;
    severity: string;
    appName: string;
    job: string;
    appId?: string;
    ruleName: string;
    ruleId?: string;
    kind?: RuleKind | string;
    expr?: string;
    value?: number | null;
    firingSince?: string;
    snapshot?: any | null;
    ai?: any | null;
    runbookUrl?: string;
    runbookSteps?: string[];
  }): any {
    const colorBySeverity: Record<string, number> = {
      LOW: 0x95a5a6,
      MEDIUM: 0xf1c40f,
      HIGH: 0xe67e22,
      CRITICAL: 0xe74c3c,
    };

    const toUnix = (iso?: string) => {
      if (!iso) return null;
      const ms = Date.parse(iso);
      if (!Number.isFinite(ms)) return null;
      return Math.floor(ms / 1000);
    };

    const fmt = (n: any, digits = 4) => {
      const x = Number(n);
      if (!Number.isFinite(x)) return '-';
      return x.toFixed(digits).replace(/\.?0+$/, '');
    };

    const fmtPct = (ratio: any) => {
      const x = Number(ratio);
      if (!Number.isFinite(x)) return '-';
      return `${fmt(x * 100, 2)}%`;
    };

    const fmtBytes = (bytes: any) => {
      const x = Number(bytes);
      if (!Number.isFinite(x)) return '-';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let v = x;
      let i = 0;
      while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i += 1;
      }
      return `${fmt(v, 2)} ${units[i]}`;
    };

    const kind = String(input.kind || 'CUSTOM');
    const reasonByKind: Record<string, string> = {
      INSTANCE_DOWN: 'Prometheus target is DOWN (up == 0).',
      HEAP_RATIO_HIGH: 'JVM heap usage ratio is high.',
      GC_PAUSE_AVG_HIGH: 'GC pause time is high.',
      CPU_CORES_HIGH: 'CPU usage is high.',
      RSS_BYTES_HIGH: 'Memory (RSS) usage is high.',
      HTTP_5XX_RATIO_HIGH: 'HTTP 5xx ratio is high.',
      HTTP_LATENCY_P95_HIGH: 'HTTP latency (p95) is high.',
      HTTP_RPS_DROP: 'Request rate (RPS) dropped.',
      SLO_BURN_RATE_HIGH: 'SLO error budget burn rate is high.',
      CUSTOM: 'Custom rule triggered.',
    };

    const extractThreshold = (expr?: string) => {
      const s = String(expr || '');
      const matches = Array.from(s.matchAll(/([<>]=?)\s*([0-9]+(?:\.[0-9]+)?)/g));
      const last = matches[matches.length - 1];
      if (!last) return null;
      return { op: last[1], threshold: Number(last[2]) };
    };
    const thr = extractThreshold(input.expr);

    const evidence = input.snapshot?.evidence || {};
    const contextLines: string[] = [];
    if (evidence?.up_sum?.value !== undefined) contextLines.push(`up_sum: ${fmt(evidence.up_sum.value)}`);
    if (evidence?.rps?.value !== undefined) contextLines.push(`rps: ${fmt(evidence.rps.value)} /s`);
    if (evidence?.http_5xx_ratio?.value !== undefined) contextLines.push(`http_5xx_ratio: ${fmtPct(evidence.http_5xx_ratio.value)}`);
    if (evidence?.error_ratio_5m?.value !== undefined) contextLines.push(`error_ratio_5m: ${fmtPct(evidence.error_ratio_5m.value)}`);
    if (evidence?.burn_rate_5m?.value !== undefined) contextLines.push(`burn_rate_5m: ${fmt(evidence.burn_rate_5m.value)}x`);
    if (evidence?.latency_p95_s?.value !== undefined) contextLines.push(`latency_p95: ${fmt(evidence.latency_p95_s.value)} s`);
    if (evidence?.heap_ratio?.value !== undefined) contextLines.push(`heap_ratio: ${fmtPct(evidence.heap_ratio.value)}`);
    if (evidence?.gc_pause_avg_ms?.value !== undefined) contextLines.push(`gc_pause_avg: ${fmt(evidence.gc_pause_avg_ms.value)} ms`);
    if (evidence?.cpu_cores?.value !== undefined) contextLines.push(`cpu_cores: ${fmt(evidence.cpu_cores.value)}`);
    if (evidence?.rss_bytes?.value !== undefined) contextLines.push(`rss: ${fmtBytes(evidence.rss_bytes.value)}`);

    const publicBase = String(this.config.get<string>('OPS_PUBLIC_URL', '') || '').replace(/\/$/, '');
    const viewUrl = publicBase && input.appId ? `${publicBase}/ops/apps/${input.appId}` : undefined;

    const sinceUnix = toUnix(input.firingSince);
    const sinceText = sinceUnix ? `<t:${sinceUnix}:F> (<t:${sinceUnix}:R>)` : input.firingSince;

    const embed: any = {
      title: `[${input.severity}] ${input.appName} · ${input.ruleName}`,
      color: colorBySeverity[input.severity] ?? 0x3498db,
      fields: [
        { name: 'What happened', value: reasonByKind[kind] ?? reasonByKind.CUSTOM },
        { name: 'App', value: `${input.appName}\njob: \`${input.job}\``, inline: true },
        { name: 'Rule', value: `${input.ruleName}\nkind: \`${kind}\``, inline: true },
      ],
    };
    if (input.value !== undefined && input.value !== null) {
      const valueLine = thr ? `value: **${fmt(input.value)}**\ncondition: \`${thr.op} ${fmt(thr.threshold)}\`` : `value: **${fmt(input.value)}**`;
      embed.fields.push({ name: 'Trigger', value: valueLine, inline: true });
    }
    if (sinceText) {
      embed.fields.push({ name: 'Since', value: sinceText, inline: true });
    }
    if (contextLines.length) {
      embed.fields.push({ name: 'Context (from Prometheus)', value: contextLines.slice(0, 8).join('\n') });
    }
    const expr = String(input.expr || input.snapshot?.primary?.expr || '').trim();
    if (expr) {
      const clipped = expr.length > 900 ? expr.slice(0, 900) + '…' : expr;
      embed.fields.push({ name: 'Why this fired (PromQL)', value: '```promql\n' + clipped + '\n```' });
    }
    if (viewUrl) {
      embed.fields.push({ name: 'View', value: viewUrl });
    } else if (input.url) {
      embed.fields.push({ name: 'View', value: input.url });
    }
    if (input.runbookUrl) {
      embed.fields.push({ name: 'Runbook', value: input.runbookUrl });
    }
    if (Array.isArray(input.runbookSteps) && input.runbookSteps.length > 0) {
      embed.fields.push({
        name: 'Immediate Steps',
        value: input.runbookSteps.slice(0, 4).map((s) => `- ${s}`).join('\n'),
      });
    }

    if (input.ai) {
      const causes = Array.isArray(input.ai?.probable_causes) ? input.ai.probable_causes : [];
      const mitigations = Array.isArray(input.ai?.mitigations) ? input.ai.mitigations : [];
      const checks = Array.isArray(input.ai?.next_checks) ? input.ai.next_checks : [];
      if (causes.length) embed.fields.push({ name: 'Probable Causes', value: causes.slice(0, 3).map((x: any) => `- ${x}`).join('\n') });
      if (checks.length) embed.fields.push({ name: 'Next Checks', value: checks.slice(0, 5).map((x: any) => `- ${x}`).join('\n') });
      if (mitigations.length)
        embed.fields.push({ name: 'Mitigations', value: mitigations.slice(0, 5).map((x: any) => `- ${x}`).join('\n') });
    }

    return { content: `**[${input.severity}]** ${input.appName} · ${input.ruleName}`, embeds: [embed] };
  }
}
