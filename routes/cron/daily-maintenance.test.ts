import { beforeEach, describe, expect, it, vi } from 'vitest';

// Monitors run last in daily-maintenance, after market capture, snapshots, contributions,
// rebalances, and rebalance delivery. That ordering only pays off if a monitor failure never
// takes the earlier steps' real results down with it. These tests force each of the two monitor
// steps to reject and assert the response still reports 200 with the earlier steps' real values,
// and that only the failed step's own field is replaced with `{ error }`.

vi.mock('./capture-market.js', () => ({
  default: async () => new Response(JSON.stringify({ ok: 'market' }), { status: 200 }),
}));
vi.mock('./snapshot-portfolios.js', () => ({
  default: async () => new Response(JSON.stringify({ ok: 'portfolios' }), { status: 200 }),
}));
vi.mock('../../server/portfolio/contribution-service.js', () => ({
  monitorPortfolioContributions: async () => ({ contributionResult: true }),
}));
vi.mock('../../server/portfolio/rebalance-service.js', () => ({
  monitorPortfolioRebalances: async () => ({ rebalanceResult: true }),
}));
vi.mock('../../server/notifications/rebalances.js', () => ({
  deliverPendingRebalances: async () => ({ attempted: 1, sent: 1, failed: 0 }),
}));

const monitorRules = vi.fn();
const deliverPendingMonitorDigests = vi.fn();
vi.mock('../../server/monitors/monitor-service.js', () => ({
  monitorRules: (...args: unknown[]) => monitorRules(...args),
}));
vi.mock('../../server/notifications/monitors.js', () => ({
  deliverPendingMonitorDigests: (...args: unknown[]) => deliverPendingMonitorDigests(...args),
}));

process.env.CRON_SECRET = 'test-secret';

function request(): Request {
  return new Request('https://example.com/api/cron/daily-maintenance', {
    method: 'GET',
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('daily-maintenance monitor step isolation', () => {
  beforeEach(() => {
    vi.resetModules();
    monitorRules.mockReset();
    deliverPendingMonitorDigests.mockReset();
  });

  it('returns 200 with the earlier steps intact when monitorRules rejects', async () => {
    monitorRules.mockRejectedValue(new Error('boom-monitor'));
    deliverPendingMonitorDigests.mockResolvedValue({ attempted: 0, sent: 0, failed: 0 });

    const mod = await import('./daily-maintenance.js');
    const response = await mod.default(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.market).toEqual({ ok: 'market' });
    expect(body.portfolios).toEqual({ ok: 'portfolios' });
    expect(body.contribution).toEqual({ contributionResult: true });
    expect(body.rebalance).toEqual({ rebalanceResult: true });
    expect(body.rebalanceDelivery).toEqual({ attempted: 1, sent: 1, failed: 0 });
    expect(body.monitor).toEqual({ error: 'boom-monitor' });
    expect(body.monitorDelivery).toEqual({ attempted: 0, sent: 0, failed: 0 });
  });

  it('returns 200 with the earlier steps intact when deliverPendingMonitorDigests rejects', async () => {
    monitorRules.mockResolvedValue({
      claimed: 0,
      evaluated: 0,
      breached: 0,
      deferred: 0,
      errored: 0,
      digests: 0,
      portfolios: 0,
      budgetExhausted: false,
    });
    deliverPendingMonitorDigests.mockRejectedValue(new Error('boom-delivery'));

    const mod = await import('./daily-maintenance.js');
    const response = await mod.default(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.market).toEqual({ ok: 'market' });
    expect(body.portfolios).toEqual({ ok: 'portfolios' });
    expect(body.contribution).toEqual({ contributionResult: true });
    expect(body.rebalance).toEqual({ rebalanceResult: true });
    expect(body.rebalanceDelivery).toEqual({ attempted: 1, sent: 1, failed: 0 });
    expect(body.monitor).toEqual({
      claimed: 0,
      evaluated: 0,
      breached: 0,
      deferred: 0,
      errored: 0,
      digests: 0,
      portfolios: 0,
      budgetExhausted: false,
    });
    expect(body.monitorDelivery).toEqual({ error: 'boom-delivery' });
  });
});
