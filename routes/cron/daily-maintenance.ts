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
  const rebalanceDelivery = await deliverPendingRebalances();

  // Monitors run last on purpose. Contributions and rebalances create reviewable plans that
  // lead to ledger writes; monitors only notify. If the 60s budget runs short, dropping a
  // day of monitoring costs less than dropping a contribution. Both steps are isolated below
  // so a monitor failure never fails the whole run or hides the results already gathered above.
  let monitor: MonitorRunResult | { readonly error: string };
  try {
    const monitorDeadlineMs = Date.now() + loadConfig().monitorBudgetMs;
    monitor = await monitorRules(`${requestId}:monitor`, monitorDeadlineMs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('monitor.run_failed', { requestId, message });
    monitor = Object.freeze({ error: message });
  }

  let monitorDelivery: { readonly attempted: number; readonly sent: number; readonly failed: number } | { readonly error: string };
  try {
    monitorDelivery = await deliverPendingMonitorDigests();
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
