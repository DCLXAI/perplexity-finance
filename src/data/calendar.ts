/* ============================================================
   Deterministic market calendars used by the mock data engine.

   - US equities: weekdays minus standard NYSE holidays
   - Futures: weekday sessions (simplified mock calendar)
   - Crypto: 24/7 calendar

   Dates are handled in UTC to avoid the viewer's local timezone
   changing the generated series.
   ============================================================ */
import type { AssetKind, HistoryRange } from './types.js';
import { KR_NON_TRADING_DAYS } from './kr-holidays.js';
import type { MarketRegion } from './region.js';

const DAY_MS = 86_400_000;
const FIFTEEN_MINUTES = 15 * 60;

export type MarketCalendar = 'US_EQUITY' | 'KR_EQUITY' | 'WEEKDAY' | 'CRYPTO_24_7';

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nthWeekday(year: number, month: number, weekday: number, nth: number): Date {
  const first = utcDate(year, month, 1);
  const delta = (weekday - first.getUTCDay() + 7) % 7;
  return utcDate(year, month, 1 + delta + (nth - 1) * 7);
}

function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = utcDate(year, month + 1, 0);
  const delta = (last.getUTCDay() - weekday + 7) % 7;
  return addDays(last, -delta);
}

function observedFixedHoliday(year: number, month: number, day: number): Date {
  const actual = utcDate(year, month, day);
  if (actual.getUTCDay() === 6) return addDays(actual, -1);
  if (actual.getUTCDay() === 0) return addDays(actual, 1);
  return actual;
}

/** Anonymous Gregorian computus. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month, day);
}

const holidayCache = new Map<number, Set<string>>();

function usEquityHolidayKeys(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const dates = [
    observedFixedHoliday(year, 0, 1), // New Year's Day
    nthWeekday(year, 0, 1, 3), // Martin Luther King Jr. Day
    nthWeekday(year, 1, 1, 3), // Washington's Birthday
    addDays(easterSunday(year), -2), // Good Friday
    lastWeekday(year, 4, 1), // Memorial Day
    ...(year >= 2022 ? [observedFixedHoliday(year, 5, 19)] : []), // Juneteenth
    observedFixedHoliday(year, 6, 4), // Independence Day
    nthWeekday(year, 8, 1, 1), // Labor Day
    nthWeekday(year, 10, 4, 4), // Thanksgiving
    observedFixedHoliday(year, 11, 25), // Christmas
    // New Year's Day of the following year can be observed on Dec 31.
    observedFixedHoliday(year + 1, 0, 1),
  ];

  const set = new Set(dates.filter((date) => date.getUTCFullYear() === year).map(dateKey));
  holidayCache.set(year, set);
  return set;
}

export function isUsEquityTradingDay(date: Date): boolean {
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !usEquityHolidayKeys(date.getUTCFullYear()).has(dateKey(date));
}

const krHolidayCache = new Map<number, Set<string>>();

function krNonTradingKeys(year: number): Set<string> {
  const cached = krHolidayCache.get(year);
  if (cached) return cached;

  const set = new Set(KR_NON_TRADING_DAYS[year] ?? []);
  krHolidayCache.set(year, set);
  return set;
}

/**
 * Weekends, then the table. A year absent from the table degrades to
 * weekdays-only rather than throwing: a missing year should cost accuracy
 * on that year's bars, not take down every chart on the page.
 */
export function isKrEquityTradingDay(date: Date): boolean {
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !krNonTradingKeys(date.getUTCFullYear()).has(dateKey(date));
}

