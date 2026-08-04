import { evaluateAlerts } from '../../server/alerts/evaluator.js';
import { writeHeartbeat } from '../../server/cloud/store.js';
import { json, requireCronSecret, withFunction } from '../../server/http/function.js';
import { deliverPending } from '../../server/notifications/channels.js';
import { logger } from '../../server/observability/logger.js';
import type { CronEvaluationResponse } from '../../src/shared/api.js';

export const config = { maxDuration: 60 };

export default withFunction('cron.evaluate-alerts', ['GET'], async (request, requestId) => {
  requireCronSecret(request);
  let evaluation = { checked: 0, triggered: 0, enqueued: 0, deferred: 0 };
  let evaluationError: unknown;
  try {
    evaluation = await evaluateAlerts(requestId);
  } catch (error) {
    evaluationError = error;
    logger.error('cron.alert_evaluation_failed', error);
  }

  let delivery = { attempted: 0, sent: 0, failed: 0 };
  let deliveryError: unknown;
  try {
    delivery = await deliverPending();
  } catch (error) {
    deliveryError = error;
    logger.error('cron.delivery_failed', error);
  }

  await writeHeartbeat('alert-evaluator', {
    requestId,
    evaluation,
    delivery,
    ok: !evaluationError && !deliveryError,
  }).catch((error: unknown) => logger.warn('cron.heartbeat_failed', {
    message: error instanceof Error ? error.message : String(error),
  }));

  if (evaluationError || deliveryError) {
    throw new AggregateError(
      [evaluationError, deliveryError].filter((error) => error !== undefined),
      'Cron evaluation or delivery failed',
    );
  }

  const response: CronEvaluationResponse = Object.freeze({
    requestId,
    checkedAlerts: evaluation.checked,
    triggeredAlerts: evaluation.triggered,
    deferredAlerts: evaluation.deferred,
    attemptedDeliveries: delivery.attempted,
    sentDeliveries: delivery.sent,
    failedDeliveries: delivery.failed,
    generatedAt: new Date().toISOString(),
  });
  return json(response, {}, requestId);
});
