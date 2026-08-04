import { z } from 'zod';
import { requireUser } from '../server/auth/supabase.js';
import { deletePushSubscription, savePushSubscription } from '../server/cloud/store.js';
import { clientIp, json, readJson, withFunction } from '../server/http/function.js';
import { enforceRateLimit } from '../server/rate-limit.js';

const schema = z.object({
  endpoint: z.string().url().max(4096),
  expirationTime: z.number().nullable(),
  keys: z.object({ p256dh: z.string().min(1).max(1024), auth: z.string().min(1).max(1024) }),
});

export default withFunction('push', ['POST', 'DELETE'], async (request, requestId) => {
  const user = await requireUser(request);
  await enforceRateLimit('push', `${user.id}:${clientIp(request)}`, 30, 600);
  const input = schema.parse(await readJson(request, 16_384));
  if (request.method === 'POST') await savePushSubscription(user.id, input);
  else await deletePushSubscription(user.id, input.endpoint);
  return json({ requestId, ok: true }, {}, requestId);
});
