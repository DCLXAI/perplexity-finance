import { describe, expect, it } from 'vitest';
import { isKrEquityTradingDay, previousSessionDates, dailyBarTimestamp } from './calendar.js';
import { KR_HOLIDAY_YEARS, KR_NON_TRADING_DAYS } from './kr-holidays.js';

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('isKrEquityTradingDay', () => {
  it('excludes weekends', () => {
    expect(isKrEquityTradingDay(utc('2026-08-08'))).toBe(false); // Saturday
    expect(isKrEquityTradingDay(utc('2026-08-09'))).toBe(false); // Sunday
  });

  it('trades on an ordinary weekday', () => {
    expect(isKrEquityTradingDay(utc('2026-08-04'))).toBe(true);
  });

  it('excludes every date in the table', () => {
    for (const year of KR_HOLIDAY_YEARS) {
      // KR_HOLIDAY_YEARS is derived from KR_NON_TRADING_DAYS's own keys, so
      // this is never actually undefined — but the value type now honestly
      // says `readonly string[] | undefined` (see kr-holidays.ts), so the
      // fallback keeps the typechecker satisfied without an `as` assertion.
      for (const iso of KR_NON_TRADING_DAYS[year] ?? []) {
        expect(isKrEquityTradingDay(utc(iso)), `${iso} should be closed`).toBe(false);
      }
    }
  });

  // These dates are deliberately WEEKDAY holidays. 광복절 2026 falls on a
  // Saturday, so asserting on it would pass against an empty table and prove
  // nothing — the weekend check alone would carry it.
  it('excludes 어린이날, a Tuesday in 2026', () => {
    expect(isKrEquityTradingDay(utc('2026-05-05'))).toBe(false);
  });

  it('excludes 한글날, a Friday in 2026', () => {
    expect(isKrEquityTradingDay(utc('2026-10-09'))).toBe(false);
  });

  it('excludes 근로자의날, when KRX closes though it is not a public holiday', () => {
    expect(isKrEquityTradingDay(utc('2026-05-01'))).toBe(false);
  });

  it('falls back to weekdays-only outside the table rather than throwing', () => {
    // 2035 is deliberately absent; a missing year must degrade, not crash.
    expect(() => isKrEquityTradingDay(utc('2035-03-14'))).not.toThrow();
    expect(isKrEquityTradingDay(utc('2035-03-14'))).toBe(true);
    expect(isKrEquityTradingDay(utc('2035-03-17'))).toBe(false); // Saturday
  });
});

describe('KR_EQUITY sessions', () => {
  it('skips a weekday holiday when walking back', () => {
    // 2026-05-05 어린이날 is a Tuesday, so this cannot pass on the weekend
    // check alone the way a Saturday holiday would.
    // previousSessionDates returns Date[], not ISO strings, so map before
    // comparing with toContain (which uses strict equality).
    const dates = previousSessionDates('KR_EQUITY', '2026-05-07', 3).map((d) =>
      d.toISOString().slice(0, 10),
    );
    expect(dates).not.toContain('2026-05-05');
    expect(dates).toContain('2026-05-04');
    expect(dates).toContain('2026-05-06');
  });

  it('stamps the daily bar at the 15:30 KST close', () => {
    const ts = dailyBarTimestamp('KR_EQUITY', utc('2026-08-04'));
    // 15:30 KST is 06:30 UTC; KST has no daylight saving.
    expect(new Date(ts * 1000).toISOString()).toBe('2026-08-04T06:30:00.000Z');
  });
});
