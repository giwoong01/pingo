import React, { useEffect, useMemo, useRef, useState } from 'react';
import MainLayout from '@/layouts/MainLayout';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { App, opsApi } from '@/features/ops/api/ops.api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

type Point = { t: number; v: number };
type AppWidget = {
  id: string;
  title: string;
  expr: string;
  minutes: number;
  stepSec: number;
  enabled: boolean;
  helpKey?: string;
  custom?: boolean;
};

type WidgetPreset = {
  kind: 'recommended' | 'scenario';
  category: 'Traffic' | 'Errors' | 'Latency' | 'JVM' | 'Infra' | 'SLO';
  id: string;
  title: string;
  expr: string;
  minutes: number;
  stepSec: number;
  helpKey?: string;
};
type WidgetBundle = {
  id: string;
  label: string;
  widgetIds: string[];
};

const WIDGET_PRESETS: WidgetPreset[] = [
  {
    kind: 'recommended',
    category: 'Traffic',
    id: 'up_sum',
    title: 'Up Sum',
    expr: 'sum(up{job="${job}"${instanceMatcher}})',
    minutes: 60,
    stepSec: 30,
    helpKey: 'up_sum',
  },
  {
    kind: 'recommended',
    category: 'Traffic',
    id: 'rps',
    title: 'RPS',
    expr: 'sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher}}[5m]))',
    minutes: 60,
    stepSec: 30,
    helpKey: 'rps',
  },
  {
    kind: 'scenario',
    category: 'Traffic',
    id: 'http_total_rps',
    title: 'HTTP total RPS',
    expr: '(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher}}[5m]))) or on() vector(0)',
    minutes: 60,
    stepSec: 30,
    helpKey: 'http_total_rps',
  },
  {
    kind: 'recommended',
    category: 'Traffic',
    id: 'http_2xx',
    title: 'HTTP 2xx',
    expr: 'sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher},status=~"2.."}[5m]))',
    minutes: 60,
    stepSec: 30,
    helpKey: 'http_2xx',
  },
  {
    kind: 'scenario',
    category: 'Traffic',
    id: 'http_3xx',
    title: 'HTTP 3xx',
    expr: '(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher},status=~"3.."}[5m]))) or on() vector(0)',
    minutes: 60,
    stepSec: 30,
    helpKey: 'http_3xx',
  },
  {
    kind: 'recommended',
    category: 'Errors',
    id: 'http_4xx',
    title: 'HTTP 4xx',
    expr: '(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher},status=~"4.."}[5m]))) or on() vector(0)',
    minutes: 60,
    stepSec: 30,
    helpKey: 'http_4xx',
  },
  {
    kind: 'recommended',
    category: 'Errors',
    id: 'http_5xx',
    title: 'HTTP 5xx',
    expr: '(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher},status=~"5.."}[5m]))) or on() vector(0)',
    minutes: 60,
    stepSec: 30,
    helpKey: 'http_5xx',
  },
  {
    kind: 'recommended',
    category: 'Errors',
    id: 'http_5xx_ratio',
    title: 'HTTP 5xx ratio',
    expr: 'sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher},status=~"5.."}[5m])) / clamp_min(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher}}[5m])), 1)',
    minutes: 60,
    stepSec: 30,
    helpKey: 'http_5xx_ratio',
  },
  {
    kind: 'scenario',
    category: 'Errors',
    id: 'http_4xx_ratio',
    title: 'HTTP 4xx ratio',
    expr: 'sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher},status=~"4.."}[5m])) / clamp_min(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher}}[5m])), 1)',
    minutes: 60,
    stepSec: 30,
    helpKey: 'http_4xx_ratio',
  },
  {
    kind: 'recommended',
    category: 'Latency',
    id: 'latency_p50_s',
    title: 'p50 latency (s)',
    expr: '(histogram_quantile(0.50, sum by (le) (rate(http_server_requests_seconds_bucket{job="${job}"${instanceMatcher}}[5m])))) or (max(max_over_time(http_server_requests_seconds_max{job="${job}"${instanceMatcher}}[5m]))) or on() vector(0)',
    minutes: 60,
    stepSec: 30,
    helpKey: 'latency_p50_s',
  },
  {
    kind: 'recommended',
    category: 'Latency',
    id: 'latency_p95_s',
    title: 'p95 latency (s)',
    expr: '(histogram_quantile(0.95, sum by (le) (rate(http_server_requests_seconds_bucket{job="${job}"${instanceMatcher}}[5m])))) or (max(max_over_time(http_server_requests_seconds_max{job="${job}"${instanceMatcher}}[5m])))',
    minutes: 60,
    stepSec: 30,
    helpKey: 'latency_p95_s',
  },
  {
    kind: 'recommended',
    category: 'Latency',
    id: 'latency_p99_s',
    title: 'p99 latency (s)',
    expr: '(histogram_quantile(0.99, sum by (le) (rate(http_server_requests_seconds_bucket{job="${job}"${instanceMatcher}}[5m])))) or (max(max_over_time(http_server_requests_seconds_max{job="${job}"${instanceMatcher}}[5m]))) or on() vector(0)',
    minutes: 60,
    stepSec: 30,
    helpKey: 'latency_p99_s',
  },
  {
    kind: 'scenario',
    category: 'Latency',
    id: 'latency_avg_s',
    title: 'avg latency (s)',
    expr: '(sum(rate(http_server_requests_seconds_sum{job="${job}"${instanceMatcher}}[5m])) / clamp_min(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher}}[5m])), 1)) or on() vector(0)',
    minutes: 60,
    stepSec: 30,
    helpKey: 'latency_avg_s',
  },
  {
    kind: 'recommended',
    category: 'JVM',
    id: 'heap_ratio',
    title: 'Heap ratio',
    expr: 'sum(jvm_memory_used_bytes{job="${job}"${instanceMatcher},area="heap"}) / clamp_min(sum(jvm_memory_max_bytes{job="${job}"${instanceMatcher},area="heap"} > 0), 1)',
    minutes: 60,
    stepSec: 30,
    helpKey: 'heap_ratio',
  },
  {
    kind: 'recommended',
    category: 'JVM',
    id: 'heap_used_bytes',
    title: 'Heap used bytes',
    expr: '(sum(jvm_memory_used_bytes{job="${job}"${instanceMatcher},area="heap"})) or on() vector(0)',
    minutes: 60,
    stepSec: 30,
    helpKey: 'heap_used_bytes',
  },
  {
    kind: 'recommended',
    category: 'JVM',
    id: 'gc_pause_avg_ms',
    title: 'GC pause avg (ms)',
    expr: '1000 * (sum(rate(jvm_gc_pause_seconds_sum{job="${job}"${instanceMatcher}}[5m])) / clamp_min(sum(rate(jvm_gc_pause_seconds_count{job="${job}"${instanceMatcher}}[5m])), 1))',
    minutes: 60,
    stepSec: 30,
    helpKey: 'gc_pause_avg_ms',
  },
  {
    kind: 'scenario',
    category: 'JVM',
    id: 'nonheap_used_bytes',
    title: 'Non-heap used bytes',
    expr: '(sum(jvm_memory_used_bytes{job="${job}"${instanceMatcher},area="nonheap"})) or on() vector(0)',
    minutes: 60,
    stepSec: 30,
    helpKey: 'nonheap_used_bytes',
  },
  {
    kind: 'scenario',
    category: 'JVM',
    id: 'jvm_threads_live',
    title: 'JVM live threads',
    expr: '(max(jvm_threads_live_threads{job="${job}"${instanceMatcher}})) or on() vector(0)',
    minutes: 60,
    stepSec: 30,
    helpKey: 'jvm_threads_live',
  },
  {
    kind: 'recommended',
    category: 'Infra',
    id: 'cpu_cores',
    title: 'CPU cores',
    expr: '(sum(rate(process_cpu_seconds_total{job="${job}"${instanceMatcher}}[1m]))) or (sum(rate(process_cpu_time_ns_total{job="${job}"${instanceMatcher}}[1m])) / 1e9) or (sum(process_cpu_usage{job="${job}"${instanceMatcher}}))',
    minutes: 60,
    stepSec: 30,
    helpKey: 'cpu_cores',
  },
  {
    kind: 'recommended',
    category: 'Infra',
    id: 'rss_bytes',
    title: 'RSS bytes',
    expr: '(max(process_resident_memory_bytes{job="${job}"${instanceMatcher}})) or (max(process_memory_usage_bytes{job="${job}"${instanceMatcher}})) or (sum(jvm_memory_used_bytes{job="${job}"${instanceMatcher},area="heap"}) + sum(jvm_memory_used_bytes{job="${job}"${instanceMatcher},area="nonheap"})) or on() vector(0)',
    minutes: 60,
    stepSec: 30,
    helpKey: 'rss_bytes',
  },
  {
    kind: 'scenario',
    category: 'Infra',
    id: 'open_fds',
    title: 'Open file descriptors',
    expr: '(max(process_open_fds{job="${job}"${instanceMatcher}})) or on() vector(0)',
    minutes: 60,
    stepSec: 30,
    helpKey: 'open_fds',
  },
  {
    kind: 'scenario',
    category: 'Infra',
    id: 'uptime_seconds',
    title: 'Uptime (seconds)',
    expr: '(max(process_uptime_seconds{job="${job}"${instanceMatcher}})) or on() vector(0)',
    minutes: 60,
    stepSec: 30,
    helpKey: 'uptime_seconds',
  },
  {
    kind: 'recommended',
    category: 'SLO',
    id: 'burn_rate_5m',
    title: 'SLO burn rate (5m, 99.9%)',
    expr: '(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher},status=~"5.."}[5m])) / clamp_min(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher}}[5m])), 1)) / 0.001',
    minutes: 60,
    stepSec: 30,
    helpKey: 'burn_rate_5m',
  },
  {
    kind: 'scenario',
    category: 'SLO',
    id: 'burn_rate_1h',
    title: 'SLO burn rate (1h, 99.9%)',
    expr: '(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher},status=~"5.."}[1h])) / clamp_min(sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher}}[1h])), 1)) / 0.001',
    minutes: 60,
    stepSec: 30,
    helpKey: 'burn_rate_1h',
  },
];
const RECOMMENDED_WIDGET_IDS = WIDGET_PRESETS.filter((p) => p.kind === 'recommended').map((p) => p.id);
const PRESET_HELP_KEY_BY_ID = Object.fromEntries(WIDGET_PRESETS.map((p) => [p.id, p.helpKey || p.id]));
const SCENARIO_BUNDLES: WidgetBundle[] = [
  {
    id: 'incident',
    label: '장애 대응',
    widgetIds: ['up_sum', 'http_5xx', 'http_5xx_ratio', 'latency_p95_s', 'latency_p99_s', 'burn_rate_5m'],
  },
  {
    id: 'traffic',
    label: '트래픽 분석',
    widgetIds: ['rps', 'http_total_rps', 'http_2xx', 'http_3xx', 'http_4xx', 'http_5xx', 'latency_avg_s'],
  },
  {
    id: 'jvm_memory',
    label: 'JVM 메모리',
    widgetIds: ['heap_ratio', 'heap_used_bytes', 'nonheap_used_bytes', 'gc_pause_avg_ms', 'jvm_threads_live'],
  },
  {
    id: 'infra_runtime',
    label: '인프라 런타임',
    widgetIds: ['cpu_cores', 'rss_bytes', 'open_fds', 'uptime_seconds'],
  },
];

