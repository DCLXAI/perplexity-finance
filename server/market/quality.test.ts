import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, resetConfigForTests, type AppConfig } from '../config.js';
import { clearIncidentsForTests } from '../ops/incidents.js';
import type { ProviderName, RemoteQuotePatch } from '../../src/shared/api.js';
import { isAlertEligibleQuote, reconcileQuoteCandidates } from './quality.js';

function config(): AppConfig {
  return Object.freeze({ ...loadConfig(), quoteMaxDeviationBps: 75 });
}

function quote(
  provider: ProviderName,
  price: number,
  time = new Date().toISOString(),
  mode: RemoteQuotePatch['provenance']['mode'] = 'live',
): RemoteQuotePatch {
  return Object.freeze({
    symbol: 'BTCUSD',
    price,
    prevClose: price - 1,
    open: price - 0.5,
    high: price + 1,
    low: price - 2,
    volume: 100,
    asOfISO: time,
    session: 'continuous',
    sessionStatus: 'open',
    provenance: Object.freeze({
      source: provider,
      sourceLabel: provider,
      mode,
      quality: 'provider',
      providerTimestamp: time,
      ingestedAt: time,
      feed: 'test',
    }),
  });
}

afterEach(() => {
  clearIncidentsForTests();
  resetConfigForTests();
});

describe('cross-provider quote quality', () => {
  it('promotes agreeing providers to verified and alert eligible', () => {
    const result = reconcileQuoteCandidates('BTCUSD', [quote('alpaca', 100), quote('coinbase', 100.2)], 'req', config());
    expect(result.quote?.provenance.quality).toBe('verified');
    expect(result.quote?.provenance.verification?.strategy).toBe('cross-provider');
    expect(isAlertEligibleQuote(result.quote!)).toBe(true);
  });



  it('prefers a healthy secondary quote over a stale primary cache value', () => {
    const result = reconcileQuoteCandidates(
      'BTCUSD',
      [quote('alpaca', 100, new Date().toISOString(), 'stale'), quote('coinbase', 100.1)],
      'req',
      config(),
    );
    expect(result.quote?.provenance.source).toBe('coinbase');
    expect(result.quote?.provenance.mode).toBe('live');
    expect(result.quote?.provenance.verification?.decision).toBe('accepted');
    expect(isAlertEligibleQuote(result.quote!)).toBe(true);
  });

  it('quarantines material deviation from automated alerts', () => {
    const result = reconcileQuoteCandidates('BTCUSD', [quote('alpaca', 100), quote('coinbase', 110)], 'req', config());
    expect(result.quote?.provenance.quality).toBe('degraded');
    expect(result.quote?.provenance.verification?.decision).toBe('degraded');
    expect(result.incidents.some((incident) => incident.kind === 'cross-provider-deviation')).toBe(true);
    expect(isAlertEligibleQuote(result.quote!)).toBe(false);
  });
});
