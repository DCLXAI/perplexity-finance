import { describe, expect, it } from 'vitest';
import { withRegion } from './AppShell.js';

describe('withRegion', () => {
  it('returns the path unchanged when region is null', () => {
    expect(withRegion('/screener', null)).toBe('/screener');
  });

  it('appends the region parameter to a bare path', () => {
    expect(withRegion('/politicians', 'kr')).toBe('/politicians?region=kr');
  });

  it('merges into an existing query string instead of concatenating a second "?"', () => {
    expect(withRegion('/stock/005930?foo=1', 'kr')).toBe('/stock/005930?foo=1&region=kr');
  });
});
