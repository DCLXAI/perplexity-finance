import type {
  PortfolioAllocationPolicy,
  PortfolioAllocationTarget,
  PortfolioHolding,
} from '../../shared/api.js';

const CASH_SYMBOL = 'CASH';
const EPSILON = 0.000_001;

export interface RebalancePlanItem {
  readonly symbol: string;
  readonly currentValue: number;
  readonly currentPct: number;
  readonly targetValue: number;
  readonly targetPct: number;
  readonly driftPct: number;
  readonly action: 'buy' | 'sell' | 'hold';
  readonly tradeValue: number;
  readonly estimatedQuantity?: number;
}

export interface RebalancePlan {
  readonly status: 'available' | 'partial' | 'invalid';
  readonly rebalanceNeeded: boolean;
  readonly totalValue: number;
  readonly driftThresholdPct: number;
  readonly minTradeValue: number;
  readonly maxDriftPct: number;
  readonly estimatedCashAfter: number;
  readonly buyValue: number;
  readonly sellValue: number;
  readonly items: readonly RebalancePlanItem[];
  readonly warnings: readonly string[];
}

export interface RebalancePlanInput {
  readonly totalValue: number;
  readonly cashBalance: number;
  readonly holdings: readonly PortfolioHolding[];
  readonly policy: Pick<PortfolioAllocationPolicy, 'driftThresholdPct' | 'minTradeValue' | 'targets'>;
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

export function validateAllocationTargets(targets: readonly PortfolioAllocationTarget[]): readonly string[] {
  const warnings: string[] = [];
  const symbols = new Set<string>();
  let total = 0;
  for (const target of targets) {
    const symbol = target.symbol.trim().toUpperCase();
    if (!symbol || symbol.length > 20 || !/^[A-Z0-9.:-]+$/.test(symbol)) warnings.push('목표 심볼 형식이 올바르지 않습니다.');
    if (symbols.has(symbol)) warnings.push(`${symbol} 목표가 중복되었습니다.`);
    symbols.add(symbol);
    if (!Number.isFinite(target.targetPct) || target.targetPct <= 0 || target.targetPct > 100) {
      warnings.push(`${symbol || '알 수 없는 자산'} 목표 비중은 0% 초과 100% 이하여야 합니다.`);
    } else {
      total += target.targetPct;
    }
  }
  if (targets.length === 0) warnings.push('목표 자산을 하나 이상 입력해야 합니다.');
  if (Math.abs(total - 100) > 0.01) warnings.push(`목표 비중 합계가 ${round(total, 2)}%입니다. 정확히 100%여야 합니다.`);
  return Object.freeze([...new Set(warnings)]);
}

export function computeRebalancePlan(input: RebalancePlanInput): RebalancePlan {
  const targetWarnings = validateAllocationTargets(input.policy.targets);
  const numericInvalid = !Number.isFinite(input.totalValue) || input.totalValue <= 0
    || !Number.isFinite(input.cashBalance) || input.cashBalance < 0
    || !Number.isFinite(input.policy.driftThresholdPct) || input.policy.driftThresholdPct <= 0 || input.policy.driftThresholdPct > 100
    || !Number.isFinite(input.policy.minTradeValue) || input.policy.minTradeValue < 0;
  if (numericInvalid || targetWarnings.length > 0) {
    return Object.freeze({
      status: 'invalid',
      rebalanceNeeded: false,
      totalValue: input.totalValue,
      driftThresholdPct: input.policy.driftThresholdPct,
      minTradeValue: input.policy.minTradeValue,
      maxDriftPct: 0,
      estimatedCashAfter: input.cashBalance,
      buyValue: 0,
      sellValue: 0,
      items: Object.freeze([]),
      warnings: Object.freeze(numericInvalid
        ? [...targetWarnings, '평가액, 현금, 편차 임계치 또는 최소 주문금액이 올바르지 않습니다.']
        : [...targetWarnings]),
    });
  }

  const targets = new Map(input.policy.targets.map((target) => [target.symbol.trim().toUpperCase(), target.targetPct]));
  const holdings = new Map(input.holdings.map((holding) => [holding.symbol.toUpperCase(), holding]));
  const symbols = new Set([...targets.keys(), ...holdings.keys(), CASH_SYMBOL]);
  const warnings: string[] = [];
  if (input.holdings.some((holding) => holding.marketValue === undefined)) {
    warnings.push('가격이 없는 보유 자산이 있어 해당 자산을 0으로 계산했습니다. 주문 전 가격을 확인하세요.');
  }

  const drafts = [...symbols].map((symbol) => {
    const holding = holdings.get(symbol);
    const currentValue = symbol === CASH_SYMBOL ? input.cashBalance : holding?.marketValue ?? 0;
    const currentPct = (currentValue / input.totalValue) * 100;
    const targetPct = targets.get(symbol) ?? 0;
    const targetValue = input.totalValue * targetPct / 100;
    const driftPct = currentPct - targetPct;
    return { symbol, holding, currentValue, currentPct, targetValue, targetPct, driftPct };
  });
  const maxDriftPct = Math.max(0, ...drafts.map((item) => Math.abs(item.driftPct)));
  const rebalanceNeeded = maxDriftPct + EPSILON >= input.policy.driftThresholdPct;

  const items: readonly RebalancePlanItem[] = Object.freeze(drafts
    .map((item): RebalancePlanItem => {
      const desiredTrade = item.targetValue - item.currentValue;
      const actionable = item.symbol !== CASH_SYMBOL
        && rebalanceNeeded
        && Math.abs(desiredTrade) + EPSILON >= input.policy.minTradeValue;
      const action: RebalancePlanItem['action'] = !actionable ? 'hold' : desiredTrade > 0 ? 'buy' : 'sell';
      const tradeValue = actionable ? Math.abs(desiredTrade) : 0;
      const price = item.holding?.price;
      if (action === 'buy' && (!price || price <= 0)) {
        warnings.push(`${item.symbol} 가격이 없어 예상 수량을 계산할 수 없습니다.`);
      }
      return Object.freeze({
        symbol: item.symbol,
        currentValue: round(item.currentValue, 2),
        currentPct: round(item.currentPct),
        targetValue: round(item.targetValue, 2),
        targetPct: round(item.targetPct),
        driftPct: round(item.driftPct),
        action,
        tradeValue: round(tradeValue, 2),
        ...(action !== 'hold' && price && price > 0 ? { estimatedQuantity: round(tradeValue / price, 8) } : {}),
      });
    })
    .sort((left, right) => {
      if (left.symbol === CASH_SYMBOL) return 1;
      if (right.symbol === CASH_SYMBOL) return -1;
      return Math.abs(right.driftPct) - Math.abs(left.driftPct) || left.symbol.localeCompare(right.symbol);
    }));

  const buyValue = round(items.reduce((sum, item) => sum + (item.action === 'buy' ? item.tradeValue : 0), 0), 2);
  const sellValue = round(items.reduce((sum, item) => sum + (item.action === 'sell' ? item.tradeValue : 0), 0), 2);
  const estimatedCashAfter = round(input.cashBalance + sellValue - buyValue, 2);
  if (estimatedCashAfter < -EPSILON) warnings.push('제안 매수금액이 현금과 제안 매도금액의 합계를 초과합니다. 주문 크기를 조정하세요.');
  if (rebalanceNeeded && items.every((item) => item.action === 'hold')) {
    warnings.push('편차 임계치는 넘었지만 모든 주문이 최소 주문금액보다 작습니다.');
  }

  return Object.freeze({
    status: warnings.length > 0 ? 'partial' : 'available',
    rebalanceNeeded,
    totalValue: round(input.totalValue, 2),
    driftThresholdPct: input.policy.driftThresholdPct,
    minTradeValue: input.policy.minTradeValue,
    maxDriftPct: round(maxDriftPct),
    estimatedCashAfter,
    buyValue,
    sellValue,
    items,
    warnings: Object.freeze([...new Set(warnings)]),
  });
}
