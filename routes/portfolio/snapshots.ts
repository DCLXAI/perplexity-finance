import { z } from 'zod';
import { requireUser } from '../../server/auth/supabase.js';
import { ApiError, clientIp, json, withFunction } from '../../server/http/function.js';
import { getPortfolio, listPortfolioSnapshots } from '../../server/portfolio/store.js';
import { enforceRateLimit } from '../../server/rate-limit.js';
import type { PortfolioSnapshotsResponse } from '../../src/shared/api.js';

export default withFunction('portfolio.snapshots', ['GET'], async (request, requestId) => {
  const user = await requireUser(request);
  await enforceRateLimit('portfolio-snapshots', `${user.id}:${clientIp(request)}`, 120, 60);
  const url = new URL(request.url);
  const portfolioId = z.string().uuid().parse(url.searchParams.get('portfolioId'));
  const limit = z.coerce.number().int().min(1).max(2_000).default(365).parse(url.searchParams.get('limit') ?? undefined);
  const portfolio = await getPortfolio(user.id, portfolioId);
  if (!portfolio) throw new ApiError(404, 'PORTFOLIO_NOT_FOUND', '포트폴리오를 찾을 수 없습니다.');
  const response: PortfolioSnapshotsResponse = Object.freeze({
    requestId,
    portfolio,
    snapshots: await listPortfolioSnapshots(user.id, portfolioId, limit),
    generatedAt: new Date().toISOString(),
  });
  return json(response, {}, requestId);
});
