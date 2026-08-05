// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
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

  it('ignores a corrupted stored value rather than throwing', () => {
    localStorage.setItem('pf.region', 'not-a-region');
    expect(landingRegion()).toBe(DEFAULT_REGION);
  });
});

describe('REGION_LABELS', () => {
  it('labels both regions in Korean with a flag', () => {
    expect(REGION_LABELS.US).toEqual({ label: '미국 시장', flag: '🇺🇸' });
    expect(REGION_LABELS.KR).toEqual({ label: '한국 시장', flag: '🇰🇷' });
  });
});
