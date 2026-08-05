import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadConfig, resetConfigForTests } from '../server/config.js';
import { isKrEquityTradingDay } from '../src/data/calendar.js';
import { engine } from '../src/data/engine.js';
import { fmtInstrumentValue, fmtKrw, fmtKrwCompact } from '../src/data/format.js';
import { KR_HOLIDAY_YEARS } from '../src/data/kr-holidays.js';
import { parseRegion } from '../src/data/region.js';
import { KR_SEED_ASSETS } from '../src/data/universe.kr.js';
import { SEED_ASSETS } from '../src/data/universe.js';

resetConfigForTests();
assert.equal(loadConfig().version, '1.12.0');

// --- region parsing -----------------------------------------------------------------------------

assert.equal(parseRegion('kr'), 'KR', 'lowercase kr must map to KR');
assert.equal(parseRegion('KR'), 'KR', 'uppercase KR must map to KR');
assert.equal(parseRegion('us'), 'US', 'lowercase us must map to US');
assert.equal(parseRegion('jp'), 'US', 'an unrecognised region must fall back to US, not throw');
assert.equal(parseRegion(null), 'US', 'a missing region must fall back to US');
assert.equal(parseRegion(undefined), 'US', 'an undefined region must fall back to US');

// --- won formatting -------------------------------------------------------------------------------

assert.equal(fmtKrw(246_000), '₩246,000');

// Load-bearing against the two compaction thresholds fmtKrwCompact actually branches on (1e12, 1e8).
assert.equal(fmtKrwCompact(1_268_000_000_000), '₩1.27조', 'a 조-scale value must render with the 조 unit');
assert.equal(fmtKrwCompact(66_000_000_000), '₩660억', 'an 억-scale value must render with the 억 unit');

// The existing USD unit path must be unaffected by adding the KRW branch.
assert.equal(fmtInstrumentValue('USD', 309.38), 'US$309.38', 'existing USD instrument formatting must be unchanged');

// --- KRX trading calendar --------------------------------------------------------------------------

// 광복절 (Liberation Day, 8/15) falls on a Saturday in 2026 — asserting against that date would pass
// whether or not the holiday table exists, since the weekend check alone already returns false. 2025's
// 8/15 is a Friday and is present in KR_NON_TRADING_DAYS[2025], so this assertion is only true because
// the table is actually consulted (confirmed by probing the table directly — see task-12-report.md).
assert.equal(
  isKrEquityTradingDay(new Date('2025-08-15T00:00:00Z')),
  false,
  '광복절 (2025-08-15, a Friday) must not be a KRX trading day',
);

// A weekend must be excluded regardless of the holiday table.
assert.equal(
  isKrEquityTradingDay(new Date('2026-08-08T00:00:00Z')),
  false,
  'a Saturday must not be a KRX trading day',
);

// An ordinary weekday with no holiday-table entry must trade.
assert.equal(
  isKrEquityTradingDay(new Date('2026-08-04T00:00:00Z')),
  true,
  'an ordinary Tuesday with no holiday-table entry must be a KRX trading day',
);

// A year outside KR_HOLIDAY_YEARS must degrade to weekdays-only rather than throw.
assert.ok(!KR_HOLIDAY_YEARS.includes(2027), '2027 must be outside the seeded holiday-table range for this assertion to mean anything');
assert.doesNotThrow(
  () => isKrEquityTradingDay(new Date('2027-08-16T00:00:00Z')),
  'a year outside KR_HOLIDAY_YEARS must not throw',
);
assert.equal(
  isKrEquityTradingDay(new Date('2027-08-16T00:00:00Z')),
  true,
  'an ordinary weekday in a year outside KR_HOLIDAY_YEARS must fall back to true',
);

// --- seed asset region/unit invariants ---------------------------------------------------------------

for (const asset of KR_SEED_ASSETS) {
  assert.equal(asset.region, 'KR', `Korean seed asset ${asset.symbol} must carry region 'KR'`);
}
// Every KR index is priced in POINTS except the USDKRW cross, which is priced in KRW — so the KRW unit
// invariant is only true of KR *stocks*, not the full KR_SEED_ASSETS list including indices. Asserting
// unit === 'KRW' across every Korean seed asset (as an earlier draft of this brief phrased it) would be
// false against the shipped seed; see task-12-report.md for why the assertion is scoped to stocks here.
const krStocks = KR_SEED_ASSETS.filter((asset) => asset.kind === 'stock');
assert.ok(krStocks.length > 0, 'the Korean seed must contain at least one stock');
for (const asset of krStocks) {
  assert.equal(asset.unit, 'KRW', `Korean stock ${asset.symbol} must carry unit 'KRW'`);
}

for (const asset of SEED_ASSETS) {
  assert.equal(asset.region, 'US', `US seed asset ${asset.symbol} must carry region 'US'`);
}

// --- engine region scoping -----------------------------------------------------------------------

const krListed = engine.listAssets('KR');
const usListed = engine.listAssets('US');
assert.ok(krListed.length > 0, 'engine.listAssets(KR) must be non-empty');
assert.ok(usListed.length > 0, 'engine.listAssets(US) must be non-empty');
const krSymbols = new Set(krListed.map((quote) => quote.symbol));
const usSymbols = new Set(usListed.map((quote) => quote.symbol));
for (const symbol of krSymbols) {
  assert.ok(!usSymbols.has(symbol), `${symbol} must not appear in both region listings`);
}
assert.ok(krListed.every((quote) => quote.region === 'KR'), 'every listAssets(KR) row must carry region KR');
assert.ok(usListed.every((quote) => quote.region === 'US'), 'every listAssets(US) row must carry region US');

// --- vercel.json: still exactly two Cron entries (Vercel Hobby's hard limit) ----------------------

const vercelConfig = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
  readonly crons: readonly unknown[];
};
assert.equal(vercelConfig.crons.length, 2, 'Vercel Hobby allows exactly two Cron schedules');

console.log(JSON.stringify({
  version: '1.12.0',
  regionParsing: 'PASS',
  wonFormatting: 'PASS',
  existingUsdUnitUnaffected: 'PASS',
  liberationDayIsNonTradingDay: 'PASS',
  weekendIsNonTradingDay: 'PASS',
  ordinaryWeekdayTrades: 'PASS',
  yearOutsideTableDoesNotThrowAndTradesOnWeekday: 'PASS',
  everyKoreanSeedAssetIsRegionKr: 'PASS',
  everyKoreanStockIsUnitKrw: 'PASS',
  everyUsSeedAssetIsRegionUs: 'PASS',
  engineListingsAreDisjointAndNonEmpty: 'PASS',
  exactlyTwoCronSchedules: 'PASS',
  result: 'PASS',
}, null, 2));
