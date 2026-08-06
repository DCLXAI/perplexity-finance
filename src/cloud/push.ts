import { apiFetch } from '@/live/apiClient';
import type { PushSubscriptionPayload } from '@/shared/api';

function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const bytes = atob(base64);
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

function payload(subscription: PushSubscription): PushSubscriptionPayload {
  const value = subscription.toJSON();
  if (!value.endpoint || !value.keys?.p256dh || !value.keys.auth) {
    throw new Error('브라우저 푸시 구독 정보를 읽지 못했습니다.');
  }
  return {
    endpoint: value.endpoint,
    expirationTime: value.expirationTime ?? null,
    keys: { p256dh: value.keys.p256dh, auth: value.keys.auth },
  };
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function enablePushNotifications(
  accessToken: string,
  vapidPublicKey: string,
): Promise<PushSubscriptionPayload> {
  if (!pushSupported()) throw new Error('이 브라우저는 Web Push를 지원하지 않습니다.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('브라우저 알림 권한이 허용되지 않았습니다.');
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeVapidKey(vapidPublicKey),
  });
  const body = payload(subscription);
  await apiFetch('/api/push', { method: 'POST', body: JSON.stringify(body) }, accessToken);
  return body;
}

export async function disablePushNotifications(accessToken: string): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const body = payload(subscription);
  await apiFetch('/api/push', { method: 'DELETE', body: JSON.stringify(body) }, accessToken);
  await subscription.unsubscribe();
}
