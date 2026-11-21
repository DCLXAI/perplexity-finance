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
export const KR_ASOF_ISO = '2026-11-20T15:30:00+09:00';
export const KR_MID_ASOF_ISO = '2026-11-13T15:30:00+09:00';
export const KR_PREV_ASOF_ISO = '2026-08-05T15:30:00+09:00';

/** [code, name, nameKo, sectorId, marketCapTrillionKrw, priceKrw, dayChangePct, asOfISO?] */
type KrStockRow = [string, string, string, SectorId, number, number, number, string?];

export const KR_STOCKS: KrStockRow[] = [
  // ---------- 기술 ----------
  ['005930', 'Samsung Electronics Co., Ltd.', '삼성전자', 'tech', 1568.32, 180900, -8.13, KR_ASOF_ISO],
  ['000660', 'SK hynix Inc.', 'SK하이닉스', 'tech', 1215.75, 1100000, -7.02, KR_ASOF_ISO],
  ['402340', 'SK Square Co., Ltd.', 'SK스퀘어', 'tech', 147.36, 672000, -9.07, KR_ASOF_ISO],
  ['009150', 'Samsung Electro-Mechanics Co., Ltd.', '삼성전기', 'tech', 99.92, 767000, -13.33, KR_ASOF_ISO],
  ['066570', 'LG Electronics Inc.', 'LG전자', 'tech', 30.29, 128700, -5.3, KR_ASOF_ISO],
  ['042700', 'Hanmi Semiconductor Co., Ltd.', '한미반도체', 'tech', 19.82, 151600, -12.06, KR_ASOF_ISO],
  ['018260', 'Samsung SDS Co., Ltd.', '삼성SDS', 'tech', 16.98, 206500, -3.73, KR_ASOF_ISO],
  ['011070', 'LG Innotek Co., Ltd.', 'LG이노텍', 'tech', 14.22, 265500, -9.39, KR_ASOF_ISO],
  ['307950', 'Hyundai AutoEver Corp.', '현대오토에버', 'tech', 10.81, 289500, -6.16, KR_ASOF_ISO],
  ['064400', 'LG CNS Co., Ltd.', 'LG CNS', 'tech', 7.1, 70800, -5.6, KR_ASOF_ISO],
  ['007660', 'ISU Petasys Co., Ltd.', '이수페타시스', 'tech', 5.84, 68500, -17.47, KR_ASOF_ISO],
  ['353200', 'Daeduck Electronics Co., Ltd.', '대덕전자', 'tech', 5.3, 72400, -14.62, KR_ASOF_ISO],
  ['034220', 'LG Display Co., Ltd.', 'LG디스플레이', 'tech', 4.9, 6800, -4.09, KR_ASOF_ISO],
  ['000990', 'DB HiTek Co., Ltd.', 'DB하이텍', 'tech', 3.8, 67300, -11.33, KR_ASOF_ISO],
  ['022100', 'POSCO DX Co., Ltd.', '포스코DX', 'tech', 3.17, 20600, -7, KR_ASOF_ISO],
  ['489790', 'Hanwha Vision Co., Ltd.', '한화비전', 'tech', 2.47, 32750, -12.32, KR_ASOF_ISO],

  // ---------- 커뮤니케이션 서비스 ----------
  ['035420', 'NAVER Corporation', '네이버', 'comm', 34.26, 160800, -4.46, KR_ASOF_ISO],
  ['017670', 'SK Telecom Co., Ltd.', 'SK텔레콤', 'comm', 19.81, 69200, -13.72, KR_ASOF_ISO],
  ['035720', 'Kakao Corp.', '카카오', 'comm', 16.81, 30650, -3.92, KR_ASOF_ISO],

  ['030200', 'KT Corporation', 'KT', 'comm', 12.66, 45850, -3.07, KR_ASOF_ISO],
  ['259960', 'KRAFTON, Inc.', '크래프톤', 'comm', 10.04, 202000, 2.49, KR_ASOF_ISO],
  ['032640', 'LG Uplus Corp.', 'LG유플러스', 'comm', 6.33, 15010, -1.12, KR_ASOF_ISO],
  ['036570', 'NCsoft Corporation', '엔씨소프트', 'comm', 4.56, 179400, -2.55, KR_ASOF_ISO],
  ['251270', 'Netmarble Corporation', '넷마블', 'comm', 3.11, 31950, -2.29, KR_ASOF_ISO],

  // ---------- 금융 서비스 ----------
  ['105560', 'KB Financial Group Inc.', 'KB금융', 'fin', 59.87, 153100, 0.13, KR_ASOF_ISO],
  ['032830', 'Samsung Life Insurance Co., Ltd.', '삼성생명', 'fin', 52.79, 237500, -7.05, KR_ASOF_ISO],
  ['055550', 'Shinhan Financial Group Co., Ltd.', '신한지주', 'fin', 49.17, 86300, 0.82, KR_ASOF_ISO],
  ['086790', 'Hana Financial Group Inc.', '하나금융지주', 'fin', 34.4, 124200, 0.24, KR_ASOF_ISO],
  ['000810', 'Samsung Fire & Marine Insurance Co., Ltd.', '삼성화재', 'fin', 25.74, 507000, -3.43, KR_ASOF_ISO],
  ['316140', 'Woori Financial Group Inc.', '우리금융지주', 'fin', 24.38, 31850, 0.31, KR_ASOF_ISO],
  ['138040', 'Meritz Financial Group Inc.', '메리츠금융지주', 'fin', 19.65, 125900, 0.56, KR_ASOF_ISO],
  ['006800', 'Mirae Asset Securities Co., Ltd.', '미래에셋증권', 'fin', 16.59, 18800, -6.47, KR_ASOF_ISO],
  ['024110', 'Industrial Bank of Korea', '기업은행', 'fin', 16.11, 19110, -0.62, KR_ASOF_ISO],
  ['071050', 'Korea Investment Holdings Co., Ltd.', '한국금융지주', 'fin', 11.91, 121000, -3.35, KR_ASOF_ISO],
  ['005940', 'NH Investment & Securities Co., Ltd.', 'NH투자증권', 'fin', 10.52, 22500, -3.85, KR_ASOF_ISO],
  ['323410', 'KakaoBank Corp.', '카카오뱅크', 'fin', 10.28, 21650, 0.93, KR_ASOF_ISO],
  ['005830', 'DB Insurance Co., Ltd.', 'DB손해보험', 'fin', 9.39, 164500, -2.37, KR_ASOF_ISO],
  ['016360', 'Samsung Securities Co., Ltd.', '삼성증권', 'fin', 8.72, 69100, -4.29, KR_ASOF_ISO],
  ['039490', 'Kiwoom Securities Co., Ltd.', '키움증권', 'fin', 7.67, 188200, -3.29, KR_ASOF_ISO],
  ['377300', 'Kakao Pay Corp.', '카카오페이', 'fin', 5.62, 33450, -2.48, KR_ASOF_ISO],
  ['175330', 'JB Financial Group Co., Ltd.', 'JB금융지주', 'fin', 5.16, 25700, 0.19, KR_ASOF_ISO],
  ['138930', 'BNK Financial Group Inc.', 'BNK금융지주', 'fin', 4.69, 12900, -2.86, KR_ASOF_ISO],
  ['088350', 'Hanwha Life Insurance Co., Ltd.', '한화생명', 'fin', 3.24, 3490, -5.16, KR_ASOF_ISO],
  ['031210', 'Seoul Guarantee Insurance Co., Ltd.', '서울보증보험', 'fin', 2.97, 38100, -3.91, KR_ASOF_ISO],
  ['139130', 'iM Financial Group Co., Ltd.', 'iM금융지주', 'fin', 2.76, 15660, -1.14, KR_ASOF_ISO],
  ['001450', 'Hyundai Marine & Fire Insurance Co., Ltd.', '현대해상화재보험', 'fin', 2.73, 33050, -3.92, KR_ASOF_ISO],
  ['003690', 'Korean Reinsurance Company', '코리안리', 'fin', 2.44, 12270, -3.39, KR_ASOF_ISO],
  ['279570', 'K bank Co., Ltd.', '케이뱅크', 'fin', 2.3, 5350, -2.01, KR_ASOF_ISO],
  ['085620', 'Mirae Asset Life Insurance Co., Ltd.', '미래에셋생명', 'fin', 2.03, 15860, -5.76, KR_ASOF_ISO],

  // ---------- 경기소비재 ----------
  ['005380', 'Hyundai Motor Company', '현대자동차', 'cons-cyc', 94.11, 253000, -5.42, KR_ASOF_ISO],
  ['000270', 'Kia Corporation', '기아', 'cons-cyc', 50.36, 87400, -4.48, KR_ASOF_ISO],
  ['012330', 'Hyundai Mobis Co., Ltd.', '현대모비스', 'cons-cyc', 44.86, 322000, -5.71, KR_ASOF_ISO],
  ['021240', 'COWAY Co., Ltd.', '코웨이', 'cons-cyc', 6.51, 106400, -0.84, KR_ASOF_ISO],
  ['004170', 'Shinsegae Co., Ltd.', '신세계', 'cons-cyc', 3.77, 290000, -1.86, KR_ASOF_ISO],
  ['111770', 'Youngone Corporation', '영원무역', 'cons-cyc', 3.77, 71200, 1.28, KR_ASOF_ISO],
  ['018880', 'Hanon Systems', '한온시스템', 'cons-cyc', 3.46, 2920, -3.63, KR_ASOF_ISO],
  ['023530', 'Lotte Shopping Co., Ltd.', '롯데쇼핑', 'cons-cyc', 3.23, 80400, -5.19, KR_ASOF_ISO],
  ['035250', 'Kangwon Land, Inc.', '강원랜드', 'cons-cyc', 2.81, 14230, 0.71, KR_ASOF_ISO],
  ['005850', 'S.L. Corp.', 'SL', 'cons-cyc', 2.58, 35600, -5.94, KR_ASOF_ISO],
  ['007340', 'DN Automotive Corporation', 'DN오토모티브', 'cons-cyc', 2.4, 37100, -3.26, KR_ASOF_ISO],
  ['204320', 'HL Mando Co., Ltd.', 'HL만도', 'cons-cyc', 2.38, 31350, -5.14, KR_ASOF_ISO],
  ['383220', 'F&F Co., Ltd.', 'F&F', 'cons-cyc', 2.37, 60700, -0.82, KR_ASOF_ISO],
  ['069960', 'Hyundai Department Store Co., Ltd.', '현대백화점', 'cons-cyc', 2.35, 98500, 0.92, KR_ASOF_ISO],
  ['081660', 'Misto Holdings Co., Ltd.', '미스토홀딩스', 'cons-cyc', 2.34, 31500, 0.64, KR_ASOF_ISO],
  ['009970', 'Youngone Holdings Co., Ltd.', '영원홀딩스', 'cons-cyc', 2.11, 162700, -0.85, KR_ASOF_ISO],
  ['073240', 'Kumho Tire Co., Inc.', '금호타이어', 'cons-cyc', 2.01, 5060, -4.17, KR_ASOF_ISO],

  // ---------- 필수소비재 ----------
  ['033780', 'KT&G Corporation', 'KT&G', 'cons-def', 18.27, 181100, -0.77, KR_ASOF_ISO],
  ['278470', 'APR Corporation', 'APR', 'cons-def', 13.46, 232500, -4.52, KR_ASOF_ISO],
  ['003230', 'Samyang Foods Co., Ltd.', '삼양식품', 'cons-def', 9.11, 1221000, -2.32, KR_ASOF_ISO],
  ['090430', 'Amorepacific Corporation', '아모레퍼시픽', 'cons-def', 8.14, 138500, -2.81, KR_ASOF_ISO],
  ['271560', 'ORION Corp.', '오리온', 'cons-def', 5.15, 116500, -1.52, KR_ASOF_ISO],
  ['051900', 'LG Household & Health Care Ltd.', 'LG생활건강', 'cons-def', 4.52, 252500, -0.39, KR_ASOF_ISO],
  ['001040', 'CJ Corporation', 'CJ(주)', 'cons-def', 4.26, 113700, -0.44, KR_ASOF_ISO],
  ['097950', 'CJ CheilJedang Corp.', 'CJ제일제당', 'cons-def', 3.07, 182500, -1.3, KR_ASOF_ISO],
  ['483650', "d'Alba Global Co., Ltd.", '달바글로벌', 'cons-def', 2.89, 123200, -6.17, KR_ASOF_ISO],
  ['026960', 'Dongsuh Companies, Inc.', '동서', 'cons-def', 2.49, 27550, -0.54, KR_ASOF_ISO],
  ['161890', 'Kolmar Korea Co., Ltd.', '한국콜마', 'cons-def', 2.41, 115600, -2.53, KR_ASOF_ISO],
  ['192820', 'Cosmax, Inc.', '코스맥스', 'cons-def', 2.21, 281000, -3.27, KR_ASOF_ISO],
  ['005440', 'Hyundai G.F. Holdings Co.,Ltd.', '현대지에프홀딩스', 'cons-def', 2.18, 11510, -2.29, KR_ASOF_ISO],
  ['002790', 'Amorepacific Group, Inc.', '아모레퍼시픽그룹', 'cons-def', 2.14, 27500, -1.61, KR_ASOF_ISO],
  ['139480', 'Emart Inc.', '이마트', 'cons-def', 2.13, 63500, -1.85, KR_ASOF_ISO],
  ['282330', 'BGF Retail Co., Ltd.', 'BGF리테일', 'cons-def', 2.11, 142800, 1.28, KR_ASOF_ISO],
  ['007070', 'GS Retail Co., Ltd.', 'GS리테일', 'cons-def', 2.07, 22000, 0.23, KR_ASOF_ISO],

  // ---------- 에너지 ----------
  ['096770', 'SK Innovation Co., Ltd.', 'SK이노베이션', 'energy', 18.44, 94200, -4.17, KR_ASOF_ISO],
  ['010950', 'S-Oil Corporation', '에쓰오일', 'energy', 14.03, 97000, -3.96, KR_ASOF_ISO],
  ['078930', 'GS Holdings Corp.', 'GS', 'energy', 8.93, 75100, -7.4, KR_ASOF_ISO],

  // ---------- 산업재 ----------
  ['373220', 'LG Energy Solution, Ltd.', 'LG에너지솔루션', 'industrials', 78.51, 297500, -1.49, KR_ASOF_ISO],
  ['028260', 'Samsung C&T Corporation', '삼성물산', 'industrials', 55.55, 255500, -6.24, KR_ASOF_ISO],
  ['329180', 'HD Hyundai Heavy Industries Co., Ltd.', 'HD현대중공업', 'industrials', 53.41, 247000, -5.54, KR_ASOF_ISO],
  ['012450', 'Hanwha Aerospace Co., Ltd.', '한화에어로스페이스', 'industrials', 51.65, 603000, -4.44, KR_ASOF_ISO],
  ['034020', 'Doosan Enerbility Co., Ltd.', '두산에너빌리티', 'industrials', 49.32, 40250, -8.11, KR_ASOF_ISO],
  ['006400', 'Samsung SDI Co., Ltd.', '삼성SDI', 'industrials', 32.67, 398500, -7, KR_ASOF_ISO],
  ['010120', 'LS ELECTRIC Co., Ltd.', 'LS일렉트릭', 'industrials', 31.52, 108400, -10.26, KR_ASOF_ISO],
  ['034730', 'SK Inc.', 'SK(주)', 'industrials', 30.64, 456500, -7.5, KR_ASOF_ISO],
  ['042660', 'Hanwha Ocean Co., Ltd.', '한화오션', 'industrials', 28.15, 41900, -6.89, KR_ASOF_ISO],
  ['009540', 'HD Korea Shipbuilding & Offshore Engineering Co., Ltd.', 'HD한국조선해양', 'industrials', 28, 221500, -4.11, KR_ASOF_ISO],
  ['298040', 'Hyosung Heavy Industries Corporation', '효성중공업', 'industrials', 27.8, 1651000, -8.07, KR_ASOF_ISO],
  ['267260', 'HD Hyundai Electric Co., Ltd.', 'HD현대일렉트릭', 'industrials', 27.79, 386000, -7.1, KR_ASOF_ISO],
  ['011200', 'HMM Co., Ltd.', 'HMM', 'industrials', 20, 21900, -2.88, KR_ASOF_ISO],
  ['000150', 'Doosan Corporation', '두산', 'industrials', 19.23, 518000, -15.36, KR_ASOF_ISO],
  ['010140', 'Samsung Heavy Industries Co., Ltd.', '삼성중공업', 'industrials', 18.96, 15030, -6.93, KR_ASOF_ISO],
  ['079550', 'LIG Nex1 Co., Ltd.', 'LIG넥스원', 'industrials', 17.43, 346000, -6.74, KR_ASOF_ISO],
  ['003550', 'LG Corp.', 'LG(주)', 'industrials', 16.35, 87700, -2.88, KR_ASOF_ISO],
  ['064350', 'Hyundai Rotem Company', '현대로템', 'industrials', 16.12, 61000, -8.41, KR_ASOF_ISO],
  ['086280', 'Hyundai Glovis Co., Ltd.', '현대글로비스', 'industrials', 15, 202500, -0.49, KR_ASOF_ISO],
  ['267250', 'HD Hyundai Co., Ltd.', 'HD현대', 'industrials', 14.73, 112400, -4.83, KR_ASOF_ISO],
  ['272210', 'Hanwha Systems Co., Ltd.', '한화시스템', 'industrials', 13.54, 46200, -5.81, KR_ASOF_ISO],
  ['047810', 'Korea Aerospace Industries, Ltd.', '한국항공우주산업', 'industrials', 13.4, 100300, -3.46, KR_ASOF_ISO],
  ['000720', 'Hyundai Engineering & Construction Co., Ltd.', '현대건설', 'industrials', 12.31, 71600, -9.94, KR_ASOF_ISO],
  ['003490', 'Korean Air Lines Co., Ltd.', '대한항공', 'industrials', 9.93, 31300, -3.54, KR_ASOF_ISO],
  ['028050', 'Samsung E&A Co., Ltd.', '삼성E&A', 'industrials', 9.62, 58800, -7.26, KR_ASOF_ISO],
  ['006260', 'LS Corp.', 'LS', 'industrials', 9, 166100, -8.74, KR_ASOF_ISO],
  ['443060', 'HD Hyundai Marine Solution Co., Ltd.', 'HD현대마린솔루션', 'industrials', 8.66, 183400, -0.38, KR_ASOF_ISO],
  ['180640', 'Hanjin Kal Corp.', '한진칼', 'industrials', 8.19, 237000, 9.72, KR_ASOF_ISO],
  ['267270', 'HD Hyundai Construction Equipment Co., Ltd.', 'HD현대건설기계', 'industrials', 6.78, 78300, -14.24, KR_ASOF_ISO],
  ['047040', 'Daewoo Engineering & Construction Co., Ltd.', '대우건설', 'industrials', 6.59, 10330, -8.75, KR_ASOF_ISO],
  ['241560', 'Doosan Bobcat Inc.', '두산밥캣', 'industrials', 6.16, 50200, -3.09, KR_ASOF_ISO],
  ['001440', 'Taihan Cable & Solution Co., Ltd.', '대한전선', 'industrials', 5.55, 16780, -7.45, KR_ASOF_ISO],
  ['000880', 'Hanwha Corporation', '한화', 'industrials', 5.46, 65800, -6.27, KR_ASOF_ISO],
  ['454910', 'Doosan Robotics Inc.', '두산로보틱스', 'industrials', 4.73, 47250, -6.8, KR_ASOF_ISO],
  ['000500', 'Gaon Cable Co., Ltd.', '가온전선', 'industrials', 4.73, 206500, -5.49, KR_ASOF_ISO],
  ['062040', 'Sanil Electric Co., Ltd.', '산일전기', 'industrials', 4.67, 102400, -11.57, KR_ASOF_ISO],
  ['052690', 'KEPCO Engineering & Construction Company, Inc.', '한전기술', 'industrials', 3.9, 62400, -7, KR_ASOF_ISO],
  ['082740', 'Hanwha Engine Co., Ltd.', '한화엔진', 'industrials', 3.84, 21550, -9.64, KR_ASOF_ISO],
  ['028670', 'Pan Ocean Co., Ltd.', '팬오션', 'industrials', 3.13, 4875, -4.41, KR_ASOF_ISO],
  ['103590', 'Iljin Electric Co., Ltd.', '일진전기', 'industrials', 2.91, 52600, -6.24, KR_ASOF_ISO],
  ['375500', 'DL E&C Co., Ltd.', 'DL이앤씨', 'industrials', 2.76, 46550, -7.82, KR_ASOF_ISO],
  ['004800', 'Hyosung Corporation', '효성', 'industrials', 2.7, 115000, -5.66, KR_ASOF_ISO],
  ['017800', 'Hyundai Elevator Co., Ltd.', '현대엘리베이터', 'industrials', 2.5, 61500, -7.93, KR_ASOF_ISO],
  ['012750', 'S-1 Corporation', '에스원', 'industrials', 2.49, 105900, 0.09, KR_ASOF_ISO],
  ['006360', 'GS Engineering & Construction Corp.', 'GS건설', 'industrials', 2.44, 28250, -6.3, KR_ASOF_ISO],
  ['336260', 'Doosan Fuel Cell Co., Ltd.', '두산퓨얼셀', 'industrials', 2.27, 23650, -7.62, KR_ASOF_ISO],
  ['051600', 'KEPCO Plant Service & Engineering Co., Ltd.', '한전KPS', 'industrials', 2.1, 34050, -2.16, KR_ASOF_ISO],
  ['071970', 'HD Hyundai Marine Engine Co., Ltd.', 'HD현대마린엔진', 'industrials', 2.01, 31150, -9.84, KR_ASOF_ISO],

  // ---------- 의료 ----------
  ['207940', 'Samsung Biologics Co.,Ltd.', '삼성바이오로직스', 'healthcare', 69.02, 1336000, -2.84, KR_ASOF_ISO],
  ['068270', 'Celltrion, Inc.', '셀트리온', 'healthcare', 43.64, 212500, -1.16, KR_ASOF_ISO],
  ['326030', 'SK Biopharmaceuticals Co., Ltd.', 'SK바이오팜', 'healthcare', 6.42, 86000, -1.26, KR_ASOF_ISO],
  ['000100', 'Yuhan Corporation', '유한양행', 'healthcare', 5.6, 80400, -1.11, KR_ASOF_ISO],
  ['128940', 'Hanmi Pharm. Co., Ltd.', '한미약품', 'healthcare', 4.82, 449500, 6.52, KR_ASOF_ISO],
  ['302440', 'SK bioscience Co., Ltd.', 'SK바이오사이언스', 'healthcare', 2.71, 38500, 0.79, KR_ASOF_ISO],
  ['009420', 'HanAll Biopharma Co., Ltd.', '한올바이오파마', 'healthcare', 2.7, 53300, -1.3, KR_ASOF_ISO],
  ['008930', 'Hanmi Science Co., Ltd.', '한미사이언스', 'healthcare', 2.65, 51400, 0.39, KR_ASOF_ISO],

  // ---------- 기초 소재 ----------
  ['005490', 'POSCO Holdings Inc.', 'POSCO홀딩스', 'materials', 23.97, 252000, -2.89, KR_ASOF_ISO],
  ['010130', 'Korea Zinc Co., Ltd.', '고려아연', 'materials', 22.33, 742000, -6.31, KR_ASOF_ISO],
  ['051910', 'LG Chem, Ltd.', 'LG화학', 'materials', 18.97, 202000, -3.58, KR_ASOF_ISO],
  ['003670', 'POSCO Future M Co., Ltd.', '포스코퓨처엠', 'materials', 12.7, 157600, -5.06, KR_ASOF_ISO],
  ['047050', 'POSCO International Corporation', '포스코인터내셔널', 'materials', 9.2, 46500, -3.63, KR_ASOF_ISO],
  ['009830', 'Hanwha Solutions Corporation', '한화솔루션', 'materials', 5.15, 19140, -7.98, KR_ASOF_ISO],
  ['010060', 'OCI Holdings Company, Ltd.', 'OCI홀딩스', 'materials', 4.59, 155400, -8.59, KR_ASOF_ISO],
  ['004020', 'Hyundai Steel Company', '현대제철', 'materials', 3.64, 27450, -3.68, KR_ASOF_ISO],
  ['066970', 'L&F Co., Ltd.', '엘앤에프', 'materials', 3.15, 68100, -6.46, KR_ASOF_ISO],
  ['002380', 'KCC Corporation', 'KCC', 'materials', 3.05, 342500, -4.99, KR_ASOF_ISO],
  ['011780', 'Kumho Petrochemical Co., Ltd.', '금호석유화학', 'materials', 2.85, 91100, -2.04, KR_ASOF_ISO],
  ['011790', 'SKC Co., Ltd.', 'SKC', 'materials', 2.78, 65500, -7.75, KR_ASOF_ISO],
  ['000240', 'Hankook & Company Co., Ltd.', '한국앤컴퍼니', 'materials', 2.41, 19250, -2.78, KR_ASOF_ISO],
  ['450080', 'Ecopro Materials Co., Ltd.', '에코프로머티', 'materials', 2.4, 25150, -6.33, KR_ASOF_ISO],
  ['014680', 'Hansol Chemical Co., Ltd.', '한솔케미칼', 'materials', 2.33, 170000, -4.12, KR_ASOF_ISO],

  // ---------- 유틸리티 ----------
  ['015760', 'Korea Electric Power Corporation', '한국전력공사', 'utilities', 22.92, 25550, 1.19, KR_ASOF_ISO],
  ['036460', 'Korea Gas Corporation', '한국가스공사', 'utilities', 2.96, 37400, -1.97, KR_ASOF_ISO],
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
