import { clientIp, json, withFunction } from '../../server/http/function.js';
import { getMarketQuotes } from '../../server/market/service.js';
import { enforceRateLimit } from '../../server/rate-limit.js';

export default withFunction('market.quotes', ['GET'], async (request, requestId) => {
  await enforceRateLimit('market-quotes', clientIp(request), 180, 60);
  const raw = new URL(request.url).searchParams.get('symbols') ?? '';
  const response = await getMarketQuotes(raw.split(','), requestId);
  return json(
    response,
    { headers: { 'Cache-Control': 'public, max-age=5, stale-while-revalidate=15' } },
    requestId,
  );
});
