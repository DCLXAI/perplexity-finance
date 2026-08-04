import { describe, expect, it } from 'vitest';
import { didCrossThreshold, sanitizeAlerts } from './alertsStore.js';

describe('price-alert contracts', () => {
  it('fires only on a true directional threshold crossing', () => {
    expect(didCrossThreshold('above', 99, 100, 100)).toBe(true);
    expect(didCrossThreshold('above', 100, 101, 100)).toBe(false);
    expect(didCrossThreshold('above', 101, 102, 100)).toBe(false);
    expect(didCrossThreshold('below', 101, 100, 100)).toBe(true);
    expect(didCrossThreshold('below', 100, 99, 100)).toBe(false);
    expect(didCrossThreshold('below', 99, 98, 100)).toBe(false);
    expect(didCrossThreshold('above', Number.NaN, 100, 100)).toBe(false);
  });

  it('drops malformed, duplicate and unknown persisted alerts', () => {
    const createdISO = '2026-07-12T00:00:00.000Z';
    const alerts = sanitizeAlerts([
      { id: 'a1', symbol: 'BTCUSD', condition: 'above', target: 100_000, createdISO, seen: true },
      { id: 'a1', symbol: 'ETHUSD', condition: 'below', target: 1, createdISO, seen: true },
      { id: 'bad-symbol', symbol: 'NOPE', condition: 'above', target: 1, createdISO, seen: false },
      { id: 'bad-target', symbol: 'AMD', condition: 'above', target: -1, createdISO, seen: false },
      { id: 'a2', symbol: 'AMD', condition: 'below', target: 120, createdISO, seen: false, triggeredAt: 123 },
    ]);

    expect(alerts).toHaveLength(2);
    expect(alerts[0]?.id).toBe('a1');
    expect(alerts[1]?.triggeredAt).toBe(123);
    expect(Object.isFrozen(alerts)).toBe(true);
    expect(Object.isFrozen(alerts[0])).toBe(true);
  });
});
