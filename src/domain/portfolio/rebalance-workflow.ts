import type {
  PortfolioRebalanceRun,
  PortfolioRebalanceStatus,
  PortfolioSummary,
} from '../../shared/api.js';
import type { RebalancePlan } from './rebalance.js';

const HOUR_MS = 3_600_000;

export type RebalanceTransition = 'approve' | 'reject' | 'complete' | 'expire';

export interface RebalanceApprovalAssessment {
  readonly safe: boolean;
  readonly maxPriceMovePct: number;
  readonly reasons: readonly string[];
}

export interface RebalanceApprovalInput {
  readonly run: PortfolioRebalanceRun;
  readonly currentSummary: PortfolioSummary;
  readonly currentPlan: RebalancePlan;
  readonly currentPolicyUpdatedAt: string;
  readonly now?: string;
  readonly maxPriceAgeHours?: number;
  readonly maxPriceMovePct?: number;
  readonly phase?: 'approve' | 'execute';
}

export function canTransitionRebalance(status: PortfolioRebalanceStatus, transition: RebalanceTransition): boolean {
  if (transition === 'approve') return status === 'pending';
  if (transition === 'reject' || transition === 'expire') return status === 'pending' || status === 'approved';
  return status === 'approved';
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function assessRebalanceApproval(input: RebalanceApprovalInput): RebalanceApprovalAssessment {
  const reasons: string[] = [];
  const now = new Date(input.now ?? new Date().toISOString()).getTime();
  const expiresAt = new Date(input.run.expiresAt).getTime();
  const valuationAt = new Date(input.currentSummary.asOfISO).getTime();
  const maxPriceAgeHours = input.maxPriceAgeHours ?? 96;
  const allowedPriceMovePct = input.maxPriceMovePct ?? 3;
  const phase = input.phase ?? 'approve';

  if (phase === 'approve' && !canTransitionRebalance(input.run.status, 'approve')) {
    reasons.push('검토 대기 상태의 계획만 승인할 수 있습니다.');
  }
  if (phase === 'execute' && !canTransitionRebalance(input.run.status, 'complete')) {
    reasons.push('승인된 계획만 체결 완료할 수 있습니다.');
  }
  if (!Number.isFinite(expiresAt) || expiresAt <= now) reasons.push('계획이 만료되어 새 계산이 필요합니다.');
  if (input.currentPolicyUpdatedAt !== input.run.policyUpdatedAt) reasons.push('목표배분 정책이 변경되어 새 계산이 필요합니다.');
  if (input.currentSummary.portfolio.updatedAt !== input.run.portfolioUpdatedAt) reasons.push('계획 생성 후 거래 원장이 변경되었습니다.');
  if (input.currentSummary.valuationQuality !== 'verified') reasons.push('현재 평가가격이 검증 상태가 아닙니다.');
  if (!Number.isFinite(valuationAt) || now - valuationAt > maxPriceAgeHours * HOUR_MS || valuationAt - now > HOUR_MS) {
    reasons.push(`평가가격이 ${maxPriceAgeHours}시간 유효 범위를 벗어났습니다.`);
  }
  if (input.currentPlan.status !== 'available') reasons.push('현재 리밸런싱 계산에 가격 또는 현금 경고가 있습니다.');
  if (!input.currentPlan.rebalanceNeeded) reasons.push('현재 편차가 임계치 이내로 돌아왔습니다.');
  if (input.currentPlan.estimatedCashAfter < 0) reasons.push('현재 계획의 예상 잔여 현금이 부족합니다.');

  const currentItems = new Map(input.currentPlan.items.map((item) => [item.symbol, item]));
  const currentHoldings = new Map(input.currentSummary.holdings.map((holding) => [holding.symbol, holding]));
  let maxObservedMove = 0;
  for (const item of input.run.items.filter((entry) => entry.action !== 'hold')) {
    const current = currentItems.get(item.symbol);
    if (!current || current.action !== item.action) {
      reasons.push(`${item.symbol} 제안 방향이 변경되었습니다.`);
      continue;
    }
    const currentPrice = currentHoldings.get(item.symbol)?.price;
    if (!item.referencePrice || !currentPrice || currentPrice <= 0) {
      reasons.push(`${item.symbol} 비교 가격을 확인할 수 없습니다.`);
      continue;
    }
    const movePct = Math.abs((currentPrice / item.referencePrice - 1) * 100);
    maxObservedMove = Math.max(maxObservedMove, movePct);
    if (movePct > allowedPriceMovePct) reasons.push(`${item.symbol} 가격이 계획 생성 후 ${round(movePct)}% 변동했습니다.`);
  }

  return Object.freeze({
    safe: reasons.length === 0,
    maxPriceMovePct: round(maxObservedMove),
    reasons: Object.freeze([...new Set(reasons)]),
  });
}
