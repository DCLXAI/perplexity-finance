import { z } from 'zod';
import { requireUser } from '../server/auth/supabase.js';
import { ApiError, clientIp, json, readJson, withFunction } from '../server/http/function.js';
import { sanitizeSymbols } from '../server/market/catalog.js';
import {
  archiveInvestmentThesis,
  createInvestmentThesis,
  getPortfolio,
  listInvestmentTheses,
  updateInvestmentThesis,
} from '../server/portfolio/store.js';
import { enforceRateLimit } from '../server/rate-limit.js';
import type { ResearchMutationResponse, ResearchResponse } from '../src/shared/api.js';

const status = z.enum(['watching', 'active', 'invalidated', 'realized', 'archived']);
const base = {
  portfolioId: z.string().uuid().optional(),
  symbol: z.string().min(1).max(20),
  title: z.string().trim().min(1).max(120),
  thesis: z.string().trim().min(1).max(6_000),
  bullCase: z.string().trim().max(4_000).default(''),
  bearCase: z.string().trim().max(4_000).default(''),
  catalysts: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  invalidation: z.string().trim().max(3_000).default(''),
  targetPrice: z.number().positive().finite().max(1e12).optional(),
  confidence: z.number().int().min(0).max(100).default(50),
  status: status.default('watching'),
};
const createSchema = z.object(base).strict();
const patchSchema = z.object({
  id: z.string().uuid(),
  portfolioId: z.string().uuid().optional(),
  symbol: z.string().min(1).max(20).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  thesis: z.string().trim().min(1).max(6_000).optional(),
  bullCase: z.string().trim().max(4_000).optional(),
  bearCase: z.string().trim().max(4_000).optional(),
  catalysts: z.array(z.string().trim().min(1).max(200)).max(12).optional(),
  invalidation: z.string().trim().max(3_000).optional(),
  targetPrice: z.number().positive().finite().max(1e12).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  status: status.optional(),
}).strict();
const deleteSchema = z.object({ id: z.string().uuid() }).strict();

function symbol(value: string): string {
  const normalized = sanitizeSymbols([value], 1)[0];
  if (!normalized) throw new ApiError(400, 'UNKNOWN_SYMBOL', '지원하지 않는 심볼입니다.');
  return normalized;
}

async function assertPortfolio(userId: string, portfolioId?: string | null): Promise<void> {
  if (!portfolioId) return;
  if (!await getPortfolio(userId, portfolioId)) throw new ApiError(404, 'PORTFOLIO_NOT_FOUND', '포트폴리오를 찾을 수 없습니다.');
}

export default withFunction('research', ['GET', 'POST', 'PATCH', 'DELETE'], async (request, requestId) => {
  const user = await requireUser(request);
  await enforceRateLimit('research', `${user.id}:${clientIp(request)}`, 120, 60);

  if (request.method === 'POST') {
    const input = createSchema.parse(await readJson<unknown>(request));
    await assertPortfolio(user.id, input.portfolioId);
    const response: ResearchMutationResponse = Object.freeze({
      requestId,
      thesis: await createInvestmentThesis(user.id, {
        ...input,
        symbol: symbol(input.symbol),
        evidence: Object.freeze([]),
      }),
    });
    return json(response, { status: 201 }, requestId);
  }

  if (request.method === 'PATCH') {
    const input = patchSchema.parse(await readJson<unknown>(request));
    await assertPortfolio(user.id, input.portfolioId);
    const response: ResearchMutationResponse = Object.freeze({
      requestId,
      thesis: await updateInvestmentThesis(user.id, input.id, {
        ...(input.portfolioId !== undefined ? { portfolioId: input.portfolioId } : {}),
        ...(input.symbol !== undefined ? { symbol: symbol(input.symbol) } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.thesis !== undefined ? { thesis: input.thesis } : {}),
        ...(input.bullCase !== undefined ? { bullCase: input.bullCase } : {}),
        ...(input.bearCase !== undefined ? { bearCase: input.bearCase } : {}),
        ...(input.catalysts !== undefined ? { catalysts: input.catalysts } : {}),
        ...(input.invalidation !== undefined ? { invalidation: input.invalidation } : {}),
        ...(input.targetPrice !== undefined ? { targetPrice: input.targetPrice } : {}),
        ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      }),
    });
    return json(response, {}, requestId);
  }

  if (request.method === 'DELETE') {
    const input = deleteSchema.parse(await readJson<unknown>(request));
    await archiveInvestmentThesis(user.id, input.id);
    return json({ requestId, ok: true }, {}, requestId);
  }

  const url = new URL(request.url);
  const portfolioId = url.searchParams.get('portfolioId') ?? undefined;
  const rawSymbol = url.searchParams.get('symbol');
  const response: ResearchResponse = Object.freeze({
    requestId,
    theses: await listInvestmentTheses(user.id, {
      ...(portfolioId ? { portfolioId: z.string().uuid().parse(portfolioId) } : {}),
      ...(rawSymbol ? { symbol: symbol(rawSymbol) } : {}),
      includeArchived: url.searchParams.get('includeArchived') === 'true',
    }),
    generatedAt: new Date().toISOString(),
  });
  return json(response, {}, requestId);
});
