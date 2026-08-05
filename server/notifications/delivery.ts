import webpush from 'web-push';
import { userForDelivery, deletePushSubscriptionById, listPushSubscriptions } from '../cloud/store.js';
import { loadConfig } from '../config.js';
import { logger } from '../observability/logger.js';

export function retryAt(attempts: number): string | null {
  if (attempts >= 5) return null;
  const seconds = Math.min(3_600, 30 * 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + seconds * 1_000).toISOString();
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
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

export interface SendEmailMessageInput {
  readonly userId: string;
  readonly subject: string;
  readonly text: string;
  readonly idempotencyKey: string;
}

export async function sendEmailMessage(input: SendEmailMessageInput): Promise<void> {
  const config = loadConfig();
  if (!config.resendApiKey || !config.alertEmailFrom) throw new Error('Resend is not configured');
  const user = await userForDelivery(input.userId);
  if (!user?.email) throw new Error('User email is unavailable');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.deliveryTimeoutMs);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.resendApiKey}`,
        'content-type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        from: config.alertEmailFrom,
        to: [user.email],
        subject: input.subject,
        text: input.text,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Resend HTTP ${response.status}`);
  } finally {
    clearTimeout(timer);
  }
}

export interface SendPushMessageInput {
  readonly userId: string;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly tag: string;
}

export async function sendPushMessage(input: SendPushMessageInput): Promise<void> {
  const config = loadConfig();
  if (!config.vapidPublicKey || !config.vapidPrivateKey) throw new Error('Web Push is not configured');
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  const subscriptions = await listPushSubscriptions(input.userId);
  if (!subscriptions.length) throw new Error('No browser push subscriptions');
  let sent = 0;
  for (const subscription of subscriptions) {
    try {
      await withTimeout(webpush.sendNotification({
        endpoint: subscription.endpoint,
        expirationTime: subscription.expires_at ? new Date(subscription.expires_at).getTime() : null,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify({
        title: input.title,
        body: input.body,
        url: input.url,
        tag: input.tag,
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

/**
 * Delivers `rows` with bounded concurrency, optionally stopping at `deadlineMs`.
 *
 * The deadline matters because a claimed batch is an unbounded external-network step: with the
 * default batch size 50, concurrency 5 and a 12s per-send timeout, a fully-timing-out batch
 * takes ten rounds — 120s — which is twice the whole serverless function budget. A platform
 * kill is not catchable, so it would destroy the entire cron response, including work already
 * completed by earlier steps. Rows left unprocessed stay in `processing` and are recovered by
 * the claim function's stale-lease sweep on a later run, so stopping early loses nothing.
 *
 * `attempted` counts rows actually handed to `deliverOne`, which equals `rows.length` whenever
 * no deadline is supplied or the deadline is never reached.
 */
export async function drainQueue<TRow>(
  rows: readonly TRow[],
  deliverOne: (row: TRow) => Promise<'sent' | 'failed'>,
  concurrency: number,
  deadlineMs?: number,
): Promise<{ attempted: number; sent: number; failed: number }> {
  let cursor = 0;
  let sent = 0;
  let failed = 0;
  const workers = Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
    while (cursor < rows.length) {
      if (deadlineMs !== undefined && Date.now() >= deadlineMs) return;
      const index = cursor++;
      const result = await deliverOne(rows[index]);
      if (result === 'sent') sent += 1;
      else failed += 1;
    }
  });
  await Promise.all(workers);
  const attempted = sent + failed;
  if (attempted < rows.length) {
    logger.warn('delivery.deadline_reached', { claimed: rows.length, attempted, skipped: rows.length - attempted });
  }
  return Object.freeze({ attempted, sent, failed });
}
