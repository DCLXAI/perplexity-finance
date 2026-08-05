// src/data/format.krw.test.ts
import { describe, expect, it } from 'vitest';
import { fmtInstrumentChange, fmtInstrumentValue, fmtKrw, fmtKrwCompact } from './format.js';

describe('fmtKrw', () => {
  it('renders whole won with thousands separators and no decimals', () => {
    expect(fmtKrw(246000)).toBe('₩246,000');
    expect(fmtKrw(1668000)).toBe('₩1,668,000');
  });

  it('rounds sub-won values rather than showing fractions of a won', () => {
    expect(fmtKrw(1380.4)).toBe('₩1,380');
  });
});

describe('fmtKrwCompact', () => {
  it('compacts with 조 and 억, the units a Korean reader expects', () => {
    expect(fmtKrwCompact(1_568_320_000_000_000)).toBe('₩1,568.32조');
    expect(fmtKrwCompact(4_250_000_000_000)).toBe('₩4.25조');
    expect(fmtKrwCompact(852_000_000_000)).toBe('₩8,520억');
    expect(fmtKrwCompact(31_000_000_000)).toBe('₩310억');
  });

  it('falls back to plain won below 억', () => {
    expect(fmtKrwCompact(4_300_000)).toBe('₩4,300,000');
  });
});

describe('instrument dispatch', () => {
  it('routes KRW through the won formatter', () => {
    expect(fmtInstrumentValue('KRW', 246000)).toBe('₩246,000');
    expect(fmtInstrumentChange('KRW', 6000)).toBe('+₩6,000');
    expect(fmtInstrumentChange('KRW', -6000)).toBe('-₩6,000');
  });

  it('leaves the existing units untouched', () => {
    expect(fmtInstrumentValue('POINTS', 3241.5)).toContain('pt');
    expect(fmtInstrumentValue('USD', 309.38)).toBe('US$309.38');
  });
});
