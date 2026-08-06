import type { MonitorDigestPayload } from '../monitors/digest.js';
import { digestBody, digestSubject } from '../monitors/digest.js';
import {
  claimDueMonitorDigestDeliveries,
  markMonitorDigestDeliveryDisabled,
  markMonitorDigestDeliveryFailure,
  markMonitorDigestDeliverySent,
  type MonitorDigestDeliveryRow,
} from '../monitors/store.js';
import { loadConfig } from '../config.js';
import { logger } from '../observability/logger.js';
import { drainQueue, retryAt, sendEmailMessage, sendPushMessage } from './delivery.js';

function payloadOf(row: MonitorDigestDeliveryRow): MonitorDigestPayload {
  return row.payload as unknown as MonitorDigestPayload;
}

async function sendEmail(row: MonitorDigestDeliveryRow): Promise<void> {
  const payload = payloadOf(row);
  await sendEmailMessage({
    userId: row.user_id,
    subject: digestSubject(payload),
    text: digestBody(payload),
    idempotencyKey: `pf-monitor-${row.digest_id}-email`,
  });
}

async function sendPush(row: MonitorDigestDeliveryRow): Promise<void> {
  const payload = payloadOf(row);
  await sendPushMessage({
    userId: row.user_id,
    title: digestSubject(payload),
    // Every notification must state both that this is not an order AND that nothing was
    // written to the ledger; the email body says both, so the push must too.
    body: `${payload.breachCount}건 감지 · 자동 주문 아님 · 거래 원장 미반영`,
    url: payload.url,
    tag: `pf-monitor-${row.digest_id}`,
  });
}

async function deliverOne(row: MonitorDigestDeliveryRow): Promise<'sent' | 'failed'> {
  try {
    if (row.channel === 'email') await sendEmail(row);
    else await sendPush(row);
    await markMonitorDigestDeliverySent(row.id);
    return 'sent';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not configured')) await markMonitorDigestDeliveryDisabled(row.id, message);
    else await markMonitorDigestDeliveryFailure(row.id, row.attempts, message, retryAt(row.attempts));
    logger.warn('monitor.digest_delivery_failed', { channel: row.channel, attempts: row.attempts, message });
    return 'failed';
  }
}

/**
 * `deadlineMs` is the caller's remaining wall-clock (an absolute epoch ms). Delivery is an
 * unbounded external-network step, so the cron entrypoint bounds it: nothing is claimed once
 * the deadline has already passed, and `drainQueue` stops handing out rows when it arrives.
 * Rows claimed but not attempted stay `processing` and are recovered by
 * `claim_due_monitor_digest_deliveries`'s stale-lease sweep on a later run.
 */
export async function deliverPendingMonitorDigests(
  deadlineMs?: number,
): Promise<{ attempted: number; sent: number; failed: number }> {
  if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
    logger.warn('monitor.digest_delivery_skipped', { reason: 'budget exhausted' });
    return Object.freeze({ attempted: 0, sent: 0, failed: 0 });
  }
  const config = loadConfig();
  const rows = await claimDueMonitorDigestDeliveries(config.deliveryBatchSize);
  return drainQueue(rows, deliverOne, config.deliveryConcurrency, deadlineMs);
}
