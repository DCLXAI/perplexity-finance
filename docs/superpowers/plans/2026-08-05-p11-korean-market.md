# P11 Korean Market Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Korean market (KRX) as a first-class region — won pricing, KRX trading calendar, KOSPI/KOSDAQ, and a Korean equity universe — reachable from a real region switcher that re-scopes market home, screener, heatmap, and earnings.

**Architecture:** Region lives in the URL as `?region=kr`, defaulting to `us`. `AssetMeta` carries its own region, so the data engine resolves any symbol without being told which market it belongs to; the URL parameter decides only which universe a page *lists*. The three USD/NYSE assumptions baked into shared code — `InstrumentUnit`, the currency formatter, and `MarketCalendar` — each gain a Korean sibling rather than being forked.

**Tech Stack:** TypeScript 5.9 (ESM, `.js` import specifiers), React 19, `react-router` 8, Vitest, Vite 8.

## Global Constraints

- Node.js `>=22.22.0`. React 19, `react-router` 8 (never `react-router-dom` — the package does not exist in v8).
- All relative imports use `.js` specifiers even for `.ts`/`.tsx` sources; `npm run validate:esm` enforces this.
- `Object.freeze` on returned collections and objects; `readonly` interface members; named exports.
- No new dependencies. In particular, **do not add a lunar-calendar library** — the holiday table exists precisely so that dependency is unnecessary.
- Do not modify `vercel.json`. The Vercel Hobby plan allows exactly two Cron schedules and both are in use.
- **The portfolio stays a USD ledger.** Do not touch `server/portfolio/*`, the portfolio migrations, or `src/features/portfolio/*`. Multi-currency reopens P4 through P9.
- Korean market data is seeded and labelled exactly as the US demo is (`DEMO · 합성 시세`). Region selection never changes provenance rules, the quality gate, or what may become a strict snapshot.
- User-facing copy is Korean.
- Application version moves `1.11.0` → `1.12.0` in Task 12. Until then leave every version literal alone.
- Run `npm run check` before every commit. It must exit 0.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/data/region.ts` | `MarketRegion` type, the URL-parameter contract, landing-default persistence. Pure. |
| `src/data/kr-holidays.ts` | KRX non-trading dates, 2021–2026. Data only, no logic. |
| `src/data/calendar.ts` | + `KR_EQUITY` calendar, KST session helper. |
| `src/data/format.ts` | + won formatting and 조/억 compaction. |
| `src/data/types.ts` | + `'KRW'` unit, `AssetMeta.region`. |
| `src/data/universe.kr.ts` | Korean equity seed, indices, and sector levels. |
| `src/data/universe.ts` | Region-scoped `SECTORS`; existing rows gain `region: 'US'`. |
| `src/data/content.kr.ts` | Korean market summary, news, explore cards. |
| `src/data/engine.ts` | Resolves symbols across both universes. |
| `src/components/layout/RegionSwitcher.tsx` | The switcher control. |
| `src/components/layout/AppShell.tsx` | Hides 정치인/예측 while region is `KR`. |
| `src/features/market/MarketPage.tsx` | Region-aware; hosts the switcher. |
| `src/features/screener/ScreenerPage.tsx` | Region-aware listing. |
| `src/features/heatmap/Heatmap.tsx` | Region-aware universe. |
| `src/features/earnings/EarningsPage.tsx` | Region-aware listing. |
| `scripts/fetch-kr-seed.mjs` | Sources the Korean seed. |
| `scripts/validate-p11.ts` | Contract assertions, wired into `npm run check`. |

---

### Task 1: Region model

**Files:**
- Create: `src/data/region.ts`, `src/data/region.test.ts`

**Interfaces:**
- Produces: `MarketRegion` (`'US' | 'KR'`), `REGIONS`, `DEFAULT_REGION`, `parseRegion(value)`, `regionFromSearch(params)`, `rememberRegion(region)`, `landingRegion()`, `REGION_LABELS`.

- [ ] **Step 1: Write the failing test**

```ts
// src/data/region.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/region.test.ts`
Expected: FAIL — cannot resolve `./region.js`.

- [ ] **Step 3: Write the implementation**

