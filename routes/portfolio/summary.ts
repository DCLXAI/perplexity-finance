import { z } from 'zod';
import { requireUser } from '../../server/auth/supabase.js';
import { clientIp, json, withFunction } from '../../server/http/function.js';
import { buildPortfolioSummary } from '../../server/portfolio/service.js';
import { enforceRateLimit } from '../../server/rate-limit.js';
import type { PortfolioSummaryResponse } from '../../src/shared/api.js';

export default withFunction('portfolio.summary', ['GET'], async (request, requestId) => {
  const user = await requireUser(request);
  await enforceRateLimit('portfolio-summary', `${user.id}:${clientIp(request)}`, 60, 60);
  const url = new URL(request.url);
  const portfolioId = z.string().uuid().parse(url.searchParams.get('portfolioId'));
  const includeRisk = url.searchParams.get('includeRisk') !== 'false';
  const response: PortfolioSummaryResponse = Object.freeze({
    requestId,
    summary: await buildPortfolioSummary(user.id, portfolioId, requestId, { includeRisk }),
  });
  return json(response, {}, requestId);
});
