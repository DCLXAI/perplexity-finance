import { describe, expect, it } from 'vitest';
import { engine } from './engine.js';
import { SNAPSHOT, US_PREV_ASOF_ISO } from './universe.js';
import { KR_PREV_ASOF_ISO } from './universe.kr.js';

/**
 * Regression guard for the 2026-08-07 seed refresh's per-row `asOfISO` override
 * (`AssetMeta.asOfISO` in types.ts; resolved in engine.ts's `equityAsOfISO`/`equityAsOfTs`).
 *
 * The refresh corroborated new closes for only a minority of rows in each region. Without a
 * per-row override, bumping `SNAPSHOT.asOfISO`/`krAsOfISO` forward to those new closes would
 * silently relabel every *other* row — still priced as of the old close — as if it too were
 * current. That's the exact defect P11 fixed for KR-vs-US rows (Korean rows stamped with the
 * US equity as-of instead of their own KRX-session capture), reintroduced here per-row instead
 * of per-region. This test pins the fix: a refreshed row must carry the new anchor, and an
 * un-refreshed (or deliberately-skipped) row must keep the previous one — never the new one it
 * doesn't actually have data for.
 */
describe('per-row as-of override (2026-08-07 seed refresh)', () => {
  it('stamps a refreshed US row with the new snapshot anchor, not the previous one', () => {
    // NVDA was individually re-verified against a settled 2026-08-06 close.
    const nvda = engine.quote('NVDA');
    expect(nvda).toBeDefined();
    expect(nvda!.sessions.regular?.asOfISO).toBe(SNAPSHOT.asOfISO);
    expect(nvda!.sessions.regular?.asOfISO).not.toBe(US_PREV_ASOF_ISO);
    expect(nvda!.provenance.providerTimestamp).toBe(SNAPSHOT.asOfISO);
  });

  it('leaves an un-refreshed US row on the previous anchor, not the bumped snapshot one', () => {
    // KO (Coca-Cola) was not corroborated in the 08-07 research pass, so it carries no override.
    const ko = engine.quote('KO');
    expect(ko).toBeDefined();
    expect(ko!.sessions.regular?.asOfISO).toBe(US_PREV_ASOF_ISO);
    expect(ko!.sessions.regular?.asOfISO).not.toBe(SNAPSHOT.asOfISO);
    expect(ko!.provenance.providerTimestamp).toBe(US_PREV_ASOF_ISO);
  });

  it('stamps a refreshed KR row with the new snapshot anchor, not the previous one', () => {
    // Samsung Electronics (005930) was cross-checked exactly against a second source.
    const samsung = engine.quote('005930');
    expect(samsung).toBeDefined();
    expect(samsung!.sessions.regular?.asOfISO).toBe(SNAPSHOT.krAsOfISO);
    expect(samsung!.sessions.regular?.asOfISO).not.toBe(KR_PREV_ASOF_ISO);
  });

  it('leaves a deliberately-skipped KR row (Kakao) on the previous anchor', () => {
    // Kakao's only 08-07 figure fell inside the 시간외단일가 auction window and was not applied.
    const kakao = engine.quote('035720');
    expect(kakao).toBeDefined();
    expect(kakao!.sessions.regular?.asOfISO).toBe(KR_PREV_ASOF_ISO);
    expect(kakao!.sessions.regular?.asOfISO).not.toBe(SNAPSHOT.krAsOfISO);
  });

  it("a refreshed row's daily history ends on its own as-of's calendar day, not the previous anchor's", () => {
    const nvdaDaily = engine.getHistory('NVDA', '1M');
    const koDaily = engine.getHistory('KO', '1M');
    const nvdaLastISO = new Date(nvdaDaily[nvdaDaily.length - 1].time * 1000).toISOString().slice(0, 10);
    const koLastISO = new Date(koDaily[koDaily.length - 1].time * 1000).toISOString().slice(0, 10);
    expect(nvdaLastISO).toBe(SNAPSHOT.asOfISO.slice(0, 10));
    expect(koLastISO).toBe(US_PREV_ASOF_ISO.slice(0, 10));
    expect(nvdaLastISO).not.toBe(koLastISO);
  });
});