```ts
// src/data/region.ts
/* ============================================================
   Which market a page lists.

   The URL is the single source of truth at render time — links and
   refreshes have to work. localStorage only picks the landing default and
   is never consulted during render, so the two cannot disagree.
   ============================================================ */

export type MarketRegion = 'US' | 'KR';

export const REGIONS: readonly MarketRegion[] = Object.freeze(['US', 'KR']);
export const DEFAULT_REGION: MarketRegion = 'US';

/** Search-parameter name carrying the region. */
export const REGION_PARAM = 'region';

const STORAGE_KEY = 'pf.region';

export const REGION_LABELS: Readonly<Record<MarketRegion, { label: string; flag: string }>> =
  Object.freeze({
    US: Object.freeze({ label: '미국 시장', flag: '🇺🇸' }),
    KR: Object.freeze({ label: '한국 시장', flag: '🇰🇷' }),
  });

/** Never throws: an unrecognised value is a stale link, not an error worth breaking a page over. */
export function parseRegion(value: string | null | undefined): MarketRegion {
  const upper = (value ?? '').toUpperCase();
  return REGIONS.includes(upper as MarketRegion) ? (upper as MarketRegion) : DEFAULT_REGION;
}

export function regionFromSearch(params: URLSearchParams): MarketRegion {
  return parseRegion(params.get(REGION_PARAM));
}

export function rememberRegion(region: MarketRegion): void {
  try {
    localStorage.setItem(STORAGE_KEY, region);
  } catch {
    // Private mode or a full quota: the landing default is a convenience, not state worth failing on.
  }
}

export function landingRegion(): MarketRegion {
  try {
    return parseRegion(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_REGION;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/region.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/region.ts src/data/region.test.ts
git commit -m "feat(p11): add the market region model"
```

---

### Task 2: Won formatting

**Files:**
- Modify: `src/data/types.ts` (the `InstrumentUnit` union), `src/data/format.ts`
- Create: `src/data/format.krw.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `'KRW'` on `InstrumentUnit`; `fmtKrw(value)`, `fmtKrwCompact(value)`; `fmtInstrumentValue` and `fmtInstrumentChange` handling `'KRW'`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/format.krw.test.ts`
Expected: FAIL — `fmtKrw` is not exported.

- [ ] **Step 3: Add `'KRW'` to the unit union**

In `src/data/types.ts`, change the `InstrumentUnit` line to:

```ts
export type InstrumentUnit = 'USD' | 'KRW' | 'POINTS' | 'PERCENT' | 'USD_PER_OZ' | 'USD_PER_BBL';
```

- [ ] **Step 4: Write the formatters**

Add to `src/data/format.ts`, beside `fmtUsd`:

```ts
/** Won prices are whole units — KRX quotes in won, so a decimal would be noise. */
export function fmtKrw(value: number): string {
  return `₩${Math.round(value).toLocaleString('ko-KR')}`;
}

/**
 * 조 (10^12) and 억 (10^8) rather than T/B/M. A Korean reader parses
 * "1,568.32조" instantly and "US$1.57T" not at all.
 */
export function fmtKrwCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `₩${(value / 1e12).toFixed(2)}조`;
  if (abs >= 1e8) return `₩${Math.round(value / 1e8).toLocaleString('ko-KR')}억`;
  return fmtKrw(value);
}
```

Then add `'KRW'` to both dispatchers, before their final `return`:

