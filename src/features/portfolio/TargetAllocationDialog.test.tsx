// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PortfolioSummary } from '../../shared/api.js';
import TargetAllocationDialog from './TargetAllocationDialog.js';

const summary: PortfolioSummary = {
  portfolio: {
    id: '11111111-1111-4111-8111-111111111111',
    name: '비용 정책 테스트',
    baseCurrency: 'USD',
    status: 'active',
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
  },
  generatedAt: '2026-07-14T00:00:00.000Z',
  asOfISO: '2026-07-14T00:00:00.000Z',
  transactionCount: 1,
  cashBalance: 1_000,
  netContributions: 1_000,
  investedValue: 0,
  marketValue: 0,
  totalValue: 1_000,
  realizedPnl: 0,
  unrealizedPnl: 0,
  income: 0,
  feesPaid: 0,
  totalReturn: 0,
  totalReturnPct: 0,
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

describe('TargetAllocationDialog P9 cost policy', () => {
  afterEach(cleanup);

  it('saves the seven cost assumptions with FIFO fixed', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn(async () => undefined);
    render(
      <TargetAllocationDialog
        summary={summary}
        policy={null}
        demo
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    expect((screen.getByLabelText('주문당 고정 수수료 · USD') as HTMLInputElement).value).toBe('0');
    expect((screen.getByLabelText('비율 수수료 · bp') as HTMLInputElement).value).toBe('0');
    expect((screen.getByLabelText('매수 슬리피지 · bp') as HTMLInputElement).value).toBe('5');
    expect((screen.getByLabelText('매도 슬리피지 · bp') as HTMLInputElement).value).toBe('5');
    expect((screen.getByLabelText('매도 거래세 · bp') as HTMLInputElement).value).toBe('0');
    expect((screen.getByLabelText('양도소득세율 · %') as HTMLInputElement).value).toBe('0');
    expect((screen.getByLabelText('허용 최대 비용 · 주문금액 %') as HTMLInputElement).value).toBe('2');
    expect(screen.getByText('FIFO · 선입선출 고정')).toBeTruthy();
    expect(screen.getByText(/실제 신고·납부액이 아니며 세무 자문을 대신하지 않습니다/)).toBeTruthy();

    const fixed = screen.getByLabelText('주문당 고정 수수료 · USD');
    const tax = screen.getByLabelText('양도소득세율 · %');
    await user.clear(fixed);
    await user.type(fixed, '0.25');
    await user.clear(tax);
    await user.type(tax, '18');
    await user.click(screen.getByRole('button', { name: '데모에 적용' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
      costPolicy: {
        commissionFixedUsd: 0.25,
        commissionBps: 0,
        buySlippageBps: 5,
        sellSlippageBps: 5,
        sellTransactionTaxBps: 0,
        capitalGainsTaxPct: 18,
        maxCostPct: 2,
        taxLotMethod: 'fifo',
      },
    })));
  });

  it('does not close from Escape while a save is pending', async () => {
    const user = userEvent.setup();
    let resolveSave: (() => void) | undefined;
    const onSaved = vi.fn(() => new Promise<void>((resolve) => {
      resolveSave = resolve;
    }));
    const onClose = vi.fn();
    render(
      <TargetAllocationDialog
        summary={summary}
        policy={null}
        demo
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole('button', { name: '데모에 적용' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '저장 중…' })).toBeTruthy());
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();

    resolveSave?.();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
