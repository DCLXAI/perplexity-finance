import assert from 'node:assert/strict';
import { localFallbackAnswer } from '../server/ai/service.js';
import { loadConfig, resetConfigForTests, type AppConfig } from '../server/config.js';
import { getMarketQuotes } from '../server/market/service.js';
import { isAlertEligibleQuote, reconcileQuoteCandidates } from '../server/market/quality.js';
import { redactForLog } from '../server/observability/logger.js';
import { buildReadiness, calculateMarketSlo, evaluateReleaseGate } from '../server/ops/summary.js';
import { CircuitBreaker } from '../server/resilience/circuit-breaker.js';
import type { ProviderName, RemoteQuotePatch } from '../src/shared/api.js';

for (const name of [
  'ALPACA_API_KEY_ID', 'ALPACA_API_SECRET_KEY', 'FINNHUB_API_KEY', 'OPENAI_API_KEY',
  'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
]) delete process.env[name];
process.env.ALLOW_MOCK_FALLBACK = 'true';
process.env.REQUIRE_LIVE_DATA = 'false';
resetConfigForTests();

const config = loadConfig();
assert.equal(config.version, '1.11.0');
assert.equal(config.marketProviderMode, 'failover');

const fallback = await getMarketQuotes(['AMD', 'BTCUSD'], 'p3-validation');
assert.equal(fallback.mode, 'fallback');
assert.equal(fallback.quotes.length, 2);
assert.ok(fallback.quotes.every((quote) => quote.provenance.verification?.strategy === 'synthetic'));
assert.ok(fallback.quotes.every((quote) => !isAlertEligibleQuote(quote)));

function quote(provider: ProviderName, price: number): RemoteQuotePatch {
  const now = new Date().toISOString();
  return Object.freeze({
    symbol: 'BTCUSD', price, prevClose: price - 1, open: price - 0.5,
    high: price + 1, low: price - 2, volume: 100, asOfISO: now,
    session: 'continuous', sessionStatus: 'open',
    provenance: Object.freeze({
      source: provider, sourceLabel: provider, mode: 'live', quality: 'provider',
      providerTimestamp: now, ingestedAt: now, feed: 'validation',
    }),
  });
}
const qualityConfig: AppConfig = Object.freeze({ ...config, quoteMaxDeviationBps: 75 });
const verified = reconcileQuoteCandidates('BTCUSD', [quote('alpaca', 100), quote('coinbase', 100.2)], 'p3', qualityConfig);
assert.equal(verified.quote?.provenance.quality, 'verified');
assert.equal(isAlertEligibleQuote(verified.quote!), true);
const quarantined = reconcileQuoteCandidates('BTCUSD', [quote('alpaca', 100), quote('coinbase', 110)], 'p3', qualityConfig);
assert.equal(quarantined.quote?.provenance.quality, 'degraded');
assert.equal(isAlertEligibleQuote(quarantined.quote!), false);

const circuit = new CircuitBreaker('validation', 2, 100);
assert.equal(circuit.failure(new Error('1'), 1_000).state, 'closed');
assert.equal(circuit.failure(new Error('2'), 1_001).state, 'open');
assert.equal(circuit.acquire(1_102).state, 'half-open');
assert.equal(circuit.success().state, 'closed');

const readiness = buildReadiness('p3-validation');
assert.equal(readiness.ready, true);
assert.equal(readiness.status, 'degraded');
const slo = calculateMarketSlo({ attempts: 10, successes: 10, latencies: [100, 200], freshnessSeconds: [10, 20] }, qualityConfig);
assert.equal(slo.status, 'healthy');
assert.notEqual(evaluateReleaseGate(readiness, slo, qualityConfig).status, 'fail');

const answer = localFallbackAnswer([{ role: 'user', text: 'AMD 알려줘' }], 'p3-validation');
assert.match(answer.evidenceHash ?? '', /^[a-f0-9]{64}$/);
const redacted = JSON.stringify(redactForLog({ authorization: 'secret', nested: { email: 'x@example.com' } }));
assert.ok(!redacted.includes('secret'));
assert.ok(!redacted.includes('x@example.com'));

console.log(JSON.stringify({
  version: config.version,
  multiProviderQualityGate: 'PASS',
  syntheticExcludedFromAlerts: 'PASS',
  circuitBreaker: 'PASS',
  readinessAndReleaseGate: 'PASS',
  aiEvidenceHash: 'PASS',
  logRedaction: 'PASS',
  result: 'PASS',
}, null, 2));
