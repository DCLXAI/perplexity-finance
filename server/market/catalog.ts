import { engine } from '../../src/data/engine.js';
import type { RemoteQuotePatch } from '../../src/shared/api.js';

const known = new Map(engine.getAll().map((quote) => [quote.symbol, quote]));

export function sanitizeSymbols(raw: readonly string[], limit = 50): readonly string[] {
  const out: string[] = [];
  for (const value of raw) {
    const symbol = value.trim().toUpperCase();
    if (known.has(symbol) && !out.includes(symbol)) out.push(symbol);
    if (out.length >= limit) break;
  }
  return Object.freeze(out);
}
export function catalogQuote(symbol: string) {
  return known.get(symbol);
}
export function fallbackQuote(symbol: string, requestId: string): RemoteQuotePatch | undefined {
  const quote = known.get(symbol);
  if (!quote) return undefined;
  const active = quote.kind === 'crypto' ? quote.sessions.continuous : quote.sessions.regular;
  const asOfISO = active?.asOfISO ?? new Date().toISOString();
  return Object.freeze({
    symbol: quote.symbol,
    price: quote.price,
    prevClose: quote.prevClose,
    open: quote.open,
    high: quote.dayHigh,
    low: quote.dayLow,
    volume: quote.volume,
    marketCap: quote.marketCap,
    asOfISO,
    session: quote.kind === 'crypto' ? 'continuous' : 'regular',
    sessionStatus: quote.kind === 'crypto' ? 'open' : 'closed',
    provenance: Object.freeze({
      source: 'local-simulation',
      sourceLabel: 'P1 결정론적 로컬 엔진',
      mode: 'fallback',
      quality: 'synthetic',
      providerTimestamp: asOfISO,
      ingestedAt: new Date().toISOString(),
      feed: 'deterministic-local',
      requestId,
      note: '외부 공급자 응답이 없어 사용하는 명시적 폴백입니다.',
      verification: Object.freeze({
        strategy: 'synthetic',
        providers: Object.freeze(['local-simulation' as const]),
        lineageId: globalThis.crypto.randomUUID(),
        freshnessSeconds: 0,
        decision: 'degraded',
      }),
    }),
  });
}
export function fallbackQuotes(symbols: readonly string[], requestId: string): readonly RemoteQuotePatch[] {
  return Object.freeze(symbols.flatMap((symbol) => {
    const quote = fallbackQuote(symbol, requestId);
    return quote ? [quote] : [];
  }));
}