export function isWeekday(date: Date): boolean {
  const weekday = date.getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

export function calendarForAsset(kind: AssetKind, region: MarketRegion = 'US'): MarketCalendar {
  if (kind === 'crypto') return 'CRYPTO_24_7';
  if (kind === 'future') return 'WEEKDAY';
  return region === 'KR' ? 'KR_EQUITY' : 'US_EQUITY';
}

/**
 * The clock a chart axis should be labelled in: the market's own, not the viewer's and not UTC.
 * A 09:00–15:30 KRX session rendered against UTC reads as 00:00–06:30, contradicting the KST
 * as-of stamp printed directly above the chart. Crypto trades continuously with no home
 * exchange, so UTC is the honest choice there rather than an arbitrary city.
 */
export function marketTimeZone(calendar: MarketCalendar): string {
  if (calendar === 'KR_EQUITY') return 'Asia/Seoul';
  if (calendar === 'CRYPTO_24_7') return 'UTC';
  return 'America/New_York';
}

function isSessionDay(calendar: MarketCalendar, date: Date): boolean {
  if (calendar === 'CRYPTO_24_7') return true;
  if (calendar === 'WEEKDAY') return isWeekday(date);
  if (calendar === 'KR_EQUITY') return isKrEquityTradingDay(date);
  return isUsEquityTradingDay(date);
}

export function previousSessionDates(
  calendar: MarketCalendar,
  endDateISO: string,
  count: number,
): Date[] {
  const out: Date[] = [];
  let cursor = new Date(`${endDateISO}T00:00:00Z`);
  while (out.length < count) {
    if (isSessionDay(calendar, cursor)) out.push(cursor);
    cursor = addDays(cursor, -1);
  }
  return out.reverse();
}

function rangeStart(end: Date, range: Exclude<HistoryRange, '1D' | '5D' | '7D'>): Date {
  const year = end.getUTCFullYear();
  const month = end.getUTCMonth();
  const day = end.getUTCDate();
  if (range === 'YTD') return utcDate(year, 0, 1);
  if (range === '1M') return utcDate(year, month - 1, day);
  if (range === '6M') return utcDate(year, month - 6, day);
  if (range === '1Y') return utcDate(year - 1, month, day);
  return utcDate(year - 5, month, day);
}

export function sessionDatesForRange(
  calendar: MarketCalendar,
  endDateISO: string,
  range: Exclude<HistoryRange, '1D' | '5D' | '7D'>,
): Date[] {
  const end = new Date(`${endDateISO}T00:00:00Z`);
  const start = rangeStart(end, range);
  const out: Date[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    if (isSessionDay(calendar, cursor)) out.push(cursor);
  }
  return out;
}

function nthSunday(year: number, month: number, nth: number): Date {
  return nthWeekday(year, month, 0, nth);
}

/** US Eastern offset for 2007+ DST rules, sufficient for the 5Y demo range. */
function easternOffsetHours(date: Date): -5 | -4 {
  const year = date.getUTCFullYear();
  const start = nthSunday(year, 2, 2);
  const end = nthSunday(year, 10, 1);
  const key = dateKey(date);
  return key >= dateKey(start) && key < dateKey(end) ? -4 : -5;
}

function easternTimestamp(date: Date, hour: number, minute: number): number {
  const offset = easternOffsetHours(date);
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour - offset, minute) /
      1000,
  );
}

/** KST is UTC+9 year-round — no daylight saving, so no offset lookup is needed. */
function kstTimestamp(date: Date, hour: number, minute: number): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour - 9, minute) / 1000,
  );
}

export function dailyBarTimestamp(calendar: MarketCalendar, date: Date): number {
  if (calendar === 'US_EQUITY') return easternTimestamp(date, 16, 0);
  if (calendar === 'KR_EQUITY') return kstTimestamp(date, 15, 30);
  if (calendar === 'WEEKDAY') return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 20, 0) / 1000;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0) / 1000;
}

export function intradayBarTimestamps(
  calendar: MarketCalendar,
  endDateISO: string,
  endTimestamp: number,
  range: '1D' | '5D' | '7D',
): number[] {
  if (calendar === 'US_EQUITY' || calendar === 'KR_EQUITY') {
    const sessions = range === '1D' ? 1 : range === '5D' ? 5 : 7;
    const dates = previousSessionDates(calendar, endDateISO, sessions);
    const out: number[] = [];
    for (const date of dates) {
      // US: 9:30-16:00 ET. KR: 09:00-15:30 KST. Both are 6.5h — 26 bars of 15m.
      const open =
        calendar === 'US_EQUITY' ? easternTimestamp(date, 9, 30) : kstTimestamp(date, 9, 0);
      for (let i = 0; i < 26; i++) out.push(open + i * FIFTEEN_MINUTES);
    }
    return out;
  }

  const days = range === '1D' ? 1 : range === '5D' ? 5 : 7;
  const needed = days * 96;
  const out: number[] = [];
  let cursor = endTimestamp - FIFTEEN_MINUTES;
  while (out.length < needed) {
    const date = new Date(cursor * 1000);
    if (calendar === 'CRYPTO_24_7' || isWeekday(date)) out.push(cursor);
    cursor -= FIFTEEN_MINUTES;
  }
  return out.reverse();
}
