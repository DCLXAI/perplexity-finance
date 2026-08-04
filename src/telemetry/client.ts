type TelemetryValue = string | number | boolean | null;

export function trackClientEvent(
  event: string,
  properties: Readonly<Record<string, TelemetryValue>> = {},
): void {
  if (import.meta.env.MODE === 'test' || typeof window === 'undefined') return;
  const payload = JSON.stringify({
    event,
    route: window.location.hash || window.location.pathname,
    properties,
  });

  try {
    if (navigator.sendBeacon) {
      const accepted = navigator.sendBeacon(
        '/api/telemetry',
        new Blob([payload], { type: 'application/json' }),
      );
      if (accepted) return;
    }
    void fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Telemetry must never interfere with the product flow.
  }
}
