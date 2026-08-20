/* ============================================================
   Korean (KRX) asset universe seed.

   Filled out for Task 5 (P11) to the top ~150 KRX listings by market cap,
   plus five market benchmarks (KOSPI, KOSDAQ, KOSPI200, USD/KRW, VKOSPI).
   Sourced from stockanalysis.com's KRX ranked list and quote pages, with
   companiesmarketcap.com and investing.com used as an independent second
   source for corroboration. See `scripts/fetch-kr-seed.mjs` and
   `.superpowers/sdd/2026-08-05-p11-korean-market/task-5-report.md` for the
   full sourcing method and the list of candidates dropped for lack of
   corroboration (dropped rather than guessed — a missing row is honest,
   a wrong one is not).

   Equities are a 2026-08-05 KRX-close capture (`SNAPSHOT.krAsOfISO`), one
   session after the 2026-08-04 US close `SNAPSHOT.asOfISO` anchors — the two
   markets were never going to line up to the same instant, so this gets its
   own field exactly as crypto's `cryptoAsOfISO` already does. The five index/
   FX benchmarks are the same 2026-08-05 KRX session close; no separate field
   was needed for them since every source agreed on that same trading day.

   2026-08-07 partial refresh (`.superpowers/refresh-2026-08-07-kr.md`): 18 of
   the 20 priority stocks plus all five index/FX benchmarks were re-verified
   against a settled 2026-08-07 15:30 KST close and now carry their own
   row-level `asOfISO` (`KR_ASOF_ISO`, below — equal to the bumped
   `SNAPSHOT.krAsOfISO`). Kakao (035720) and NAVER (035420) were deliberately
   left at their 2026-08-05 figures — see the inline comments on those rows.
   Every other row in this file is still the original 2026-08-05 capture;
   `KR_PREV_ASOF_ISO` is what engine.ts falls back to for those, so bumping
   `SNAPSHOT.krAsOfISO` forward doesn't relabel them as 08-07 data they
   aren't.

   Row-tuple shape mirrors `universe.ts`'s `StockRow`:
     [code, name, nameKo, sectorId, marketCapTrillionKrw, priceKrw, dayChangePct, asOfISO?]
   `marketCapTrillionKrw` is trillions of KRW (조원) — the KR analogue of the
   US rows' `capB` ($B) column, and the number a human can check against a
   Korean quote page. `price` stays in raw KRW (`unit: 'KRW'` — display
   renders it natively via `fmtKrw`/`fmtKrwCompact`). No won market-cap
   figures were found in the 08-07 research, so `marketCapTrillionKrw` is
   unchanged for every row, refreshed or not.

   `AssetMeta.marketCap`, however, is documented in types.ts as USD and is
   compared across the whole engine (heatmap weighting, movers, search
   ranking) via `getAll()`/`getStocks()`/etc, which span both regions. A
   raw-won marketCap would out-rank every US mega-cap by ~100x on unit alone.
   So the authored trillion-KRW column is converted to USD once, here, via
   the single `KRW_PER_USD` constant below — never re-derive it elsewhere.
   ============================================================ */
import type { AssetKind, InstrumentUnit, SectorId, SectorInfo } from './types.js';
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

/**
 * 2026-08-07 seed refresh (see `.superpowers/refresh-2026-08-07-kr.md`). KRX closed normally
 * at 15:30 KST that Friday — one session after this file's original 2026-08-05 anchor, not
 * the same day as the US refresh below (US markets hadn't closed 08-07 yet when researched;
 * see `US_ASOF_ISO` in universe.ts). `KR_ASOF_ISO` is the override value for rows the research
 * corroborated to a settled close; `KR_PREV_ASOF_ISO` is what engine.ts falls back to for every
 * KR row this pass did NOT touch, so bumping `SNAPSHOT.krAsOfISO` forward doesn't silently
 * claim the new close for rows still priced as of the old one.
 */
export const KR_ASOF_ISO = '2026-08-20T15:30:00+09:00';
export const KR_MID_ASOF_ISO = '2026-08-19T15:30:00+09:00';
export const KR_PREV_ASOF_ISO = '2026-08-05T15:30:00+09:00';

/** [code, name, nameKo, sectorId, marketCapTrillionKrw, priceKrw, dayChangePct, asOfISO?] */
type KrStockRow = [string, string, string, SectorId, number, number, number, string?];

