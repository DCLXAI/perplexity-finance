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
    body: `${payload.breachCount}건 감지 · 자동 주문 아님`,
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

export async function deliverPendingMonitorDigests(): Promise<{ attempted: number; sent: number; failed: number }> {
  const config = loadConfig();
  const rows = await claimDueMonitorDigestDeliveries(config.deliveryBatchSize);
  return drainQueue(rows, deliverOne, config.deliveryConcurrency);
}
