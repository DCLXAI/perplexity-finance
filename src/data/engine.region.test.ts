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

  it('scopes movers to one region — regression for the market-home rail leaking KR rows into US', () => {
    for (const direction of ['up', 'down', 'active'] as const) {
      const us = engine.movers(direction, 8, 0, 'US');
      expect(us.length).toBeGreaterThan(0);
      expect(us.every((q) => q.region === 'US')).toBe(true);

      const kr = engine.movers(direction, 8, 0, 'KR');
      expect(kr.length).toBeGreaterThan(0);
      expect(kr.every((q) => q.region === 'KR')).toBe(true);
    }
  });
});
