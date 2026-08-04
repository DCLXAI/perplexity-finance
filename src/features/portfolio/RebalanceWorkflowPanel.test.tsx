// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PortfolioRebalanceRun } from '@/shared/api';
import { RebalanceWorkflowPanel } from './RebalanceWorkflowPanel.js';

const costPolicy = {
  commissionFixedUsd: 0,
  commissionBps: 5,
  buySlippageBps: 10,
  sellSlippageBps: 10,
  sellTransactionTaxBps: 0,
  capitalGainsTaxPct: 20,
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

function run(status: PortfolioRebalanceRun['status']): PortfolioRebalanceRun {
  const completed = status === 'completed';
  return {
    id: '11111111-1111-4111-8111-111111111111',
    portfolioId: '22222222-2222-4222-8222-222222222222',
    planKind: 'rebalance',
    status,
    source: 'manual',
    planHash: 'a'.repeat(64),
    policyUpdatedAt: '2026-07-14T00:00:00.000Z',
    portfolioUpdatedAt: '2026-07-14T00:00:00.000Z',
    valuationAsOf: '2026-07-14T00:00:00.000Z',
    valuationQuality: 'verified',
    totalValue: 10_000,
    cashBalance: 2_000,
    driftThresholdPct: 5,
    minTradeValue: 100,
    maxDriftPct: 10,
    estimatedCashAfter: 1_000,
    costModelVersion: 1,
    costPolicySnapshot: costPolicy,
    estimatedCosts: {
      commission: 5,
      slippage: 10,
      transactionTax: 0,
      capitalGainsTax: 0,
      tax: 0,
      taxableGain: 0,
      total: 15,
      netCashEffect: -1_015,
    },
    ...(completed ? {
      actualCosts: {
        commission: 5,
        slippage: 50,
        transactionTax: 0,
        capitalGainsTax: 0,
        tax: 0,
        taxableGain: 0,
        total: 55,
        netCashEffect: -1_055,
      },
    } : {}),
    createdAt: '2026-07-14T00:00:00.000Z',
    expiresAt: '2026-07-18T00:00:00.000Z',
    ...(status === 'approved' || completed ? { approvedAt: '2026-07-13T00:05:00.000Z' } : {}),
    ...(completed ? { completedAt: '2026-07-14T00:10:00.000Z' } : {}),
    items: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        runId: '11111111-1111-4111-8111-111111111111',
        symbol: 'NVDA',
        currentValue: 3_000,
        currentPct: 30,
        targetValue: 4_000,
        targetPct: 40,
        driftPct: -10,
        action: 'buy',
        requestedTradeValue: 1_000,
        tradeValue: 1_000,
        optimizationDecision: 'execute',
        estimatedCosts: {
          commission: 5,
          slippage: 10,
          transactionTax: 0,
          capitalGainsTax: 0,
          tax: 0,
          taxableGain: 0,
          total: 15,
          netCashEffect: -1_015,
        },
        estimatedCostBasis: 0,
        taxLotSnapshot: [],
        referencePrice: 100,
        priceAsOf: '2026-07-14T00:00:00.000Z',
        estimatedQuantity: 10,
        ...(completed ? {
          transactionId: '44444444-4444-4444-8444-444444444444',
          actualQuantity: 10,
          actualPrice: 105,
          actualFees: 5,
          actualCosts: {
            commission: 5,
            slippage: 50,
            transactionTax: 0,
            capitalGainsTax: 0,
            tax: 0,
            taxableGain: 0,
            total: 55,
            netCashEffect: -1_055,
          },
        } : {}),
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        runId: '11111111-1111-4111-8111-111111111111',
        symbol: 'CASH',
        currentValue: 2_000,
        currentPct: 20,
        targetValue: 1_000,
        targetPct: 10,
        driftPct: 10,
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
      id: '1',
      runId: '11111111-1111-4111-8111-111111111111',
      event: 'created',
      toStatus: 'pending',
      details: {},
      createdAt: '2026-07-14T00:00:00.000Z',
    }],
  };
}

