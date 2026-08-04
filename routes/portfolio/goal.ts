import { z } from 'zod';
import { requireUser } from '../../server/auth/supabase.js';
import { clientIp, json, readJson, withFunction } from '../../server/http/function.js';
import {
  getPortfolioGoalView,
  savePortfolioGoal,
  transitionPortfolioGoal,
} from '../../server/portfolio/contribution-service.js';
import { enforceRateLimit } from '../../server/rate-limit.js';
import type {
  PortfolioGoalMutationResponse,
  PortfolioGoalResponse,
} from '../../src/shared/api.js';

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식이어야 합니다.')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, '유효한 날짜여야 합니다.');

const currentOrFutureDateSchema = calendarDateSchema.refine(
  (value) => value >= new Date().toISOString().slice(0, 10),
  '목표 날짜는 오늘 이후여야 합니다.',
);

const moneySchema = z.number().finite().min(0.01).max(Number.MAX_SAFE_INTEGER / 100)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7,
    '금액은 센트 단위까지 입력해야 합니다.',
  );

const saveSchema = z.object({
  portfolioId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  targetAmount: moneySchema,
  targetDate: currentOrFutureDateSchema,
  expectedAnnualReturnPct: z.number().min(-50).max(50).finite(),
  contributionAmount: moneySchema,
  contributionDay: z.number().int().min(1).max(28),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
}).strict();

const transitionSchema = z.object({
  goalId: z.string().uuid(),
  action: z.enum(['pause', 'resume', 'archive', 'complete']),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict();

export default withFunction('portfolio.goal', ['GET', 'PUT', 'PATCH'], async (request, requestId) => {
  const user = await requireUser(request);
  await enforceRateLimit('portfolio-goal', `${user.id}:${clientIp(request)}`, 120, 60);

  if (request.method === 'PUT') {
    const input = saveSchema.parse(await readJson<unknown>(request));
    const response: PortfolioGoalMutationResponse = Object.freeze({
      requestId,
      goal: await savePortfolioGoal(user.id, input),
    });
    return json(response, {}, requestId);
  }

  if (request.method === 'PATCH') {
    const input = transitionSchema.parse(await readJson<unknown>(request));
    const response: PortfolioGoalMutationResponse = Object.freeze({
      requestId,
      goal: await transitionPortfolioGoal(
        user.id,
        input.goalId,
        input.action,
        input.expectedUpdatedAt,
        requestId,
      ),
    });
    return json(response, {}, requestId);
  }

  const portfolioId = z.string().uuid().parse(new URL(request.url).searchParams.get('portfolioId'));
  const view = await getPortfolioGoalView(user.id, portfolioId, requestId);
  const response: PortfolioGoalResponse = Object.freeze({
    requestId,
    goal: view.goal,
    projection: view.projection,
    generatedAt: new Date().toISOString(),
  });
  return json(response, {}, requestId);
});