```ts
// in fmtInstrumentValue
if (unit === 'KRW') return fmtKrw(value);

// in fmtInstrumentChange
if (unit === 'KRW') return `${sign}${fmtKrw(magnitude)}`;
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/data/format.krw.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Verify nothing else broke**

Run: `npm run check`
Expected: exit 0. Adding a union member can surface non-exhaustive switches elsewhere; if the typechecker points at one, handle `'KRW'` there rather than widening the type back.

- [ ] **Step 7: Commit**

```bash
git add src/data/types.ts src/data/format.ts src/data/format.krw.test.ts
git commit -m "feat(p11): add won formatting with 조/억 compaction"
```

---

### Task 3: KRX calendar

The lunar-holiday problem lives here. Read the design's calendar section before starting.

**Files:**
- Create: `src/data/kr-holidays.ts`, `src/data/calendar.kr.test.ts`
- Modify: `src/data/calendar.ts`

**Interfaces:**
- Produces: `KR_NON_TRADING_DAYS` (a `Record<number, readonly string[]>` keyed by year, values `YYYY-MM-DD`), `KR_HOLIDAY_YEARS`, `isKrEquityTradingDay(date)`, `'KR_EQUITY'` on `MarketCalendar`, and `calendarForAsset(kind, region)`.

- [ ] **Step 1: Source the holiday table**

Do NOT write these dates from memory — 설날, 추석 and 부처님오신날 are lunar, and 대체공휴일 shift by year. Fetch them from an authoritative reference (the Korean government's public-holiday listing, or a published KRX trading-calendar notice) for **2021 through 2026**, covering: 신정, 설날 연휴(3일), 삼일절, 어린이날, 부처님오신날, 현충일, 광복절, 추석 연휴(3일), 개천절, 한글날, 성탄절, plus any 대체공휴일 and 임시공휴일 for that year, plus 근로자의날 (May 1 — KRX is closed although it is not a public holiday) and the year-end closing day (December 31, when KRX does not trade).

Record the source URL in a comment at the top of the file. If a year cannot be sourced with confidence, leave it out of the table rather than guessing — the fallback below handles missing years, and a wrong holiday silently shifts every generated bar.

- [ ] **Step 2: Write the failing test**

```ts
// src/data/calendar.kr.test.ts
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
      for (const iso of KR_NON_TRADING_DAYS[year]) {
        expect(isKrEquityTradingDay(utc(iso)), `${iso} should be closed`).toBe(false);
      }
    }
  });

  it('excludes 광복절, a fixed-date holiday', () => {
    expect(isKrEquityTradingDay(utc('2026-08-15'))).toBe(false);
  });

  it('falls back to weekdays-only outside the table rather than throwing', () => {
    // 2035 is deliberately absent; a missing year must degrade, not crash.
    expect(() => isKrEquityTradingDay(utc('2035-03-14'))).not.toThrow();
    expect(isKrEquityTradingDay(utc('2035-03-14'))).toBe(true);
    expect(isKrEquityTradingDay(utc('2035-03-17'))).toBe(false); // Saturday
  });
});

