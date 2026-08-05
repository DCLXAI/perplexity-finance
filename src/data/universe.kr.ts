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
   US rows' `capB` ($B) column — multiplied out to raw won below, the same
   way `capB * 1e9` works for US rows.
   ============================================================ */
import type { SectorId } from './types.js';
import type { SeedAsset } from './universe.js';

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
    marketCap: capT * 1e12,
    price,
    changePct,
    logoBg: '#20808d',
    logoText: nameKo.slice(0, 1),
  };
}

/** KR seed assets merged into the engine's asset map. Task 5 expands this list. */
export const KR_SEED_ASSETS: SeedAsset[] = KR_STOCKS.map(krStockAsset);
