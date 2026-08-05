import { describe, expect, it } from 'vitest';
import { engine } from './engine.js';

describe('cross-region resolution', () => {
  it('resolves a US ticker', () => {
    expect(engine.quote('AAPL')?.region).toBe('US');
  });

  it('resolves a Korean listing code without being told the region', () => {
    expect(engine.quote('005930')?.region).toBe('KR');
  });

  it('prices each in its own unit', () => {
    expect(engine.quote('AAPL')?.unit).toBe('USD');
    expect(engine.quote('005930')?.unit).toBe('KRW');
  });

  it('lists only the requested region', () => {
    const kr = engine.listAssets('KR');
    expect(kr.length).toBeGreaterThan(0);
    expect(kr.every((a) => a.region === 'KR')).toBe(true);
    expect(engine.listAssets('US').every((a) => a.region === 'US')).toBe(true);
  });
});
