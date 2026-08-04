import type {
  DataProvenance,
  PortfolioHolding,
  PortfolioRiskMetrics,
  RemoteCandle,
} from '../../shared/api.js';

export interface PortfolioHistorySeries {
  readonly symbol: string;
  readonly candles: readonly RemoteCandle[];
  readonly provenance: DataProvenance;
}

function round(value: number, digits = 4): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function dailyReturns(candles: readonly RemoteCandle[]): ReadonlyMap<string, number> {
  const closes = new Map<string, { time: number; close: number }>();
  for (const candle of candles) {
    if (!Number.isFinite(candle.time) || !Number.isFinite(candle.close) || candle.close <= 0) continue;
    const date = new Date(candle.time * 1000).toISOString().slice(0, 10);
    const previous = closes.get(date);
    if (!previous || candle.time > previous.time) closes.set(date, { time: candle.time, close: candle.close });
  }
  const ordered = [...closes.entries()].sort(([left], [right]) => left.localeCompare(right));
  const returns = new Map<string, number>();
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1][1].close;
    const current = ordered[index][1].close;
    const value = current / previous - 1;
    if (Number.isFinite(value) && value > -1) returns.set(ordered[index][0], value);
  }
  return returns;
}

function quantile(sorted: readonly number[], probability: number): number {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function sampleStdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function maxDrawdown(returns: readonly number[]): number {
  let value = 1;
  let peak = 1;
  let worst = 0;
  for (const dailyReturn of returns) {
    value *= 1 + dailyReturn;
    peak = Math.max(peak, value);
    worst = Math.min(worst, value / peak - 1);
  }
  return Math.max(0, -worst);
}

function quality(series: readonly PortfolioHistorySeries[]): PortfolioRiskMetrics['dataQuality'] {
  if (!series.length) return 'synthetic';
  if (series.some((entry) => entry.provenance.quality === 'synthetic' || entry.provenance.source === 'local-simulation')) return 'synthetic';
  if (series.every((entry) => ['provider', 'verified'].includes(entry.provenance.quality)
    && !['stale', 'fallback', 'mock'].includes(entry.provenance.mode))) return 'verified';
  return 'mixed';
}

export function computePortfolioRisk(
  holdings: readonly PortfolioHolding[],
  histories: readonly PortfolioHistorySeries[],
  totalMarketValue: number,
): PortfolioRiskMetrics {
  const priced = holdings.filter((holding) => (holding.marketValue ?? 0) > 0);
  const weights = priced.map((holding) => ({
    symbol: holding.symbol,
    weight: totalMarketValue > 0 ? (holding.marketValue ?? 0) / totalMarketValue : 0,
  }));
  const concentrationHhi = weights.reduce((sum, entry) => sum + entry.weight ** 2, 0);
  const topHoldingPct = weights.reduce((max, entry) => Math.max(max, entry.weight * 100), 0);
  const effectiveHoldings = concentrationHhi > 0 ? 1 / concentrationHhi : 0;
  const warnings: string[] = [];

  const historyMap = new Map(histories.map((entry) => [entry.symbol, entry]));
  const eligible = weights.flatMap((entry) => {
    const history = historyMap.get(entry.symbol);
    if (!history) return [];
    const returns = dailyReturns(history.candles);
    return returns.size >= 20 ? [{ ...entry, history, returns }] : [];
  });
  const coveredWeight = eligible.reduce((sum, entry) => sum + entry.weight, 0);
  const riskCoveragePct = Math.max(0, Math.min(100, coveredWeight * 100));

  if (!eligible.length || coveredWeight <= 0) {
    warnings.push('20개 이상의 일별 수익률을 가진 보유종목이 없어 역사적 리스크를 계산하지 못했습니다.');
    return Object.freeze({
      status: 'insufficient-data',
      dataQuality: quality(histories),
      observations: 0,
      concentrationHhi: round(concentrationHhi, 6),
      effectiveHoldings: round(effectiveHoldings, 2),
      topHoldingPct: round(topHoldingPct, 2),
      pricedCoveragePct: round(riskCoveragePct, 2),
      warnings: Object.freeze(warnings),
    });
  }

  let dates: Set<string> | undefined;
  for (const entry of eligible) {
    const ownDates = new Set(entry.returns.keys());
    dates = dates === undefined
      ? ownDates
      : new Set<string>(Array.from(dates).filter((date: string) => ownDates.has(date)));
  }
  const alignedDates = [...(dates ?? [])].sort();
  const normalizedWeight = eligible.reduce((sum, entry) => sum + entry.weight, 0);
  const portfolioReturns = alignedDates.map((date) => eligible.reduce(
    (sum, entry) => sum + (entry.weight / normalizedWeight) * (entry.returns.get(date) ?? 0),
    0,
  )).filter(Number.isFinite);

  if (portfolioReturns.length < 20) {
    warnings.push('보유종목 간 공통 거래일이 20일 미만이라 역사적 VaR·변동성을 계산하지 못했습니다.');
    return Object.freeze({
      status: 'insufficient-data',
      dataQuality: quality(eligible.map((entry) => entry.history)),
      observations: portfolioReturns.length,
      concentrationHhi: round(concentrationHhi, 6),
      effectiveHoldings: round(effectiveHoldings, 2),
      topHoldingPct: round(topHoldingPct, 2),
      pricedCoveragePct: round(riskCoveragePct, 2),
      warnings: Object.freeze(warnings),
    });
  }

  const sorted = [...portfolioReturns].sort((left, right) => left - right);
  const q05 = quantile(sorted, 0.05);
  const tail = sorted.filter((value) => value <= q05);
  const cvarReturn = tail.length ? tail.reduce((sum, value) => sum + value, 0) / tail.length : q05;
  const varPct = Math.max(0, -q05 * 100);
  const cvarPct = Math.max(0, -cvarReturn * 100);
  const dataQuality = quality(eligible.map((entry) => entry.history));

  if (riskCoveragePct < 80) warnings.push(`리스크 시계열이 현재 시장가치의 ${round(riskCoveragePct, 1)}%만 포함합니다.`);
  if (dataQuality !== 'verified') warnings.push('리스크 수치에 혼합 또는 합성 히스토리가 포함되어 참고용입니다.');

  return Object.freeze({
    status: portfolioReturns.length >= 60 && riskCoveragePct >= 80 ? 'available' : 'partial',
    dataQuality,
    observations: portfolioReturns.length,
    annualizedVolatilityPct: round(sampleStdDev(portfolioReturns) * Math.sqrt(252) * 100, 2),
    historicalVar95Pct: round(varPct, 2),
    historicalVar95Amount: round(totalMarketValue * varPct / 100, 2),
    historicalCvar95Pct: round(cvarPct, 2),
    historicalCvar95Amount: round(totalMarketValue * cvarPct / 100, 2),
    maxDrawdownPct: round(maxDrawdown(portfolioReturns) * 100, 2),
    concentrationHhi: round(concentrationHhi, 6),
    effectiveHoldings: round(effectiveHoldings, 2),
    topHoldingPct: round(topHoldingPct, 2),
    pricedCoveragePct: round(riskCoveragePct, 2),
    warnings: Object.freeze(warnings),
  });
}
