// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_REGION, landingRegion, parseRegion, regionFromSearch, rememberRegion, REGION_LABELS,
} from './region.js';

describe('parseRegion', () => {
  it('accepts both regions case-insensitively', () => {
    expect(parseRegion('kr')).toBe('KR');
    expect(parseRegion('KR')).toBe('KR');
    expect(parseRegion('us')).toBe('US');
  });

  it('falls back to the default on anything unrecognised', () => {
    expect(parseRegion('jp')).toBe(DEFAULT_REGION);
    expect(parseRegion(null)).toBe(DEFAULT_REGION);
    expect(parseRegion(undefined)).toBe(DEFAULT_REGION);
    expect(parseRegion('')).toBe(DEFAULT_REGION);
  });
});

describe('regionFromSearch', () => {
  it('reads the region parameter', () => {
    expect(regionFromSearch(new URLSearchParams('region=kr'))).toBe('KR');
  });

  it('defaults to US when the parameter is absent', () => {
    expect(regionFromSearch(new URLSearchParams(''))).toBe('US');
  });
});

describe('landing default', () => {
  beforeEach(() => localStorage.clear());

  it('starts at the default region', () => {
    expect(landingRegion()).toBe(DEFAULT_REGION);
  });

  it('remembers the last explicit choice', () => {
    rememberRegion('KR');
    expect(landingRegion()).toBe('KR');
  });

  it('returns the default when reading storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: storage disabled');
    });
    expect(landingRegion()).toBe(DEFAULT_REGION);
    spy.mockRestore();
  });

  it('does not throw when writing to storage fails', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => rememberRegion('KR')).not.toThrow();
    spy.mockRestore();
  });
});

describe('REGION_LABELS', () => {
  it('labels both regions in Korean with a flag', () => {
    expect(REGION_LABELS.US).toEqual({ label: '미국 시장', flag: '🇺🇸' });
    expect(REGION_LABELS.KR).toEqual({ label: '한국 시장', flag: '🇰🇷' });
  });
});