export const KR_STOCKS: KrStockRow[] = [
  // ---------- 기술 ----------
  ['005930', 'Samsung Electronics Co., Ltd.', '삼성전자', 'tech', 1568.32, 271000, 9.49, KR_ASOF_ISO],
  ['000660', 'SK hynix Inc.', 'SK하이닉스', 'tech', 1215.75, 1691000, 12.73, KR_ASOF_ISO],
  ['402340', 'SK Square Co., Ltd.', 'SK스퀘어', 'tech', 147.36, 1123000, 11.85, KR_ASOF_ISO],
  ['009150', 'Samsung Electro-Mechanics Co., Ltd.', '삼성전기', 'tech', 99.92, 1396000, 0.65, KR_ASOF_ISO],
  ['066570', 'LG Electronics Inc.', 'LG전자', 'tech', 30.29, 202500, 0.5, KR_ASOF_ISO],
  ['042700', 'Hanmi Semiconductor Co., Ltd.', '한미반도체', 'tech', 19.82, 225500, 2.04, KR_ASOF_ISO],
  ['018260', 'Samsung SDS Co., Ltd.', '삼성SDS', 'tech', 16.98, 233000, 3.1, KR_ASOF_ISO],
  ['011070', 'LG Innotek Co., Ltd.', 'LG이노텍', 'tech', 14.22, 587000, -2.65, KR_ASOF_ISO],
  ['307950', 'Hyundai AutoEver Corp.', '현대오토에버', 'tech', 10.81, 459500, 5.27, KR_ASOF_ISO],
  ['064400', 'LG CNS Co., Ltd.', 'LG CNS', 'tech', 7.1, 73800, 3.94, KR_ASOF_ISO],
  ['007660', 'ISU Petasys Co., Ltd.', '이수페타시스', 'tech', 5.84, 105000, 0.57, KR_ASOF_ISO],
  ['353200', 'Daeduck Electronics Co., Ltd.', '대덕전자', 'tech', 5.3, 113400, -0.7, KR_ASOF_ISO],
  ['034220', 'LG Display Co., Ltd.', 'LG디스플레이', 'tech', 4.9, 9650, 0.63, KR_ASOF_ISO],
  ['000990', 'DB HiTek Co., Ltd.', 'DB하이텍', 'tech', 3.8, 96900, 3.53, KR_ASOF_ISO],
  ['022100', 'POSCO DX Co., Ltd.', '포스코DX', 'tech', 3.17, 20450, 2.87, KR_ASOF_ISO],
  ['489790', 'Hanwha Vision Co., Ltd.', '한화비전', 'tech', 2.47, 54700, 4.59, KR_ASOF_ISO],

  // ---------- 커뮤니케이션 서비스 ----------
  ['035420', 'NAVER Corporation', '네이버', 'comm', 34.26, 219500, 5.53, KR_ASOF_ISO],
  ['017670', 'SK Telecom Co., Ltd.', 'SK텔레콤', 'comm', 19.81, 96600, -1.43, KR_ASOF_ISO],
  ['035720', 'Kakao Corp.', '카카오', 'comm', 16.81, 38700, 3.48, KR_ASOF_ISO],

  ['030200', 'KT Corporation', 'KT', 'comm', 12.66, 52100, -0.95, KR_ASOF_ISO],
  ['259960', 'KRAFTON, Inc.', '크래프톤', 'comm', 10.04, 222500, 0.45, KR_ASOF_ISO],
  ['032640', 'LG Uplus Corp.', 'LG유플러스', 'comm', 6.33, 14660, -0.48, KR_ASOF_ISO],
  ['036570', 'NCsoft Corporation', '엔씨소프트', 'comm', 4.56, 220500, 0.46, KR_ASOF_ISO],
  ['251270', 'Netmarble Corporation', '넷마블', 'comm', 3.11, 37500, 0.4, KR_ASOF_ISO],

  // ---------- 금융 서비스 ----------
  ['105560', 'KB Financial Group Inc.', 'KB금융', 'fin', 59.87, 160000, -3.85, KR_ASOF_ISO],
  ['032830', 'Samsung Life Insurance Co., Ltd.', '삼성생명', 'fin', 52.79, 297000, 7.61, KR_ASOF_ISO],
  ['055550', 'Shinhan Financial Group Co., Ltd.', '신한지주', 'fin', 49.17, 101100, -3.71, KR_ASOF_ISO],
  ['086790', 'Hana Financial Group Inc.', '하나금융지주', 'fin', 34.4, 123400, -3.22, KR_ASOF_ISO],
  ['000810', 'Samsung Fire & Marine Insurance Co., Ltd.', '삼성화재', 'fin', 25.74, 622000, 1.47, KR_ASOF_ISO],
  ['316140', 'Woori Financial Group Inc.', '우리금융지주', 'fin', 24.38, 31550, -5.82, KR_ASOF_ISO],
  ['138040', 'Meritz Financial Group Inc.', '메리츠금융지주', 'fin', 19.65, 115200, 0, KR_ASOF_ISO],
  ['006800', 'Mirae Asset Securities Co., Ltd.', '미래에셋증권', 'fin', 16.59, 36100, 4.03, KR_ASOF_ISO],
  ['024110', 'Industrial Bank of Korea', '기업은행', 'fin', 16.11, 19950, -1.72, KR_ASOF_ISO],
  ['071050', 'Korea Investment Holdings Co., Ltd.', '한국금융지주', 'fin', 11.91, 186800, 2.02, KR_ASOF_ISO],
  ['005940', 'NH Investment & Securities Co., Ltd.', 'NH투자증권', 'fin', 10.52, 26500, 1.73, KR_ASOF_ISO],
  ['323410', 'KakaoBank Corp.', '카카오뱅크', 'fin', 10.28, 21200, -1.4, KR_ASOF_ISO],
  ['005830', 'DB Insurance Co., Ltd.', 'DB손해보험', 'fin', 9.39, 177400, -5.39, KR_ASOF_ISO],
  ['016360', 'Samsung Securities Co., Ltd.', '삼성증권', 'fin', 8.72, 92400, 8.71, KR_ASOF_ISO],
  ['039490', 'Kiwoom Securities Co., Ltd.', '키움증권', 'fin', 7.67, 275500, 3.77, KR_ASOF_ISO],
  ['377300', 'Kakao Pay Corp.', '카카오페이', 'fin', 5.62, 44950, 8.97, KR_ASOF_ISO],
  ['175330', 'JB Financial Group Co., Ltd.', 'JB금융지주', 'fin', 5.16, 26400, -2.94, KR_ASOF_ISO],
  ['138930', 'BNK Financial Group Inc.', 'BNK금융지주', 'fin', 4.69, 14300, -2.46, KR_ASOF_ISO],
  ['088350', 'Hanwha Life Insurance Co., Ltd.', '한화생명', 'fin', 3.24, 5510, 3.18, KR_ASOF_ISO],
  ['031210', 'Seoul Guarantee Insurance Co., Ltd.', '서울보증보험', 'fin', 2.97, 42950, -1.04, KR_ASOF_ISO],
  ['139130', 'iM Financial Group Co., Ltd.', 'iM금융지주', 'fin', 2.76, 17000, -2.07, KR_ASOF_ISO],
  ['001450', 'Hyundai Marine & Fire Insurance Co., Ltd.', '현대해상화재보험', 'fin', 2.73, 48850, -2.3, KR_ASOF_ISO],
  ['003690', 'Korean Reinsurance Company', '코리안리', 'fin', 2.44, 14620, -2.08, KR_ASOF_ISO],
  ['279570', 'K bank Co., Ltd.', '케이뱅크', 'fin', 2.3, 5580, 0.9, KR_ASOF_ISO],
  ['085620', 'Mirae Asset Life Insurance Co., Ltd.', '미래에셋생명', 'fin', 2.03, 26600, 15.4, KR_ASOF_ISO],

  // ---------- 경기소비재 ----------
  ['005380', 'Hyundai Motor Company', '현대자동차', 'cons-cyc', 94.11, 417500, 0.85, KR_ASOF_ISO],
  ['000270', 'Kia Corporation', '기아', 'cons-cyc', 50.36, 131100, -1.43, KR_ASOF_ISO],
  ['012330', 'Hyundai Mobis Co., Ltd.', '현대모비스', 'cons-cyc', 44.86, 507000, -0.39, KR_ASOF_ISO],
  ['021240', 'COWAY Co., Ltd.', '코웨이', 'cons-cyc', 6.51, 93400, -0.11, KR_ASOF_ISO],
  ['004170', 'Shinsegae Co., Ltd.', '신세계', 'cons-cyc', 3.77, 404500, 1, KR_ASOF_ISO],
  ['111770', 'Youngone Corporation', '영원무역', 'cons-cyc', 3.77, 74300, -3.63, KR_ASOF_ISO],
  ['018880', 'Hanon Systems', '한온시스템', 'cons-cyc', 3.46, 3515, 0.72, KR_ASOF_ISO],
  ['023530', 'Lotte Shopping Co., Ltd.', '롯데쇼핑', 'cons-cyc', 3.23, 97200, 0.1, KR_ASOF_ISO],
  ['035250', 'Kangwon Land, Inc.', '강원랜드', 'cons-cyc', 2.81, 14320, 0.21, KR_ASOF_ISO],
  ['005850', 'S.L. Corp.', 'SL', 'cons-cyc', 2.58, 53700, -2.01, KR_ASOF_ISO],
  ['007340', 'DN Automotive Corporation', 'DN오토모티브', 'cons-cyc', 2.4, 46650, -13.77, KR_ASOF_ISO],
  ['204320', 'HL Mando Co., Ltd.', 'HL만도', 'cons-cyc', 2.38, 54200, 4.23, KR_ASOF_ISO],
  ['383220', 'F&F Co., Ltd.', 'F&F', 'cons-cyc', 2.37, 61900, -1.59, KR_ASOF_ISO],
  ['069960', 'Hyundai Department Store Co., Ltd.', '현대백화점', 'cons-cyc', 2.35, 94500, -0.32, KR_ASOF_ISO],
  ['081660', 'Misto Holdings Co., Ltd.', '미스토홀딩스', 'cons-cyc', 2.34, 41250, -4.18, KR_ASOF_ISO],
  ['009970', 'Youngone Holdings Co., Ltd.', '영원홀딩스', 'cons-cyc', 2.11, 165300, -5.27, KR_ASOF_ISO],
  ['073240', 'Kumho Tire Co., Inc.', '금호타이어', 'cons-cyc', 2.01, 7420, -2.37, KR_ASOF_ISO],

  // ---------- 필수소비재 ----------
  ['033780', 'KT&G Corporation', 'KT&G', 'cons-def', 18.27, 171900, -2.05, KR_ASOF_ISO],
  ['278470', 'APR Corporation', 'APR', 'cons-def', 13.46, 386000, 0.65, KR_ASOF_ISO],
  ['003230', 'Samyang Foods Co., Ltd.', '삼양식품', 'cons-def', 9.11, 1397000, 7.13, KR_ASOF_ISO],
  ['090430', 'Amorepacific Corporation', '아모레퍼시픽', 'cons-def', 8.14, 136600, 2.63, KR_ASOF_ISO],
  ['271560', 'ORION Corp.', '오리온', 'cons-def', 5.15, 124600, 0.4, KR_ASOF_ISO],
  ['051900', 'LG Household & Health Care Ltd.', 'LG생활건강', 'cons-def', 4.52, 304500, 0.83, KR_ASOF_ISO],
  ['001040', 'CJ Corporation', 'CJ(주)', 'cons-def', 4.26, 122900, 0.08, KR_ASOF_ISO],
  ['097950', 'CJ CheilJedang Corp.', 'CJ제일제당', 'cons-def', 3.07, 184800, 2.61, KR_ASOF_ISO],
  ['483650', "d'Alba Global Co., Ltd.", '달바글로벌', 'cons-def', 2.89, 225000, 3.21, KR_ASOF_ISO],
  ['026960', 'Dongsuh Companies, Inc.', '동서', 'cons-def', 2.49, 25500, -0.78, KR_ASOF_ISO],
  ['161890', 'Kolmar Korea Co., Ltd.', '한국콜마', 'cons-def', 2.41, 137800, 7.82, KR_ASOF_ISO],
  ['192820', 'Cosmax, Inc.', '코스맥스', 'cons-def', 2.21, 260500, 5.89, KR_ASOF_ISO],
  ['005440', 'Hyundai G.F. Holdings Co.,Ltd.', '현대지에프홀딩스', 'cons-def', 2.18, 11600, 3.76, KR_ASOF_ISO],
  ['002790', 'Amorepacific Group, Inc.', '아모레퍼시픽그룹', 'cons-def', 2.14, 25900, 2.98, KR_ASOF_ISO],
  ['139480', 'Emart Inc.', '이마트', 'cons-def', 2.13, 72500, 0, KR_ASOF_ISO],
  ['282330', 'BGF Retail Co., Ltd.', 'BGF리테일', 'cons-def', 2.11, 142800, 0, KR_ASOF_ISO],
  ['007070', 'GS Retail Co., Ltd.', 'GS리테일', 'cons-def', 2.07, 26700, -0.74, KR_ASOF_ISO],

  // ---------- 에너지 ----------
  ['096770', 'SK Innovation Co., Ltd.', 'SK이노베이션', 'energy', 18.44, 125900, -2.33, KR_ASOF_ISO],
  ['010950', 'S-Oil Corporation', '에쓰오일', 'energy', 14.03, 142600, -5.94, KR_ASOF_ISO],
  ['078930', 'GS Holdings Corp.', 'GS', 'energy', 8.93, 113600, -5.1, KR_ASOF_ISO],

  // ---------- 산업재 ----------
  ['373220', 'LG Energy Solution, Ltd.', 'LG에너지솔루션', 'industrials', 78.51, 358000, 0.14, KR_ASOF_ISO],
  ['028260', 'Samsung C&T Corporation', '삼성물산', 'industrials', 55.55, 374000, 7.78, KR_ASOF_ISO],
  ['329180', 'HD Hyundai Heavy Industries Co., Ltd.', 'HD현대중공업', 'industrials', 53.41, 475500, 0.32, KR_ASOF_ISO],
  ['012450', 'Hanwha Aerospace Co., Ltd.', '한화에어로스페이스', 'industrials', 51.65, 1167000, -0.85, KR_ASOF_ISO],
  ['034020', 'Doosan Enerbility Co., Ltd.', '두산에너빌리티', 'industrials', 49.32, 75900, -0.39, KR_ASOF_ISO],
  ['006400', 'Samsung SDI Co., Ltd.', '삼성SDI', 'industrials', 32.67, 499500, 2.57, KR_ASOF_ISO],
  ['010120', 'LS ELECTRIC Co., Ltd.', 'LS일렉트릭', 'industrials', 31.52, 199200, -1.39, KR_ASOF_ISO],
  ['034730', 'SK Inc.', 'SK(주)', 'industrials', 30.64, 568000, 3.09, KR_ASOF_ISO],
  ['042660', 'Hanwha Ocean Co., Ltd.', '한화오션', 'industrials', 28.15, 88500, 0.45, KR_ASOF_ISO],
  ['009540', 'HD Korea Shipbuilding & Offshore Engineering Co., Ltd.', 'HD한국조선해양', 'industrials', 28, 360500, -1.77, KR_ASOF_ISO],
  ['298040', 'Hyosung Heavy Industries Corporation', '효성중공업', 'industrials', 27.8, 2857000, -1.75, KR_ASOF_ISO],
  ['267260', 'HD Hyundai Electric Co., Ltd.', 'HD현대일렉트릭', 'industrials', 27.79, 746000, -0.8, KR_ASOF_ISO],
  ['011200', 'HMM Co., Ltd.', 'HMM', 'industrials', 20, 21200, -2.3, KR_ASOF_ISO],
  ['000150', 'Doosan Corporation', '두산', 'industrials', 19.23, 1178000, -1.26, KR_ASOF_ISO],
  ['010140', 'Samsung Heavy Industries Co., Ltd.', '삼성중공업', 'industrials', 18.96, 20800, 0.97, KR_ASOF_ISO],
  ['079550', 'LIG Nex1 Co., Ltd.', 'LIG넥스원', 'industrials', 17.43, 787000, -1.13, KR_ASOF_ISO],
  ['003550', 'LG Corp.', 'LG(주)', 'industrials', 16.35, 110400, 0.18, KR_ASOF_ISO],
  ['064350', 'Hyundai Rotem Company', '현대로템', 'industrials', 16.12, 137200, 0.66, KR_ASOF_ISO],
  ['086280', 'Hyundai Glovis Co., Ltd.', '현대글로비스', 'industrials', 15, 199800, -1.82, KR_ASOF_ISO],
  ['267250', 'HD Hyundai Co., Ltd.', 'HD현대', 'industrials', 14.73, 221500, -2.85, KR_ASOF_ISO],
  ['272210', 'Hanwha Systems Co., Ltd.', '한화시스템', 'industrials', 13.54, 75300, -0.92, KR_ASOF_ISO],
  ['047810', 'Korea Aerospace Industries, Ltd.', '한국항공우주산업', 'industrials', 13.4, 134700, -0.74, KR_ASOF_ISO],
  ['000720', 'Hyundai Engineering & Construction Co., Ltd.', '현대건설', 'industrials', 12.31, 113800, -2.32, KR_ASOF_ISO],
  ['003490', 'Korean Air Lines Co., Ltd.', '대한항공', 'industrials', 9.93, 25050, 0, KR_ASOF_ISO],
  ['028050', 'Samsung E&A Co., Ltd.', '삼성E&A', 'industrials', 9.62, 48050, -0.93, KR_ASOF_ISO],
  ['006260', 'LS Corp.', 'LS', 'industrials', 9, 313500, -5.86, KR_ASOF_ISO],
  ['443060', 'HD Hyundai Marine Solution Co., Ltd.', 'HD현대마린솔루션', 'industrials', 8.66, 203000, -3.1, KR_ASOF_ISO],
  ['180640', 'Hanjin Kal Corp.', '한진칼', 'industrials', 8.19, 114500, -1.55, KR_ASOF_ISO],
  ['267270', 'HD Hyundai Construction Equipment Co., Ltd.', 'HD현대건설기계', 'industrials', 6.78, 121900, -5.65, KR_ASOF_ISO],
  ['047040', 'Daewoo Engineering & Construction Co., Ltd.', '대우건설', 'industrials', 6.59, 16710, -2.85, KR_ASOF_ISO],
  ['241560', 'Doosan Bobcat Inc.', '두산밥캣', 'industrials', 6.16, 58800, -4.85, KR_ASOF_ISO],
  ['001440', 'Taihan Cable & Solution Co., Ltd.', '대한전선', 'industrials', 5.55, 28350, 1.25, KR_ASOF_ISO],
  ['000880', 'Hanwha Corporation', '한화', 'industrials', 5.46, 83800, 0, KR_ASOF_ISO],
  ['454910', 'Doosan Robotics Inc.', '두산로보틱스', 'industrials', 4.73, 72300, 1.12, KR_ASOF_ISO],
  ['000500', 'Gaon Cable Co., Ltd.', '가온전선', 'industrials', 4.73, 164900, 4.5, KR_ASOF_ISO],
  ['062040', 'Sanil Electric Co., Ltd.', '산일전기', 'industrials', 4.67, 179200, 1.99, KR_ASOF_ISO],
  ['052690', 'KEPCO Engineering & Construction Company, Inc.', '한전기술', 'industrials', 3.9, 94200, 0.75, KR_ASOF_ISO],
  ['082740', 'Hanwha Engine Co., Ltd.', '한화엔진', 'industrials', 3.84, 46600, 0.54, KR_ASOF_ISO],
  ['028670', 'Pan Ocean Co., Ltd.', '팬오션', 'industrials', 3.13, 5770, -3.99, KR_ASOF_ISO],
  ['103590', 'Iljin Electric Co., Ltd.', '일진전기', 'industrials', 2.91, 70000, -1.55, KR_ASOF_ISO],
  ['375500', 'DL E&C Co., Ltd.', 'DL이앤씨', 'industrials', 2.76, 71200, -0.84, KR_ASOF_ISO],
  ['004800', 'Hyosung Corporation', '효성', 'industrials', 2.7, 160800, -1.11, KR_ASOF_ISO],
  ['017800', 'Hyundai Elevator Co., Ltd.', '현대엘리베이터', 'industrials', 2.5, 72600, -2.16, KR_ASOF_ISO],
  ['012750', 'S-1 Corporation', '에스원', 'industrials', 2.49, 75100, -2.47, KR_ASOF_ISO],
  ['006360', 'GS Engineering & Construction Corp.', 'GS건설', 'industrials', 2.44, 35600, 1.86, KR_ASOF_ISO],
  ['336260', 'Doosan Fuel Cell Co., Ltd.', '두산퓨얼셀', 'industrials', 2.27, 40650, 2.14, KR_ASOF_ISO],
  ['051600', 'KEPCO Plant Service & Engineering Co., Ltd.', '한전KPS', 'industrials', 2.1, 44950, -0.77, KR_ASOF_ISO],
  ['071970', 'HD Hyundai Marine Engine Co., Ltd.', 'HD현대마린엔진', 'industrials', 2.01, 53500, -1.11, KR_ASOF_ISO],

  // ---------- 의료 ----------
  ['207940', 'Samsung Biologics Co.,Ltd.', '삼성바이오로직스', 'healthcare', 69.02, 1574000, 1.94, KR_ASOF_ISO],
  ['068270', 'Celltrion, Inc.', '셀트리온', 'healthcare', 43.64, 194100, 0, KR_ASOF_ISO],
  ['326030', 'SK Biopharmaceuticals Co., Ltd.', 'SK바이오팜', 'healthcare', 6.42, 86500, 1.41, KR_ASOF_ISO],
  ['000100', 'Yuhan Corporation', '유한양행', 'healthcare', 5.6, 83400, 4.77, KR_ASOF_ISO],
  ['128940', 'Hanmi Pharm. Co., Ltd.', '한미약품', 'healthcare', 4.82, 399000, 2.7, KR_ASOF_ISO],
  ['302440', 'SK bioscience Co., Ltd.', 'SK바이오사이언스', 'healthcare', 2.71, 37750, 5.45, KR_ASOF_ISO],
  ['009420', 'HanAll Biopharma Co., Ltd.', '한올바이오파마', 'healthcare', 2.7, 62600, 5.74, KR_ASOF_ISO],
  ['008930', 'Hanmi Science Co., Ltd.', '한미사이언스', 'healthcare', 2.65, 44250, -1.99, KR_ASOF_ISO],

  // ---------- 기초 소재 ----------
  ['005490', 'POSCO Holdings Inc.', 'POSCO홀딩스', 'materials', 23.97, 321500, 0.47, KR_ASOF_ISO],
  ['010130', 'Korea Zinc Co., Ltd.', '고려아연', 'materials', 22.33, 1238000, 8.12, KR_ASOF_ISO],
  ['051910', 'LG Chem, Ltd.', 'LG화학', 'materials', 18.97, 264000, -0.75, KR_ASOF_ISO],
  ['003670', 'POSCO Future M Co., Ltd.', '포스코퓨처엠', 'materials', 12.7, 163300, 1.87, KR_ASOF_ISO],
  ['047050', 'POSCO International Corporation', '포스코인터내셔널', 'materials', 9.2, 52300, 3.16, KR_ASOF_ISO],
  ['009830', 'Hanwha Solutions Corporation', '한화솔루션', 'materials', 5.15, 35200, 1.59, KR_ASOF_ISO],
  ['010060', 'OCI Holdings Company, Ltd.', 'OCI홀딩스', 'materials', 4.59, 290000, 4.5, KR_ASOF_ISO],
  ['004020', 'Hyundai Steel Company', '현대제철', 'materials', 3.64, 28050, 0, KR_ASOF_ISO],
  ['066970', 'L&F Co., Ltd.', '엘앤에프', 'materials', 3.15, 108000, 2.86, KR_ASOF_ISO],
  ['002380', 'KCC Corporation', 'KCC', 'materials', 3.05, 474500, 8.46, KR_ASOF_ISO],
  ['011780', 'Kumho Petrochemical Co., Ltd.', '금호석유화학', 'materials', 2.85, 120000, -2.91, KR_ASOF_ISO],
  ['011790', 'SKC Co., Ltd.', 'SKC', 'materials', 2.78, 86300, 3.48, KR_ASOF_ISO],
  ['000240', 'Hankook & Company Co., Ltd.', '한국앤컴퍼니', 'materials', 2.41, 23600, -2.28, KR_ASOF_ISO],
  ['450080', 'Ecopro Materials Co., Ltd.', '에코프로머티', 'materials', 2.4, 37000, 0.27, KR_ASOF_ISO],
  ['014680', 'Hansol Chemical Co., Ltd.', '한솔케미칼', 'materials', 2.33, 203000, 0.25, KR_ASOF_ISO],

  // ---------- 유틸리티 ----------
  ['015760', 'Korea Electric Power Corporation', '한국전력공사', 'utilities', 22.92, 31800, 3.08, KR_ASOF_ISO],
  ['036460', 'Korea Gas Corporation', '한국가스공사', 'utilities', 2.96, 36350, 0.28, KR_ASOF_ISO],
];

