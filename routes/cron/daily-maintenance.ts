import captureMarketHandler from './capture-market.js';
import snapshotPortfoliosHandler from './snapshot-portfolios.js';
import { loadConfig } from '../../server/config.js';
import { ApiError, json, requireCronSecret, withFunction } from '../../server/http/function.js';
import { monitorRules } from '../../server/monitors/monitor-service.js';
import type { MonitorRunResult } from '../../server/monitors/monitor-service.js';
import { deliverPendingMonitorDigests } from '../../server/notifications/monitors.js';
import { deliverPendingRebalances } from '../../server/notifications/rebalances.js';
import { logger } from '../../server/observability/logger.js';
import { monitorPortfolioContributions } from '../../server/portfolio/contribution-service.js';
import { monitorPortfolioRebalances } from '../../server/portfolio/rebalance-service.js';

export const config = { maxDuration: 60 };
// FUNCTION_BUDGET_MS mirrors `config.maxDuration` above in milliseconds — the two must move
// together, since FUNCTION_BUDGET_MS exists only to keep the monitor deadline inside whatever
// wall-clock the platform actually grants this function.
const FUNCTION_BUDGET_MS = config.maxDuration * 1_000;
// Room left, after the monitor step's own deadline, to serialize and return the response. A
// platform timeout kills the function outright — it does not throw — so nothing after it,
// including the try/catch isolation below, ever runs. This margin is what keeps the whole
// request inside the platform limit instead of racing it.
const SAFETY_MARGIN_MS = 5_000;

interface MaintenanceTaskResult {
  readonly status: number;
  readonly ok: boolean;
  readonly body: unknown;
}

function childRequest(request: Request, path: string, requestId: string): Request {
  const headers = new Headers();
  const authorization = request.headers.get('authorization');
  if (authorization) headers.set('authorization', authorization);
  headers.set('x-request-id', requestId);
  return new Request(new URL(path, request.url), { method: 'GET', headers });
}

async function taskResult(response: Response): Promise<MaintenanceTaskResult> {
  const body = await response.json().catch(() => ({ error: { code: 'UNREADABLE_TASK_RESPONSE' } }));
  return Object.freeze({ status: response.status, ok: response.ok, body });
}

export default withFunction('cron.daily-maintenance', ['GET'], async (request, requestId) => {
  const runStartMs = Date.now();
  requireCronSecret(request);
  const [marketResponse, snapshotResponse] = await Promise.all([
    captureMarketHandler(childRequest(request, '/api/cron/capture-market', `${requestId}:market`)),
    snapshotPortfoliosHandler(childRequest(request, '/api/cron/snapshot-portfolios', `${requestId}:portfolio`)),
  ]);
  const [market, portfolios] = await Promise.all([
    taskResult(marketResponse),
    taskResult(snapshotResponse),
  ]);
  if (!market.ok || !portfolios.ok) {
    throw new ApiError(
      502,
      'DAILY_MAINTENANCE_FAILED',
      `Daily maintenance failed: market=${market.status}, portfolios=${portfolios.status}`,
    );
  }
  // Contributions take the shared open-plan slot first on their due date. This
  // prevents a same-day drift scan from racing an expected cash contribution.
  const contribution = await monitorPortfolioContributions(`${requestId}:contribution`);
  const rebalance = await monitorPortfolioRebalances(`${requestId}:rebalance`);
  // Every remaining step is bounded by the same absolute wall-clock: what the platform grants
  // this invocation, less the margin needed to serialize the response. Delivery steps are
  // unbounded external-network work (batch 50 x 12s timeout / concurrency 5 = up to 120s in the
  // worst case), so without this bound a slow provider could push the function past its limit
  // and get it killed — destroying the entire response, including the market, snapshot,
  // contribution and rebalance results already computed above.
  const wallClockDeadlineMs = runStartMs + FUNCTION_BUDGET_MS - SAFETY_MARGIN_MS;
  const rebalanceDelivery = await deliverPendingRebalances(wallClockDeadlineMs);

  // Monitors run last on purpose. Contributions and rebalances create reviewable plans that
  // lead to ledger writes; monitors only notify. If the 60s budget runs short, dropping a
  // day of monitoring costs less than dropping a contribution. Both steps are isolated below
  // so a monitor failure never fails the whole run or hides the results already gathered above.
  let monitor: MonitorRunResult | { readonly error: string };
  try {
    // Bounded by whichever is tighter: the monitor step's own configured budget, or what is
    // actually left of the function's total wall-clock. Market capture, snapshots,
    // contributions, rebalances, and rebalance delivery already burned time in this same
    // invocation, so a fresh `monitorBudgetMs` window from "now" could still run past
    // `runStartMs + FUNCTION_BUDGET_MS` and get the whole function killed by the platform —
    // losing this response's already-computed results along with it.
    const monitorDeadlineMs = Math.min(
      Date.now() + loadConfig().monitorBudgetMs,
      wallClockDeadlineMs,
    );
    monitor = await monitorRules(`${requestId}:monitor`, monitorDeadlineMs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('monitor.run_failed', { requestId, message });
    monitor = Object.freeze({ error: message });
  }

  let monitorDelivery: { readonly attempted: number; readonly sent: number; readonly failed: number } | { readonly error: string };
  try {
    monitorDelivery = await deliverPendingMonitorDigests(wallClockDeadlineMs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('monitor.delivery_failed', { requestId, message });
    monitorDelivery = Object.freeze({ error: message });
  }

  return json(Object.freeze({
    requestId,
    market: market.body,
    portfolios: portfolios.body,
    contribution,
    rebalance,
    rebalanceDelivery,
    monitor,
    monitorDelivery,
    generatedAt: new Date().toISOString(),
  }), {}, requestId);
});
