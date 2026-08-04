// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PortfolioContributionRun,
  PortfolioGoal,
  PortfolioGoalProjection,
  PortfolioSummary,
} from '../../shared/api.js';
import { GoalContributionPanel } from './GoalContributionPanel.js';

const summary: PortfolioSummary = {
  portfolio: {
    id: '11111111-1111-4111-8111-111111111111',
    name: '장기 포트폴리오',
    baseCurrency: 'USD',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
  },
  generatedAt: '2026-07-14T00:00:00.000Z',
  asOfISO: '2026-07-14T00:00:00.000Z',
  transactionCount: 2,
  cashBalance: 1_000,
  netContributions: 9_000,
  investedValue: 9_000,
  marketValue: 9_000,
  totalValue: 10_000,
  realizedPnl: 0,
  unrealizedPnl: 1_000,
  income: 0,
  feesPaid: 0,
  totalReturn: 1_000,
  totalReturnPct: 11.11,
  valuationQuality: 'verified',
  holdings: [],
  risk: {
    status: 'insufficient-data',
    dataQuality: 'verified',
    observations: 0,
    concentrationHhi: 0,
    effectiveHoldings: 0,
    topHoldingPct: 0,
    pricedCoveragePct: 100,
    warnings: [],
  },
  warnings: [],
};

const goal: PortfolioGoal = {
  id: '22222222-2222-4222-8222-222222222222',
  portfolioId: summary.portfolio.id,
  name: '내 집 마련',
  targetAmount: 100_000,
  targetDate: '2030-12-31',
  expectedAnnualReturnPct: 7,
  contributionAmount: 1_000,
  contributionDay: 15,
  nextContributionDate: '2026-08-15',
  status: 'active',
  createdAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
};

const projection: PortfolioGoalProjection = {
  status: 'on-track',
  currentValue: 10_000,
  targetAmount: 100_000,
  progressPct: 10,
  contributionPeriodsRemaining: 53,
  projectedAmount: 102_500,
  requiredContributionAmount: 950,
  projectedShortfall: 0,
  asOfISO: '2026-07-14T00:00:00.000Z',
  valuationQuality: 'verified',
};

const costPolicy = {
  commissionFixedUsd: 0,
  commissionBps: 5,
  buySlippageBps: 5,
  sellSlippageBps: 5,
  sellTransactionTaxBps: 0,
  capitalGainsTaxPct: 0,
  maxCostPct: 2,
  taxLotMethod: 'fifo' as const,
};

const zeroCosts = {
  commission: 0,
  slippage: 0,
  transactionTax: 0,
  capitalGainsTax: 0,
  tax: 0,
  taxableGain: 0,
  total: 0,
  netCashEffect: 0,
};

