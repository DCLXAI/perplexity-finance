// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { engine } from '@/data/engine';
import { SNAPSHOT } from '@/data/universe';
import type { EarningsResponse } from '@/shared/api';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('@/live/apiClient', () => ({ apiFetch: apiFetchMock }));
// EarningsPage also renders <AskBar/> and <MarketRail/>, which pull in auth context and
// runtime-config fetches unrelated to the region-filtering behavior under test here — stub
// them out so this test stays focused on EarningsPage's own entry-scoping logic.
vi.mock('@/features/ai/AskBar', () => ({ default: () => null }));
vi.mock('@/features/rail/RailWidgets', () => ({ MarketRail: () => null }));

import EarningsPage from './EarningsPage.js';

function fixtureResponse(): EarningsResponse {
  return {
    requestId: 'test',
    generatedAt: '2026-08-05T00:00:00.000Z',
    fallback: false,
    provider: {
      provider: 'alpha-vantage',
      configured: true,
      status: 'up',
      mode: 'delayed',
      message: 'ok',
      checkedAt: '2026-08-05T00:00:00.000Z',
    },
    entries: [
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        reportDate: SNAPSHOT.todayISO,
        estimate: 1.5,
        currency: 'USD',
        providerTimestamp: '2026-08-05T00:00:00.000Z',
      },
      {
        symbol: '005930',
        name: 'Samsung Electronics Co., Ltd.',
        reportDate: SNAPSHOT.todayISO,
        currency: 'KRW',
        providerTimestamp: '2026-08-05T00:00:00.000Z',
      },
      {
        // No matching quote in either universe — per the "every entry in this feed is a real
        // US-listed company" reasoning in EarningsPage.tsx, this must default to US, not vanish.
        symbol: 'ZZZUNKNOWN',
        name: 'Unknown Co',
        reportDate: SNAPSHOT.todayISO,
        currency: 'USD',
        providerTimestamp: '2026-08-05T00:00:00.000Z',
      },
    ],
  };
}

function fixtureUsOnlyPastDateResponse(): EarningsResponse {
  return {
    requestId: 'test-2',
    generatedAt: '2026-08-05T00:00:00.000Z',
    fallback: false,
    provider: {
      provider: 'alpha-vantage',
      configured: true,
      status: 'up',
      mode: 'delayed',
      message: 'ok',
      checkedAt: '2026-08-05T00:00:00.000Z',
    },
    entries: [
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        reportDate: '2026-07-13', // strictly before SNAPSHOT.todayISO, and the only date present
        estimate: 1.5,
        currency: 'USD',
        providerTimestamp: '2026-08-05T00:00:00.000Z',
      },
    ],
  };
}

function mount(initialEntry: string) {
  const router = createMemoryRouter([{ path: '/earnings', element: <EarningsPage /> }], {
    initialEntries: [initialEntry],
  });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  engine.stop();
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue(fixtureResponse());
});

afterEach(() => cleanup());

/**
 * Regression guard for Task 10 Step 1: the earnings feed (Alpha Vantage, or its static
 * fallback) only ever carries US-listed symbols — there is no Korean earnings provider.
 * EarningsPage must scope by resolving each entry's symbol against the engine and matching
 * it to the active region, rather than showing every entry under every region label.
 */
describe('EarningsPage region scoping', () => {
  it('shows only US-resolvable entries (plus unresolvable ones, treated as US) with no region param', async () => {
    await act(async () => {
      mount('/earnings');
    });

    expect(await screen.findByText('Apple Inc.')).toBeTruthy();
    expect(screen.getByText('Unknown Co')).toBeTruthy();
    expect(screen.queryByText('Samsung Electronics Co., Ltd.')).toBeNull();
    expect(screen.getByText(/2개 일정/)).toBeTruthy();
  });

  it('shows only the Korean entry under ?region=kr', async () => {
    await act(async () => {
      mount('/earnings?region=kr');
    });

    expect(await screen.findByText('Samsung Electronics Co., Ltd.')).toBeTruthy();
    expect(screen.queryByText('Apple Inc.')).toBeNull();
    expect(screen.queryByText('Unknown Co')).toBeNull();
    expect(screen.getByText(/1개 일정/)).toBeTruthy();
  });
});

/**
 * Regression guard for review round 2's minor finding: the initial-date auto-pick derived
 * `dates`/`first` from the raw, unfiltered provider response, so under `?region=kr` (with a
 * feed that is entirely US, as it always is today) the empty state named an unreachable
 * US-derived date — no day pill for it existed, and the pager was a no-op. It must fall back to
 * `SNAPSHOT.todayISO` instead when the region-scoped date set is empty.
 */
describe('EarningsPage initial date selection is region-scoped', () => {
  it('falls back to today, not a stranded US-derived date, when the KR-scoped date set is empty', async () => {
    apiFetchMock.mockResolvedValue(fixtureUsOnlyPastDateResponse());
    await act(async () => {
      mount('/earnings?region=kr');
    });

    await screen.findByText(/등록된 실적 발표가 없습니다\./);
    expect(screen.getByText(`${SNAPSHOT.todayISO}에 등록된 실적 발표가 없습니다.`)).toBeTruthy();
    expect(screen.queryByText('2026-07-13에 등록된 실적 발표가 없습니다.')).toBeNull();
  });
});

/**
 * Final whole-branch review minor finding: the feed is US-only (see `regionEntries`'s own doc
 * comment above), so under `?region=kr` the page already correctly shows "0개 일정" — but it
 * still rendered the `er-provider-status` banner with the *US* feed's `provider.status` and
 * `generatedAt`, right next to that "0개 일정" text, implying the banner's freshness/status
 * applied to the (empty) Korean listing it sits beside. Scoped to `region === 'US'` instead.
 */
describe('EarningsPage provider-status banner is US-only', () => {
  it('hides the Alpha Vantage provider banner under ?region=kr', async () => {
    await act(async () => {
      mount('/earnings?region=kr');
    });

    await screen.findByText('Samsung Electronics Co., Ltd.');
    expect(screen.queryByText('alpha-vantage')).toBeNull();
  });

  it('still shows the provider banner for the default US region (no regression)', async () => {
    await act(async () => {
      mount('/earnings');
    });

    await screen.findByText('Apple Inc.');
    expect(screen.getByText('alpha-vantage')).toBeTruthy();
  });
});
