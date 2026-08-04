import { describe, expect, it } from 'vitest';
import { parseJson, parseTheme, sanitizeWatchlist } from './persistence.js';

describe('browser persistence validation', () => {
  it('parses JSON without throwing on corruption', () => {
    expect(parseJson(null)).toBeNull();
    expect(parseJson('{broken')).toBeUndefined();
    expect(parseJson('["AMD"]')).toEqual(['AMD']);
  });

  it('accepts only supported themes', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('sepia', 'dark')).toBe('dark');
  });

  it('deduplicates, bounds and repairs watchlists', () => {
    const allowed = new Set(['AMD', 'NVDA', 'BTCUSD']);
    const fallback = ['AMD', 'NVDA'] as const;

    const sanitized = sanitizeWatchlist(
      ['AMD', 'AMD', 42, 'BTCUSD', 'NOPE'],
      allowed,
      fallback,
    );
    expect(sanitized).toEqual(['AMD', 'BTCUSD']);
    expect(Object.isFrozen(sanitized)).toBe(true);
    expect(sanitizeWatchlist([], allowed, fallback)).toEqual([]);
    expect(sanitizeWatchlist(['NOPE', 42], allowed, fallback)).toEqual(fallback);
    expect(sanitizeWatchlist({ symbol: 'AMD' }, allowed, fallback)).toEqual(fallback);
    expect(sanitizeWatchlist(['AMD', 'NVDA', 'BTCUSD'], allowed, fallback, 2)).toEqual([
      'AMD',
      'NVDA',
    ]);
  });
});