function contributionRun(status: PortfolioContributionRun['status']): PortfolioContributionRun {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    portfolioId: summary.portfolio.id,
    planKind: 'contribution',
    goalSnapshot: {
      id: goal.id,
      name: goal.name,
      targetAmount: goal.targetAmount,
      targetDate: goal.targetDate,
      expectedAnnualReturnPct: goal.expectedAnnualReturnPct,
      contributionAmount: goal.contributionAmount,
      contributionDay: goal.contributionDay,
      updatedAt: goal.updatedAt,
    },
    status,
    source: 'manual',
    planHash: 'a'.repeat(64),
    policyUpdatedAt: '2026-07-14T00:00:00.000Z',
    portfolioUpdatedAt: '2026-07-14T00:00:00.000Z',
    valuationAsOf: '2026-07-14T00:00:00.000Z',
    valuationQuality: 'verified',
    totalValue: 10_000,
    cashBalance: 1_000,
    driftThresholdPct: 5,
    minTradeValue: 25,
    maxDriftPct: 8,
    estimatedCashAfter: 1_200,
    costModelVersion: 1,
    costPolicySnapshot: costPolicy,
    estimatedCosts: {
      commission: 1,
      slippage: 0.4,
      transactionTax: 0,
      capitalGainsTax: 0,
      tax: 0,
      taxableGain: 0,
      total: 1.4,
      netCashEffect: -801.4,
    },
    createdAt: '2026-07-14T00:00:00.000Z',
    expiresAt: '2026-07-18T00:00:00.000Z',
    ...(status === 'approved' || status === 'completed' ? { approvedAt: '2026-07-14T00:05:00.000Z' } : {}),
    ...(status === 'completed' ? {
      completedAt: '2026-07-14T00:10:00.000Z',
      depositTransactionId: '44444444-4444-4444-8444-444444444444',
      actualCosts: {
        commission: 1,
        slippage: 8,
        transactionTax: 0,
        capitalGainsTax: 0,
        tax: 0,
        taxableGain: 0,
        total: 9,
        netCashEffect: -809,
      },
    } : {}),
    goalId: goal.id,
    goalUpdatedAt: goal.updatedAt,
    scheduledFor: '2026-07-15',
    contributionAmount: 1_000,
    cashRemainder: 200,
    items: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        runId: '33333333-3333-4333-8333-333333333333',
        symbol: 'NVDA',
        currentValue: 2_000,
        currentPct: 20,
        targetValue: 2_800,
        targetPct: 28,
        driftPct: -8,
        action: 'buy',
        requestedTradeValue: 800,
        tradeValue: 800,
        optimizationDecision: 'execute',
        estimatedCosts: {
          commission: 1,
          slippage: 0.4,
          transactionTax: 0,
          capitalGainsTax: 0,
          tax: 0,
          taxableGain: 0,
          total: 1.4,
          netCashEffect: -801.4,
        },
        estimatedCostBasis: 0,
        taxLotSnapshot: [],
        referencePrice: 100,
        priceAsOf: '2026-07-14T00:00:00.000Z',
        estimatedQuantity: 8,
        ...(status === 'completed' ? {
          actualQuantity: 8,
          actualPrice: 101,
          actualFees: 1,
          actualCosts: {
            commission: 1,
            slippage: 8,
            transactionTax: 0,
            capitalGainsTax: 0,
            tax: 0,
            taxableGain: 0,
            total: 9,
            netCashEffect: -809,
          },
        } : {}),
      },
      {
        id: '66666666-6666-4666-8666-666666666666',
        runId: '33333333-3333-4333-8333-333333333333',
        symbol: 'CASH',
        currentValue: 1_000,
        currentPct: 10,
        targetValue: 1_200,
        targetPct: 12,
        driftPct: -2,
        action: 'hold',
        requestedTradeValue: 0,
        tradeValue: 0,
        optimizationDecision: 'not-required',
        estimatedCosts: zeroCosts,
        estimatedCostBasis: 0,
        taxLotSnapshot: [],
      },
    ],
    audit: [{
      id: 'audit-1',
      runId: '33333333-3333-4333-8333-333333333333',
      event: 'created',
      toStatus: 'pending',
      details: {},
      createdAt: '2026-07-14T00:00:00.000Z',
    }],
  };
}

function callbacks() {
  return {
    onSaveGoal: vi.fn(async () => undefined),
    onGoalAction: vi.fn(async () => undefined),
    onGenerate: vi.fn(async () => undefined),
    onApprove: vi.fn(async () => undefined),
    onReject: vi.fn(async () => undefined),
    onComplete: vi.fn(async () => undefined),
  };
}

