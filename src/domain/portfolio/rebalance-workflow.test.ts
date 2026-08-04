import { describe, expect, it } from 'vitest';
import type { PortfolioRebalanceRun, PortfolioSummary } from '@/shared/api';
import type { RebalancePlan } from './rebalance.js';
import { assessRebalanceApproval, canTransitionRebalance } from './rebalance-workflow.js';

const now = '2026-07-13T12:00:00.000Z';
const zeroCosts = Object.freeze({
  commission: 0, slippage: 0, transactionTax: 0, capitalGainsTax: 0,
  tax: 0, taxableGain: 0, total: 0, netCashEffect: 0,
});
const zeroCostPolicy = Object.freeze({
  commissionFixedUsd: 0, commissionBps: 0, buySlippageBps: 0, sellSlippageBps: 0,
  sellTransactionTaxBps: 0, capitalGainsTaxPct: 0, maxCostPct: 100, taxLotMethod: 'fifo' as const,
});
const run = {
  id: 'run-1', portfolioId: 'portfolio-1', planKind: 'rebalance', status: 'pending', source: 'manual', planHash: 'hash',
  policyUpdatedAt: '2026-07-13T10:00:00.000Z', valuationAsOf: '2026-07-13T10:00:00.000Z',
  portfolioUpdatedAt: '2026-07-13T09:00:00.000Z',
  valuationQuality: 'verified', totalValue: 1_000, cashBalance: 100, driftThresholdPct: 5,
  minTradeValue: 25, maxDriftPct: 10, estimatedCashAfter: 100,
  costModelVersion: 1,
  costPolicySnapshot: zeroCostPolicy, estimatedCosts: zeroCosts,
  createdAt: '2026-07-13T10:00:00.000Z', expiresAt: '2026-07-16T10:00:00.000Z',
  items: [{
    id: 'item-1', runId: 'run-1', symbol: 'AAA', currentValue: 600, currentPct: 60,
    targetValue: 500, targetPct: 50, driftPct: 10, action: 'sell', requestedTradeValue: 100, tradeValue: 100,
    optimizationDecision: 'execute', estimatedCosts: zeroCosts, estimatedCostBasis: 75, taxLotSnapshot: [],
    referencePrice: 20, estimatedQuantity: 5,
  }], audit: [],
} satisfies PortfolioRebalanceRun;
const summary = {
  asOfISO: '2026-07-13T11:30:00.000Z', valuationQuality: 'verified',
  portfolio: { updatedAt: '2026-07-13T09:00:00.000Z' },
  holdings: [{ symbol: 'AAA', price: 20.4 }],
} as unknown as PortfolioSummary;
const plan = {
  status: 'available', rebalanceNeeded: true, estimatedCashAfter: 100,
  items: [{ symbol: 'AAA', action: 'sell' }],
} as unknown as RebalancePlan;

describe('rebalance workflow', () => {
  it('enforces the state machine', () => {
    expect(canTransitionRebalance('pending', 'approve')).toBe(true);
    expect(canTransitionRebalance('pending', 'complete')).toBe(false);
    expect(canTransitionRebalance('approved', 'complete')).toBe(true);
    expect(canTransitionRebalance('completed', 'reject')).toBe(false);
  });

  it('approves a fresh unchanged plan', () => {
    const result = assessRebalanceApproval({ run, currentSummary: summary, currentPlan: plan, currentPolicyUpdatedAt: run.policyUpdatedAt, now });
    expect(result.safe).toBe(true);
    expect(result.maxPriceMovePct).toBe(2);
  });

  it('requires a new plan after excessive price movement or policy changes', () => {
    const moved = { ...summary, holdings: [{ symbol: 'AAA', price: 22 }] } as unknown as PortfolioSummary;
    const result = assessRebalanceApproval({
      run, currentSummary: moved, currentPlan: plan, currentPolicyUpdatedAt: '2026-07-13T11:00:00.000Z', now,
    });
    expect(result.safe).toBe(false);
    expect(result.reasons.some((reason) => reason.includes('정책'))).toBe(true);
    expect(result.reasons.some((reason) => reason.includes('10%'))).toBe(true);
  });

  it('revalidates an approved plan before execution', () => {
    const approved = { ...run, status: 'approved', approvedAt: '2026-07-13T11:45:00.000Z' } satisfies PortfolioRebalanceRun;
    const result = assessRebalanceApproval({
      run: approved,
      currentSummary: summary,
      currentPlan: plan,
      currentPolicyUpdatedAt: run.policyUpdatedAt,
      now,
      phase: 'execute',
    });
    expect(result.safe).toBe(true);
  });
});
