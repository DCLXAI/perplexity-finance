import { z } from 'zod';
import { clientIp, json, readJson, withFunction } from '../server/http/function.js';
import { logger } from '../server/observability/logger.js';
import { metrics } from '../server/observability/metrics.js';
import { enforceRateLimit } from '../server/rate-limit.js';

const FORBIDDEN_PROPERTY = /(email|name|phone|address|token|secret|auth|cookie|password|query|prompt|message|body|endpoint|p256dh)/i;
const scalar = z.union([z.string().max(200), z.number().finite(), z.boolean(), z.null()]);
const schema = z.object({
  event: z.string().regex(/^[a-z0-9_.-]{1,80}$/),
  route: z.string().regex(/^\/[A-Za-z0-9_./:-]{0,199}$/).optional(),
  properties: z.record(z.string().regex(/^[a-zA-Z0-9_.-]{1,60}$/), scalar).optional(),
}).strict();

export default withFunction('telemetry', ['POST'], async (request, requestId) => {
  await enforceRateLimit('telemetry', clientIp(request), 120, 60);
  const input = schema.parse(await readJson(request, 8_192));
  const properties = Object.fromEntries(
    Object.entries(input.properties ?? {})
      .filter(([key]) => !FORBIDDEN_PROPERTY.test(key))
      .slice(0, 20),
  );
  metrics.increment('client_events_total', { event: input.event });
  logger.info('client.event', { event: input.event, route: input.route, properties });
  return json({ requestId, accepted: true }, { status: 202 }, requestId);
});
