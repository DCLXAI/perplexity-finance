// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { engine } from '@/data/engine';
import WatchlistPage from './WatchlistPage.js';

function mount() {
  return render(
    <MemoryRouter>
      <WatchlistPage />
    </MemoryRouter>,
  );
}

async function addSymbol(user: ReturnType<typeof userEvent.setup>, symbol: string) {
  const input = screen.getByRole('combobox', { name: '관심목록에 종목 추가' });
  await user.clear(input);
  await user.type(input, symbol);
  const item = await screen.findByText(symbol, { selector: '.wl-add-sym' });
  await user.click(item);
}

beforeEach(() => {
  engine.stop();
  window.localStorage.clear();
});

afterEach(() => cleanup());

/**
 * Regression guard for Task 10 Step 3: the watchlist is deliberately cross-region — a US row
 * and a Korean row sit in the same table — and each must render in its own currency. Before
 * this fix, the market-cap column hardcoded `US$${fmtCompact(...)}` for every row regardless
 * of `quote.unit`, so a KR row would show a dollar-prefixed figure for a won-denominated cap.
 */
describe('WatchlistPage cross-region rendering', () => {
  it('renders a US row in dollars and a Korean row in won side by side, without filtering either out', async () => {
    const user = userEvent.setup();
    const { container } = mount();

    await addSymbol(user, 'AAPL');
    await addSymbol(user, '005930');

    const rows = [...container.querySelectorAll('.wl-table tbody tr')];
    const aaplRow = rows.find((r) => r.textContent?.includes('AAPL'));
    const krRow = rows.find((r) => r.textContent?.includes('005930'));

    expect(aaplRow).toBeTruthy();
    expect(krRow).toBeTruthy();

    // Both rows present at once — the watchlist must not filter by region (Step 3).
    expect(rows.length).toBeGreaterThanOrEqual(2);

    expect(aaplRow!.textContent).toMatch(/US\$/);
    expect(aaplRow!.textContent).not.toContain('₩');

    expect(krRow!.textContent).toContain('₩');
    expect(krRow!.textContent).not.toMatch(/US\$/);
  });
});
