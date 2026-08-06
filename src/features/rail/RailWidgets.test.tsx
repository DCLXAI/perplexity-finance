// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { engine } from '@/data/engine';
import { MoversCard } from './RailWidgets.js';

function mount() {
  return render(
    <MemoryRouter>
      <MoversCard />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // Stops the crypto mock-tick interval so the render below is deterministic and doesn't
  // leave a timer running past the test (same convention as SearchPalette.test.tsx).
  engine.stop();
});

afterEach(() => {
  cleanup();
});

/**
 * Regression guard for C1: `MoversCard` mounted with **no** `region` prop — the exact shape
 * of the `EarningsPage` → `<MarketRail />` → `<MoversCard region={region} />` call chain, where
 * `region` is `undefined`. Before this fix, `MoversCard` had no default and `engine.movers`
 * received `undefined`, returning an unscoped, mixed-region list.
 *
 * This does not duplicate `engine.region.test.ts`'s explicit-region coverage: that test proves
 * `engine.movers()` filters correctly when *given* a region; this test proves the component
 * still defaults to US when *no* region is given at all, which is where the real bug lived.
 */
describe('MoversCard region default', () => {
  it('renders only US rows when mounted with no region prop', () => {
    mount();
    const rowLinks = screen.getAllByRole('link', { name: /상세 보기/ });
    expect(rowLinks.length).toBeGreaterThan(0);

    const renderedSymbols = rowLinks.map((el) =>
      decodeURIComponent((el.getAttribute('href') ?? '').replace(/^\/stock\//, '')),
    );

    // Exact match against the explicit-US call — proves the no-region default behaves
    // identically to an explicit `region: 'US'`.
    expect(renderedSymbols).toEqual(engine.movers('up', 4, 0, 'US').map((q) => q.symbol));

    // Belt-and-braces: a KR listing code is always six digits: confirm none leaked in.
    expect(renderedSymbols.some((sym) => /^\d{6}$/.test(sym))).toBe(false);
  });
});
