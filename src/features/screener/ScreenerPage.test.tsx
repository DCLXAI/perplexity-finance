// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { engine } from '@/data/engine';
import ScreenerPage from './ScreenerPage.js';

function mount() {
  // A data router (not a plain `<MemoryRouter>`) so `router.navigate` below changes the
  // location of an *already-mounted* tree — the same route element stays mounted across
  // the navigation, exactly like the in-app SPA transition this effect guards. Re-rendering
  // a fresh `<MemoryRouter initialEntries=...>` per assertion would trivially reset React
  // state via remount and prove nothing about the effect itself.
  const router = createMemoryRouter([{ path: '/screener', element: <ScreenerPage /> }], {
    initialEntries: ['/screener'],
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
