import type { MonitorRuleKind } from './store.js';

/**
 * Everything `buildDigestPayload` needs about one breach. Deliberately narrower than
 * `MonitorBreachRow`: the digest never touches `id`/`digest_id`/`rule_id`/etc, and it needs
 * `symbol`, which lives on the rule, not the breach row — so the monitor-service call site
 * assembles this from the rule it just evaluated plus the outcome it just computed.
 */
export interface MonitorDigestBreachInput {
  readonly kind: MonitorRuleKind;
  readonly symbol: string | null;
  readonly spec: Record<string, unknown>;
  readonly observed_value: number | string | null;
  readonly threshold_value: number | string | null;
}

export interface MonitorDigestItem {
  readonly kind: MonitorRuleKind;
  readonly symbol?: string;
  readonly label: string;
  readonly observedValue: number | string | null;
  readonly threshold: number | string | null;
}

export interface MonitorDigestPayload {
  readonly breachCount: number;
  readonly items: readonly MonitorDigestItem[];
  readonly url: string;
}

function formatValue(value: number | string | null): string {
  return value === null || value === undefined ? '-' : String(value);
}

function riskMetricLabel(spec: Record<string, unknown>): string {
  const metric = spec?.['metric'];
  return typeof metric === 'string' && metric.length > 0 ? metric : '리스크 지표';
}

function itemLabel(breach: MonitorDigestBreachInput): string {
  switch (breach.kind) {
    case 'thesis_invalidation':
      return `${breach.symbol ?? ''} 투자논거 무효화 조건 충족`;
    case 'risk_threshold':
      return `${riskMetricLabel(breach.spec)} ${formatValue(breach.observed_value)} (임계 ${formatValue(breach.threshold_value)})`;
    case 'stress_scenario':
      return `스트레스 예상 손실 ${formatValue(breach.observed_value)}% (임계 ${formatValue(breach.threshold_value)}%)`;
  }
}

function digestUrl(publicOrigin: string): string {
  const path = '/#/portfolio?tab=monitors';
  return publicOrigin ? `${publicOrigin}${path}` : path;
}

export function buildDigestPayload(
  breaches: readonly MonitorDigestBreachInput[],
  publicOrigin: string,
): MonitorDigestPayload {
  const items = breaches.map((breach) => Object.freeze<MonitorDigestItem>({
    kind: breach.kind,
    ...(breach.symbol ? { symbol: breach.symbol } : {}),
    label: itemLabel(breach),
    observedValue: breach.observed_value,
    threshold: breach.threshold_value,
  }));
  return Object.freeze({
    breachCount: breaches.length,
    items: Object.freeze(items),
    url: digestUrl(publicOrigin),
  });
}

export function digestSubject(payload: MonitorDigestPayload): string {
  return `[포트폴리오 모니터링] ${payload.breachCount}건의 감시 조건이 충족되었습니다`;
}

export function digestBody(payload: MonitorDigestPayload): string {
  const itemLines = payload.items.map((item) => `- ${item.label}`).join('\n');
  return `${payload.breachCount}건의 감시 조건이 충족되어 검토가 필요합니다.\n\n${itemLines}\n\n자세히 보기: ${payload.url}\n\n이 알림은 정보 제공 목적이며 자동 주문이 아닙니다. 거래 원장에는 반영되지 않았습니다.`;
}
