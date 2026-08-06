import assert from 'node:assert/strict';
import { isUsEquityTradingDay } from '../src/data/calendar.js';
import { EARNINGS, EARNINGS_WEEK, PREDICTIONS } from '../src/data/content.js';
import { engine } from '../src/data/engine.js';
import { SEED_ASSETS, SNAPSHOT } from '../src/data/universe.js';
import { KR_SEED_ASSETS } from '../src/data/universe.kr.js';
import type { CandlePoint, HistoryRange } from '../src/data/types.js';

function isoDate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function validateCandles(label: string, candles: readonly CandlePoint[]): void {
  assert.ok(candles.length > 0, `${label}: empty history`);
  let prior = -Infinity;
  for (const candle of candles) {
    assert.ok(candle.time > prior, `${label}: timestamps not strictly increasing`);
    assert.ok(candle.low <= candle.open, `${label}: low > open`);
    assert.ok(candle.low <= candle.close, `${label}: low > close`);
    assert.ok(candle.high >= candle.open, `${label}: high < open`);
    assert.ok(candle.high >= candle.close, `${label}: high < close`);
    assert.ok(candle.volume >= 0, `${label}: negative volume`);
    prior = candle.time;
  }
}

async function main(): Promise<void> {
  assert.equal(SNAPSHOT.asOfISO, '2026-08-04T16:00:00-04:00');
  // The anchor must be a weekday session close. It was pinned to Friday while the seed
  // happened to be captured on one; that was never a requirement of the calendar
  // generator, only a property of the old capture. Any Mon-Fri close is valid.
  const anchorDay = new Date(SNAPSHOT.asOfISO).getUTCDay();
  assert.ok(anchorDay >= 1 && anchorDay <= 5, 'equity snapshot must be a weekday close');
  assert.ok(new Date(SNAPSHOT.asOfISO) < new Date(`${SNAPSHOT.todayISO}T23:59:59Z`),
    'equity snapshot cannot be after todayISO');

  // Merged, not US-only: a KR/US symbol collision must be caught here, not
  // silently absorbed by the engine's `quotes.set` overwrite.
  const allSeedAssets = [...SEED_ASSETS, ...KR_SEED_ASSETS];
  assert.equal(
    new Set(allSeedAssets.map((asset) => asset.symbol)).size,
    allSeedAssets.length,
    'duplicate symbols',
  );
  assert.ok(allSeedAssets.every((asset) => Boolean(asset.unit)), 'all assets need an explicit unit');

  const quotes = engine.getAll();
  assert.equal(quotes.length, allSeedAssets.length);
  assert.ok(quotes.every((quote) => quote.dayLow <= quote.open && quote.open <= quote.dayHigh));
  assert.ok(quotes.every((quote) => quote.dayLow <= quote.price && quote.price <= quote.dayHigh));
  const separatedOpens = quotes.filter(
    (quote) =>
      Math.abs(quote.open - quote.prevClose) > Math.max(1e-12, quote.prevClose * 1e-10),
  );
  assert.ok(
    separatedOpens.length >= Math.floor(quotes.length * 0.95),
    'opens should be distinct from previous closes',
  );

  const amd1d = engine.getHistory('AMD', '1D');
  const amd5d = engine.getHistory('AMD', '5D');
  const amd7d = engine.getHistory('AMD', '7D');
  const btc7d = engine.getHistory('BTCUSD', '7D');
  assert.equal(amd1d.length, 26, 'equity 1D should have 26 15-minute bars');
  assert.equal(amd5d.length, 130, 'equity 5D should have 5 sessions');
  assert.equal(amd7d.length, 182, 'equity 7D should have 7 sessions');
  assert.equal(btc7d.length, 672, 'crypto 7D should have 7x96 bars');
  assert.equal(new Set(amd5d.map((bar) => isoDate(bar.time))).size, 5);
  for (const day of new Set(amd7d.map((bar) => isoDate(bar.time)))) {
    assert.ok(
      isUsEquityTradingDay(new Date(`${day}T00:00:00Z`)),
      `non-trading equity date ${day}`,
    );
  }

  const ranges: HistoryRange[] = ['1D', '5D', '7D', '1M', '6M', 'YTD', '1Y', '5Y'];
  for (const symbol of ['AMD', '^GSPC', 'GC=F', 'BTCUSD']) {
    for (const range of ranges) {
      const candles = engine.getHistory(symbol, range);
      validateCandles(`${symbol}:${range}`, candles);
      const quote = engine.getQuote(symbol)!;
      assert.ok(
        Math.abs(candles.at(-1)!.close - quote.price) <= Math.max(1e-9, quote.price * 1e-10),
      );
    }
  }

  const amdYtd = engine.getHistory('AMD', 'YTD');
  assert.equal(isoDate(amdYtd[0].time), '2026-01-02', 'YTD should start on first NYSE session');
  for (const bar of amdYtd) {
    const day = isoDate(bar.time);
    assert.ok(
      isUsEquityTradingDay(new Date(`${day}T00:00:00Z`)),
      `YTD contains holiday/weekend ${day}`,
    );
  }

  for (const market of PREDICTIONS) {
    const sum = market.outcomes.reduce((total, outcome) => total + outcome.prob, 0);
    assert.ok(market.outcomes.every((outcome) => outcome.prob >= 0 && outcome.prob <= 100));
    if (market.extraCount) {
      assert.ok(sum <= 100, `${market.id}: visible outcomes exceed 100%`);
    } else {
      assert.ok(Math.abs(sum - 100) < 1e-9, `${market.id}: complete market must total 100%`);
    }
  }

  const earningsCount = new Map<string, number>();
  for (const entry of EARNINGS) {
    earningsCount.set(entry.dateISO, (earningsCount.get(entry.dateISO) ?? 0) + 1);
  }
  for (const day of EARNINGS_WEEK) {
    assert.equal(
      day.count,
      earningsCount.get(day.dateISO) ?? 0,
      `${day.dateISO}: earnings count mismatch`,
    );
  }

  // P1 engine contract: immutable snapshots, explicit sessions and one batch per tick.
  for (const quote of engine.getAll()) {
    assert.ok(Object.isFrozen(quote), `${quote.symbol}: quote must be frozen`);
    assert.ok(Object.isFrozen(quote.spark), `${quote.symbol}: spark must be frozen`);
    assert.ok(Object.isFrozen(quote.sessions), `${quote.symbol}: sessions must be frozen`);
    if (quote.kind === 'crypto') {
      assert.equal(quote.sessions.continuous?.kind, 'continuous');
      assert.equal(quote.sessions.continuous?.status, 'open');
      assert.equal(quote.sessions.regular, undefined);
      assert.ok(Object.isFrozen(quote.sessions.continuous));
    } else {
      assert.equal(quote.sessions.regular?.kind, 'regular');
      assert.equal(quote.sessions.regular?.status, 'closed');
      assert.equal(quote.sessions.continuous, undefined);
      assert.ok(Object.isFrozen(quote.sessions.regular));
    }
  }
  assert.ok(Object.isFrozen(engine.getAll()), 'all-quote snapshot must be frozen');
  assert.ok(Object.isFrozen(amd1d), 'history array must be frozen');
  assert.ok(Object.isFrozen(amd1d[0]), 'history bars must be frozen');

  // Prime live history caches so a tick must replace their final bars immutably.
  for (const quote of engine.getCrypto()) engine.getHistory(quote.symbol, '1D');

  const beforeAll = new Map(engine.getAll().map((quote) => [quote.symbol, quote]));
  const beforePrices = new Map(engine.getAll().map((quote) => [quote.symbol, quote.price]));
  const beforeUnits = new Map(
    engine
      .getCrypto()
      .filter((quote) => quote.marketCap !== undefined)
      .map((quote) => [quote.symbol, quote.marketCap! / quote.price]),
  );

  let callbackCount = 0;
  let callbackSequence = 0;
  const unsubscribe = engine.subscribeAll((batch) => {
    callbackCount += 1;
    callbackSequence = batch.sequence;
  });
  const batch = engine.runMockTick();
  unsubscribe();

  assert.ok(batch, 'mock tick must emit a batch');
  assert.equal(callbackCount, 1, 'one tick must publish exactly one global batch');
  assert.equal(callbackSequence, batch.sequence);
  assert.ok(Number.isFinite(Date.parse(batch.asOfISO)), 'batch needs a valid as-of time');
  assert.ok(Object.isFrozen(batch), 'batch must be frozen');
  assert.ok(Object.isFrozen(batch.changedSymbols), 'changed-symbol list must be frozen');
  assert.ok(Object.isFrozen(batch.quotes), 'changed-quote list must be frozen');
  assert.deepEqual(
    batch.changedSymbols,
    batch.quotes.map((quote) => quote.symbol),
    'batch symbols and quote order must match',
  );
  assert.equal(new Set(batch.changedSymbols).size, batch.changedSymbols.length, 'duplicate batch symbols');
  assert.ok(batch.quotes.every((quote) => quote.kind === 'crypto'), 'only crypto may mock-tick');

  const changed = new Set(batch.changedSymbols);
  for (const quote of batch.quotes) {
    const prior = beforeAll.get(quote.symbol)!;
    assert.notEqual(quote, prior, `${quote.symbol}: changed quote must be a new object`);
    assert.equal(prior.price, beforePrices.get(quote.symbol), `${quote.symbol}: old snapshot was mutated`);
    assert.equal(quote.sessions.continuous?.asOfISO, batch.asOfISO);
    assert.equal(quote.sessions.regular, undefined);
    assert.equal(engine.getQuote(quote.symbol), quote);
    assert.equal(engine.getHistory(quote.symbol, '1D').at(-1)?.close, quote.price);
    const units = beforeUnits.get(quote.symbol);
    if (units !== undefined && quote.marketCap !== undefined) {
      assert.ok(
        Math.abs(quote.marketCap / quote.price - units) <= Math.max(1e-6, units * 1e-10),
        `${quote.symbol}: market-cap unit count drifted`,
      );
    }
  }
  for (const quote of engine.getAll()) {
    if (changed.has(quote.symbol)) continue;
    assert.equal(quote, beforeAll.get(quote.symbol), `${quote.symbol}: unchanged quote reference replaced`);
  }
  for (const quote of engine.getAll().filter((item) => item.kind !== 'crypto')) {
    assert.equal(quote.price, beforePrices.get(quote.symbol), `${quote.symbol}: closed-market price moved`);
  }

  console.log(
    JSON.stringify(
      {
        assets: allSeedAssets.length,
        stocks: engine.getStocks().length,
        crypto: engine.getCrypto().length,
        equity1DBars: amd1d.length,
        equity5DBars: amd5d.length,
        equity7DBars: amd7d.length,
        crypto7DBars: btc7d.length,
        ytdFirstSession: isoDate(amdYtd[0].time),
        predictions: PREDICTIONS.length,
        earnings: EARNINGS.length,
        immutableSnapshots: true,
        sessionSeparation: true,
        batchesPerTick: callbackCount,
        result: 'PASS',
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