function handlers() {
  return {
    onGenerate: vi.fn(async () => undefined),
    onApprove: vi.fn(async () => undefined),
    onReject: vi.fn(async () => undefined),
    onComplete: vi.fn(async () => undefined),
  };
}

describe('RebalanceWorkflowPanel', () => {
  afterEach(cleanup);

  it('keeps the persisted workflow read-only in demo mode', async () => {
    const callbacks = handlers();
    render(
      <RebalanceWorkflowPanel
        runs={[]}
        demo
        hasPolicy
        {...callbacks}
      />,
    );

    const generate = screen.getByRole('button', { name: '현재 계획 저장' });
    expect((generate as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('데모에서는 조회만 가능합니다.')).toBeTruthy();
    await userEvent.click(generate);
    expect(callbacks.onGenerate).not.toHaveBeenCalled();
  });

  it('collects actual fills only after an approved plan', async () => {
    const user = userEvent.setup();
    const callbacks = handlers();
    render(
      <RebalanceWorkflowPanel
        runs={[run('approved')]}
        hasPolicy
        {...callbacks}
      />,
    );

    expect(screen.queryByRole('button', { name: '승인' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '실제 체결 입력' }));
    expect(screen.getByRole('dialog', { name: '실제 체결 원장 반영' })).toBeTruthy();
    expect(screen.getByText(/계획 총비용 \$15.00/)).toBeTruthy();
    expect(screen.getByText(/입력 기준 슬리피지 \$0.00/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '검증 후 원장 반영' }));

    await waitFor(() => expect(callbacks.onComplete).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      [expect.objectContaining({
        itemId: '33333333-3333-4333-8333-333333333333',
        quantity: 10,
        price: 100,
        fees: 0,
      })],
    ));
  });

  it('shows planned-versus-actual execution and residual drift for a completed run', () => {
    render(
      <RebalanceWorkflowPanel
        runs={[run('completed')]}
        hasPolicy
        {...handlers()}
      />,
    );

    expect(screen.getByText('$1,050.00')).toBeTruthy();
    expect(screen.getByText(/주문금액 \+\$50.00/)).toBeTruthy();
    expect(screen.getByText('실행 당시 정책과 예상 주문 비용')).toBeTruthy();
    expect(screen.getByText('체결 기준 비용 결과')).toBeTruthy();
    expect(screen.getAllByText(/체결 기준 추정세금/).length).toBeGreaterThan(0);
    expect(screen.getByText(/원장 44444444/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '실제 체결 입력' })).toBeNull();
  });

  it('shows action failures next to the workflow', async () => {
    const user = userEvent.setup();
    const callbacks = handlers();
    callbacks.onGenerate.mockRejectedValueOnce(new Error('비용 정책을 다시 확인해 주세요.'));
    render(
      <RebalanceWorkflowPanel
        runs={[]}
        hasPolicy
        {...callbacks}
      />,
    );

    await user.click(screen.getByRole('button', { name: '현재 계획 저장' }));
    expect((await screen.findByRole('alert')).textContent).toContain('비용 정책을 다시 확인해 주세요.');
  });

  it('closes a stale execution dialog when the approved run is no longer executable', async () => {
    const user = userEvent.setup();
    const callbacks = handlers();
    const { rerender } = render(
      <RebalanceWorkflowPanel
        runs={[run('approved')]}
        hasPolicy
        {...callbacks}
      />,
    );

    await user.click(screen.getByRole('button', { name: '실제 체결 입력' }));
    expect(screen.getByRole('dialog', { name: '실제 체결 원장 반영' })).toBeTruthy();
    rerender(
      <RebalanceWorkflowPanel
        runs={[run('expired')]}
        hasPolicy
        {...callbacks}
      />,
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '실제 체결 원장 반영' })).toBeNull());
  });
});
