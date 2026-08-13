import { describe, expect, it } from 'vitest';
import { engine } from './engine.js';
import { SNAPSHOT, US_PREV_ASOF_ISO } from './universe.js';
import { KR_MID_ASOF_ISO, KR_PREV_ASOF_ISO } from './universe.kr.js';

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
describe('per-row as-of override after the 2026-08-14 seed refresh', () => {
  it('stamps a refreshed US row with the new snapshot anchor, not the previous one', () => {
    // NVDA was re-verified against the settled 2026-08-12 close.
    const nvda = engine.quote('NVDA');
    expect(nvda).toBeDefined();
    expect(nvda!.sessions.regular?.asOfISO).toBe(SNAPSHOT.asOfISO);
    expect(nvda!.sessions.regular?.asOfISO).not.toBe(US_PREV_ASOF_ISO);
    expect(nvda!.provenance.providerTimestamp).toBe(SNAPSHOT.asOfISO);
  });

  it('leaves an un-refreshed US row on the previous anchor, not the bumped snapshot one', () => {
    // RF had no settled 08-12 history row at refresh time and therefore retains its old anchor.
    const rf = engine.quote('RF');
    expect(rf).toBeDefined();
    expect(rf!.sessions.regular?.asOfISO).toBe(US_PREV_ASOF_ISO);
    expect(rf!.sessions.regular?.asOfISO).not.toBe(SNAPSHOT.asOfISO);
    expect(rf!.provenance.providerTimestamp).toBe(US_PREV_ASOF_ISO);
  });

  it('stamps a refreshed KR row with the new snapshot anchor, not the previous one', () => {
    // Samsung Electronics (005930) was cross-checked exactly against a second source.
    const samsung = engine.quote('005930');
    expect(samsung).toBeDefined();
    expect(samsung!.sessions.regular?.asOfISO).toBe(SNAPSHOT.krAsOfISO);
    expect(samsung!.sessions.regular?.asOfISO).not.toBe(KR_PREV_ASOF_ISO);
  });

  it('keeps a KR benchmark that was not re-verified on its explicit middle anchor', () => {
    const kospi200 = engine.quote('^KOSPI200');
    expect(kospi200).toBeDefined();
    expect(kospi200!.sessions.regular?.asOfISO).toBe(KR_MID_ASOF_ISO);
    expect(kospi200!.sessions.regular?.asOfISO).not.toBe(SNAPSHOT.krAsOfISO);
    expect(kospi200!.sessions.regular?.asOfISO).not.toBe(KR_PREV_ASOF_ISO);
  });

  it("a refreshed row's daily history ends on its own as-of's calendar day, not the previous anchor's", () => {
    const nvdaDaily = engine.getHistory('NVDA', '1M');
    const rfDaily = engine.getHistory('RF', '1M');
    const nvdaLastISO = new Date(nvdaDaily[nvdaDaily.length - 1].time * 1000).toISOString().slice(0, 10);
    const rfLastISO = new Date(rfDaily[rfDaily.length - 1].time * 1000).toISOString().slice(0, 10);
    expect(nvdaLastISO).toBe(SNAPSHOT.asOfISO.slice(0, 10));
    expect(rfLastISO).toBe(US_PREV_ASOF_ISO.slice(0, 10));
    expect(nvdaLastISO).not.toBe(rfLastISO);
  });
});
