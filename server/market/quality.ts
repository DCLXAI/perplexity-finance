import { createHash } from 'node:crypto';
import type { AppConfig } from '../config.js';
import type { DataProvenance, DataQualityIncident, ProviderName, RemoteQuotePatch } from '../../src/shared/api.js';
import { recordIncident } from '../ops/incidents.js';
import { assetKind } from './symbols.js';

export interface QuoteValidation {
  readonly valid: boolean;
  readonly freshnessSeconds: number;
  readonly reasons: readonly string[];
}
export interface ReconciledQuote {
  readonly quote?: RemoteQuotePatch;
  readonly warnings: readonly string[];
  readonly incidents: readonly DataQualityIncident[];
  readonly rejectedProviders: readonly ProviderName[];
}

const PROVIDER_PRIORITY: readonly ProviderName[] = Object.freeze(['alpaca', 'coinbase', 'finnhub']);
function priority(provider: ProviderName): number {
  const index = PROVIDER_PRIORITY.indexOf(provider);
  return index < 0 ? PROVIDER_PRIORITY.length : index;
}
function validPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function validateQuoteCandidate(
  quote: RemoteQuotePatch,
  config: AppConfig,
  now = Date.now(),
): QuoteValidation {
  const reasons: string[] = [];
  if (!validPositive(quote.price)) reasons.push('price');
  if (!validPositive(quote.prevClose)) reasons.push('prevClose');
  if (!validPositive(quote.open)) reasons.push('open');
  if (!validPositive(quote.high)) reasons.push('high');
  if (!validPositive(quote.low)) reasons.push('low');
  if (!Number.isFinite(quote.volume) || quote.volume < 0) reasons.push('volume');
  if (quote.low > Math.min(quote.open, quote.price) || quote.high < Math.max(quote.open, quote.price)) {
    reasons.push('ohlc-bounds');
  }
  const timestamp = new Date(quote.asOfISO).getTime();
  if (!Number.isFinite(timestamp)) reasons.push('timestamp');
  const freshnessSeconds = Number.isFinite(timestamp)
    ? Math.max(0, (now - timestamp) / 1000)
    : Number.POSITIVE_INFINITY;
  if (Number.isFinite(timestamp) && timestamp - now > 120_000) reasons.push('future-timestamp');
  const kind = assetKind(quote.symbol);
  const baseMaxAge = kind === 'crypto' ? config.quoteMaxAgeCryptoSeconds : config.quoteMaxAgeStockSeconds;
  const maxAge = baseMaxAge + (quote.provenance.delayedSeconds ?? 0);
  if ((quote.sessionStatus === 'open' || quote.session === 'continuous') && freshnessSeconds > maxAge) {
    reasons.push('stale-open-session');
  }
  return Object.freeze({ valid: reasons.length === 0, freshnessSeconds, reasons: Object.freeze(reasons) });
}

function lineage(symbol: string, candidates: readonly RemoteQuotePatch[]): string {
  const material = candidates
    .map((quote) => `${quote.provenance.source}:${quote.asOfISO}:${quote.price}`)
    .sort()
    .join('|');
  return createHash('sha256').update(`${symbol}|${material}`).digest('hex').slice(0, 24);
}
function withVerification(
  quote: RemoteQuotePatch,
  requestId: string,
  provenance: Omit<DataProvenance, 'verification'> & { verification: NonNullable<DataProvenance['verification']> },
): RemoteQuotePatch {
  return Object.freeze({
    ...quote,
    provenance: Object.freeze({ ...provenance, requestId }),
  });
}
function deviationBps(a: number, b: number): number {
  const denominator = Math.max(Math.abs(a), Math.abs(b), Number.EPSILON);
  return Math.abs(a - b) / denominator * 10_000;
}

