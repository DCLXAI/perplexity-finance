import { getEarnings } from '../server/content/service.js';
import { clientIp, json, withFunction } from '../server/http/function.js';
import { enforceRateLimit } from '../server/rate-limit.js';

export default withFunction('earnings', ['GET'], async (request, requestId) => {
  await enforceRateLimit('earnings', clientIp(request), 60, 60);
  return json(
    await getEarnings(requestId),
    { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=1800' } },
    requestId,
  );
});
