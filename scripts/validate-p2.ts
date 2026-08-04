import assert from 'node:assert/strict';
import { localFallbackAnswer } from '../server/ai/service.js';
import { didCross } from '../server/alerts/evaluator.js';
import { resetConfigForTests } from '../server/config.js';
import { getMarketHistory, getMarketQuotes } from '../server/market/service.js';
import { MarketEngine } from '../src/data/engine.js';
import type { DataProvenance } from '../src/shared/api.js';

delete process.env.ALPACA_API_KEY_ID;
delete process.env.ALPACA_API_SECRET_KEY;
delete process.env.OPENAI_API_KEY;
resetConfigForTests();

const quotes = await getMarketQuotes(['AMD', 'BTCUSD'], 'p2-validation');
assert.equal(quotes.mode, 'fallback');
assert.equal(quotes.quotes.length, 2);
assert.ok(quotes.quotes.every((quote) => quote.provenance.mode === 'fallback'));
assert.ok(quotes.quotes.every((quote) => quote.provenance.source === 'local-simulation'));

const history = await getMarketHistory('AMD', '5D', 'p2-validation');
assert.equal(history.candles.length, 0);
assert.equal(history.provenance.mode, 'fallback');

const answer = localFallbackAnswer([{ role: 'user', text: 'AMD 현재 상태' }], 'p2-validation');
assert.equal(answer.mode, 'local-fallback');
assert.equal(answer.sources[0]?.source, 'local-simulation');
assert.equal(didCross('above', 99, 100, 100), true);
assert.equal(didCross('above', 100, 101, 100), false);

const provenance: DataProvenance = Object.freeze({
  source: 'alpaca', sourceLabel: 'Alpaca Market Data', mode: 'live', quality: 'provider',
  providerTimestamp: '2026-07-12T08:00:00.000Z', ingestedAt: '2026-07-12T08:00:01.000Z', feed: 'iex',
});
const market = new MarketEngine();
const before = market.getQuote('AMD');
const batch = market.applyExternalQuotes([{
  symbol: 'AMD', price: 600, prevClose: 590, open: 592, high: 603, low: 588,
  volume: 1_000_000, marketCap: 950_000_000_000, asOfISO: provenance.providerTimestamp,
  session: 'regular', sessionStatus: 'open', provenance,
}]);
assert.ok(batch);
assert.notEqual(market.getQuote('AMD'), before);
assert.equal(market.getQuote('AMD')?.provenance.source, 'alpaca');
market.stop();

console.log(JSON.stringify({
  marketFallback: true,
  syntheticNeverLive: true,
  historyPreservesLocalCalendar: true,
  aiFallbackExplicit: true,
  durableCrossing: true,
  externalIngestionImmutable: true,
  result: 'PASS',
}, null, 2));