export function reconcileQuoteCandidates(
  symbol: string,
  rawCandidates: readonly RemoteQuotePatch[],
  requestId: string,
  config: AppConfig,
  now = Date.now(),
): ReconciledQuote {
  const warnings: string[] = [];
  const incidents: DataQualityIncident[] = [];
  const rejectedProviders: ProviderName[] = [];
  const valid: Array<{ quote: RemoteQuotePatch; validation: QuoteValidation }> = [];

  for (const quote of rawCandidates) {
    const validation = validateQuoteCandidate(quote, config, now);
    if (validation.valid) {
      valid.push({ quote, validation });
      continue;
    }
    rejectedProviders.push(quote.provenance.source);
    incidents.push(recordIncident({
      kind: 'invalid-quote',
      severity: 'warning',
      symbol,
      providers: [quote.provenance.source],
      message: `${quote.provenance.source}의 ${symbol} 시세가 품질 검사를 통과하지 못했습니다.`,
      details: { reasons: validation.reasons.join(','), freshnessSeconds: validation.freshnessSeconds },
    }));
  }

  valid.sort((left, right) => {
    const leftRecoveryPenalty = left.quote.provenance.mode === 'stale' ? 1 : 0;
    const rightRecoveryPenalty = right.quote.provenance.mode === 'stale' ? 1 : 0;
    if (leftRecoveryPenalty !== rightRecoveryPenalty) return leftRecoveryPenalty - rightRecoveryPenalty;
    const source = priority(left.quote.provenance.source) - priority(right.quote.provenance.source);
    return source !== 0
      ? source
      : new Date(right.quote.asOfISO).getTime() - new Date(left.quote.asOfISO).getTime();
  });
  if (!valid.length) {
    return Object.freeze({
      warnings: Object.freeze(warnings),
      incidents: Object.freeze(incidents),
      rejectedProviders: Object.freeze(rejectedProviders),
    });
  }

  const chosen = valid[0];
  const lineageId = lineage(symbol, valid.map((candidate) => candidate.quote));
  if (valid.length === 1) {
    const strategy = chosen.quote.provenance.source === 'alpaca' ? 'single-provider' : 'failover';
    const degraded = chosen.quote.provenance.quality === 'degraded' || chosen.quote.provenance.quality === 'estimated';
    if (strategy === 'failover') warnings.push(`${symbol}은 ${chosen.quote.provenance.source} 보조 공급자를 사용합니다.`);
    const quote = withVerification(chosen.quote, requestId, {
      ...chosen.quote.provenance,
      quality: degraded ? 'degraded' : chosen.quote.provenance.quality,
      verification: Object.freeze({
        strategy,
        providers: Object.freeze([chosen.quote.provenance.source]),
        lineageId,
        freshnessSeconds: chosen.validation.freshnessSeconds,
        decision: degraded ? 'degraded' : chosen.quote.provenance.mode === 'stale' ? 'stale' : 'accepted',
      }),
    });
    return Object.freeze({
      quote,
      warnings: Object.freeze(warnings),
      incidents: Object.freeze(incidents),
      rejectedProviders: Object.freeze(rejectedProviders),
    });
  }

  const peer = valid[1];
  const deviation = deviationBps(chosen.quote.price, peer.quote.price);
  if (deviation <= config.quoteMaxDeviationBps) {
    const quote = withVerification(chosen.quote, requestId, {
      ...chosen.quote.provenance,
      quality: 'verified',
      note: [chosen.quote.provenance.note, `${peer.quote.provenance.source}와 교차 검증됨`].filter(Boolean).join(' · '),
      verification: Object.freeze({
        strategy: 'cross-provider',
        providers: Object.freeze([chosen.quote.provenance.source, peer.quote.provenance.source]),
        lineageId,
        freshnessSeconds: chosen.validation.freshnessSeconds,
        deviationBps: deviation,
        decision: chosen.quote.provenance.mode === 'stale' ? 'stale' : 'accepted',
      }),
    });
    return Object.freeze({
      quote,
      warnings: Object.freeze(warnings),
      incidents: Object.freeze(incidents),
      rejectedProviders: Object.freeze(rejectedProviders),
    });
  }

  const freshest = [...valid].sort(
    (left, right) => new Date(right.quote.asOfISO).getTime() - new Date(left.quote.asOfISO).getTime(),
  )[0];
  const incident = recordIncident({
    kind: 'cross-provider-deviation',
    severity: deviation > config.quoteMaxDeviationBps * 3 ? 'critical' : 'warning',
    symbol,
    providers: [chosen.quote.provenance.source, peer.quote.provenance.source],
    message: `${symbol} 공급자 가격 편차가 허용치를 초과했습니다.`,
    details: {
      deviationBps: Math.round(deviation * 100) / 100,
      thresholdBps: config.quoteMaxDeviationBps,
      selectedProvider: freshest.quote.provenance.source,
    },
  });
  incidents.push(incident);
  warnings.push(`${symbol} 공급자 편차 ${Math.round(deviation)}bp로 최신값을 격리 표시합니다.`);
  const quote = withVerification(freshest.quote, requestId, {
    ...freshest.quote.provenance,
    mode: 'snapshot',
    quality: 'degraded',
    note: `공급자 간 편차 ${Math.round(deviation)}bp로 알림·자동 판단에서 제외됩니다.`,
    verification: Object.freeze({
      strategy: 'cross-provider',
      providers: Object.freeze(valid.map((candidate) => candidate.quote.provenance.source)),
      lineageId,
      freshnessSeconds: freshest.validation.freshnessSeconds,
      deviationBps: deviation,
      decision: 'degraded',
    }),
  });
  return Object.freeze({
    quote,
    warnings: Object.freeze(warnings),
    incidents: Object.freeze(incidents),
    rejectedProviders: Object.freeze(rejectedProviders),
  });
}

export function isAlertEligibleQuote(quote: RemoteQuotePatch): boolean {
  return ['live', 'delayed'].includes(quote.provenance.mode)
    && ['provider', 'verified'].includes(quote.provenance.quality)
    && quote.provenance.verification?.decision !== 'degraded'
    && quote.provenance.verification?.decision !== 'rejected';
}
