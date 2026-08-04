import { z } from 'zod';
import { requireUser } from '../../server/auth/supabase.js';
import {
  clientIp,
  json,
  readJson,
  requireIdempotencyKey,
  withFunction,
} from '../../server/http/function.js';
import {
  approveRebalanceRun,
  executeRebalanceRun,
  generateRebalanceRun,
  rejectRebalanceRun,
} from '../../server/portfolio/rebalance-service.js';
import { listPortfolioRebalanceRuns } from '../../server/portfolio/store.js';
import { enforceRateLimit } from '../../server/rate-limit.js';
import type {
  PortfolioRebalanceMutationResponse,
  PortfolioRebalancesResponse,
} from '../../src/shared/api.js';

function rounded(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

const fillSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().positive().finite().max(1e12)
    .transform((value) => rounded(value, 12)).refine((value) => value > 0),
  price: z.number().positive().finite().max(1e12)
    .transform((value) => rounded(value, 8)).refine((value) => value > 0),
  fees: z.number().nonnegative().finite().max(1e9)
    .transform((value) => rounded(value, 8)).default(0),
  tradeAt: z.string().datetime({ offset: true }),
}).strict();

const mutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('generate'), portfolioId: z.string().uuid() }).strict(),
  z.object({ action: z.literal('approve'), runId: z.string().uuid() }).strict(),
  z.object({
    action: z.literal('reject'),
    runId: z.string().uuid(),
    reason: z.string().trim().min(1).max(500),
  }).strict(),
  z.object({
    action: z.literal('complete'),
    runId: z.string().uuid(),
    fills: z.array(fillSchema).min(1).max(500),
  }).strict(),
]);

export default withFunction('portfolio.rebalances', ['GET', 'POST'], async (request, requestId) => {
  const user = await requireUser(request);
  await enforceRateLimit('portfolio-rebalances', `${user.id}:${clientIp(request)}`, 120, 60);

  if (request.method === 'POST') {
    const idempotencyKey = requireIdempotencyKey(request);
    const input = mutationSchema.parse(await readJson<unknown>(request));
    if (input.action === 'generate') {
      const result = await generateRebalanceRun(
        user.id,
        input.portfolioId,
        'manual',
        idempotencyKey,
        requestId,
      );
      if (!result) throw new Error('Manual rebalance generation returned no result');
      const response: PortfolioRebalanceMutationResponse = Object.freeze({
        requestId,
        run: result.run,
        created: result.created,
      });
      return json(response, { status: result.created ? 201 : 200 }, requestId);
    }

    const run = input.action === 'approve'
      ? await approveRebalanceRun(user.id, input.runId, idempotencyKey, requestId)
      : input.action === 'reject'
        ? await rejectRebalanceRun(user.id, input.runId, input.reason, idempotencyKey)
        : await executeRebalanceRun(user.id, input.runId, input.fills, idempotencyKey, requestId);
    const response: PortfolioRebalanceMutationResponse = Object.freeze({ requestId, run });
    return json(response, {}, requestId);
  }

  const url = new URL(request.url);
  const portfolioId = z.string().uuid().parse(url.searchParams.get('portfolioId'));
  const limit = z.coerce.number().int().min(1).max(100).default(20).parse(url.searchParams.get('limit') ?? undefined);
  const response: PortfolioRebalancesResponse = Object.freeze({
    requestId,
    runs: await listPortfolioRebalanceRuns(user.id, portfolioId, limit),
    generatedAt: new Date().toISOString(),
  });
  return json(response, {}, requestId);
});
