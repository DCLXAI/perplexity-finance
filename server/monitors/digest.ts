import type { MonitorRuleKind } from './store.js';

/**
 * Everything `buildDigestPayload` needs about one breach. Deliberately narrower than
 * `MonitorBreachRow`, but a structural subset of it: the payload is assembled from the
 * durable `monitor_breaches` rows attached to the digest (see
 * `listMonitorBreachesByDigest`), so a `MonitorBreachRow` satisfies this directly.
 *
 * The watched symbol is read out of `spec` rather than taken as its own field: the
 * `monitor_rules.symbol` column is itself derived from `spec.symbol` (see `resolveRuleSymbol`
 * in routes/portfolio/monitor-rules.ts), and `spec` is what the breach row carries.
 */
export interface MonitorDigestBreachInput {
  readonly kind: MonitorRuleKind;
  readonly portfolio_id: string;
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

/**
 * `monitor_breaches.observed_value` is `numeric(28, 8)`, which arrives from PostgREST as a
 * string like `"190.00000000"`. Rendering that verbatim in an email is noise, so numeric-looking
 * values are normalised to at most two decimals; anything that is not a finite number is passed
 * through untouched rather than silently turned into `NaN`.
 */
function formatValue(value: number | string | null): string {
  if (value === null || value === undefined) return '-';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return String(Math.round(numeric * 100) / 100);
}

function specString(spec: Record<string, unknown>, key: string): string | null {
  const value = spec?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function riskMetricLabel(spec: Record<string, unknown>): string {
  return specString(spec, 'metric') ?? '리스크 지표';
}

/**
 * Korean label and unit for each thesis condition. Without these, every thesis breach on the
 * same symbol rendered as one identical line — `price_below 150` and `drawdown_from_entry_pct
 * 20` on AAPL were byte-identical — for the rule kind that most directly prompts a sell
 * decision. The risk and stress labels already carry both numbers; this makes the thesis line
 * consistent with them.
 */
const THESIS_CONDITION_LABELS: Readonly<Record<string, readonly [string, string]>> = Object.freeze({
  price_below: ['기준가 하회', ''],
  price_above: ['기준가 상회', ''],
  drawdown_from_entry_pct: ['평균단가 대비 하락률', '%'],
  weight_above_pct: ['비중 상회', '%'],
  no_verified_price_days: ['검증 시세 미확인 일수', '일'],
});

function thesisLabel(breach: MonitorDigestBreachInput): string {
  const symbol = specString(breach.spec, 'symbol');
  const condition = specString(breach.spec, 'condition');
  const known = condition ? THESIS_CONDITION_LABELS[condition] : undefined;
  const [conditionLabel, unit] = known ?? [condition ?? '조건', ''];
  const observed = `${formatValue(breach.observed_value)}${unit}`;
  const threshold = `${formatValue(breach.threshold_value)}${unit}`;
  const prefix = symbol ? `${symbol} ` : '';
  return `${prefix}투자논거 무효화 · ${conditionLabel} ${observed} (임계 ${threshold})`;
}

function itemLabel(breach: MonitorDigestBreachInput): string {
  switch (breach.kind) {
    case 'thesis_invalidation':
      return thesisLabel(breach);
    case 'risk_threshold':
      return `${riskMetricLabel(breach.spec)} ${formatValue(breach.observed_value)} (임계 ${formatValue(breach.threshold_value)})`;
    case 'stress_scenario':
      return `스트레스 예상 손실 ${formatValue(breach.observed_value)}% (임계 ${formatValue(breach.threshold_value)}%)`;
  }
}

/**
 * A digest is per-user, so it can in principle span several portfolios. `PortfolioPage` reads
 * `portfolioId` and nothing in `src/` reads a `tab` parameter, so the previous
 * `?tab=monitors` link silently landed on whichever portfolio happened to be selected. The
 * link therefore carries the first (oldest) breach's portfolio: the monitor status panel lives
 * on the portfolio page itself, so this puts the reader on the portfolio that raised the
 * earliest breach in the digest, and the remaining portfolios are one selector click away.
 * Per-item links were rejected because the email body renders one line per breach and a URL on
 * every line is unreadable, while the overwhelmingly common case is a single-portfolio digest.
 */
function digestUrl(breaches: readonly MonitorDigestBreachInput[], publicOrigin: string): string {
  const portfolioId = breaches[0]?.portfolio_id;
  const path = portfolioId
    ? `/#/portfolio?portfolioId=${encodeURIComponent(portfolioId)}`
    : '/#/portfolio';
  return publicOrigin ? `${publicOrigin}${path}` : path;
}

export function buildDigestPayload(
  breaches: readonly MonitorDigestBreachInput[],
  publicOrigin: string,
): MonitorDigestPayload {
  const items = breaches.map((breach) => {
    const symbol = specString(breach.spec, 'symbol');
    return Object.freeze<MonitorDigestItem>({
      kind: breach.kind,
      ...(symbol ? { symbol } : {}),
      label: itemLabel(breach),
      observedValue: breach.observed_value,
      threshold: breach.threshold_value,
    });
  });
  return Object.freeze({
    breachCount: breaches.length,
    items: Object.freeze(items),
    url: digestUrl(breaches, publicOrigin),
  });
}

export function digestSubject(payload: MonitorDigestPayload): string {
  return `[포트폴리오 모니터링] ${payload.breachCount}건의 감시 조건이 충족되었습니다`;
}

export function digestBody(payload: MonitorDigestPayload): string {
  const itemLines = payload.items.map((item) => `- ${item.label}`).join('\n');
  return `${payload.breachCount}건의 감시 조건이 충족되어 검토가 필요합니다.\n\n${itemLines}\n\n자세히 보기: ${payload.url}\n\n이 알림은 정보 제공 목적이며 자동 주문이 아닙니다. 거래 원장에는 반영되지 않았습니다.`;
}
