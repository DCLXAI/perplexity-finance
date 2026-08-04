import { buildPortfolioSummary } from '../portfolio/service.js';
import type { MonitorObservation } from './evaluate.js';
import type { PortfolioHolding } from '../../src/shared/api.js';

/**
 * One shared observation per portfolio. Uses the same call the snapshot Cron makes, so the
 * quality semantics here are identical to the ones that gate a strict snapshot.
 */
export async function buildMonitorObservation(
  userId: string,
  portfolioId: string,
  requestId: string,
): Promise<MonitorObservation> {
  const summary = await buildPortfolioSummary(userId, portfolioId, requestId);
  return Object.freeze({
    portfolioId,
    asOfISO: summary.asOfISO,
    valuationQuality: summary.valuationQuality,
    holdings: summary.holdings,
    risk: summary.risk,
    summary,
    unverifiedSinceISO: unverifiedClock(summary.holdings),
  });
}

/**
 * For each currently-unverified holding, the provider timestamp is the age of the newest
 * price the provider was willing to give — which is exactly the clock a
 * `no_verified_price_days` rule asks about. Holdings without provenance are omitted, and
 * the evaluator defers on an omission rather than reporting a false `clear`.
 */
function unverifiedClock(
  holdings: readonly PortfolioHolding[],
): Readonly<Record<string, string>> {
  const clock: Record<string, string> = {};
  for (const holding of holdings) {
    if (holding.valuationQuality === 'verified') continue;
    const timestamp = holding.provenance?.providerTimestamp;
    if (timestamp) clock[holding.symbol] = timestamp;
  }
  return Object.freeze(clock);
}