describe('KR_EQUITY sessions', () => {
  it('skips closed days when walking back', () => {
    const dates = previousSessionDates('KR_EQUITY', '2026-08-17', 3);
    expect(dates).not.toContain('2026-08-15');
    expect(dates).not.toContain('2026-08-16');
  });

  it('stamps the daily bar at the 15:30 KST close', () => {
    const ts = dailyBarTimestamp('KR_EQUITY', utc('2026-08-04'));
    // 15:30 KST is 06:30 UTC; KST has no daylight saving.
    expect(new Date(ts * 1000).toISOString()).toBe('2026-08-04T06:30:00.000Z');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/data/calendar.kr.test.ts`
Expected: FAIL — cannot resolve `./kr-holidays.js`.

- [ ] **Step 4: Write `src/data/kr-holidays.ts`**

```ts
/* ============================================================
   KRX non-trading dates, 2021–2026.

   A table rather than a rule set, and deliberately so. US market holidays
   all follow Gregorian rules, which is why usEquityHolidayKeys can compute
   them. Korea's cannot be computed: 설날, 추석 and 부처님오신날 are lunar,
   and 대체공휴일/임시공휴일 are announced per year by government notice
   rather than derived from anything. Adding a lunar-conversion dependency
   to generate seed data would be a poor trade.

   The range covers what the seed's 5Y history reaches. A year outside it
   falls back to weekdays-only — see isKrEquityTradingDay. If you extend
   the seed further back or forward, extend this table with it, or the
   generated series will show bars on days KRX was closed.

   Source: <record the exact reference URL used>
   ============================================================ */

export const KR_NON_TRADING_DAYS: Readonly<Record<number, readonly string[]>> = Object.freeze({
  // Populated in Step 1. Each value is a frozen array of 'YYYY-MM-DD'.
});

export const KR_HOLIDAY_YEARS: readonly number[] = Object.freeze(
  Object.keys(KR_NON_TRADING_DAYS).map(Number).sort((a, b) => a - b),
);
```

Replace the empty object with the sourced dates, one frozen array per year.

- [ ] **Step 5: Extend `src/data/calendar.ts`**

Widen the union at line 16:

```ts
export type MarketCalendar = 'US_EQUITY' | 'KR_EQUITY' | 'WEEKDAY' | 'CRYPTO_24_7';
```

Add the trading-day predicate beside `isUsEquityTradingDay`:

```ts
/**
 * Weekends, then the table. A year absent from the table degrades to
 * weekdays-only rather than throwing: a missing year should cost accuracy
 * on that year's bars, not take down every chart on the page.
 */
export function isKrEquityTradingDay(date: Date): boolean {
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const closed = KR_NON_TRADING_DAYS[date.getUTCFullYear()];
  return !closed?.includes(dateKey(date));
}
```

Add the KST timestamp helper beside `easternTimestamp`. KST is UTC+9 year-round with no daylight saving, so unlike `easternTimestamp` this needs no offset lookup:

```ts
function kstTimestamp(date: Date, hour: number, minute: number): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour - 9, minute) / 1000,
  );
}
```

Route the new calendar in `isSessionDay` and `dailyBarTimestamp`:

```ts
// isSessionDay, before the final return
if (calendar === 'KR_EQUITY') return isKrEquityTradingDay(date);

// dailyBarTimestamp, after the US_EQUITY line
if (calendar === 'KR_EQUITY') return kstTimestamp(date, 15, 30);
```

Import the table with a `.js` specifier: `import { KR_NON_TRADING_DAYS } from './kr-holidays.js';`

- [ ] **Step 6: Make `calendarForAsset` region-aware**

Its current signature takes only `AssetKind`, which cannot distinguish a KRX stock from a NYSE one. Change it to:

```ts
export function calendarForAsset(kind: AssetKind, region: MarketRegion = 'US'): MarketCalendar {
  if (kind === 'crypto') return 'CRYPTO_24_7';
  if (kind === 'future') return 'WEEKDAY';
  return region === 'KR' ? 'KR_EQUITY' : 'US_EQUITY';
}
```

Import `MarketRegion` from `./region.js`. The default keeps every existing call site compiling unchanged; Task 5 passes the real region.

- [ ] **Step 7: Also cover intraday timestamps**

Read `intradayBarTimestamps`. If it branches on `US_EQUITY` for the session open, add a `KR_EQUITY` branch opening at 09:00 KST and closing at 15:30 KST. State in your report what you found and what you changed.

- [ ] **Step 8: Run tests**

Run: `npx vitest run src/data/calendar.kr.test.ts`
Expected: PASS.

Run: `npm run check`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/data/kr-holidays.ts src/data/calendar.ts src/data/calendar.kr.test.ts
git commit -m "feat(p11): add the KRX trading calendar"
```

---

### Task 4: Region on assets, engine resolution

**Files:**
- Modify: `src/data/types.ts`, `src/data/universe.ts`, `src/data/engine.ts`
- Create: `src/data/engine.region.test.ts`

**Interfaces:**
- Consumes: `MarketRegion` (Task 1), `calendarForAsset(kind, region)` (Task 3).
- Produces: `AssetMeta.region: MarketRegion`; `SECTORS_BY_REGION`; engine lookups that resolve either universe by symbol.

- [ ] **Step 1: Add the field**

In `src/data/types.ts`, add to `AssetMeta`:

```ts
  /** Which market lists this asset. Drives the trading calendar and the price unit. */
  readonly region: MarketRegion;
```

Import `MarketRegion` from `./region.js`.

- [ ] **Step 2: Region-scope the sector table**

`SECTORS` currently holds US sector index levels. Rename the existing constant to `US_SECTORS` and introduce:

```ts
export const SECTORS_BY_REGION: Readonly<Record<MarketRegion, readonly SectorInfo[]>> =
  Object.freeze({ US: US_SECTORS, KR: KR_SECTORS });
```

`KR_SECTORS` comes from `universe.kr.ts` in Task 5. Until then, export `SECTORS_BY_REGION` with `KR: US_SECTORS` as a temporary stand-in and add a comment naming Task 5 as the replacement — do NOT leave it silently wrong. Keep `SECTORS` exported as an alias of `US_SECTORS` so existing imports keep compiling; Task 7 onward migrates them.

- [ ] **Step 3: Tag existing rows**

Every asset built in `universe.ts` gets `region: 'US'`. Find where `AssetMeta` objects are constructed (the `logoBg: chipColor(symbol)` sites are the marker) and add the field there rather than at each row literal.

- [ ] **Step 4: Write the failing engine test**

```ts
// src/data/engine.region.test.ts
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
```

- [ ] **Step 5: Run to verify it fails**

Run: `npx vitest run src/data/engine.region.test.ts`
Expected: FAIL — `005930` does not resolve, and `listAssets` does not exist.

- [ ] **Step 6: Implement**

Merge the Korean seed into the engine's asset map so symbol lookup spans both universes, and add `listAssets(region)` returning only that region's assets, frozen. Pass each asset's `region` into `calendarForAsset` wherever the engine generates history, so Korean series follow KRX sessions.

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/data/engine.region.test.ts` then `npm run check`
Expected: both pass. This task depends on Task 5's seed existing; if you are running tasks in order, implement Task 5's seed file first as a minimal stub with two rows (005930, 000660), and Task 5 fills it out.

- [ ] **Step 8: Commit**

```bash
git add src/data/types.ts src/data/universe.ts src/data/engine.ts src/data/engine.region.test.ts
git commit -m "feat(p11): resolve assets across regions"
```

---

### Task 5: Korean universe seed

**Files:**
- Create: `scripts/fetch-kr-seed.mjs`, `src/data/universe.kr.ts`

**Interfaces:**
- Produces: `KR_STOCKS`, `KR_INDICES`, `KR_SECTORS`, and the assembled `KR_SEED_ASSETS` consumed by the engine.

- [ ] **Step 1: Source the data**

Target the top 150 KRX listings by market cap. `stockanalysis.com/quote/krx/<code>/` serves individual quotes in won with an explicit as-of date, and its KRX list pages serve many rows at once — prefer the list pages and fall back to individual quotes only for gaps.

Capture per row: six-digit code, English name, Korean name, sector (mapped onto the existing `SectorId` union), market cap in won, price in won, day change percent.

Two rules, both learned from the US seed refresh:

- **Corroborate before writing.** If two sources disagree on a number, leave that row out rather than averaging or picking one. A row that is absent is honest; a row that is confidently wrong is not.
- **Record the as-of instant.** Equities and any separately-sourced series get their own timestamp in `SNAPSHOT`, exactly as `cryptoAsOfISO` already sits beside `asOfISO`.

Also capture the top-assets row: KOSPI, KOSDAQ, KOSPI200, USD/KRW, VKOSPI. Indices carry `unit: 'POINTS'`; USD/KRW carries `unit: 'KRW'`.

- [ ] **Step 2: Write `universe.kr.ts`**

Mirror `universe.ts`'s row-tuple shape so the two read alike:

```ts
/** [code, nameEn, nameKo, sector, marketCap(KRW), price(KRW), dayChangePct] */
type KrStockRow = [string, string, string, SectorId, number, number, number];
```

Every assembled asset carries `region: 'KR'` and `unit: 'KRW'`. Indices carry `region: 'KR'` and `unit: 'POINTS'`.

`KR_SECTORS` uses the same `SectorId` values as the US table with Korean-market index levels, so the screener and heatmap sector filters keep working unchanged.

- [ ] **Step 3: Replace the Task 4 stand-in**

In `universe.ts`, point `SECTORS_BY_REGION.KR` at the real `KR_SECTORS` and delete the temporary comment.

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: exit 0, including `npm run validate:data` — that script asserts every asset has an explicit `unit` and that quotes stay inside their day's high/low, so a malformed seed row fails there.

- [ ] **Step 5: Report the count honestly**

State in your report how many rows landed and which targets you dropped for lack of corroboration. Task 9 makes the screener header report the real count.

- [ ] **Step 6: Commit**

```bash
git add scripts/fetch-kr-seed.mjs src/data/universe.kr.ts src/data/universe.ts
git commit -m "feat(p11): add the Korean equity seed"
```

---

### Task 6: Korean market content

**Files:**
- Create: `src/data/content.kr.ts`
- Modify: `src/data/content.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `KR_MARKET_SUMMARY`, `KR_GENERAL_NEWS`, `KR_EXPLORE_CARDS`, and `CONTENT_BY_REGION` keyed by `MarketRegion`.

- [ ] **Step 1: Source Korean market copy**

Write 시장 요약, 최신 시장 뉴스, and 탐색 카드 against real Korean market conditions for the seed's as-of date, reusing the existing `MarketSummaryItem`, `NewsItem`, and `ExploreCard` types unchanged.

Apply the same corroboration rule as Task 5: a headline whose figures two sources disagree on does not ship. Every item keeps a source attribution and timestamp exactly as the US content does.

- [ ] **Step 2: Add the region map**

In `content.ts`, add:

```ts
export const CONTENT_BY_REGION = Object.freeze({
  US: Object.freeze({ summary: MARKET_SUMMARY, news: GENERAL_NEWS, explore: EXPLORE_CARDS }),
  KR: Object.freeze({ summary: KR_MARKET_SUMMARY, news: KR_GENERAL_NEWS, explore: KR_EXPLORE_CARDS }),
});
```

Keep the existing exports so nothing breaks before Task 8 migrates the consumers.

- [ ] **Step 3: Verify and commit**

Run: `npm run check` (exit 0), then:

```bash
git add src/data/content.kr.ts src/data/content.ts
git commit -m "feat(p11): add Korean market content"
```

---

### Task 7: Region switcher and nav gating

**Files:**
- Create: `src/components/layout/RegionSwitcher.tsx`, `src/components/layout/RegionSwitcher.test.tsx`
- Modify: `src/components/layout/AppShell.tsx`

**Interfaces:**
- Consumes: `MarketRegion`, `REGION_LABELS`, `regionFromSearch`, `rememberRegion`, `REGION_PARAM` (Task 1).
- Produces: `<RegionSwitcher />`, and an `AppShell` nav that hides 정치인 and 예측 while region is `KR`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/layout/RegionSwitcher.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { RegionSwitcher } from './RegionSwitcher.js';

function mount(initial = '/') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <RegionSwitcher />
    </MemoryRouter>,
  );
}

