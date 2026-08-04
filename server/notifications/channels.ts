import webpush from 'web-push';
import { loadConfig } from '../config.js';
import {
  claimDueDeliveries,
  deletePushSubscriptionById,
  listPushSubscriptions,
  markDeliveryDisabled,
  markDeliveryFailure,
  markDeliverySent,
  userForDelivery,
  type DeliveryRow,
} from '../cloud/store.js';
import { logger } from '../observability/logger.js';

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

async function sendEmail(row: DeliveryRow): Promise<void> {
  const config = loadConfig();
  if (!config.resendApiKey || !config.alertEmailFrom) throw new Error('Resend is not configured');
  const user = await userForDelivery(row.user_id);
  if (!user?.email) throw new Error('User email is unavailable');
  const payload = row.payload;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.deliveryTimeoutMs);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.resendApiKey}`,
        'content-type': 'application/json',
        'Idempotency-Key': `pf-alert-${row.alert_id}-email`,
      },
      body: JSON.stringify({
        from: config.alertEmailFrom,
        to: [user.email],
        subject: `${payload.symbol} 가격 알림`,
        text: `${payload.symbol}이(가) ${payload.target} ${payload.condition === 'above' ? '이상' : '이하'}로 교차했습니다. 감지 가격 ${payload.price}. 시각 ${payload.triggeredAt}. 데이터 ${payload.provenance.sourceLabel} (${payload.provenance.mode}).`,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Resend HTTP ${response.status}`);
  } finally {
    clearTimeout(timer);
  }
}

async function sendPush(row: DeliveryRow): Promise<void> {
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
        title: `${row.payload.symbol} 가격 알림`,
        body: `${row.payload.price}에서 임계값을 교차했습니다.`,
        url: `/#/stock/${encodeURIComponent(row.payload.symbol)}`,
        tag: `pf-${row.alert_id}`,
      })), config.deliveryTimeoutMs, 'Web Push');
      sent += 1;
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 0;
      if (status === 404 || status === 410) await deletePushSubscriptionById(subscription.id);
      else logger.warn('push.subscription_failed', {
        status,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!sent) throw new Error('No active push subscription accepted the notification');
}

async function deliverOne(row: DeliveryRow): Promise<'sent' | 'failed'> {
  try {
    if (row.channel === 'email') await sendEmail(row);
    else await sendPush(row);
    await markDeliverySent(row.id);
    return 'sent';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not configured')) await markDeliveryDisabled(row.id, message);
    else await markDeliveryFailure(row.id, row.attempts, message, retryAt(row.attempts));
    logger.warn('delivery.failed', { channel: row.channel, attempts: row.attempts, message });
    return 'failed';
  }
}

export async function deliverPending(): Promise<{ attempted: number; sent: number; failed: number }> {
  const config = loadConfig();
  const rows = await claimDueDeliveries(config.deliveryBatchSize);
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
