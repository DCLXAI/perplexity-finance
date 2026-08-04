import { getNews } from '../server/content/service.js';
import { clientIp, json, withFunction } from '../server/http/function.js';
import { sanitizeSymbols } from '../server/market/catalog.js';
import { enforceRateLimit } from '../server/rate-limit.js';

export default withFunction('news', ['GET'], async (request, requestId) => {
  await enforceRateLimit('news', clientIp(request), 120, 60);
  const url = new URL(request.url);
  const raw = url.searchParams.get('symbol');
  const symbol = raw ? sanitizeSymbols([raw], 1)[0] : undefined;
  const requested = Number(url.searchParams.get('limit') ?? 8);
  const limit = Math.max(1, Math.min(20, Number.isFinite(requested) ? requested : 8));
  return json(
    await getNews(symbol, limit, requestId),
    { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=180' } },
    requestId,
  );
});
