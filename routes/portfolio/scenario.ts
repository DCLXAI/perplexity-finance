import { z } from 'zod';
import { requireUser } from '../../server/auth/supabase.js';
import { clientIp, json, readJson, withFunction } from '../../server/http/function.js';
import { buildPortfolioSummary } from '../../server/portfolio/service.js';
import { enforceRateLimit } from '../../server/rate-limit.js';
import { runPortfolioScenario } from '../../src/domain/portfolio/scenario.js';
import type { PortfolioScenarioResponse, PortfolioScenarioShock } from '../../src/shared/api.js';

const schema = z.object({
  portfolioId: z.string().uuid(),
  shocks: z.array(z.object({
    targetType: z.enum(['all', 'symbol', 'sector', 'asset-kind']),
    target: z.string().trim().min(1).max(40),
    changePct: z.number().finite().min(-100).max(1_000),
  }).strict()).min(1).max(20),
}).strict();

export default withFunction('portfolio.scenario', ['POST'], async (request, requestId) => {
  const user = await requireUser(request);
  await enforceRateLimit('portfolio-scenario', `${user.id}:${clientIp(request)}`, 60, 60);
  const input = schema.parse(await readJson<unknown>(request));
  const shocks: readonly PortfolioScenarioShock[] = Object.freeze(input.shocks.map((shock) => Object.freeze({
    targetType: shock.targetType,
    target: shock.targetType === 'symbol' ? shock.target.toUpperCase() : shock.target,
    changePct: shock.changePct,
  })));
  const summary = await buildPortfolioSummary(user.id, input.portfolioId, requestId, { includeRisk: false });
  const result = runPortfolioScenario(summary, shocks);
  const response: PortfolioScenarioResponse = Object.freeze({
    requestId,
    portfolioId: input.portfolioId,
    generatedAt: new Date().toISOString(),
    ...result,
    shocks,
  });
  return json(response, {}, requestId);
});
