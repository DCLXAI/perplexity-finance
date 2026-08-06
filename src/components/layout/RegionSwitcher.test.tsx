// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { MarketRegion } from '@/data/region.js';
import { RegionTab } from './RegionSwitcher.js';

afterEach(() => {
  cleanup();
});

function mountTab(initial: string, onNavigate: (region: MarketRegion) => void = () => {}) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <RegionTab isActive onNavigate={onNavigate} />
    </MemoryRouter>,
  );
}

/**
 * The tab-bar caret used to be a decorative `▾` that promised a dropdown and did nothing — the
 * only working switcher lived inside the market page. These pin the tab's own menu.
 */
describe('RegionTab', () => {
  it('labels the tab with the region the URL names', () => {
    mountTab('/?region=kr');
    // The flag is aria-hidden, so the accessible name is the label alone.
    expect(screen.getByRole('button', { name: '한국 시장' })).toBeTruthy();
  });

  it('opens a menu offering both markets from the caret', async () => {
    mountTab('/?region=kr');
    await userEvent.click(screen.getByRole('button', { name: /시장 지역 변경/ }));
    expect(screen.getByRole('menuitem', { name: /미국 시장/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /한국 시장/ })).toBeTruthy();
  });

  it('reports the chosen region so the shell can navigate to that market home', async () => {
    const seen: string[] = [];
    mountTab('/?region=kr', (next) => seen.push(next));
    await userEvent.click(screen.getByRole('button', { name: /시장 지역 변경/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: /미국 시장/ }));
    expect(seen).toEqual(['US']);
  });

  it('does not re-navigate when the current region is re-selected', async () => {
    const seen: string[] = [];
    mountTab('/?region=kr', (next) => seen.push(next));
    await userEvent.click(screen.getByRole('button', { name: /시장 지역 변경/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: /한국 시장/ }));
    expect(seen).toEqual([]);
  });

  it('renders the menu outside the scrolling tab bar', async () => {
    const { container } = mountTab('/');
    await userEvent.click(screen.getByRole('button', { name: /시장 지역 변경/ }));
    const menu = screen.getByRole('menu');
    // `.tabbar-tabs` is an `overflow-x: auto` scroll container, which clips absolutely
    // positioned descendants — the menu must be portalled out of the tab's own subtree.
    expect(container.contains(menu)).toBe(false);
    expect(document.body.contains(menu)).toBe(true);
  });
});
