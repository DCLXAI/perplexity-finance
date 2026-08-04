import { loadConfig } from '../config.js';
import {
  claimAlertAndEnqueue,
  claimAlertEvaluationBatch,
  completeObservedPrice,
  releaseAlertEvaluation,
  type AlertDeliveryPayload,
} from '../cloud/store.js';
import { getMarketQuotes } from '../market/service.js';
import { isAlertEligibleQuote } from '../market/quality.js';
import { logger } from '../observability/logger.js';
import type { RemoteQuotePatch } from '../../src/shared/api.js';

export function didCross(
  condition: 'above' | 'below',
  previous: number,
  current: number,
  target: number,
): boolean {
  return condition === 'above'
    ? previous < target && current >= target
    : previous > target && current <= target;
}

function chunks<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return Object.freeze(result.map((chunk) => Object.freeze(chunk)));
}

async function loadQuotes(symbols: readonly string[], requestId: string): Promise<Map<string, RemoteQuotePatch>> {
  const quotes = new Map<string, RemoteQuotePatch>();
  for (const batch of chunks(symbols, 200)) {
    try {
      const response = await getMarketQuotes(batch, requestId);
      for (const quote of response.quotes) quotes.set(quote.symbol, quote);
    } catch (error) {
      logger.warn('alerts.market_batch_failed', {
        symbols: batch.length,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return quotes;
}

export interface AlertEvaluationResult {
  readonly checked: number;
  readonly triggered: number;
  readonly enqueued: number;
  readonly deferred: number;
}

export async function evaluateAlerts(requestId: string): Promise<AlertEvaluationResult> {
  const config = loadConfig();
  const alerts = await claimAlertEvaluationBatch(config.alertBatchSize, config.alertEvaluationLeaseSeconds);
  if (!alerts.length) return { checked: 0, triggered: 0, enqueued: 0, deferred: 0 };

  const symbols = [...new Set(alerts.map((alert) => alert.symbol))];
  const quotes = await loadQuotes(symbols, requestId);
  let triggered = 0;
  let enqueued = 0;
  let deferred = 0;

  for (const alert of alerts) {
    try {
      const quote = quotes.get(alert.symbol);
      if (!quote || !isAlertEligibleQuote(quote)) {
        deferred += 1;
        await releaseAlertEvaluation(alert.id);
        continue;
      }
      const previous = Number(alert.last_observed_price ?? alert.baseline);
      const current = quote.price;
      if (didCross(alert.condition, previous, current, Number(alert.target))) {
        const payload: AlertDeliveryPayload = {
          symbol: alert.symbol,
          condition: alert.condition,
          target: Number(alert.target),
          price: current,
          triggeredAt: new Date().toISOString(),
          provenance: quote.provenance,
        };
        const claim = await claimAlertAndEnqueue(alert.id, current, quote.provenance, payload);
        if (!claim.claimed) {
          await releaseAlertEvaluation(alert.id);
          continue;
        }
        triggered += 1;
        enqueued += claim.enqueued;
      } else {
        await completeObservedPrice(alert.id, current);
      }
    } catch (error) {
      deferred += 1;
      logger.warn('alerts.evaluation_item_failed', {
        alertId: alert.id,
        symbol: alert.symbol,
        message: error instanceof Error ? error.message : String(error),
      });
      await releaseAlertEvaluation(alert.id).catch((releaseError: unknown) => {
        logger.error('alerts.evaluation_release_failed', releaseError);
      });
    }
  }

  logger.info('alerts.evaluated', {
    checked: alerts.length,
    triggered,
    enqueued,
    deferred,
  });
  return { checked: alerts.length, triggered, enqueued, deferred };
}
