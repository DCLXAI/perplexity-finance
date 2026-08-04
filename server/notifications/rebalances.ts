import webpush from 'web-push';
import { userForDelivery, deletePushSubscriptionById, listPushSubscriptions } from '../cloud/store.js';
import { loadConfig } from '../config.js';
import { logger } from '../observability/logger.js';
import {
  claimDueRebalanceDeliveries,
  markRebalanceDeliveryDisabled,
  markRebalanceDeliveryFailure,
  markRebalanceDeliverySent,
  type RebalanceDeliveryRow,
} from '../portfolio/store.js';

function retryAt(attempts: number): string | null {
  if (attempts >= 5) return null;
  const seconds = Math.min(3_600, 30 * 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + seconds * 1_000).toISOString();
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
  const config = loadConfig();
  if (!config.resendApiKey || !config.alertEmailFrom) throw new Error('Resend is not configured');
  const user = await userForDelivery(row.user_id);
  if (!user?.email) throw new Error('User email is unavailable');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.deliveryTimeoutMs);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.resendApiKey}`,
        'content-type': 'application/json',
        'Idempotency-Key': `pf-rebalance-${row.run_id}-email`,
      },
      body: JSON.stringify({
        from: config.alertEmailFrom,
        to: [user.email],
        subject: `[리밸런싱 검토] ${alertText(row)}`,
        text: `${alertText(row)} 상태를 감지해 검토 대기 계획을 만들었습니다.\n\n계획 보기: ${runUrl(row)}\n\n이 알림은 주문 제안이며 자동 주문이 아닙니다. 승인 전에는 거래 원장에 반영되지 않습니다.`,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Resend HTTP ${response.status}`);
  } finally {
    clearTimeout(timer);
  }
}

async function sendPush(row: RebalanceDeliveryRow): Promise<void> {
  const config = loadConfig();
  if (!config.vapidPublicKey || !config.vapidPrivateKey) throw new Error('Web Push is not configured');
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  const subscriptions = await listPushSubscriptions(row.user_id);
  if (!subscriptions.length) throw new Error('No browser push subscriptions');
  let sent = 0;
  for (const subscription of subscriptions) {
    try {
      await withTimeout(webpush.sendNotification({
        endpoint: subscription.endpoint,
        expirationTime: subscription.expires_at ? new Date(subscription.expires_at).getTime() : null,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify({
        title: '리밸런싱 검토 필요',
        body: `${alertText(row)} · 자동 주문 아님`,
        url: runUrl(row),
        tag: `pf-rebalance-${row.run_id}`,
      })), config.deliveryTimeoutMs, 'Web Push');
      sent += 1;
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 0;
      if (status === 404 || status === 410) await deletePushSubscriptionById(subscription.id);
      else logger.warn('rebalance.push_subscription_failed', {
        status,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!sent) throw new Error('No active push subscription accepted the notification');
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

export async function deliverPendingRebalances(): Promise<{ attempted: number; sent: number; failed: number }> {
  const config = loadConfig();
  const rows = await claimDueRebalanceDeliveries(config.deliveryBatchSize);
  let cursor = 0;
  let sent = 0;
  let failed = 0;
  const workers = Array.from({ length: Math.min(config.deliveryConcurrency, rows.length) }, async () => {
    while (cursor < rows.length) {
      const index = cursor++;
      const result = await deliverOne(rows[index]);
      if (result === 'sent') sent += 1;
      else failed += 1;
    }
  });
  await Promise.all(workers);
  return { attempted: rows.length, sent, failed };
}
