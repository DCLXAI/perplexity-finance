// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '@/cloud/AuthProvider';
import AppShell from './AppShell.js';

function mount(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<div>market home</div>} />
            <Route path="/crypto" element={<div>crypto</div>} />
            <Route path="/portfolio" element={<div>portfolio</div>} />
            <Route path="/screener" element={<div>screener</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
});

/**
 * Regression guard for the round-2 review finding: `AppShell`'s nav links must follow the same
 * "only stamp `?region=` when it isn't the default US" convention `RailWidgets.tsx`'s `MoversCard`
 * already documents and follows (`withRegion('/screener', region === 'KR' ? 'kr' : null)`).
 *
 * Before the fix, `AppShell` computed `regionParam` from `searchParams.has(REGION_PARAM)` instead
 * of from the resolved `region` value. That meant once a URL explicitly carried `?region=us` —
 * which `RegionSwitcher.choose` writes unconditionally, including when switching *to* US — every
 * nav link, including region-agnostic ones like `/crypto` and `/portfolio`, kept carrying
 * `?region=us` for the rest of the session. `AppShell.test.ts` only unit-tests the `withRegion`
 * helper in isolation and could not catch this; this test renders the actual nav and reads the
 * real `href` react-router produces.
 */
describe('AppShell region-aware nav links', () => {
  it('does not stamp ?region=us onto a region-agnostic tab once the URL explicitly carries region=us', () => {
    mount('/?region=us');
    const cryptoLink = screen.getByRole('link', { name: '암호화폐' });
    const portfolioLink = screen.getByRole('link', { name: '포트폴리오' });
    expect(cryptoLink.getAttribute('href')).toBe('/crypto');
    expect(portfolioLink.getAttribute('href')).toBe('/portfolio');
  });

  it('still stamps ?region=kr onto every nav link, including region-agnostic ones, under KR', () => {
    mount('/?region=kr');
    const cryptoLink = screen.getByRole('link', { name: '암호화폐' });
    const portfolioLink = screen.getByRole('link', { name: '포트폴리오' });
    expect(cryptoLink.getAttribute('href')).toBe('/crypto?region=kr');
    expect(portfolioLink.getAttribute('href')).toBe('/portfolio?region=kr');
  });

  it('carries no region parameter at all when the URL never had one', () => {
    mount('/');
    const cryptoLink = screen.getByRole('link', { name: '암호화폐' });
    expect(cryptoLink.getAttribute('href')).toBe('/crypto');
  });
});
