import { supabaseConfigured } from '../../server/auth/supabase.js';
import {
  insertMarketObservations,
  insertProviderHealthSnapshots,
  listOperationalSymbols,
  upsertIncidents,
  writeHeartbeat,
} from '../../server/cloud/store.js';
import { loadConfig } from '../../server/config.js';
import { ApiError, json, requireCronSecret, withFunction } from '../../server/http/function.js';
import { getMarketQuotes, marketProviderStatuses } from '../../server/market/service.js';
import { isAlertEligibleQuote } from '../../server/market/quality.js';
import { recentIncidents } from '../../server/ops/incidents.js';
import type { CaptureMarketResponse } from '../../src/shared/api.js';

const DEFAULT_SYMBOLS = Object.freeze(['AMD', 'NVDA', 'AAPL', 'BTCUSD', 'ETHUSD']);

export default withFunction('cron.capture-market', ['GET'], async (request, requestId) => {
  requireCronSecret(request);
  if (!supabaseConfigured()) throw new ApiError(503, 'CLOUD_NOT_CONFIGURED', '시장 관측 원장이 설정되지 않았습니다.');
  const config = loadConfig();
  const operational = await listOperationalSymbols(config.marketCaptureLimit);
  const symbols = Object.freeze([...new Set([...DEFAULT_SYMBOLS, ...operational])].slice(0, config.marketCaptureLimit));
  const response = await getMarketQuotes(symbols, requestId);
  const accepted = response.quotes.filter(isAlertEligibleQuote);
  const incidents = recentIncidents(100);
  const [acceptedObservations, persistedIncidents] = await Promise.all([
    insertMarketObservations(accepted),
    upsertIncidents(incidents),
  ]);
  const providers = marketProviderStatuses();
  await Promise.all([
    insertProviderHealthSnapshots(providers),
    writeHeartbeat('market-capture', {
      requestId,
      requestedSymbols: symbols.length,
      returnedQuotes: response.quotes.length,
      acceptedObservations,
      persistedIncidents,
      mode: response.mode,
      providers,
    }),
  ]);
  const result: CaptureMarketResponse = Object.freeze({
    requestId,
    requestedSymbols: symbols.length,
    acceptedObservations,
    rejectedObservations: Math.max(0, symbols.length - accepted.length),
    persistedIncidents,
    generatedAt: new Date().toISOString(),
  });
  return json(result, {}, requestId);
});