function krStockAsset([code, name, nameKo, sectorId, capT, price, changePct, asOfISO]: KrStockRow): SeedAsset {
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
    asOfISO,
    logoBg: '#20808d',
    logoText: nameKo.slice(0, 1),
  };
}

/**
 * [symbol, name, nameKo, price/level, dayChangePct, unit] — market benchmarks.
 * Indices carry `unit: 'POINTS'`; the USD/KRW row carries `unit: 'KRW'`.
 */
type KrIndexRow = [string, string, string, number, number, InstrumentUnit, string?];

export const KR_INDICES: KrIndexRow[] = [
  ['^KOSPI', 'KOSPI', '코스피', 6813.34, 3.56, 'POINTS', '2026-08-13T15:30:00+09:00'],
  ['^KOSDAQ', 'KOSDAQ', '코스닥', 861.37, 0.29, 'POINTS', '2026-08-13T15:30:00+09:00'],
  ['^KOSPI200', 'KOSPI 200', '코스피200', 974.73, -0.83, 'POINTS', '2026-08-07T15:30:00+09:00'],
  ['USDKRW', 'US Dollar / Korean Won', '달러/원', 1416.1, -0.54, 'KRW', '2026-08-07T15:30:00+09:00'],
  ['^VKOSPI', 'KOSPI Volatility Index', 'VKOSPI', 75.59, -2.05, 'POINTS', '2026-08-07T15:30:00+09:00'],
];

