import type {
  PortfolioScenarioImpact,
  PortfolioScenarioShock,
  PortfolioSummary,
} from '../../shared/api.js';

function round(value: number, digits = 4): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function matches(
  shock: PortfolioScenarioShock,
  holding: PortfolioSummary['holdings'][number],
): boolean {
  switch (shock.targetType) {
    case 'all': return true;
    case 'symbol': return holding.symbol === shock.target.toUpperCase();
    case 'sector': return (holding.sector ?? '').toLowerCase() === shock.target.toLowerCase();
    case 'asset-kind': return holding.assetKind === shock.target.toLowerCase();
  }
}

export interface ScenarioResult {
  readonly beforeValue: number;
  readonly afterValue: number;
  readonly absoluteChange: number;
  readonly changePct: number;
  readonly impacts: readonly PortfolioScenarioImpact[];
  readonly warnings: readonly string[];
}

export function runPortfolioScenario(
  summary: PortfolioSummary,
  shocks: readonly PortfolioScenarioShock[],
): ScenarioResult {
  const warnings: string[] = [];
  const impacts: PortfolioScenarioImpact[] = [];

  for (const holding of summary.holdings) {
    if (holding.marketValue === undefined) {
      warnings.push(`${holding.symbol}은 시세가 없어 스트레스 테스트에서 제외됐습니다.`);
      continue;
    }
    const rawShock = shocks
      .filter((shock) => matches(shock, holding))
      .reduce((sum, shock) => sum + shock.changePct, 0);
    const appliedShockPct = Math.max(-100, Math.min(1_000, rawShock));
    if (rawShock !== appliedShockPct) warnings.push(`${holding.symbol}의 합산 충격을 ${appliedShockPct}%로 제한했습니다.`);
    const afterValue = round(Math.max(0, holding.marketValue * (1 + appliedShockPct / 100)), 2);
    impacts.push(Object.freeze({
      symbol: holding.symbol,
      beforeValue: round(holding.marketValue, 2),
      afterValue,
      change: round(afterValue - holding.marketValue, 2),
      appliedShockPct: round(appliedShockPct, 2),
    }));
  }

  impacts.sort((left, right) => Math.abs(right.change) - Math.abs(left.change));
  const beforeValue = round(summary.cashBalance + impacts.reduce((sum, impact) => sum + impact.beforeValue, 0), 2);
  const afterValue = round(summary.cashBalance + impacts.reduce((sum, impact) => sum + impact.afterValue, 0), 2);
  const absoluteChange = round(afterValue - beforeValue, 2);
  return Object.freeze({
    beforeValue,
    afterValue,
    absoluteChange,
    changePct: beforeValue !== 0 ? round((absoluteChange / Math.abs(beforeValue)) * 100, 2) : 0,
    impacts: Object.freeze(impacts),
    warnings: Object.freeze([...new Set(warnings)]),
  });
}