describe('RegionSwitcher', () => {
  it('shows the US label by default', () => {
    mount();
    expect(screen.getByRole('button', { name: /미국 시장/ })).toBeTruthy();
  });

  it('reflects the region in the URL', () => {
    mount('/?region=kr');
    expect(screen.getByRole('button', { name: /한국 시장/ })).toBeTruthy();
  });

  it('offers both regions when opened', async () => {
    mount();
    await userEvent.click(screen.getByRole('button', { name: /미국 시장/ }));
    expect(screen.getByRole('menuitem', { name: /한국 시장/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /미국 시장/ })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/layout/RegionSwitcher.test.tsx`
Expected: FAIL — cannot resolve `./RegionSwitcher.js`.

- [ ] **Step 3: Build the switcher**

Read the region with `useSearchParams` + `regionFromSearch`. Selecting a region calls `setSearchParams` to write `?region=…` (preserving other params) and `rememberRegion`. Follow the existing dropdown/menu patterns in `AppShell.tsx` for markup, focus handling, and Escape-to-close; do not invent a new interaction model.

- [ ] **Step 4: Gate the nav**

`AppShell.tsx`'s `NAV` array currently holds `{ to: '/', label: '미국 시장', flag: '🇺🇸' }` plus the other entries. While region is `KR`, filter out 정치인 and 예측 — they have no Korean data and a tab leading to US-only content under a Korean market header would be a lie about what the app knows.

Preserve the region parameter when building nav `to` values, so switching pages does not silently drop back to US.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/components/layout/RegionSwitcher.test.tsx` then `npm run check`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/RegionSwitcher.tsx src/components/layout/RegionSwitcher.test.tsx src/components/layout/AppShell.tsx
git commit -m "feat(p11): add the region switcher and gate region-less tabs"
```

---

### Task 8: Region-aware market home

**Files:**
- Modify: `src/features/market/MarketPage.tsx`

**Interfaces:**
- Consumes: `regionFromSearch`, `<RegionSwitcher />`, `CONTENT_BY_REGION`, `engine.listAssets(region)`, `SECTORS_BY_REGION`.

- [ ] **Step 1: Replace the static label**

`MarketPage.tsx:76` renders `US <span aria-hidden="true">▾</span>` — a label with nothing behind it. Replace it with `<RegionSwitcher />`.

- [ ] **Step 2: Scope the sections**

Read the region once at the top of the page and thread it through: `TopAssets` lists that region's index row, `MarketSummarySection` and `ProviderNewsSection` read `CONTENT_BY_REGION[region]`, `HeatmapSection` and the rail cards list that region's universe.

- [ ] **Step 3: Verify in a browser**

`.claude/launch.json` already defines the `web` server (`npm run dev:web`, port 5602). Start it, open `http://localhost:5602/#/?region=kr`, and confirm: the switcher reads 한국 시장, the index row shows KOSPI/KOSDAQ, prices render as ₩, market caps as 조/억, and the summary and news are the Korean set. Then switch back to US and confirm nothing regressed. Report what you saw.

- [ ] **Step 4: Verify and commit**

Run: `npm run check` (exit 0), then:

```bash
git add src/features/market/MarketPage.tsx
git commit -m "feat(p11): make market home region-aware"
```

---

### Task 9: Region-aware screener and heatmap

**Files:**
- Modify: `src/features/screener/ScreenerPage.tsx`, `src/features/heatmap/Heatmap.tsx`

- [ ] **Step 1: Screener**

List `engine.listAssets(region)`. The header currently reads `187개 종목`; it must report the actual length of the listed set, not a literal — the US count and the Korean count differ and the Korean seed's real size is whatever Task 5 landed. Source the sector filter from `SECTORS_BY_REGION[region]`.

- [ ] **Step 2: Heatmap**

Weight by market cap within the listed region only. Cross-region comparison is meaningless — a won market cap and a dollar market cap are different quantities — so the heatmap must never mix universes in one view.

- [ ] **Step 3: Verify in a browser**

Open `/#/screener?region=kr` and `/#/screener` and confirm each lists only its own region, the reported count matches the rows, and the sector filter works in both. Check the heatmap in both regions. Report what you saw.

- [ ] **Step 4: Verify and commit**

Run: `npm run check` (exit 0), then:

```bash
git add src/features/screener/ScreenerPage.tsx src/features/heatmap/Heatmap.tsx
git commit -m "feat(p11): make screener and heatmap region-aware"
```

---

### Task 10: Earnings, stock detail, cross-region watchlist

**Files:**
- Modify: `src/features/earnings/EarningsPage.tsx`, `src/features/stock/StockPage.tsx`, `src/features/watchlist/WatchlistPage.tsx`

- [ ] **Step 1: Earnings**

List the region's earnings entries. `session: 'pre' | 'post' | 'during'` needs no change — it reads correctly against KRX hours as disclosure before the open or after the close.

- [ ] **Step 2: Stock detail**

`/stock/005930` must open with no region parameter, because the engine resolves by symbol. Confirm the page renders won prices, the KRX session label, and a chart whose bars fall on KRX trading days.

- [ ] **Step 3: Watchlist**

The watchlist holds symbols from both regions at once. Each row renders in its own currency — a US row in dollars and a Korean row in won, in the same list. Do not filter the watchlist by region: it is the user's list, not a market listing.

- [ ] **Step 4: Verify in a browser**

Add a Korean symbol and a US symbol to the watchlist and confirm both render correctly side by side with correct currencies. Open `/#/stock/005930` directly in a fresh tab with no region parameter. Report what you saw.

- [ ] **Step 5: Verify and commit**

Run: `npm run check` (exit 0), then:

```bash
git add src/features/earnings/EarningsPage.tsx src/features/stock/StockPage.tsx src/features/watchlist/WatchlistPage.tsx
git commit -m "feat(p11): extend earnings, stock detail and watchlist across regions"
```

---

### Task 11: Korean brand marks

**Files:**
- Modify: `scripts/fetch-logos.mjs`, `src/data/logos.ts`, `public/logos/`

- [ ] **Step 1: Extend the fetch script**

Korean listing codes 404 on both ticker-keyed sources already in use (`nvstly/icons`, `parqet`) — verify this yourself for a couple of codes before adding a mapping. Add a Korean brand-slug map for `cdn.simpleicons.org`, covering what actually resolves.

**Check the HTTP status, not just the body.** DuckDuckGo's icon service answers `404` with a generic placeholder PNG in the body; treating that as success would put invented artwork on a financial surface. Any source that does this is rejected.

- [ ] **Step 2: Regenerate the manifest**

Re-run the luminance measurement the existing manifest uses so near-white Korean marks get the dark backing, exactly as Apple and Amazon do.

- [ ] **Step 3: Report coverage honestly**

State how many Korean symbols got a real mark and how many keep their initial chip. Partial coverage is the expected outcome and is fine; a fabricated logo is not.

- [ ] **Step 4: Verify and commit**

Run: `npm run check` (exit 0), then:

```bash
git add scripts/fetch-logos.mjs src/data/logos.ts public/logos
git commit -m "feat(p11): add available Korean brand marks"
```

---

### Task 12: Validation, version bump, documentation

**Files:**
- Create: `scripts/validate-p11.ts`, `P11_CHANGELOG.md`
- Modify: `package.json`, `server/config.ts`, `server/http/api-router.test.ts`, `scripts/validate-p3.ts`, `scripts/validate-p4.ts`, `scripts/validate-p5.ts`, `scripts/validate-p6.ts`, `scripts/validate-p7.ts`, `scripts/validate-p8.ts`, `scripts/validate-p10.ts`, `scripts/postdeploy-smoke.ts`, `README.md`, `ARCHITECTURE.md`, `CONTRACT.md`, `DEPLOYMENT.md`

- [ ] **Step 1: Write `scripts/validate-p11.ts`**

Follow `scripts/validate-p10.ts`. Assert:
- `loadConfig().version === '1.12.0'`
- `parseRegion` maps `'kr'`/`'KR'` to `'KR'` and anything unrecognised to `'US'`
- `fmtKrw(246000) === '₩246,000'` and `fmtKrwCompact` renders 조 and 억
- `fmtInstrumentValue('USD', 309.38) === 'US$309.38'` — the existing units are unchanged
- `isKrEquityTradingDay` returns false for 광복절 and for a weekend, true for an ordinary weekday
- a year outside `KR_HOLIDAY_YEARS` does not throw and returns true for a weekday
- every Korean seed asset has `region: 'KR'` and `unit: 'KRW'`, and every US seed asset has `region: 'US'`
- `engine.listAssets('KR')` and `engine.listAssets('US')` are disjoint and non-empty
- `vercel.json` still declares exactly 2 cron entries

- [ ] **Step 2: Wire it in**

Add `"validate:p11": "tsx scripts/validate-p11.ts"` to `package.json` and insert `&& npm run validate:p11` into `check` immediately after `validate:p10`.

- [ ] **Step 3: Bump to 1.12.0**

Run `grep -rn "1\.11\.0" --exclude-dir=node_modules --exclude-dir=dist --exclude=package-lock.json .` and update every live assertion. Note P10's bump had to touch `validate-p4/6/7/8.ts` beyond the obvious list; expect the same here. Leave `P10_CHANGELOG.md`'s historical sentences alone — those correctly describe P10 shipping at 1.11.0.

- [ ] **Step 4: Write `P11_CHANGELOG.md`**

Follow `P10_CHANGELOG.md`'s structure. Document plainly:
- the holiday table's 2021–2026 range and the weekdays-only fallback outside it
- that the portfolio remains a USD ledger
- that 정치인 and 예측 are hidden in Korean mode because Korea has no equivalent disclosure regime or domestic prediction market, and are deferred to their own phase
- the Korean logo coverage that actually landed

- [ ] **Step 5: Update the long-form docs**

`README.md` (P11 capabilities, the region parameter, `validate:p11`), `ARCHITECTURE.md` (the region model and where the calendar branches), `CONTRACT.md` (the `region` query parameter), `DEPLOYMENT.md` (the holiday-table limitation).

- [ ] **Step 6: Verify**

Run `npm run check` (exit 0, including `validate:p11`), `npm audit --audit-level=low` (0 vulnerabilities), and `git diff --exit-code vercel.json` (exit 0).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(p11): add validation script, bump to 1.12.0, and document the Korean market"
```

---

## Self-Review

**Spec coverage.** Region model → Task 1. Currency → Task 2. Calendar and the holiday table → Task 3. `AssetMeta.region`, region-scoped sectors, engine resolution → Task 4. Universe seed and the 150 target → Task 5. Market copy → Task 6. Switcher, switcher-only-on-scoped-pages, and hiding 정치인/예측 → Task 7. Market home → Task 8. Screener (including the honest count) and heatmap → Task 9. Earnings, stock detail, cross-region watchlist → Task 10. Logos and the 404-with-placeholder rule → Task 11. Testing, version, safety-boundary docs → Task 12.

**Type consistency.** `MarketRegion` is defined in Task 1 and consumed unchanged in Tasks 3, 4, 6, 7. `calendarForAsset(kind, region)` is widened in Task 3 and called with a real region in Task 4. `fmtKrw`/`fmtKrwCompact` are defined in Task 2 and asserted in Task 12. `SECTORS_BY_REGION` is introduced in Task 4 with a named stand-in and replaced in Task 5. `KR_NON_TRADING_DAYS`/`KR_HOLIDAY_YEARS` are defined in Task 3 and re-asserted in Task 12.

**One ordering hazard, stated explicitly.** Task 4's engine test needs Korean assets to exist, but the seed is Task 5. Task 4 Step 7 handles this by having Task 4 create a two-row stub that Task 5 fills out. The alternative — reordering so the seed comes first — was rejected because the seed's shape depends on `AssetMeta.region`, which Task 4 introduces; the stub is the smaller coupling.

**Two things deliberately not written into this plan.** The holiday dates themselves and the Korean seed rows are sourced during their tasks rather than embedded here. Writing lunar holiday dates or 150 stock quotes from memory into a plan is exactly the confidently-wrong failure this project keeps catching; both tasks instead specify the source, the corroboration rule, and what to do when a value cannot be confirmed.
