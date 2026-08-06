/* ============================================================
   Core data types for the market engine & static content
   ============================================================ */
import type { DataProvenance } from '../shared/api.js';
import type { MarketRegion } from './region.js';


export type SectorId =
  | 'tech'
  | 'comm'
  | 'fin'
  | 'cons-cyc'
  | 'cons-def'
  | 'energy'
  | 'industrials'
  | 'healthcare'
  | 'materials'
  | 'utilities'
  | 'realestate';

export interface SectorInfo {
  id: SectorId;
  nameKo: string;
  nameEn: string;
  /** index level shown in the sector widget */
  indexValue: number;
  changePct: number;
}

export type AssetKind = 'stock' | 'index' | 'future' | 'crypto' | 'etf';
export type InstrumentUnit = 'USD' | 'KRW' | 'POINTS' | 'PERCENT' | 'USD_PER_OZ' | 'USD_PER_BBL';
export type MarketSessionKind = 'regular' | 'continuous' | 'after-hours';
export type MarketSessionStatus = 'open' | 'closed';

export interface AssetMeta {
  readonly symbol: string;
  readonly name: string;
  readonly nameKo?: string;
  readonly exchange: string;
  readonly kind: AssetKind;
  readonly unit: InstrumentUnit;
  /** Which market lists this asset. Drives the trading calendar and the price unit. */
  readonly region: MarketRegion;
  readonly sectorId?: SectorId;
  /** market cap in USD (stocks/crypto), used for heatmap weighting */
  readonly marketCap?: number;
  readonly logoBg?: string;
  readonly logoText?: string;
}

/**
 * Immutable statistics for one market session. Keeping this separate prevents
 * regular-close, extended-hours and 24/7 values from being silently merged.
 */
export interface QuoteSessionSnapshot {
  readonly kind: MarketSessionKind;
  readonly status: MarketSessionStatus;
  readonly asOfISO: string;
  readonly price: number;
  readonly volume: number;
  readonly high: number;
  readonly low: number;
  readonly open: number;
}

export interface Quote extends AssetMeta {
  readonly price: number;
  readonly prevClose: number;
  readonly change: number;
  readonly changePct: number;
  readonly volume: number;
  readonly dayHigh: number;
  readonly dayLow: number;
  readonly open: number;
  readonly spark: readonly number[];
  /** monotonically increasing per-symbol revision */
  readonly seq: number;
  readonly provenance: DataProvenance;
  readonly sessions: Readonly<{
    regular?: QuoteSessionSnapshot;
    continuous?: QuoteSessionSnapshot;
    afterHours?: QuoteSessionSnapshot;
  }>;
}

/** One publication per simulation tick, regardless of changed symbol count. */
export interface MarketBatch {
  readonly sequence: number;
  readonly occurredAt: number;
  readonly asOfISO: string;
  readonly changedSymbols: readonly string[];
  readonly quotes: readonly Quote[];
}

export interface CandlePoint {
  /** unix seconds */
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
  readonly provenance?: DataProvenance;
}

export type HistoryRange = '1D' | '5D' | '7D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y';

/* ---------- Static editorial content ---------- */

export interface MarketSummaryItem {
  id: string;
  title: string;
  body: string;
  sources: number;
}

export interface ExploreCard {
  id: string;
  title: string;
  sources: number;
  /** css gradient string used as the visual */
  gradient: string;
  /** inline svg scene id rendered on the card (see ui/CardArt) */
  art: 'fab' | 'refinery' | 'imf' | 'chips' | 'bank' | 'oil' | 'housing' | 'gold' | 'satellite' | 'grid';
}

export interface PredictionOutcome {
  label: string;
  prob: number;      // 0-100
  deltaPct: number;  // day change of probability, signed
}

export interface PredictionMarket {
  id: string;
  question: string;
  questionKo: string;
  outcomes: PredictionOutcome[];
  volumeUsd: number;
  extraCount?: number;
  source: 'Polymarket-style' | 'Kalshi-style';
  category: 'macro' | 'earnings' | 'crypto' | 'politics' | 'commodities' | 'tech';
  endsAt: string; // e.g. '2026-07-31'
}

export interface EarningsEntry {
  symbol: string;
  company: string;
  fiscalLabel: string;   // '2026년 Q2'
  timeLabel: string;     // '오전 5:45'
  session: 'pre' | 'post' | 'during';
  dateISO: string;       // '2026-07-16'
  epsEst?: number;
  revenueEst?: string;   // '$2.82B'
  bullets: string[];
  logoBg: string;
  logoText: string;
}

export interface EarningsDay {
  dateISO: string;
  weekdayKo: string; // '일','월','화','수','목','금','토'
  label: string;     // '7월 12일'
  count: number;
  logos: string[];   // symbols to preview on the chip
}

export interface PoliticianTrade {
  id: string;
  politician: string;
  party: '민주당' | '공화당';
  chamber: '하원' | '상원';
  state: string;
  symbol: string;
  company: string;
  action: '매수' | '매도';
  amountRange: string;   // '$100K – $250K'
  tradedISO: string;
  disclosedISO: string;
  sincePct: number;      // return since trade
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  timeAgo: string;
  symbols: string[];
}

export interface AppGalleryItem {
  id: string;
  nameKo: string;
  description: string;
  icon: string; // emoji
  category: string;
}
