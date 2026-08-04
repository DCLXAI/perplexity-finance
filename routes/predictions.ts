import { getPredictions } from '../server/content/service.js';
import { clientIp, json, withFunction } from '../server/http/function.js';
import { enforceRateLimit } from '../server/rate-limit.js';

export default withFunction('predictions', ['GET'], async (request, requestId) => {
  await enforceRateLimit('predictions', clientIp(request), 90, 60);
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 10);
  return json(
    await getPredictions(Number.isFinite(limit) ? limit : 10, requestId),
    { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' } },
    requestId,
  );
});
