import { z } from 'zod';
import { requireUser } from '../server/auth/supabase.js';
import { getWatchlist, saveWatchlist } from '../server/cloud/store.js';
import { clientIp, json, readJson, withFunction } from '../server/http/function.js';
import { sanitizeSymbols } from '../server/market/catalog.js';
import { enforceRateLimit } from '../server/rate-limit.js';
import type { WatchlistResponse } from '../src/shared/api.js';

const schema = z.object({ symbols: z.array(z.string()).max(100) });

export default withFunction('watchlist', ['GET', 'PUT'], async (request, requestId) => {
  const user = await requireUser(request);
  await enforceRateLimit('watchlist', `${user.id}:${clientIp(request)}`, 180, 60);
  const value = request.method === 'PUT'
    ? await saveWatchlist(
        user.id,
        sanitizeSymbols(schema.parse(await readJson(request)).symbols, 100),
      )
    : await getWatchlist(user.id);
  const response: WatchlistResponse = Object.freeze({
    requestId,
    symbols: value.symbols,
    updatedAt: value.updatedAt,
    version: 1,
  });
  return json(response, {}, requestId);
});