describe('GoalContributionPanel', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows goal progress, the next due date and the non-automation disclosure', async () => {
    const user = userEvent.setup();
    const handlers = callbacks();
    render(
      <GoalContributionPanel
        summary={summary}
        goal={goal}
        projection={projection}
        contributionRuns={[]}
        hasPolicy
        {...handlers}
      />,
    );

    expect(screen.getByRole('progressbar', { name: '내 집 마련 달성 진행률' })).toBeTruthy();
    expect(screen.getByText('10.0%')).toBeTruthy();
    expect(screen.getByText('다음 월 적립 예정')).toBeTruthy();
    expect(screen.getByText('자동 이체·자동 주문 없음')).toBeTruthy();
    expect(screen.getByText(/실제 성과를 보장하지 않습니다/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '이번 달 적립 계획' }));
    await waitFor(() => expect(handlers.onGenerate).toHaveBeenCalledTimes(1));
  });

  it('creates a goal through an accessible dialog', async () => {
    const user = userEvent.setup();
    const handlers = callbacks();
    render(
      <GoalContributionPanel
        summary={summary}
        goal={null}
        projection={null}
        contributionRuns={[]}
        hasPolicy
        {...handlers}
      />,
    );

    await user.click(screen.getByRole('button', { name: '목표 만들기' }));
    expect(screen.getByRole('dialog', { name: '투자 목표 만들기' })).toBeTruthy();
    const name = screen.getByLabelText('목표명');
    await user.clear(name);
    await user.type(name, '은퇴 준비');
    await user.click(screen.getByRole('button', { name: '목표 저장' }));

    await waitFor(() => expect(handlers.onSaveGoal).toHaveBeenCalledWith(expect.objectContaining({
      name: '은퇴 준비',
      targetAmount: 100_000,
      expectedAnnualReturnPct: 7,
      contributionAmount: 1_000,
      contributionDay: 1,
    })));
  });

  it('supports pending approval and rejection while keeping the history buy-only', async () => {
    const user = userEvent.setup();
    const handlers = callbacks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'prompt').mockReturnValue('이번 달은 보류');
    render(
      <GoalContributionPanel
        summary={summary}
        goal={goal}
        projection={projection}
        contributionRuns={[contributionRun('pending')]}
        hasPolicy
        {...handlers}
      />,
    );

    expect(screen.getByRole('rowheader', { name: 'NVDA' })).toBeTruthy();
    expect(screen.queryByRole('rowheader', { name: 'CASH' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '승인' }));
    await waitFor(() => expect(handlers.onApprove).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333'));
    await user.click(screen.getByRole('button', { name: '거절' }));
    await waitFor(() => expect(handlers.onReject).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333', '이번 달은 보류'));
  });

  it('collects the actual deposit and buy fills only after approval', async () => {
    const user = userEvent.setup();
    const handlers = callbacks();
    render(
      <GoalContributionPanel
        summary={summary}
        goal={goal}
        projection={projection}
        contributionRuns={[contributionRun('approved')]}
        hasPolicy
        {...handlers}
      />,
    );

    await user.click(screen.getByRole('button', { name: '실제 적립 입력' }));
    expect(screen.getByRole('dialog', { name: '실제 적립 내역 반영' })).toBeTruthy();
    expect(screen.getByText(/은행 이체나 브로커 주문을 실행하지 않습니다/)).toBeTruthy();
    expect(screen.getByText('계획 총비용')).toBeTruthy();
    expect(screen.getByText(/입력 기준 슬리피지 \$0.00/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '입금·체결 반영' }));

    await waitFor(() => expect(handlers.onComplete).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      [{
        itemId: '55555555-5555-4555-8555-555555555555',
        quantity: 8,
        price: 100,
        fees: 0,
        tradeAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }],
    ));
  });

  it('shows the immutable cost policy and completed cost comparison', () => {
    render(
      <GoalContributionPanel
        summary={summary}
        goal={goal}
        projection={projection}
        contributionRuns={[contributionRun('completed')]}
        hasPolicy
        {...callbacks()}
      />,
    );

    expect(screen.getByText('실행 당시 정책과 예상 적립 비용')).toBeTruthy();
    expect(screen.getByText('체결 기준 적립 비용 결과')).toBeTruthy();
    expect(screen.getAllByText(/체결 기준 추정세금/).length).toBeGreaterThan(0);
    expect(screen.getByText(/비용 계획 대비 \+\$7.60/)).toBeTruthy();
  });

  it('keeps every mutation disabled in demo mode', async () => {
    const user = userEvent.setup();
    const handlers = callbacks();
    render(
      <GoalContributionPanel
        summary={summary}
        goal={goal}
        projection={projection}
        contributionRuns={[]}
        hasPolicy
        demo
        {...handlers}
      />,
    );

    expect(screen.getByText('데모에서는 조회만 가능합니다.')).toBeTruthy();
    const generate = screen.getByRole('button', { name: '이번 달 적립 계획' });
    expect((generate as HTMLButtonElement).disabled).toBe(true);
    await user.click(generate);
    expect(handlers.onGenerate).not.toHaveBeenCalled();
  });

  it('shares the open-plan lock and can complete a verified funded goal', async () => {
    const user = userEvent.setup();
    const handlers = callbacks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const funded: PortfolioGoalProjection = {
      ...projection,
      status: 'funded',
      currentValue: 100_000,
      progressPct: 100,
    };
    const { rerender } = render(
      <GoalContributionPanel
        summary={summary}
        goal={goal}
        projection={funded}
        contributionRuns={[]}
        hasPolicy
        blockedByRebalance
        {...handlers}
      />,
    );

    expect((screen.getByRole('button', { name: '리밸런싱 계획 진행 중' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('리밸런싱 계획이 먼저 진행 중입니다.')).toBeTruthy();

    rerender(
      <GoalContributionPanel
        summary={summary}
        goal={goal}
        projection={funded}
        contributionRuns={[]}
        hasPolicy
        {...handlers}
      />,
    );
    await user.click(screen.getByRole('button', { name: '목표 달성 확정' }));
    await waitFor(() => expect(handlers.onGoalAction).toHaveBeenCalledWith('complete'));
  });
});