function fmtTs(tSec: number) {
  const d = new Date(tSec * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function defaultWidgets(): AppWidget[] {
  return WIDGET_PRESETS.map((p) => ({
    ...p,
    enabled: true,
  }));
}

export default function AppDetailPage() {
  const router = useRouter();
  const id = String(router.query.id || '');
  const [loading, setLoading] = useState(false);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [appInfo, setAppInfo] = useState<App | null>(null);
  const [targets, setTargets] = useState<any[] | null>(null);
  const [appHealth, setAppHealth] = useState<any | null>(null);
  const [selectedInstance, setSelectedInstance] = useState('');
  const [editingApp, setEditingApp] = useState(false);
  const [appSaving, setAppSaving] = useState(false);
  const [appForm, setAppForm] = useState({
    name: '',
    owner: '',
    job: '',
    enabled: true,
  });
  const [showGuide, setShowGuide] = useState(false);
  const [widgets, setWidgets] = useState<AppWidget[]>([]);
  const [seriesByWidgetId, setSeriesByWidgetId] = useState<Record<string, Point[]>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    title: '',
    expr: '',
    minutes: 60,
    stepSec: 30,
  });
  const [newWidget, setNewWidget] = useState({
    title: '',
    expr: '',
    minutes: 60,
    stepSec: 30,
  });
  const [widgetsHydrated, setWidgetsHydrated] = useState(false);
  const [layoutSaveState, setLayoutSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [layoutSavedAt, setLayoutSavedAt] = useState<number | null>(null);
  const lastSavedLayoutRef = useRef('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  const metricGuide: Record<
    string,
    {
      title: string;
      meaning: string;
      good?: string;
      warn?: string;
      tips?: string;
    }
  > = {
    up_sum: {
      title: 'Up (sum(up))',
      meaning: 'Prometheus 타겟의 up 값을 합산한 값입니다. 0이면 해당 job의 타겟이 모두 DOWN 입니다.',
      good: '>= 1',
      warn: '== 0 (장애/스크랩 실패)',
      tips: 'DOWN인데 서버는 살아있다면 /actuator/prometheus 응답 지연(Timeout), DNS/네트워크, 인증 토큰을 먼저 확인하세요.',
    },
    rps: {
      title: 'RPS',
      meaning: '초당 처리 요청 수입니다 (http_server_requests_* 기반).',
      good: '평소 베이스라인 근처 유지',
      warn: '급락(거의 0) 또는 급증',
      tips: 'RPS 급락 + up=1이면 라우팅/외부 트래픽 문제일 수 있습니다. RPS 급증 시 CPU/GC/latency도 같이 보세요.',
    },
    http_total_rps: {
      title: 'HTTP total RPS',
      meaning: 'HTTP 메트릭 기준 전체 요청 처리량입니다.',
      good: 'RPS와 유사한 베이스라인 유지',
      warn: '갑작스런 급락/급증',
      tips: 'rps와 값 차이가 크면 계측 누락이나 메트릭 라벨 차이를 점검하세요.',
    },
    http_2xx: {
      title: 'HTTP 2xx',
      meaning: '성공 응답(2xx) 초당 비율입니다.',
      good: '전체 RPS 대부분이 2xx',
      warn: '비율 하락',
      tips: '2xx가 줄고 4xx/5xx가 오르면 릴리즈/라우팅/의존성 이슈 가능성이 큽니다.',
    },
    http_3xx: {
      title: 'HTTP 3xx',
      meaning: '리다이렉트 응답(3xx) 초당 비율입니다.',
      good: '의도된 범위 유지',
      warn: '갑작스러운 증가',
      tips: '3xx 급증은 잘못된 리다이렉트/게이트웨이 설정 변화를 의심하세요.',
    },
    http_4xx: {
      title: 'HTTP 4xx',
      meaning: '클라이언트 오류(4xx) 초당 비율입니다.',
      good: '낮고 안정적',
      warn: '지속 증가',
      tips: '배포 직후 4xx 증가 시 API 계약/인증/권한 변경 여부를 먼저 확인하세요.',
    },
    http_5xx: {
      title: 'HTTP 5xx',
      meaning: '서버 오류(5xx) 초당 비율입니다.',
      good: '0에 근접',
      warn: '지속 발생',
      tips: '5xx 증가 시 latency, DB/외부 의존성, 스레드 풀 상태를 같이 보세요.',
    },
    http_5xx_ratio: {
      title: 'HTTP 5xx ratio',
      meaning: '전체 요청 중 5xx 비율입니다.',
      good: '< 0.1%',
      warn: '> 1% (주의), > 5% (심각)',
      tips: '5xx 비율이 오르면 latency, DB, 외부 의존성 오류, 스레드/커넥션 고갈을 의심하세요.',
    },
    http_4xx_ratio: {
      title: 'HTTP 4xx ratio',
      meaning: '전체 요청 중 4xx 비율입니다.',
      good: '서비스 특성에 맞는 낮은 수준',
      warn: '평소 대비 급상승',
      tips: '클라이언트 배포/인증 토큰 만료/요청 스키마 변경 여부를 확인하세요.',
    },
    latency_p50_s: {
      title: 'p50 latency',
      meaning: '요청 지연의 중앙값(50퍼센타일, 초)입니다.',
      good: '< 0.1~0.2s (대략)',
      warn: '지속 증가',
      tips: 'p50은 전체 성능 저하 신호입니다. p95/p99와 함께 보면 병목 구간을 구분하기 쉽습니다.',
    },
    latency_p95_s: {
      title: 'p95 latency',
      meaning: '요청 지연의 95퍼센타일(초)입니다.',
      good: '< 0.3s (대략)',
      warn: '> 1s (주의), > 3s (심각)',
      tips: 'p95가 오르면 RPS/CPU/GC/DB 커넥션과 같이 보세요. tail latency는 “가끔” 발생해도 사용자 체감이 큽니다.',
    },
    latency_p99_s: {
      title: 'p99 latency',
      meaning: '요청 지연의 99퍼센타일(초)입니다.',
      good: 'p95 대비 과도한 벌어짐 없음',
      warn: 'p95 대비 큰 격차/급등',
      tips: 'p99 급등은 일부 요청 경로의 병목 가능성이 높습니다. 느린 endpoint/외부 호출을 추적하세요.',
    },
    latency_avg_s: {
      title: 'avg latency',
      meaning: '요청 평균 지연(초)입니다.',
      good: '낮고 안정적',
      warn: '평균 지연의 지속 상승',
      tips: '평균값은 이상치에 덜 민감합니다. tail 이슈 파악은 p95/p99를 함께 보세요.',
    },
    heap_ratio: {
      title: 'Heap ratio',
      meaning: '사용중 heap / max heap 비율입니다.',
      good: '< 70%',
      warn: '> 80% (주의), > 90~95% (심각)',
      tips: 'heap이 높고 GC pause가 같이 오르면 메모리 압박/할당 폭주 가능성이 큽니다. 캐시/버퍼/객체 생성량을 점검하세요.',
    },
    heap_used_bytes: {
      title: 'Heap used bytes',
      meaning: 'JVM heap에서 실제 사용 중인 바이트입니다.',
      good: '톱니형 패턴 + 완만한 추세',
      warn: 'GC 후에도 지속 상승',
      tips: 'heap used가 우상향 고정이면 메모리 누수 가능성을 점검하세요.',
    },
    gc_pause_avg_ms: {
      title: 'GC pause avg',
      meaning: 'GC pause 평균(밀리초)입니다.',
      good: '< 20ms (대략)',
      warn: '> 100ms (주의), > 300ms (심각)',
      tips: 'GC pause가 커지면 latency가 같이 튈 수 있습니다. heap ratio, allocation rate, CPU를 함께 확인하세요.',
    },
    nonheap_used_bytes: {
      title: 'Non-heap used bytes',
      meaning: 'Metaspace/Code Cache 등 non-heap 사용량입니다.',
      good: '완만하고 안정적',
      warn: '지속 상승/급증',
      tips: '클래스 로딩 증가, 에이전트/라이브러리 변경 시 non-heap이 커질 수 있습니다.',
    },
    jvm_threads_live: {
      title: 'JVM live threads',
      meaning: '현재 살아있는 JVM 스레드 수입니다.',
      good: '부하 대비 안정적',
      warn: '지속 증가/급격한 변동',
      tips: '스레드 수 증가와 CPU/latency 상승이 함께 나타나면 스레드 누수나 블로킹을 의심하세요.',
    },
    cpu_cores: {
      title: 'CPU cores',
      meaning: '프로세스 CPU 사용량(코어 단위)입니다. 1.0은 “코어 1개를 꽉” 쓰는 수준입니다.',
      good: '코어 제한 대비 여유 (예: 1코어 제한이면 < 0.7 권장)',
      warn: '코어 제한 근접/초과',
      tips: 'CPU가 높으면 RPS/latency/GC와 함께 상승하는지 확인하세요. 스레드 고갈로 /actuator/prometheus 스크랩도 실패할 수 있습니다.',
    },
    rss_bytes: {
      title: 'RSS bytes',
      meaning: '프로세스가 실제 물리 메모리(RAM)에서 점유 중인 크기입니다.',
      good: '메모리 제한 대비 여유 (지속 상승 없이 안정)',
      warn: '지속 우상향/제한 근접',
      tips: 'heap ratio, non-heap, 캐시 사용량과 함께 보며 누수(steady growth) 패턴인지 확인하세요.',
    },
    open_fds: {
      title: 'Open file descriptors',
      meaning: '현재 열린 파일 디스크립터 수입니다.',
      good: '한도 대비 충분한 여유',
      warn: '지속 증가/한도 근접',
      tips: '소켓/파일 핸들 누수가 있으면 점진적으로 증가합니다. OS fd limit과 함께 확인하세요.',
    },
    uptime_seconds: {
      title: 'Uptime (seconds)',
      meaning: '프로세스 기동 후 경과 시간입니다.',
      good: '예상 재시작 정책에 부합',
      warn: '짧은 주기로 반복 리셋',
      tips: 'uptime이 자주 초기화되면 OOMKill, 크래시, 롤링 설정을 점검하세요.',
    },
    burn_rate_5m: {
      title: 'SLO burn rate (5m)',
      meaning: '짧은 창(5분) 기준 에러 버짓 소진 속도입니다.',
      good: '< 1',
      warn: '> 1 (예산 초과 소진)',
      tips: '5m burn rate는 급성 장애 탐지에 유용합니다. p95, 5xx와 함께 확인하세요.',
    },
    burn_rate_1h: {
      title: 'SLO burn rate (1h)',
      meaning: '중간 창(1시간) 기준 에러 버짓 소진 속도입니다.',
      good: '< 1',
      warn: '> 1 (지속 악화)',
      tips: '1h burn rate가 높으면 일시적 스파이크가 아닌 지속 문제일 가능성이 큽니다.',
    },
  };

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const scopeInstance = selectedInstance || undefined;
      const [a, s, t, healthList] = await Promise.all([
        opsApi.apps.get(id),
        opsApi.apps.summary(id, scopeInstance),
        opsApi.apps.targets(id),
        opsApi.apps.health(),
      ]);
      setAppInfo(a);
      setAppForm({
        name: a.name || '',
        owner: a.owner || '',
        job: a.job || '',
        enabled: Boolean(a.enabled),
      });
      setSummary(s);
      setTargets(t?.targets || []);
      setAppHealth(Array.isArray(healthList) ? healthList.find((h: any) => h?.appId === id) ?? null : null);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id, selectedInstance]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setWidgetsHydrated(false);
    setLayoutSaveState('idle');
    setLayoutSavedAt(null);
    lastSavedLayoutRef.current = '';
    opsApi.apps
      .getWidgetLayout(id)
      .then((res) => {
        if (!alive) return;
        const parsed = Array.isArray(res?.widgets) ? (res.widgets as AppWidget[]) : [];
        if (!parsed.length) {
          const defaults = defaultWidgets();
          setWidgets(defaults);
          lastSavedLayoutRef.current = JSON.stringify(defaults);
          return;
        }
        const next = parsed
          .filter((w) => w && w.enabled !== false)
          .map((w) => ({
            ...w,
            enabled: true,
            helpKey: w.helpKey || PRESET_HELP_KEY_BY_ID[w.id] || undefined,
          }));
        setWidgets(next);
        lastSavedLayoutRef.current = JSON.stringify(next);
      })
      .catch(() => {
        if (!alive) return;
        const defaults = defaultWidgets();
        setWidgets(defaults);
        lastSavedLayoutRef.current = JSON.stringify(defaults);
      })
      .finally(() => {
        if (!alive) return;
        setWidgetsHydrated(true);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!id || !widgetsHydrated) return;
    const payload = JSON.stringify(widgets);
    if (payload === lastSavedLayoutRef.current) return;
    const timer = window.setTimeout(() => {
      setLayoutSaveState('saving');
      opsApi.apps
        .saveWidgetLayout(id, widgets)
        .then(() => {
          lastSavedLayoutRef.current = payload;
          setLayoutSaveState('saved');
          setLayoutSavedAt(Date.now());
        })
        .catch(() => {
          setLayoutSaveState('error');
        });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [widgets, id, widgetsHydrated]);

  useEffect(() => {
    const run = async () => {
      if (!id) return;
      if (widgets.length === 0) {
        setSeriesByWidgetId({});
        return;
      }
      setWidgetLoading(true);
      try {
        const scopeInstance = selectedInstance || undefined;
        const pairs = await Promise.all(
          widgets.map(async (w) => {
            const res = await opsApi.apps.customTimeseries(id, w.expr, w.minutes, w.stepSec, scopeInstance);
            return [w.id, (res?.points || []) as Point[]] as const;
          }),
        );
        const map: Record<string, Point[]> = {};
        pairs.forEach(([wid, points]) => {
          map[wid] = points;
        });
        setSeriesByWidgetId(map);
      } catch (e: any) {
        setError(String(e));
      } finally {
        setWidgetLoading(false);
      }
    };
    run();
  }, [id, widgets, selectedInstance]);

  const cards = useMemo(() => {
    const m = summary?.metrics || {};
    const get = (k: string) => m?.[k]?.value;
    return [
      { k: 'up_sum', label: 'Up', v: get('up_sum') },
      { k: 'rps', label: 'RPS', v: get('rps') },
      { k: 'http_5xx_ratio', label: '5xx ratio', v: get('http_5xx_ratio') },
      { k: 'latency_p95_s', label: 'p95 latency(s)', v: get('latency_p95_s') },
      { k: 'heap_ratio', label: 'heap ratio', v: get('heap_ratio') },
      { k: 'gc_pause_avg_ms', label: 'GC pause avg(ms)', v: get('gc_pause_avg_ms') },
      { k: 'cpu_cores', label: 'CPU cores', v: get('cpu_cores') },
      { k: 'rss_bytes', label: 'RSS(bytes)', v: get('rss_bytes') },
    ];
  }, [summary]);

  const instanceOptions = useMemo(() => {
    const values = new Set<string>();
    for (const t of targets || []) {
      const instance = String(t?.instance || '').trim();
      if (instance) values.add(instance);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [targets]);

  const Help = ({ metricKey }: { metricKey: string }) => {
    const g = metricGuide[metricKey];
    const text = g
      ? `${g.title}\n\n의미: ${g.meaning}${g.good ? `\n좋은 기준: ${g.good}` : ''}${g.warn ? `\n주의 기준: ${g.warn}` : ''}${
          g.tips ? `\n팁: ${g.tips}` : ''
        }`
      : '';
    return (
      <span className="relative ml-1 inline-flex group align-middle">
        <button
          type="button"
          className="inline-flex items-center justify-center w-4 h-4 rounded-full border text-[10px] text-gray-600 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
          aria-label={`${g?.title || metricKey} help`}
          onClick={() => setShowGuide(true)}
        >
          ?
        </button>
        {text ? (
          <span
            className={[
              'pointer-events-none absolute z-20 w-80 max-w-[80vw]',
              'top-6 left-0',
              'opacity-0 scale-95 translate-y-1',
              'group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0',
              'group-focus-within:opacity-100 group-focus-within:scale-100 group-focus-within:translate-y-0',
              'transition duration-150 ease-out',
              'rounded-xl border bg-white shadow-lg p-3',
              'text-xs text-gray-800 whitespace-pre-line',
            ].join(' ')}
            role="tooltip"
          >
            <span className="font-semibold text-gray-900">{g?.title}</span>
            <span className="block mt-2">{text.replace(/^[^\n]*\n\n?/, '')}</span>
          </span>
        ) : null}
      </span>
    );
  };

  const appName = summary?.app?.name || id;
  const job = summary?.app?.job || '';
  const primaryTarget = Array.isArray(targets) && targets.length > 0 ? targets[0] : null;
  const scopedTarget = selectedInstance
    ? (targets || []).find((t: any) => String(t?.instance || '') === selectedInstance) || null
    : primaryTarget;
  const scopedHealthStatus = scopedTarget
    ? String(scopedTarget.health || '').toLowerCase() === 'up'
      ? 'OK'
      : 'DOWN'
    : 'UNKNOWN';
  const healthStatus = String(selectedInstance ? scopedHealthStatus : appHealth?.healthStatus || scopedHealthStatus).toUpperCase();
  const downReason = appHealth?.targetReason ? String(appHealth.targetReason) : null;
  const downHint =
    downReason === 'timeout'
      ? 'scrape timeout'
      : downReason === 'dns'
      ? 'dns'
      : downReason === 'conn_refused'
      ? 'conn refused'
      : downReason === 'network'
      ? 'network'
      : downReason === 'auth'
      ? 'auth'
      : downReason === 'stale'
      ? 'stale'
      : downReason === 'error'
      ? 'error'
      : null;
  const healthBadgeClass =
    healthStatus === 'DOWN'
      ? 'bg-red-50 text-red-700 border-red-200'
      : healthStatus === 'DEGRADED'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : healthStatus === 'UNKNOWN'
      ? 'bg-gray-50 text-gray-700 border-gray-200'
      : 'bg-green-50 text-green-700 border-green-200';
  const healthLabel = healthStatus === 'DOWN' && downHint ? `DOWN(${downHint})` : healthStatus;
  const isDown = healthStatus === 'DOWN';
  const openEdit = (w: AppWidget) => {
    setEditingId(w.id);
    setEditDraft({
      title: w.title,
      expr: w.expr,
      minutes: w.minutes,
      stepSec: w.stepSec,
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    const expr = String(editDraft.expr || '').trim();
    if (!expr) return;
    setWidgets((prev) =>
      prev.map((w) =>
        w.id === editingId
          ? {
              ...w,
              title: String(editDraft.title || '').trim() || w.title,
              minutes: Number(editDraft.minutes) || 60,
              stepSec: Number(editDraft.stepSec) || 30,
            }
          : w,
      ),
    );
    setEditingId(null);
  };

  const addCustomWidget = () => {
    const expr = String(newWidget.expr || '').trim();
    if (!expr) {
      setError('Custom widget expr를 입력하세요.');
      return;
    }
    const title = String(newWidget.title || '').trim() || `Custom ${widgets.filter((w) => w.custom).length + 1}`;
    const widget: AppWidget = {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      expr,
      minutes: Math.max(1, Number(newWidget.minutes) || 60),
      stepSec: Math.max(5, Number(newWidget.stepSec) || 30),
      enabled: true,
      custom: true,
    };
    setWidgets((prev) => [...prev, widget]);
    setNewWidget({ title: '', expr: '', minutes: 60, stepSec: 30 });
  };

  const togglePresetWidget = (preset: WidgetPreset) => {
    setWidgets((prev) => {
      const idx = prev.findIndex((w) => w.id === preset.id && !w.custom);
      if (idx < 0) return [...prev, { ...preset, enabled: true }];
      return prev.filter((w) => !(w.id === preset.id && !w.custom));
    });
  };

  const isPresetEnabled = (presetId: string) => {
    return widgets.some((x) => x.id === presetId && !x.custom);
  };
  const isBundleEnabled = (widgetIds: string[]) => widgetIds.every((wid) => widgets.some((x) => x.id === wid && !x.custom));
  const toggleBundleWidgets = (widgetIds: string[]) => {
    setWidgets((prev) => {
      const allOn = widgetIds.every((wid) => prev.some((w) => w.id === wid && !w.custom));
      if (allOn) return prev.filter((w) => w.custom || !widgetIds.includes(w.id));
      const existing = new Set(prev.filter((w) => !w.custom).map((w) => w.id));
      const toAdd = WIDGET_PRESETS.filter((p) => widgetIds.includes(p.id) && !existing.has(p.id)).map((p) => ({ ...p, enabled: true }));
      return [...prev, ...toAdd];
    });
  };

  const moveWidget = (wid: string, dir: -1 | 1) => {
    setWidgets((prev) => {
      const idx = prev.findIndex((w) => w.id === wid);
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(nextIdx, 0, item);
      return copy;
    });
  };

  const applyRangeMinutes = (minutes: number) => {
    const m = Math.max(1, Math.floor(minutes));
    setWidgets((prev) => prev.map((w) => ({ ...w, minutes: m })));
  };
  const applyWidgetRangeMinutes = (widgetId: string, minutes: number) => {
    const m = Math.max(1, Math.floor(minutes));
    setWidgets((prev) => prev.map((w) => (w.id === widgetId ? { ...w, minutes: m } : w)));
  };

  const applyCustomRange = () => {
    if (!rangeStart || !rangeEnd) {
      setError('구간 검색은 시작/종료 시간을 모두 입력하세요.');
      return;
    }
    const s = Date.parse(rangeStart);
    const e = Date.parse(rangeEnd);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
      setError('유효한 구간을 입력하세요. (종료 > 시작)');
      return;
    }
    const minutes = Math.max(1, Math.floor((e - s) / 60000));
    applyRangeMinutes(minutes);
    setError(null);
  };

  const saveApp = async () => {
    if (!id) return;
    const name = String(appForm.name || '').trim();
    const jobValue = String(appForm.job || '').trim();
    if (!name || !jobValue) {
      setError('App name/job은 필수입니다.');
      return;
    }
    setAppSaving(true);
    setError(null);
    try {
      const updated = await opsApi.apps.update(id, {
        owner: String(appForm.owner || '').trim(),
        job: jobValue,
        enabled: appForm.enabled,
      });
      setAppInfo(updated);
      setEditingApp(false);
      await load();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setAppSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-sm text-gray-500">
            <Link href="/ops/apps" className="underline">
              Apps
            </Link>{' '}
            / {appName}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">
            {appName} {job ? <span className="text-sm text-gray-500">({job})</span> : null}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <span className={['inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border', healthBadgeClass].join(' ')}>
              {healthLabel}
            </span>
            {healthStatus === 'DEGRADED' ? (
              <span className="text-xs text-gray-600">
                upTargets={appHealth?.targetUpCount ?? '-'} • downTargets={appHealth?.targetDownCount ?? '-'}
              </span>
            ) : null}
            {healthStatus === 'DOWN' ? (
              <span className="text-xs text-gray-600">
                up={appHealth?.upSum ?? '-'} • {appHealth?.lastScrapeAgeSec != null ? `lastScrape ${appHealth.lastScrapeAgeSec}s ago` : 'lastScrape -'}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
          <span
            className={
              layoutSaveState === 'saving'
                ? 'px-2 py-2 rounded-lg text-xs border bg-amber-50 text-amber-800 border-amber-200'
                : layoutSaveState === 'saved'
                ? 'px-2 py-2 rounded-lg text-xs border bg-green-50 text-green-700 border-green-200'
                : layoutSaveState === 'error'
                ? 'px-2 py-2 rounded-lg text-xs border bg-red-50 text-red-700 border-red-200'
                : 'px-2 py-2 rounded-lg text-xs border bg-gray-50 text-gray-600 border-gray-200'
            }
          >
            {layoutSaveState === 'saving'
              ? 'Widget saving...'
              : layoutSaveState === 'saved'
              ? `Widget saved${layoutSavedAt ? ` (${new Date(layoutSavedAt).toLocaleTimeString()})` : ''}`
              : layoutSaveState === 'error'
              ? 'Widget save failed'
              : 'Widget idle'}
          </span>
          <button type="button" onClick={() => setEditingApp((v) => !v)} className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm">
            {editingApp ? 'Close Edit App' : 'Edit App'}
          </button>
          <Link href={`/ops/rules?scope=app&appId=${id}`} className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm">
            Rules
          </Link>
          <button onClick={load} className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm">
            Refresh
          </button>
        </div>
      </div>

      {editingApp && (
        <div className="mb-6 p-4 rounded-xl border bg-white">
          <div className="font-semibold text-gray-900 mb-3">Edit App</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-gray-600">Name</label>
              <input className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" value={appForm.name} onChange={(e) => setAppForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-600">Owner</label>
              <input className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" value={appForm.owner} onChange={(e) => setAppForm((f) => ({ ...f, owner: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-600">Job</label>
              <input className="w-full mt-1 px-3 py-2 border rounded-lg text-sm font-mono" value={appForm.job} onChange={(e) => setAppForm((f) => ({ ...f, job: e.target.value }))} />
            </div>
            <div className="flex items-end">
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={appForm.enabled} onChange={(e) => setAppForm((f) => ({ ...f, enabled: e.target.checked }))} />
              </label>
            </div>
          </div>
          <div className="mt-3 text-xs text-gray-500">id={appInfo?.id || id} • clusterId={appInfo?.clusterId || '-'}</div>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={appSaving} onClick={saveApp} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm disabled:opacity-50">
              {appSaving ? 'Saving...' : 'Save App'}
            </button>
            <button type="button" disabled={appSaving} onClick={() => setEditingApp(false)} className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm disabled:opacity-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {editingApp && (
        <div className="mb-6 p-4 rounded-xl border bg-white">
          <div className="font-semibold text-gray-900 mb-3">Widget Selection</div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => toggleBundleWidgets(RECOMMENDED_WIDGET_IDS)}
              className={
                isBundleEnabled(RECOMMENDED_WIDGET_IDS)
                  ? 'px-3 py-1.5 rounded-lg text-xs border border-blue-200 bg-blue-600 text-white'
                  : 'px-3 py-1.5 rounded-lg text-xs border bg-white hover:bg-gray-50'
              }
            >
              추천 위젯 세트
            </button>
            {SCENARIO_BUNDLES.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => toggleBundleWidgets(b.widgetIds)}
                className={
                  isBundleEnabled(b.widgetIds)
                    ? 'px-3 py-1.5 rounded-lg text-xs border border-blue-200 bg-blue-600 text-white'
                    : 'px-3 py-1.5 rounded-lg text-xs border bg-white hover:bg-gray-50'
                }
              >
                {b.label}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {(['Traffic', 'Errors', 'Latency', 'JVM', 'Infra', 'SLO'] as const).map((cat) => (
              <div key={cat}>
                <div className="text-[11px] text-gray-500 mb-1">{cat}</div>
                <div className="flex flex-wrap gap-2">
                  {WIDGET_PRESETS.filter((x) => x.category === cat).map((p) => {
                    const on = isPresetEnabled(p.id);
                    return (
                      <div key={p.id} className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => togglePresetWidget(p)}
                          className={
                            on
                              ? 'px-2 py-1 rounded-lg text-xs border border-blue-200 bg-blue-600 text-white'
                              : 'px-2 py-1 rounded-lg text-xs border bg-white hover:bg-gray-50'
                          }
                        >
                          {p.title} {on ? 'ON' : 'OFF'}
                        </button>
                        <Help metricKey={p.helpKey || p.id} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editingApp && (
        <div className="mb-6 p-4 rounded-xl border bg-white">
          <div className="font-semibold text-gray-900 mb-3">Add Custom Widget</div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
            <input
              className="px-3 py-2 border rounded-lg text-sm"
              placeholder="Title"
              value={newWidget.title}
              onChange={(e) => setNewWidget((v) => ({ ...v, title: e.target.value }))}
            />
            <input
              type="number"
              min={1}
              className="px-3 py-2 border rounded-lg text-sm"
              value={newWidget.minutes}
              onChange={(e) => setNewWidget((v) => ({ ...v, minutes: Number(e.target.value) }))}
            />
            <input
              type="number"
              min={5}
              className="px-3 py-2 border rounded-lg text-sm"
              value={newWidget.stepSec}
              onChange={(e) => setNewWidget((v) => ({ ...v, stepSec: Number(e.target.value) }))}
            />
            <button type="button" onClick={addCustomWidget} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm">
              Add Widget
            </button>
          </div>
          <textarea
            className="w-full px-3 py-2 border rounded-lg text-xs font-mono"
            rows={3}
            placeholder='sum(rate(http_server_requests_seconds_count{job="${job}"${instanceMatcher}}[5m]))'
            value={newWidget.expr}
            onChange={(e) => setNewWidget((v) => ({ ...v, expr: e.target.value }))}
          />
          <div className="text-xs text-gray-500 mt-1">`${'{job}'}` / `${'{instanceMatcher}'}` 지원</div>
        </div>
      )}

      <div className="mb-6 p-4 rounded-xl border bg-white">
        <div className="text-xs text-gray-500 mb-2">Metric Scope</div>
        <div className="flex flex-wrap items-center gap-3">
          <select className="px-3 py-2 rounded-lg border bg-white text-sm" value={selectedInstance} onChange={(e) => setSelectedInstance(e.target.value)}>
            <option value="">All instances (aggregate)</option>
            {instanceOptions.map((inst) => (
              <option key={inst} value={inst}>
                {inst}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-600">
            {selectedInstance ? (
              <>
                instance <span className="font-mono">{selectedInstance}</span> 기준으로 조회합니다.
              </>
            ) : (
              'job 전체 인스턴스를 합산해서 조회합니다.'
            )}
          </span>
        </div>
        <div className="mt-3">
          <div className="text-xs text-gray-500 mb-2">Time Range</div>
          <div className="flex flex-wrap items-center gap-2">
            {[60, 180, 360, 720, 1440].map((m) => (
              <button
                key={m}
                type="button"
                className="px-2 py-1 rounded-lg text-xs border bg-white hover:bg-gray-50"
                onClick={() => applyRangeMinutes(m)}
              >
                {m >= 60 ? `${m / 60}h` : `${m}m`}
              </button>
            ))}
            <input
              type="datetime-local"
              className="px-2 py-1 rounded-lg border text-xs"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
            />
            <input
              type="datetime-local"
              className="px-2 py-1 rounded-lg border text-xs"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
            />
            <button
              type="button"
              className="px-2 py-1 rounded-lg text-xs border bg-white hover:bg-gray-50"
              onClick={applyCustomRange}
            >
              Apply
            </button>
          </div>
        </div>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      {loading && <div className="text-sm text-gray-600 mb-4">Loading...</div>}
      {widgetLoading && <div className="text-sm text-gray-600 mb-4">Loading widgets...</div>}

      {summary && (
        <>
          <div className="p-5 rounded-xl border bg-white mb-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-semibold text-gray-900">Metrics Guide</div>
                <div className="text-xs text-gray-600 mt-1">수치의 의미와 기준을 빠르게 확인합니다.</div>
              </div>
              <button type="button" onClick={() => setShowGuide((v) => !v)} className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-xs">
                {showGuide ? 'Hide' : 'Show'}
              </button>
            </div>
            {showGuide && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(metricGuide).map(([k, g]) => (
                  <div key={k} className="p-4 rounded-xl border bg-gray-50">
                    <div className="text-sm font-semibold text-gray-900">{g.title}</div>
                    <div className="text-xs text-gray-700 mt-1">{g.meaning}</div>
                    {g.good ? <div className="text-xs text-emerald-700 mt-2">좋은 기준: {g.good}</div> : null}
                    {g.warn ? <div className="text-xs text-orange-700 mt-1">주의 기준: {g.warn}</div> : null}
                    {g.tips ? <div className="text-xs text-gray-600 mt-2">팁: {g.tips}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {cards.map((c) => (
              <div key={c.k} className="p-4 rounded-xl border bg-white">
                <div className="text-xs text-gray-500 flex items-center">
                  <span>{c.label}</span>
                  <Help metricKey={c.k} />
                </div>
                <div className="text-lg font-semibold text-gray-900 mt-1">
                  {c.v === null || c.v === undefined ? '-' : Number(c.v).toFixed(4).replace(/\.?0+$/, '')}
                </div>
              </div>
            ))}
          </div>

          {widgets.length === 0 ? (
            <div className="p-6 rounded-xl border bg-white text-sm text-gray-600">No widgets selected. Edit App에서 위젯을 ON 하세요.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {widgets.map((w) => {
              const points = seriesByWidgetId[w.id] || [];
              const resolvedHelpKey = w.helpKey || PRESET_HELP_KEY_BY_ID[w.id];
              const help = resolvedHelpKey ? metricGuide[resolvedHelpKey] : null;
              return (
                <div key={w.id} className="p-5 rounded-xl border bg-white">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="font-semibold text-gray-900 flex items-center">
                      <span>{w.title}</span>
                      {w.custom ? <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded border bg-gray-50 text-gray-600">custom</span> : null}
                      {help && resolvedHelpKey ? <Help metricKey={resolvedHelpKey} /> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {[60, 180, 360, 720].map((m) => (
                        <button
                          key={`${w.id}_r_${m}`}
                          type="button"
                          onClick={() => applyWidgetRangeMinutes(w.id, m)}
                          className="px-2 py-1 rounded border text-xs"
                        >
                          {m / 60}h
                        </button>
                      ))}
                      {editingApp ? (
                        <>
                          <button type="button" onClick={() => openEdit(w)} className="px-2 py-1 rounded border text-xs">
                            Edit
                          </button>
                          <button type="button" onClick={() => moveWidget(w.id, -1)} className="px-2 py-1 rounded border text-xs">
                            ↑
                          </button>
                          <button type="button" onClick={() => moveWidget(w.id, 1)} className="px-2 py-1 rounded border text-xs">
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => setWidgets((prev) => prev.filter((x) => x.id !== w.id))}
                            className="px-2 py-1 rounded border border-red-200 text-red-700 text-xs"
                          >
                            Remove
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  {editingId === w.id ? (
                    <div className="mb-3 p-3 rounded-lg border bg-gray-50">
                      <input
                        className="w-full px-2 py-1.5 border rounded text-sm mb-2"
                        value={editDraft.title}
                        onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                        placeholder="Title"
                      />
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <input
                          type="number"
                          min={1}
                          className="px-2 py-1.5 border rounded text-sm"
                          value={editDraft.minutes}
                          onChange={(e) => setEditDraft((d) => ({ ...d, minutes: Number(e.target.value) }))}
                        />
                        <input
                          type="number"
                          min={5}
                          className="px-2 py-1.5 border rounded text-sm"
                          value={editDraft.stepSec}
                          onChange={(e) => setEditDraft((d) => ({ ...d, stepSec: Number(e.target.value) }))}
                        />
                      </div>
                      <textarea
                        className="w-full px-2 py-1.5 border rounded text-xs font-mono"
                        rows={3}
                        value={editDraft.expr}
                        onChange={(e) => setEditDraft((d) => ({ ...d, expr: e.target.value }))}
                      />
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={saveEdit} className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs">
                          Save
                        </button>
                        <button type="button" onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded border text-xs">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={points.map((p) => ({ ...p, label: fmtTs(p.t) }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="v" stroke="#2563eb" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </>
      )}
    </MainLayout>
  );
}
