import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MonitorDigestDeliveryRow } from '../monitors/store.js';

// The delivery layer is the last hop before a real email/push, and it is where a stranded row
// silently costs the user a notification, so it is exercised here with the store and both
// senders mocked — no database, no network. `vi.hoisted` is used because `vi.mock` factories run
// before the rest of the module body (same style as ../monitors/monitor-service.test.ts).
const {
  claimDueMonitorDigestDeliveriesMock,
  markSentMock,
  markFailureMock,
  markDisabledMock,
  sendEmailMessageMock,
  sendPushMessageMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  claimDueMonitorDigestDeliveriesMock: vi.fn(),
  markSentMock: vi.fn(),
  markFailureMock: vi.fn(),
  markDisabledMock: vi.fn(),
  sendEmailMessageMock: vi.fn(),
  sendPushMessageMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock('../monitors/store.js', () => ({
  claimDueMonitorDigestDeliveries: claimDueMonitorDigestDeliveriesMock,
  markMonitorDigestDeliverySent: markSentMock,
  markMonitorDigestDeliveryFailure: markFailureMock,
  markMonitorDigestDeliveryDisabled: markDisabledMock,
}));

// Only the two senders are replaced; `drainQueue` and `retryAt` stay real, because the
// deadline/backoff behaviour under test lives in them.
vi.mock('./delivery.js', async () => {
  const actual = await vi.importActual<typeof import('./delivery.js')>('./delivery.js');
  return { ...actual, sendEmailMessage: sendEmailMessageMock, sendPushMessage: sendPushMessageMock };
});

vi.mock('../observability/logger.js', () => ({
  logger: { warn: loggerWarnMock, info: vi.fn(), error: vi.fn(), debug: vi.fn(), configure: vi.fn() },
}));

import { deliverPendingMonitorDigests } from './monitors.js';

function row(overrides: Partial<MonitorDigestDeliveryRow> = {}): MonitorDigestDeliveryRow {
  return {
    id: 'delivery-1',
    digest_id: 'digest-1',
    user_id: 'u1',
    channel: 'email',
    status: 'processing',
    attempts: 0,
    payload: { breachCount: 1, items: [], url: '/#/portfolio?portfolioId=pf-1' },
    next_attempt_at: null,
    sent_at: null,
    last_error: null,
    created_at: '2026-08-05T00:00:00.000Z',
    updated_at: '2026-08-05T00:00:00.000Z',
    ...overrides,
  } as MonitorDigestDeliveryRow;
}

describe('deliverPendingMonitorDigests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendEmailMessageMock.mockResolvedValue(undefined);
    sendPushMessageMock.mockResolvedValue(undefined);
    markSentMock.mockResolvedValue(undefined);
    markFailureMock.mockResolvedValue(undefined);
    markDisabledMock.mockResolvedValue(undefined);
  });

  it('marks a delivery sent once its channel accepted it', async () => {
    claimDueMonitorDigestDeliveriesMock.mockResolvedValue([
      row({ id: 'email-row', channel: 'email' }),
      row({ id: 'push-row', channel: 'push' }),
    ]);

    const result = await deliverPendingMonitorDigests();

    expect(sendEmailMessageMock).toHaveBeenCalledTimes(1);
    expect(sendPushMessageMock).toHaveBeenCalledTimes(1);
    expect(markSentMock.mock.calls.map(([id]) => id).sort()).toEqual(['email-row', 'push-row']);
    expect(markFailureMock).not.toHaveBeenCalled();
    expect(result).toEqual({ attempted: 2, sent: 2, failed: 0 });
  });

  it('disables a delivery whose channel is not configured instead of retrying it forever', async () => {
    // A missing RESEND_API_KEY / VAPID key is not transient: retrying it burns the attempt
    // budget and ends as `failed`, which reads like a provider outage. It must land on
    // `disabled` so the cause stays visible.
    claimDueMonitorDigestDeliveriesMock.mockResolvedValue([row({ id: 'email-row' })]);
    sendEmailMessageMock.mockRejectedValue(new Error('Resend is not configured'));

    const result = await deliverPendingMonitorDigests();

    expect(markDisabledMock).toHaveBeenCalledWith('email-row', 'Resend is not configured');
    expect(markFailureMock).not.toHaveBeenCalled();
    expect(markSentMock).not.toHaveBeenCalled();
    expect(result).toEqual({ attempted: 1, sent: 0, failed: 1 });
  });

  it('schedules a retry for a non-configuration failure', async () => {
    claimDueMonitorDigestDeliveriesMock.mockResolvedValue([row({ id: 'push-row', channel: 'push', attempts: 1 })]);
    sendPushMessageMock.mockRejectedValue(new Error('Web Push timed out after 12000ms'));

    await deliverPendingMonitorDigests();

    expect(markDisabledMock).not.toHaveBeenCalled();
    expect(markFailureMock).toHaveBeenCalledTimes(1);
    const [id, attempts, message, nextAttemptAt] = markFailureMock.mock.calls[0] as
      [string, number, string, string | null];
    expect(id).toBe('push-row');
    expect(attempts).toBe(1);
    expect(message).toContain('Web Push');
    expect(nextAttemptAt).not.toBeNull();
    expect(Date.parse(nextAttemptAt as string)).toBeGreaterThan(Date.now());
  });

  it('gives up on a delivery that has exhausted its attempts', async () => {
    claimDueMonitorDigestDeliveriesMock.mockResolvedValue([row({ id: 'email-row', attempts: 5 })]);
    sendEmailMessageMock.mockRejectedValue(new Error('Resend HTTP 500'));

    await deliverPendingMonitorDigests();

    // retryAt returns null past the attempt ceiling, which mark_monitor_digest_delivery_failure
    // turns into status 'failed' rather than 'retry'.
    expect(markFailureMock.mock.calls[0][3]).toBeNull();
  });

  it('leaves an unattempted claimed row untouched when the wall-clock budget runs out', async () => {
    // Rows claimed but never handed to a sender stay `processing` with no mark_* call — they
    // are exactly the rows `claim_due_monitor_digest_deliveries`'s stale-lease sweep recovers on
    // a later run. Without that sweep this is the C1 hole: a permanently stranded notification.
    const rows = Array.from({ length: 12 }, (_unused, index) => row({ id: `row-${index}` }));
    claimDueMonitorDigestDeliveriesMock.mockResolvedValue(rows);
    sendEmailMessageMock.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 40)));

    const result = await deliverPendingMonitorDigests(Date.now() + 5);

    expect(result.attempted).toBeLessThan(rows.length);
    expect(result.attempted).toBeGreaterThan(0);
    // Every row that was attempted got a terminal mark; nothing else was written at all.
    expect(markSentMock).toHaveBeenCalledTimes(result.sent);
    expect(markSentMock.mock.calls.length + markFailureMock.mock.calls.length + markDisabledMock.mock.calls.length)
      .toBe(result.attempted);
    expect(loggerWarnMock.mock.calls.some(([event]) => event === 'delivery.deadline_reached')).toBe(true);
  });

  it('claims nothing when the budget is already gone', async () => {
    await expect(deliverPendingMonitorDigests(Date.now() - 1))
      .resolves.toEqual({ attempted: 0, sent: 0, failed: 0 });
    expect(claimDueMonitorDigestDeliveriesMock).not.toHaveBeenCalled();
  });
});
