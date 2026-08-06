import configHandler from './config.js';
import healthHandler from './health.js';
import readyHandler from './ready.js';
import quotesHandler from './market/quotes.js';
import historyHandler from './market/history.js';
import predictionsHandler from './predictions.js';
import earningsHandler from './earnings.js';
import newsHandler from './news.js';
import watchlistHandler from './watchlist.js';
import alertsHandler from './alerts.js';
import pushHandler from './push.js';
import aiHandler from './ai/answer.js';
import alertCronHandler from './cron/evaluate-alerts.js';
import captureMarketHandler from './cron/capture-market.js';
import dailyMaintenanceHandler from './cron/daily-maintenance.js';
import snapshotPortfoliosHandler from './cron/snapshot-portfolios.js';
import metricsHandler from './metrics.js';
import telemetryHandler from './telemetry.js';
import opsSummaryHandler from './ops/summary.js';
import opsActionsHandler from './ops/actions.js';
import portfoliosHandler from './portfolios.js';
import portfolioAllocationHandler from './portfolio/allocation.js';
import portfolioRebalancesHandler from './portfolio/rebalances.js';
import portfolioGoalHandler from './portfolio/goal.js';
import portfolioContributionsHandler from './portfolio/contributions.js';
import portfolioTransactionsHandler from './portfolio/transactions.js';
import portfolioSummaryHandler from './portfolio/summary.js';
import portfolioSnapshotsHandler from './portfolio/snapshots.js';
import portfolioScenarioHandler from './portfolio/scenario.js';
import portfolioMonitorRulesHandler from './portfolio/monitor-rules.js';
import portfolioMonitorStatusHandler from './portfolio/monitor-status.js';
import researchHandler from './research.js';
import type { FetchHandler } from '../server/http/function.js';

export const apiRoutes: ReadonlyMap<string, FetchHandler> = new Map([
  ['/api/config', configHandler],
  ['/api/health', healthHandler],
  ['/api/ready', readyHandler],
  ['/api/market/quotes', quotesHandler],
  ['/api/market/history', historyHandler],
  ['/api/predictions', predictionsHandler],
  ['/api/earnings', earningsHandler],
  ['/api/news', newsHandler],
  ['/api/watchlist', watchlistHandler],
  ['/api/alerts', alertsHandler],
  ['/api/push', pushHandler],
  ['/api/ai/answer', aiHandler],
  ['/api/cron/evaluate-alerts', alertCronHandler],
  ['/api/cron/capture-market', captureMarketHandler],
  ['/api/cron/daily-maintenance', dailyMaintenanceHandler],
  ['/api/cron/snapshot-portfolios', snapshotPortfoliosHandler],
  ['/api/metrics', metricsHandler],
  ['/api/telemetry', telemetryHandler],
  ['/api/ops/summary', opsSummaryHandler],
  ['/api/ops/actions', opsActionsHandler],
  ['/api/portfolios', portfoliosHandler],
  ['/api/portfolio/allocation', portfolioAllocationHandler],
  ['/api/portfolio/rebalances', portfolioRebalancesHandler],
  ['/api/portfolio/goal', portfolioGoalHandler],
  ['/api/portfolio/contributions', portfolioContributionsHandler],
  ['/api/portfolio/transactions', portfolioTransactionsHandler],
  ['/api/portfolio/summary', portfolioSummaryHandler],
  ['/api/portfolio/snapshots', portfolioSnapshotsHandler],
  ['/api/portfolio/scenario', portfolioScenarioHandler],
  ['/api/portfolio/monitor-rules', portfolioMonitorRulesHandler],
  ['/api/portfolio/monitor-status', portfolioMonitorStatusHandler],
  ['/api/research', researchHandler],
]);

export function apiHandler(pathname: string): FetchHandler | undefined {
  return apiRoutes.get(pathname);
}
