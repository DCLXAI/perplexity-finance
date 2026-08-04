import { z } from 'zod';
import { requireUser } from '../../server/auth/supabase.js';
import { clientIp, json, readJson, withFunction } from '../../server/http/function.js';
import {
  getPortfolioAllocationPolicy,
  replacePortfolioAllocationPolicy,
} from '../../server/portfolio/store.js';
import { enforceRateLimit } from '../../server/rate-limit.js';
import type { PortfolioAllocationResponse } from '../../src/shared/api.js';

const targetSchema = z.object({
  symbol: z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9.:-]+$/).transform((value) => value.toUpperCase()),
  targetPct: z.number().positive().max(100).finite(),
}).strict();
const moneySchema = z.number().min(0).max(1e9).finite().refine(
  (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
  '고정 수수료는 센트 단위로 입력해야 합니다.',
);
const bpsSchema = z.number().min(0).max(10_000).finite();
const costPolicySchema = z.object({
  commissionFixedUsd: moneySchema,
  commissionBps: bpsSchema,
  buySlippageBps: bpsSchema,
  sellSlippageBps: bpsSchema,
  sellTransactionTaxBps: bpsSchema,
  capitalGainsTaxPct: z.number().min(0).max(100).finite(),
  maxCostPct: z.number().min(0).max(100).finite(),
  taxLotMethod: z.literal('fifo').default('fifo'),
}).strict().default({
  commissionFixedUsd: 0,
  commissionBps: 0,
  buySlippageBps: 5,
  sellSlippageBps: 5,
  sellTransactionTaxBps: 0,
  capitalGainsTaxPct: 0,
  maxCostPct: 2,
  taxLotMethod: 'fifo',
});
const saveSchema = z.object({
  portfolioId: z.string().uuid(),
  driftThresholdPct: z.number().positive().max(100).finite(),
  minTradeValue: z.number().min(0).max(1e12).finite(),
  emailEnabled: z.boolean().default(false),
  pushEnabled: z.boolean().default(false),
  costPolicy: costPolicySchema,
  targets: z.array(targetSchema).min(1).max(50),
}).strict()
  .refine((value) => Math.abs(value.targets.reduce((sum, target) => sum + target.targetPct, 0) - 100) <= 0.01, '목표 비중 합계는 100%여야 합니다.')
  .refine((value) => new Set(value.targets.map((target) => target.symbol)).size === value.targets.length, '목표 심볼은 중복될 수 없습니다.');

export default withFunction('portfolio.allocation', ['GET', 'PUT'], async (request, requestId) => {
  const user = await requireUser(request);
  await enforceRateLimit('portfolio-allocation', `${user.id}:${clientIp(request)}`, 120, 60);

  if (request.method === 'PUT') {
    const input = saveSchema.parse(await readJson<unknown>(request));
    const response: PortfolioAllocationResponse = Object.freeze({
      requestId,
      policy: await replacePortfolioAllocationPolicy(user.id, input.portfolioId, {
        driftThresholdPct: input.driftThresholdPct,
        minTradeValue: input.minTradeValue,
        emailEnabled: input.emailEnabled,
        pushEnabled: input.pushEnabled,
        costPolicy: input.costPolicy,
        targets: input.targets,
      }),
    });
    return json(response, {}, requestId);
  }

  const portfolioId = z.string().uuid().parse(new URL(request.url).searchParams.get('portfolioId'));
  const response: PortfolioAllocationResponse = Object.freeze({
    requestId,
    policy: await getPortfolioAllocationPolicy(user.id, portfolioId),
  });
  return json(response, {}, requestId);
});
