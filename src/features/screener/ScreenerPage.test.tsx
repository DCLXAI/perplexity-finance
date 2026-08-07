// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { engine } from '@/data/engine';
import ScreenerPage from './ScreenerPage.js';

function mount(initialEntry = '/screener') {
  // A data router (not a plain `<MemoryRouter>`) so `router.navigate` below changes the
  // location of an *already-mounted* tree — the same route element stays mounted across
  // the navigation, exactly like the in-app SPA transition this effect guards. Re-rendering
  // a fresh `<MemoryRouter initialEntries=...>` per assertion would trivially reset React
  // state via remount and prove nothing about the effect itself.
  const router = createMemoryRouter([{ path: '/screener', element: <ScreenerPage /> }], {
    initialEntries: [initialEntry],
  });
  const utils = render(<RouterProvider router={router} />);
  return { ...utils, router };
}

beforeEach(() => {
  // Stops the mock-tick interval so the render below is deterministic and doesn't leave a
  // timer running past the test (same convention as RailWidgets.test.tsx / SearchPalette.test.tsx).
  engine.stop();
});

afterEach(() => {
  cleanup();
});

/**
 * Regression guard for the sector-selection leak across a region switch: `SECTORS_BY_REGION`
 * hands both regions the same `SectorId` taxonomy, so a sector chosen under one region is
 * *syntactically* valid under the other even though the constituent sets don't match. Before
 * the `useEffect(() => { setSector('all'); ... }, [region])` guard, a stale sector selection
 * would silently survive a region switch and could zero out the listing with no visible cause.
 *
 * `realestate` is the sharpest reproduction: it has US constituents but zero KR constituents
 * (see the doc comment on `KR_SECTORS` in universe.kr.ts), so leaking the selection across the
 * switch doesn't just filter down the KR list -- it empties it outright.
 */
describe('ScreenerPage region switch', () => {
  it('resets a US-only sector selection instead of leaking it into an empty KR listing', async () => {
    const usRealEstateCount = engine
      .listAssets('US')
      .filter((q) => q.kind === 'stock' && q.sectorId === 'realestate').length;
    const krStockCount = engine.listAssets('KR').filter((q) => q.kind === 'stock').length;
    // Both counts must be meaningful for this repro to prove anything.
    expect(usRealEstateCount).toBeGreaterThan(0);
    expect(krStockCount).toBeGreaterThan(0);

    const { router, container } = mount();

    const select = screen.getByRole('combobox', { name: '섹터 필터' }) as HTMLSelectElement;
    await userEvent.selectOptions(select, '부동산');
    expect(select.value).toBe('realestate');
    expect(container.querySelector('.sc-count')?.textContent).toBe(`${usRealEstateCount}개 종목`);

    // Same mounted ScreenerPage instance, only the location's search string changes.
    await act(async () => {
      await router.navigate('/screener?region=kr');
    });

    expect(select.value).toBe('all');
    expect(container.querySelector('.sc-count')?.textContent).toBe(`${krStockCount}개 종목`);
  });
});

/**
 * Final whole-branch review IMPORTANT: `ScreenerPage.tsx` was the one market-cap surface that
 * never converted — it called `fmtCompact(quote.marketCap)` directly instead of the
 * region-aware `fmtMarketCap()` that Task 10 centralized (and that StockPage/WatchlistPage/
 * Heatmap all already use). `AssetMeta.marketCap` is always stored in USD, so a KR row rendered
 * an unlabeled dollar-shaped number (e.g. "1.13T") in the same table cell where every other
 * surface shows "₩1,568.32조" — the review's own jsdom render caught exactly this.
 *
 * The default sort is `marketCap`/`desc`, so the first body row is always the top-cap stock for
 * the active region: Samsung Electronics (005930) for KR, NVIDIA (NVDA) for US.
 */
describe('ScreenerPage market-cap column is region-aware', () => {
  it("renders a KR row's market cap in won, not an unlabeled dollar figure", async () => {
    const { container } = mount('/screener?region=kr');
    const firstRow = container.querySelector('tbody tr');
    expect(firstRow?.querySelector('.sc-sym')?.textContent).toBe('005930');
    const capCell = firstRow?.querySelectorAll('td.num')[3];
    expect(capCell?.textContent).toBe('₩1,568.32조');
    expect(capCell?.textContent).not.toMatch(/^\d/); // never a bare, unlabeled compact number
  });

  it('still renders a US row market cap in dollars (no regression from the KR fix)', async () => {
    const { container } = mount('/screener');
    const firstRow = container.querySelector('tbody tr');
    expect(firstRow?.querySelector('.sc-sym')?.textContent).toBe('NVDA');
    const capCell = firstRow?.querySelectorAll('td.num')[3];
    expect(capCell?.textContent).toBe('US$5.30T');
  });
});

/**
 * Final whole-branch review IMPORTANT (quick-filter chips, same root cause): the "대형주"/
 * "중소형주" thresholds are USD-denominated ($100B/$10B) — numerically correct regardless of
 * region since `marketCap` is always USD — but a dollar-labeled chip filtering a won-priced
 * table told a KR user nothing about which rows would match. Measured directly against the
 * seed (see `CAP_THRESHOLDS_BY_REGION`'s doc comment): under the old US-only thresholds, KR's
 * "대형주(≥$100B)" chip matched only 3 of 159 stocks and "중소형주(<$10B)" matched 107 — visually
 * backwards from what "대형주"/"중소형주" should mean on this table. The region-specific
 * won thresholds (10조원 / 3조원) give 63 and 43.
 */
describe('ScreenerPage quick-filter chips are region-aware', () => {
  it('labels and buckets the large/small caps chips in dollars for US', async () => {
    const { container } = mount('/screener');
    await userEvent.click(screen.getByRole('button', { name: '대형주(≥$100B)' }));
    expect(container.querySelector('.sc-count')?.textContent).toBe('109개 종목');
    await userEvent.click(screen.getByRole('button', { name: '중소형주(<$10B)' }));
    expect(container.querySelector('.sc-count')?.textContent).toBe('14개 종목');
  });

  it('labels and buckets the large/small caps chips in won for KR', async () => {
    const { container } = mount('/screener?region=kr');
    await userEvent.click(screen.getByRole('button', { name: '대형주(≥10조원)' }));
    expect(container.querySelector('.sc-count')?.textContent).toBe('63개 종목');
    await userEvent.click(screen.getByRole('button', { name: '중소형주(<3조원)' }));
    expect(container.querySelector('.sc-count')?.textContent).toBe('43개 종목');
  });
});
