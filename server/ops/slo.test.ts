import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, resetConfigForTests, type AppConfig } from '../config.js';
import { calculateMarketSlo, evaluateReleaseGate, mergeProviderStatuses } from './summary.js';
import type { ProviderStatus, ReadinessResponse } from '../../src/shared/api.js';

function config(): AppConfig {
  return Object.freeze({
    ...loadConfig(),
    releaseMinAvailabilityPct: 99,
    releaseMaxP95LatencyMs: 2_500,
  });
}

afterEach(resetConfigForTests);

describe('release SLO', () => {

  it('uses persistent evidence only when the current deployment still enables the provider', () => {
    const now = new Date().toISOString();
    const runtime: ProviderStatus = Object.freeze({
      provider: 'alpaca', configured: true, status: 'degraded', mode: 'live',
      message: 'not probed', checkedAt: now, attempts: 0, successRate: 0,
      evidenceSource: 'runtime', sampledAt: '2026-01-01T00:00:00.000Z',
    });
    const stored: ProviderStatus = Object.freeze({
      provider: 'alpaca', configured: true, status: 'up', mode: 'live',
      message: 'scheduled probe passed', checkedAt: now, attempts: 12, successRate: 1,
      evidenceSource: 'persistent-ledger', sampledAt: now,
    });
    const merged = mergeProviderStatuses([runtime], [stored]);
    expect(merged[0]?.status).toBe('up');
    expect(merged[0]?.evidenceSource).toBe('persistent-ledger');

    const disabled = mergeProviderStatuses([{ ...runtime, configured: false, status: 'disabled' }], [stored]);
    expect(disabled[0]?.status).toBe('disabled');
  });

  it('marks healthy and breached provider windows deterministically', () => {
    const healthy = calculateMarketSlo({
      attempts: 100,
      successes: 100,
      latencies: Object.freeze([100, 200, 300]),
      freshnessSeconds: Object.freeze([10, 20, 30]),
    }, config());
    expect(healthy.status).toBe('healthy');

    const breached = calculateMarketSlo({
      attempts: 100,
      successes: 90,
      latencies: Object.freeze([100, 5_000]),
      freshnessSeconds: Object.freeze([10, 10]),
    }, config());
    expect(breached.status).toBe('breached');

    const readiness: ReadinessResponse = Object.freeze({
      requestId: 'r', ready: true, status: 'ready', version: '1.4.0', releaseChannel: 'test',
      generatedAt: new Date().toISOString(), checks: Object.freeze([]), errors: Object.freeze([]), warnings: Object.freeze([]),
    });
    expect(evaluateReleaseGate(readiness, breached, config()).status).toBe('fail');
  });
});
