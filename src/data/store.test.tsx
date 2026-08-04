// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  window.localStorage.clear();
  vi.resetModules();
});

afterEach(async () => {
  cleanup();
  const { engine } = await import('./engine.js');
  engine.stop();
});

describe('browser-store cross-tab synchronisation', () => {
  it('validates watchlist storage events and publishes the repaired snapshot', async () => {
    window.localStorage.setItem('pf-watchlist-v1', JSON.stringify(['AMD']));
    const { useWatchlist } = await import('./store.js');
    const { engine } = await import('./engine.js');
    engine.stop();

    function Probe() {
      const { symbols } = useWatchlist();
      return <output aria-label="관심목록 심볼">{symbols.join(',')}</output>;
    }

    render(<Probe />);
    expect(screen.getByLabelText('관심목록 심볼').textContent).toBe('AMD');

    window.localStorage.setItem('pf-watchlist-v1', JSON.stringify(['NVDA', 'NVDA', 'NOPE']));
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'pf-watchlist-v1',
        newValue: JSON.stringify(['NVDA', 'NVDA', 'NOPE']),
        storageArea: window.localStorage,
      }),
    );

    await waitFor(() => expect(screen.getByLabelText('관심목록 심볼').textContent).toBe('NVDA'));
    expect(screen.getByLabelText('관심목록 심볼').textContent).not.toContain('NOPE');
  });
});
