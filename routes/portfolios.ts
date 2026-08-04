import { z } from 'zod';
import { requireUser } from '../server/auth/supabase.js';
import { clientIp, json, readJson, withFunction } from '../server/http/function.js';
import {
  countActivePortfolios,
  createPortfolio,
  listPortfolios,
  updatePortfolio,
} from '../server/portfolio/store.js';
import { enforceRateLimit } from '../server/rate-limit.js';
import type { PortfolioMutationResponse, PortfoliosResponse } from '../src/shared/api.js';

const createSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();
const patchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  status: z.enum(['active', 'archived']).optional(),
}).strict().refine((value) => value.name !== undefined || value.status !== undefined, '수정할 필드가 필요합니다.');

export default withFunction('portfolios', ['GET', 'POST', 'PATCH'], async (request, requestId) => {
  const user = await requireUser(request);
  await enforceRateLimit('portfolios', `${user.id}:${clientIp(request)}`, 120, 60);

  if (request.method === 'POST') {
    const input = createSchema.parse(await readJson<unknown>(request));
    if (await countActivePortfolios(user.id) >= 10) {
      return json({ error: { code: 'PORTFOLIO_LIMIT_REACHED', message: '활성 포트폴리오는 최대 10개입니다.', requestId } }, { status: 409 }, requestId);
    }
    const response: PortfolioMutationResponse = Object.freeze({
      requestId,
      portfolio: await createPortfolio(user.id, input.name),
    });
    return json(response, { status: 201 }, requestId);
  }

  if (request.method === 'PATCH') {
    const input = patchSchema.parse(await readJson<unknown>(request));
    const response: PortfolioMutationResponse = Object.freeze({
      requestId,
      portfolio: await updatePortfolio(user.id, input.id, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      }),
    });
    return json(response, {}, requestId);
  }

  const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
  const response: PortfoliosResponse = Object.freeze({
    requestId,
    portfolios: await listPortfolios(user.id, includeArchived),
    generatedAt: new Date().toISOString(),
  });
  return json(response, {}, requestId);
});
