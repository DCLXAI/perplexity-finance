import captureMarketHandler from './capture-market.js';
import snapshotPortfoliosHandler from './snapshot-portfolios.js';
import { ApiError, json, requireCronSecret, withFunction } from '../../server/http/function.js';
import { deliverPendingRebalances } from '../../server/notifications/rebalances.js';
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
  return json(Object.freeze({
    requestId,
    market: market.body,
    portfolios: portfolios.body,
    contribution,
    rebalance,
    rebalanceDelivery,
    generatedAt: new Date().toISOString(),
  }), {}, requestId);
});
