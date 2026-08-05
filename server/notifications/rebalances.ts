import { loadConfig } from '../config.js';
import { logger } from '../observability/logger.js';
import {
  claimDueRebalanceDeliveries,
  markRebalanceDeliveryDisabled,
  markRebalanceDeliveryFailure,
  markRebalanceDeliverySent,
  type RebalanceDeliveryRow,
} from '../portfolio/store.js';
import { drainQueue, retryAt, sendEmailMessage, sendPushMessage } from './delivery.js';

function signedDrift(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(1)}%p`;
}

function alertText(row: RebalanceDeliveryRow): string {
  return `${row.payload.symbol} 목표 대비 ${signedDrift(row.payload.driftPct)} 초과`;
}

function runUrl(row: RebalanceDeliveryRow): string {
  const config = loadConfig();
  const path = `/#/portfolio?portfolioId=${encodeURIComponent(row.portfolio_id)}&runId=${encodeURIComponent(row.run_id)}`;
  return config.publicOrigin ? `${config.publicOrigin}${path}` : path;
}

async function sendEmail(row: RebalanceDeliveryRow): Promise<void> {
  await sendEmailMessage({
    userId: row.user_id,
    subject: `[리밸런싱 검토] ${alertText(row)}`,
    text: `${alertText(row)} 상태를 감지해 검토 대기 계획을 만들었습니다.\n\n계획 보기: ${runUrl(row)}\n\n이 알림은 주문 제안이며 자동 주문이 아닙니다. 승인 전에는 거래 원장에 반영되지 않습니다.`,
    idempotencyKey: `pf-rebalance-${row.run_id}-email`,
  });
}

async function sendPush(row: RebalanceDeliveryRow): Promise<void> {
  await sendPushMessage({
    userId: row.user_id,
    title: '리밸런싱 검토 필요',
    body: `${alertText(row)} · 자동 주문 아님`,
    url: runUrl(row),
    tag: `pf-rebalance-${row.run_id}`,
  });
}

async function deliverOne(row: RebalanceDeliveryRow): Promise<'sent' | 'failed'> {
  try {
    if (row.channel === 'email') await sendEmail(row);
    else await sendPush(row);
    await markRebalanceDeliverySent(row.id);
    return 'sent';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not configured')) await markRebalanceDeliveryDisabled(row.id, message);
    else await markRebalanceDeliveryFailure(row.id, row.attempts, message, retryAt(row.attempts));
    logger.warn('rebalance.delivery_failed', { channel: row.channel, attempts: row.attempts, message });
    return 'failed';
  }
}

/**
 * `deadlineMs` (optional, absolute epoch ms) bounds this step against the caller's remaining
 * wall-clock, exactly as for monitor digests. Rows claimed but not attempted stay `processing`
 * and are recovered by `claim_due_portfolio_rebalance_deliveries`'s stale-lease sweep.
 */
export async function deliverPendingRebalances(
  deadlineMs?: number,
): Promise<{ attempted: number; sent: number; failed: number }> {
  if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
    logger.warn('rebalance.delivery_skipped', { reason: 'budget exhausted' });
    return Object.freeze({ attempted: 0, sent: 0, failed: 0 });
  }
  const config = loadConfig();
  const rows = await claimDueRebalanceDeliveries(config.deliveryBatchSize);
  return drainQueue(rows, deliverOne, config.deliveryConcurrency, deadlineMs);
}
