import { z } from 'zod';
import { requireUser } from '../server/auth/supabase.js';
import {
  countActiveAlerts,
  createAlert,
  deleteAlert,
  listAlerts,
  markAlertsSeen,
} from '../server/cloud/store.js';
import { loadConfig } from '../server/config.js';
import { ApiError, clientIp, json, readJson, withFunction } from '../server/http/function.js';
import { getMarketQuotes } from '../server/market/service.js';
import { sanitizeSymbols } from '../server/market/catalog.js';
import { isAlertEligibleQuote } from '../server/market/quality.js';
import { enforceRateLimit } from '../server/rate-limit.js';
import type { AlertsResponse } from '../src/shared/api.js';

const createSchema = z.object({
  symbol: z.string().min(1).max(20),
  condition: z.enum(['above', 'below']),
  target: z.number().positive().finite(),
  emailEnabled: z.boolean().default(false),
  pushEnabled: z.boolean().default(false),
});
const patchSchema = z.object({ action: z.literal('seen') });

export default withFunction('alerts', ['GET', 'POST', 'PATCH', 'DELETE'], async (request, requestId) => {
  const user = await requireUser(request);
  await enforceRateLimit('alerts', `${user.id}:${clientIp(request)}`, 120, 60);

  if (request.method === 'POST') {
    const input = createSchema.parse(await readJson(request));
    const symbol = sanitizeSymbols([input.symbol], 1)[0];
    if (!symbol) throw new ApiError(400, 'UNKNOWN_SYMBOL', '지원하지 않는 심볼입니다.');
    const config = loadConfig();
    if (await countActiveAlerts(user.id) >= config.alertMaxPerUser) {
      throw new ApiError(409, 'ALERT_LIMIT_REACHED', `사용자당 활성 알림은 최대 ${config.alertMaxPerUser}개입니다.`);
    }
    if (input.emailEnabled && (!config.resendApiKey || !config.alertEmailFrom)) {
      throw new ApiError(503, 'EMAIL_NOT_CONFIGURED', '이메일 전달이 설정되지 않았습니다.');
    }
    if (input.pushEnabled && (!config.vapidPublicKey || !config.vapidPrivateKey)) {
      throw new ApiError(503, 'PUSH_NOT_CONFIGURED', '브라우저 푸시가 설정되지 않았습니다.');
    }
    const market = await getMarketQuotes([symbol], requestId);
    const quote = market.quotes.find((candidate) => candidate.symbol === symbol);
    if (!quote || !isAlertEligibleQuote(quote)) {
      throw new ApiError(503, 'VERIFIED_QUOTE_REQUIRED', '검증된 실시간 또는 지연 시세가 없어 서버 알림을 만들 수 없습니다.');
    }
    const alert = await createAlert(user.id, {
      symbol,
      condition: input.condition,
      target: input.target,
      baseline: quote.price,
      emailEnabled: input.emailEnabled,
      pushEnabled: input.pushEnabled,
    });
    return json({ requestId, alert }, { status: 201 }, requestId);
  }
  if (request.method === 'PATCH') {
    patchSchema.parse(await readJson(request));
    await markAlertsSeen(user.id);
    return json({ requestId, ok: true }, {}, requestId);
  }
  if (request.method === 'DELETE') {
    const id = z.string().uuid().parse(new URL(request.url).searchParams.get('id'));
    await deleteAlert(user.id, id);
    return json({ requestId, ok: true }, {}, requestId);
  }
  const response: AlertsResponse = Object.freeze({
    requestId,
    alerts: await listAlerts(user.id),
    generatedAt: new Date().toISOString(),
  });
  return json(response, {}, requestId);
});
