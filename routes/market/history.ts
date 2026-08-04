import { z } from 'zod';
import { clientIp, json, withFunction } from '../../server/http/function.js';
import { getMarketHistory } from '../../server/market/service.js';
import { enforceRateLimit } from '../../server/rate-limit.js';
import type { HistoryRange } from '../../src/data/types.js';

const range = z.enum(['1D', '5D', '7D', '1M', '6M', 'YTD', '1Y', '5Y']);

export default withFunction('market.history', ['GET'], async (request, requestId) => {
  await enforceRateLimit('market-history', clientIp(request), 90, 60);
  const url = new URL(request.url);
  const symbol = z.string().min(1).max(20).parse(url.searchParams.get('symbol'));
  const selected = range.parse(url.searchParams.get('range'));
  const response = await getMarketHistory(symbol, selected as HistoryRange, requestId);
  return json(
    response,
    { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
    requestId,
  );
});
