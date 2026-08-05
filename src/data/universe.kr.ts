/* ============================================================
   Korean (KRX) asset universe seed.

   MINIMAL STUB for Task 4 (P11): exactly the two rows the engine
   cross-region test needs to resolve (005930, 000660). Task 5 fills
   this out to the full KRX universe and adds `KR_SECTORS` (see the
   placeholder note in `universe.ts`'s `SECTORS_BY_REGION`).

   Row-tuple shape mirrors `universe.ts`'s `StockRow`, so Task 5 can
   extend `KR_STOCKS` in place rather than reshaping it:
     [code, name, nameKo, sectorId, marketCapTrillionKrw, priceKrw, dayChangePct]
   `marketCapTrillionKrw` is trillions of KRW (조원) — the KR analogue of the
   US rows' `capB` ($B) column, and the number a human can check against a
   Korean quote page. `price` stays in raw KRW (`unit: 'KRW'` — display
   renders it natively via `fmtKrw`/`fmtKrwCompact`).

   `AssetMeta.marketCap`, however, is documented in types.ts as USD and is
   compared across the whole engine (heatmap weighting, movers, search
   ranking) via `getAll()`/`getStocks()`/etc, which span both regions. A
   raw-won marketCap would out-rank every US mega-cap by ~100x on unit alone.
   So the authored trillion-KRW column is converted to USD once, here, via
   the single `KRW_PER_USD` constant below — never re-derive it elsewhere.
   ============================================================ */
import type { SectorId } from './types.js';
import type { SeedAsset } from './universe.js';

/**
 * Illustrative KRW/USD spot rate for this synthetic seed, as of the
 * 2026-08-04 snapshot window used by `SNAPSHOT.asOfISO` in universe.ts.
 * Not a sourced/verified rate — same demo status as the rest of this file.
 * The only place a KRW->USD marketCap conversion happens; do not scatter
 * this constant or a re-derived rate into consumers. Exported so a future
 * KR-native display (Task 8-10) can reverse the conversion for won-facing
 * UI (e.g. `fmtKrwCompact(quote.marketCap * KRW_PER_USD)`) against this same
 * rate, instead of hardcoding a second one.
 */
export const KRW_PER_USD = 1_392.5;

/** [code, name, nameKo, sectorId, marketCapTrillionKrw, priceKrw, dayChangePct] */
type KrStockRow = [string, string, string, SectorId, number, number, number];

const KR_STOCKS: KrStockRow[] = [
  ['005930', 'Samsung Electronics Co., Ltd.', '삼성전자', 'tech', 550, 92000, 1.24],
  ['000660', 'SK hynix Inc.', 'SK하이닉스', 'tech', 330, 452000, 2.87],
];

function krStockAsset([code, name, nameKo, sectorId, capT, price, changePct]: KrStockRow): SeedAsset {
  return {
    symbol: code,
    name,
    nameKo,
    exchange: 'KRX',
    kind: 'stock',
    unit: 'KRW',
    region: 'KR',
    sectorId,
    // capT is trillions of won (조원); marketCap must be USD (see AssetMeta's
    // doc comment) — convert once, here, via KRW_PER_USD.
    marketCap: (capT * 1e12) / KRW_PER_USD,
    price,
    changePct,
    logoBg: '#20808d',
    logoText: nameKo.slice(0, 1),
  };
}

/** KR seed assets merged into the engine's asset map. Task 5 expands this list. */
export const KR_SEED_ASSETS: SeedAsset[] = KR_STOCKS.map(krStockAsset);
