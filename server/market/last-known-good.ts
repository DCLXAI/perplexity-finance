import type { RemoteQuotePatch } from '../../src/shared/api.js';
import { cacheGet, cacheSet } from '../cache.js';
import { loadConfig } from '../config.js';

interface StoredQuote {
  readonly quote: RemoteQuotePatch;
  readonly storedAt: string;
}
function key(symbol: string): string {
  return `market:lkg:v1:${symbol}`;
}
export async function storeLastKnownGood(quote: RemoteQuotePatch): Promise<void> {
  if (!['live', 'delayed', 'snapshot'].includes(quote.provenance.mode)) return;
  if (!['provider', 'verified'].includes(quote.provenance.quality)) return;
  await cacheSet<StoredQuote>(key(quote.symbol), {
    quote,
    storedAt: new Date().toISOString(),
  }, loadConfig().lastKnownGoodSeconds);
}
export async function getLastKnownGood(symbol: string, requestId: string): Promise<RemoteQuotePatch | null> {
  const stored = await cacheGet<StoredQuote>(key(symbol));
  if (!stored) return null;
  const now = new Date().toISOString();
  return Object.freeze({
    ...stored.quote,
    provenance: Object.freeze({
      ...stored.quote.provenance,
      mode: 'stale',
      quality: 'verified',
      requestId,
      ingestedAt: now,
      note: `공급자 장애로 ${stored.storedAt}에 저장한 마지막 검증값을 유지합니다.`,
      verification: Object.freeze({
        strategy: 'last-known-good',
        providers: Object.freeze([stored.quote.provenance.source]),
        lineageId: stored.quote.provenance.verification?.lineageId ?? `${symbol}:${stored.quote.asOfISO}`,
        freshnessSeconds: Math.max(0, (Date.now() - new Date(stored.quote.asOfISO).getTime()) / 1000),
        decision: 'stale',
      }),
    }),
  });
}