function krIndexAsset([symbol, name, nameKo, price, changePct, unit, asOfISO]: KrIndexRow): SeedAsset {
  const kind: AssetKind = 'index';
  return {
    symbol,
    name,
    nameKo,
    exchange: symbol === 'USDKRW' ? 'FX' : 'KRX',
    kind,
    unit,
    region: 'KR',
    price,
    changePct,
    asOfISO,
    logoBg: '#20808d',
    logoText: nameKo.slice(0, 1),
  };
}

/**
 * KR sector index levels, keyed by the same `SectorId` union the US table
 * uses (see types.ts) so the screener/heatmap sector filters keep working
 * unchanged across regions.
 *
 * `indexValue` is a synthetic sector level derived transparently from this
 * seed's own data — total constituent market cap in trillion KRW / 10, the
 * same order of magnitude as the US table's illustrative levels.
 * `changePct` is the market-cap-weighted average day change among this
 * seed's constituents in that sector. `realestate` has no KR constituent in
 * the top-150 by market cap, so it's a flat placeholder rather than an
 * invented figure — known-absent, not silently guessed.
 */
export const KR_SECTORS: SectorInfo[] = [
  { id: 'tech',        nameKo: '기술',              nameEn: 'Technology',             indexValue: 315.61, changePct: 4.46 },
  { id: 'energy',      nameKo: '에너지',            nameEn: 'Energy',                 indexValue: 4.14,   changePct: -2.04 },
  { id: 'cons-cyc',    nameKo: '경기소비재',        nameEn: 'Consumer Cyclical',      indexValue: 23.14,  changePct: 2.86 },
  { id: 'cons-def',    nameKo: '필수소비재',        nameEn: 'Consumer Defensive',     indexValue: 8.66,   changePct: -0.13 },
  { id: 'comm',        nameKo: '커뮤니케이션 서비스', nameEn: 'Communication Services', indexValue: 10.76,  changePct: 0.27 },
  { id: 'industrials', nameKo: '산업재',            nameEn: 'Industrials',            indexValue: 79.52,  changePct: 4.93 },
  { id: 'fin',         nameKo: '금융 서비스',       nameEn: 'Financial Services',     indexValue: 39.11,  changePct: 1.73 },
  { id: 'utilities',   nameKo: '유틸리티',          nameEn: 'Utilities',              indexValue: 2.59,   changePct: 1.33 },
  { id: 'materials',   nameKo: '기초 소재',         nameEn: 'Basic Materials',        indexValue: 11.95,  changePct: 3.12 },
  { id: 'realestate',  nameKo: '부동산',            nameEn: 'Real Estate',            indexValue: 1.00,   changePct: 0 },
  { id: 'healthcare',  nameKo: '의료',              nameEn: 'Healthcare',             indexValue: 13.76,  changePct: 1.52 },
];

/** KR seed assets merged into the engine's asset map. */
export const KR_SEED_ASSETS: SeedAsset[] = [
  ...KR_STOCKS.map(krStockAsset),
  ...KR_INDICES.map(krIndexAsset),
];
