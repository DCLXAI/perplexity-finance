import { supabaseConfigured } from '../../server/auth/supabase.js';
import { writeHeartbeat } from '../../server/cloud/store.js';
import { ApiError, json, requireCronSecret, withFunction } from '../../server/http/function.js';
import { logger } from '../../server/observability/logger.js';
import { buildPortfolioSummary } from '../../server/portfolio/service.js';
import { insertPortfolioSnapshot, listSnapshotTargets, markPortfolioSnapshotAttempt } from '../../server/portfolio/store.js';
import type { PortfolioSnapshotCronResponse } from '../../src/shared/api.js';

const configuredLimit = Number.parseInt(process.env.PORTFOLIO_SNAPSHOT_LIMIT ?? '8', 10);
const SNAPSHOT_LIMIT = Number.isFinite(configuredLimit) ? Math.max(1, Math.min(configuredLimit, 20)) : 8;

export default withFunction('cron.snapshot-portfolios', ['GET'], async (request, requestId) => {
  requireCronSecret(request);
  if (!supabaseConfigured()) throw new ApiError(503, 'CLOUD_NOT_CONFIGURED', '포트폴리오 스냅숏 원장이 설정되지 않았습니다.');

  const targets = await listSnapshotTargets(SNAPSHOT_LIMIT);
  let capturedSnapshots = 0;
  let skippedPortfolios = 0;

  for (const target of targets) {
    try {
      const summary = await buildPortfolioSummary(target.userId, target.id, `${requestId}:${target.id}`);
      const strictQuality = summary.valuationQuality === 'verified'
        && (summary.holdings.length === 0
          || (summary.risk.dataQuality === 'verified' && summary.risk.status === 'available'));
      if (!strictQuality || summary.holdings.some((holding) => holding.valuationQuality !== 'verified')) {
        skippedPortfolios += 1;
        continue;
      }
      await insertPortfolioSnapshot(target.userId, summary);
      capturedSnapshots += 1;
    } catch (error) {
      skippedPortfolios += 1;
      logger.warn('portfolio.snapshot_skipped', {
        portfolioId: target.id,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      try {
        await markPortfolioSnapshotAttempt(target.id);
      } catch (error) {
        logger.warn('portfolio.snapshot_cursor_failed', {
          portfolioId: target.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  await writeHeartbeat('portfolio-snapshots', {
    inspected: targets.length,
    captured: capturedSnapshots,
    skipped: skippedPortfolios,
    requestId,
  });

  const response: PortfolioSnapshotCronResponse = Object.freeze({
    requestId,
    inspectedPortfolios: targets.length,
    capturedSnapshots,
    skippedPortfolios,
    generatedAt: new Date().toISOString(),
  });
  return json(response, {}, requestId);
});
