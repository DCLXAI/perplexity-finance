import { describe, expect, it } from 'vitest';
import { engine } from './engine.js';
import { SNAPSHOT } from './universe.js';

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

  /**
   * Regression guard for the Task 10 finding: Korean rows were stamped with the US equity
   * as-of (`SNAPSHOT.asOfISO`, the 2026-08-04 close) instead of their own KRX-session capture
   * (`SNAPSHOT.krAsOfISO`, one session later on 2026-08-05) — a provenance error, since the
   * seed itself documents the KR rows as a distinct, later session (see universe.kr.ts).
   */
  it('stamps a Korean quote with the KR as-of, not the US equity as-of', () => {
    const kr = engine.quote('005930');
    expect(kr).toBeDefined();
    const session = kr!.sessions.regular;
    expect(session).toBeDefined();
    expect(session!.asOfISO).toBe(SNAPSHOT.krAsOfISO);
    expect(session!.asOfISO).not.toBe(SNAPSHOT.asOfISO);
    expect(kr!.provenance.providerTimestamp).toBe(SNAPSHOT.krAsOfISO);
  });

  it('leaves a US equity quote stamped with the US as-of (no regression from the KR fix)', () => {
    const us = engine.quote('AAPL');
    expect(us).toBeDefined();
    const session = us!.sessions.regular;
    expect(session).toBeDefined();
    expect(session!.asOfISO).toBe(SNAPSHOT.asOfISO);
    expect(us!.provenance.providerTimestamp).toBe(SNAPSHOT.asOfISO);
  });

  it("a Korean equity's daily history ends on the KR as-of's calendar day", () => {
    const daily = engine.getHistory('005930', '1M');
    expect(daily.length).toBeGreaterThan(0);
    const lastBarISO = new Date(daily[daily.length - 1].time * 1000).toISOString().slice(0, 10);
    expect(lastBarISO).toBe(SNAPSHOT.krAsOfISO.slice(0, 10));
  });
});
