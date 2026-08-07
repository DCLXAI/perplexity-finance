// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { engine } from '@/data/engine';

// `PriceChart` mounts the real `lightweight-charts` widget, which drives its layout off
// ResizeObserver/canvas measurements jsdom doesn't fully implement — real, but unrelated to the
// peers/market-cap behavior under test here, and it throws asynchronously from an animation-frame
// callback after unmount, destabilizing unrelated assertions. Stub it out.
vi.mock('./PriceChart.js', () => ({ default: () => null }));

import StockPage from './StockPage.js';

function mount(symbol: string) {
  const router = createMemoryRouter([{ path: '/stock/:symbol', element: <StockPage /> }], {
    initialEntries: [`/stock/${symbol}`],
  });
  return render(<RouterProvider router={router} />);
}

beforeEach(() => {
  // Stops the crypto mock-tick interval so the render below is deterministic and doesn't
  // leave a timer running past the test (same convention as RailWidgets.test.tsx).
  engine.stop();
});

afterEach(() => cleanup());

function peerSymbols(container: HTMLElement): string[] {
  const peerLinks = within(container.querySelector('.st-peers') as HTMLElement).getAllByRole('link');
  return peerLinks.map((el) => decodeURIComponent((el.getAttribute('href') ?? '').replace(/^\/stock\//, '')));
}

/**
 * Regression guard for Task 10 finding #2: `PeersCard`'s stock/etf pool was
 * `engine.getStocks()` with no region argument, so a Korean stock's "동종 섹터" could list US
 * names sharing the same `SectorId`. `/stock/:symbol` intentionally carries no region param (the
 * engine resolves by symbol alone), so the fix scopes the pool to the *quote's own* region.
 */
describe('StockPage region-scoped peers and market cap', () => {
  it("scopes a Korean stock's sector peers to KR-only, and renders its market cap in won", async () => {
    const { container } = mount('005930'); // Samsung Electronics — KR, sector 'tech'

    expect(await screen.findByText('삼성전자')).toBeTruthy();

    const symbols = peerSymbols(container);
    expect(symbols.length).toBeGreaterThan(0);
    for (const sym of symbols) {
      expect(engine.getQuote(sym)?.region).toBe('KR');
    }

    const statsCard = container.querySelector('.st-stats') as HTMLElement;
    expect(statsCard.textContent).toContain('₩');
    expect(statsCard.textContent).not.toContain('US$');
  });

  it("leaves a US stock's sector peers as US-only, and its market cap in US dollars (no regression from the KR fix)", async () => {
    const { container } = mount('AAPL');

    expect(await screen.findByText('Apple Inc.', { exact: false })).toBeTruthy();

    const symbols = peerSymbols(container);
    expect(symbols.length).toBeGreaterThan(0);
    for (const sym of symbols) {
      expect(engine.getQuote(sym)?.region).toBe('US');
    }

    const statsCard = container.querySelector('.st-stats') as HTMLElement;
    expect(statsCard.textContent).toContain('US$');
    expect(statsCard.textContent).not.toContain('₩');
  });
});

/**
 * Regression guard for review round 2's Important 3: `NewsCard` sourced from the US-only
 * `GENERAL_NEWS` regardless of the quote's region, so — because its fallback is "no match? show
 * the first 3 anyway" — a Korean stock's "관련 뉴스" affirmatively presented US headlines
 * (Palantir / S&P 500 / AMD) as 005930's related news. That's a wrong row, not a missing one;
 * the fix sources from `CONTENT_BY_REGION[quote.region].news` instead.
 */
describe('StockPage region-scoped related news', () => {
  it("shows a Korean stock's own KR headline, not US news, in 관련 뉴스", async () => {
    const { container } = mount('005930');
    await screen.findByText('삼성전자');

    const newsCard = container.querySelector('.st-news-list') as HTMLElement;
    expect(newsCard.textContent).toContain('반도체 대장주 희비 엇갈려…SK하이닉스 4.88% 급락, 삼성전자는 강보합');
    expect(newsCard.textContent).not.toContain('Palantir surges');
    expect(newsCard.textContent).not.toContain('S&P 500 and Dow');
  });

  it('still shows US news for a US stock (no regression from the KR fix)', async () => {
    const { container } = mount('AAPL');
    await screen.findByText('Apple Inc.', { exact: false });

    const newsCard = container.querySelector('.st-news-list') as HTMLElement;
    expect(newsCard.textContent).toContain('Airbnb (ABNB) beats on Q2 earnings');
    expect(newsCard.textContent).not.toContain('코스피');
  });
});
