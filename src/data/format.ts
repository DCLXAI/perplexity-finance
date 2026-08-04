/* ============================================================
   Number / label formatting helpers.
   Price units are explicit so indices and futures are not rendered
   as if every instrument were a US-dollar cash asset.
   ============================================================ */
import type { InstrumentUnit, Quote } from './types.js';

export function fmtPrice(value: number): string {
  if (value >= 1) {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (value >= 0.01) return value.toFixed(4);
  return value.toPrecision(2);
}

export function fmtUsd(value: number): string {
  return `US$${fmtPrice(value)}`;
}

export function fmtPct(value: number, opts: { sign?: boolean } = {}): string {
  const sign = opts.sign === false ? '' : value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function fmtChange(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}US$${fmtPrice(Math.abs(value))}`;
}

export function fmtInstrumentValue(unit: InstrumentUnit, value: number): string {
  if (unit === 'POINTS') return `${fmtPrice(value)} pt`;
  if (unit === 'PERCENT') return `${fmtPrice(value)}%`;
  if (unit === 'USD_PER_OZ') return `${fmtUsd(value)}/oz`;
  if (unit === 'USD_PER_BBL') return `${fmtUsd(value)}/bbl`;
  return fmtUsd(value);
}

export function fmtInstrumentChange(unit: InstrumentUnit, value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const magnitude = Math.abs(value);
  if (unit === 'POINTS') return `${sign}${fmtPrice(magnitude)} pt`;
  if (unit === 'PERCENT') return `${sign}${fmtPrice(magnitude)}%p`;
  if (unit === 'USD_PER_OZ') return `${sign}${fmtUsd(magnitude)}/oz`;
  if (unit === 'USD_PER_BBL') return `${sign}${fmtUsd(magnitude)}/bbl`;
  return `${sign}${fmtUsd(magnitude)}`;
}

export function fmtQuoteValue(quote: Pick<Quote, 'unit'>, value: number): string {
  return fmtInstrumentValue(quote.unit, value);
}

export function fmtQuoteChange(quote: Pick<Quote, 'unit'>, value: number): string {
  return fmtInstrumentChange(quote.unit, value);
}

/** 1_268_000_000_000 → '1.27조', 66_000_000_000 → '660.0억'. */
export function fmtCapKo(value: number): string {
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}조`;
  if (value >= 1e8) return `${(value / 1e8).toFixed(1)}억`;
  if (value >= 1e4) return `${(value / 1e4).toFixed(1)}만`;
  return value.toFixed(0);
}

/** US-style compact: 1.27T / 662.0B / 35.2M. */
export function fmtCompact(value: number): string {
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

export function fmtUsdCompact(value: number): string {
  return `US$${fmtCompact(value)}`;
}

export function fmtAssetVolume(quote: Pick<Quote, 'kind' | 'symbol'>, value: number): string {
  if (quote.kind === 'index') return '—';
  if (quote.kind === 'future') return `${fmtCompact(value)}계약`;
  if (quote.kind === 'crypto') return `${fmtCompact(value)} ${quote.symbol.replace(/USD$/, '')}`;
  return `${fmtCompact(value)}주`;
}

/** Backward-compatible alias; prediction volume is a USD notional, not “권”. */
export function fmtVolumeKwon(value: number): string {
  return fmtUsdCompact(value);
}

export function fmtDateKo(iso: string): string {
  const date = new Date(iso + (iso.length <= 10 ? 'T00:00:00' : ''));
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function weekdayKo(iso: string): string {
  const date = new Date(iso + (iso.length <= 10 ? 'T00:00:00' : ''));
  return WEEKDAYS_KO[date.getDay()];
}

export function clsx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
