// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortfolioScenarioResponse, PortfolioSummary } from '@/shared/api';
import ScenarioPanel from './ScenarioPanel.js';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('@/live/apiClient', () => ({ apiFetch: apiFetchMock }));

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function summary(id: string): PortfolioSummary {
  return {
    portfolio: {
      id,
      name: id,
      baseCurrency: 'USD',
      status: 'active',
      createdAt: '2026-07-12T00:00:00.000Z',
      updatedAt: '2026-07-12T00:00:00.000Z',
    },
    generatedAt: '2026-07-12T00:00:00.000Z',
    asOfISO: '2026-07-12T00:00:00.000Z',
    transactionCount: 0,
    cashBalance: 10_000,
    netContributions: 10_000,
    investedValue: 0,
    marketValue: 0,
    totalValue: 10_000,
    realizedPnl: 0,
    unrealizedPnl: 0,
    income: 0,
    feesPaid: 0,
    totalReturn: 0,
    valuationQuality: 'unpriced',
    holdings: [],
    risk: {
      status: 'insufficient-data',
      dataQuality: 'synthetic',
      observations: 0,
      concentrationHhi: 0,
      effectiveHoldings: 0,
      topHoldingPct: 0,
      pricedCoveragePct: 0,
      warnings: [],
    },
    warnings: [],
  };
}

function scenarioResponse(portfolioId: string, symbol: string): PortfolioScenarioResponse {
  return {
    requestId: symbol,
    portfolioId,
    generatedAt: '2026-07-12T00:00:00.000Z',
    beforeValue: 10_000,
    afterValue: 9_000,
    absoluteChange: -1_000,
    changePct: -10,
    impacts: [{
      symbol,
      beforeValue: 10_000,
      afterValue: 9_000,
      change: -1_000,
      appliedShockPct: -10,
    }],
    shocks: [{ targetType: 'all', target: '*', changePct: -10 }],
    warnings: [],
  };
}

beforeEach(() => {
  apiFetchMock.mockReset();
});
afterEach(() => cleanup());

describe('ScenarioPanel request ordering', () => {
  it('ignores the previous portfolio response when it arrives during the new portfolio request', async () => {
    const requests: Deferred<PortfolioScenarioResponse>[] = [];
    apiFetchMock.mockImplementation(() => {
      const request = deferred<PortfolioScenarioResponse>();
      requests.push(request);
      return request.promise;
    });

    const { container, rerender } = render(
      <ScenarioPanel summary={summary('portfolio-a')} accessToken="token" />,
    );
    const firstPreset = container.querySelector<HTMLButtonElement>('.pf-preset-row button');
    expect(firstPreset).not.toBeNull();

    fireEvent.click(firstPreset!);
    expect(requests).toHaveLength(1);
    expect(firstPreset!.disabled).toBe(true);

    rerender(<ScenarioPanel summary={summary('portfolio-b')} accessToken="token" />);
    await waitFor(() => expect(firstPreset!.disabled).toBe(false));
    fireEvent.click(firstPreset!);
    expect(requests).toHaveLength(2);
    expect(firstPreset!.disabled).toBe(true);

    const firstBody = JSON.parse(apiFetchMock.mock.calls[0][1].body as string) as { portfolioId: string };
    const secondBody = JSON.parse(apiFetchMock.mock.calls[1][1].body as string) as { portfolioId: string };
    expect(firstBody.portfolioId).toBe('portfolio-a');
    expect(secondBody.portfolioId).toBe('portfolio-b');

    await act(async () => {
      requests[0].resolve(scenarioResponse('portfolio-a', 'STALE-HOLDING'));
      await requests[0].promise;
    });

    expect(screen.queryByText('STALE-HOLDING')).toBeNull();
    expect(firstPreset!.disabled).toBe(true);

    await act(async () => {
      requests[1].resolve(scenarioResponse('portfolio-b', 'CURRENT-HOLDING'));
      await requests[1].promise;
    });

    expect(await screen.findByText('CURRENT-HOLDING')).toBeTruthy();
    expect(screen.queryByText('STALE-HOLDING')).toBeNull();
    expect(firstPreset!.disabled).toBe(false);
  });
});
