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

   Row-tuple shape mirrors `universe.ts`'s `StockRow`:
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

/** [code, name, nameKo, sectorId, marketCapTrillionKrw, priceKrw, dayChangePct] */
type KrStockRow = [string, string, string, SectorId, number, number, number];

export const KR_STOCKS: KrStockRow[] = [
  // ---------- 기술 ----------
  ['005930', 'Samsung Electronics Co., Ltd.', '삼성전자', 'tech', 1568.32, 246000, 2.5],
  ['000660', 'SK hynix Inc.', 'SK하이닉스', 'tech', 1215.75, 1668000, 5.77],
  ['402340', 'SK Square Co., Ltd.', 'SK스퀘어', 'tech', 147.36, 1119000, 5.57],
  ['009150', 'Samsung Electro-Mechanics Co., Ltd.', '삼성전기', 'tech', 99.92, 1356000, 14.43],
  ['066570', 'LG Electronics Inc.', 'LG전자', 'tech', 30.29, 179500, 8.46],
  ['042700', 'Hanmi Semiconductor Co., Ltd.', '한미반도체', 'tech', 19.82, 209000, 2.96],
  ['018260', 'Samsung SDS Co., Ltd.', '삼성SDS', 'tech', 16.98, 230500, 5.01],
  ['011070', 'LG Innotek Co., Ltd.', 'LG이노텍', 'tech', 14.22, 601000, 14.48],
  ['307950', 'Hyundai AutoEver Corp.', '현대오토에버', 'tech', 10.81, 414500, 5.2],
  ['064400', 'LG CNS Co., Ltd.', 'LG CNS', 'tech', 7.1, 73300, 7.64],
  ['007660', 'ISU Petasys Co., Ltd.', '이수페타시스', 'tech', 5.84, 84700, 6.41],
  ['353200', 'Daeduck Electronics Co., Ltd.', '대덕전자', 'tech', 5.3, 106300, 8.69],
  ['034220', 'LG Display Co., Ltd.', 'LG디스플레이', 'tech', 4.9, 9800, 2.83],
  ['000990', 'DB HiTek Co., Ltd.', 'DB하이텍', 'tech', 3.8, 90000, 5.88],
  ['022100', 'POSCO DX Co., Ltd.', '포스코DX', 'tech', 3.17, 20850, 2.71],
  ['489790', 'Hanwha Vision Co., Ltd.', '한화비전', 'tech', 2.47, 49000, 9.62],

  // ---------- 커뮤니케이션 서비스 ----------
  ['035420', 'NAVER Corporation', '네이버', 'comm', 34.26, 229000, 1.1],
  ['017670', 'SK Telecom Co., Ltd.', 'SK텔레콤', 'comm', 19.81, 93000, 1.75],
  ['035720', 'Kakao Corp.', '카카오', 'comm', 16.81, 38150, 0.66],
  ['030200', 'KT Corporation', 'KT', 'comm', 12.66, 52500, 0.38],
  ['259960', 'KRAFTON, Inc.', '크래프톤', 'comm', 10.04, 229000, -3.78],
  ['032640', 'LG Uplus Corp.', 'LG유플러스', 'comm', 6.33, 14920, -0.07],
  ['036570', 'NCsoft Corporation', '엔씨소프트', 'comm', 4.56, 235000, -2.29],
  ['251270', 'Netmarble Corporation', '넷마블', 'comm', 3.11, 37950, -3.44],

  // ---------- 금융 서비스 ----------
  ['105560', 'KB Financial Group Inc.', 'KB금융', 'fin', 59.87, 169500, 1.13],
  ['032830', 'Samsung Life Insurance Co., Ltd.', '삼성생명', 'fin', 52.79, 294000, 5.76],
  ['055550', 'Shinhan Financial Group Co., Ltd.', '신한지주', 'fin', 49.17, 103600, 1.27],
  ['086790', 'Hana Financial Group Inc.', '하나금융지주', 'fin', 34.4, 128600, 0.78],
  ['000810', 'Samsung Fire & Marine Insurance Co., Ltd.', '삼성화재', 'fin', 25.74, 637000, 2.74],
  ['316140', 'Woori Financial Group Inc.', '우리금융지주', 'fin', 24.38, 33350, 0.45],
  ['138040', 'Meritz Financial Group Inc.', '메리츠금융지주', 'fin', 19.65, 120400, 0.75],
  ['006800', 'Mirae Asset Securities Co., Ltd.', '미래에셋증권', 'fin', 16.59, 35200, 3.38],
  ['024110', 'Industrial Bank of Korea', '기업은행', 'fin', 16.11, 20200, -0.74],
  ['071050', 'Korea Investment Holdings Co., Ltd.', '한국금융지주', 'fin', 11.91, 209500, 3.46],
  ['005940', 'NH Investment & Securities Co., Ltd.', 'NH투자증권', 'fin', 10.52, 28150, 1.08],
  ['323410', 'KakaoBank Corp.', '카카오뱅크', 'fin', 10.28, 21550, -1.37],
  ['005830', 'DB Insurance Co., Ltd.', 'DB손해보험', 'fin', 9.39, 155500, 0.45],
  ['016360', 'Samsung Securities Co., Ltd.', '삼성증권', 'fin', 8.72, 97600, -1.01],
  ['039490', 'Kiwoom Securities Co., Ltd.', '키움증권', 'fin', 7.67, 292500, 2.99],
  ['377300', 'Kakao Pay Corp.', '카카오페이', 'fin', 5.62, 42000, -4.11],
  ['175330', 'JB Financial Group Co., Ltd.', 'JB금융지주', 'fin', 5.16, 27500, 2.77],
  ['138930', 'BNK Financial Group Inc.', 'BNK금융지주', 'fin', 4.69, 14940, -1.13],
  ['088350', 'Hanwha Life Insurance Co., Ltd.', '한화생명', 'fin', 3.24, 4355, 1.04],
  ['031210', 'Seoul Guarantee Insurance Co., Ltd.', '서울보증보험', 'fin', 2.97, 42950, 0.94],
  ['139130', 'iM Financial Group Co., Ltd.', 'iM금융지주', 'fin', 2.76, 17290, 0.23],
  ['001450', 'Hyundai Marine & Fire Insurance Co., Ltd.', '현대해상화재보험', 'fin', 2.73, 36700, -0.27],
  ['003690', 'Korean Reinsurance Company', '코리안리', 'fin', 2.44, 13830, 0.66],
  ['279570', 'K bank Co., Ltd.', '케이뱅크', 'fin', 2.3, 5680, 1.07],
  ['085620', 'Mirae Asset Life Insurance Co., Ltd.', '미래에셋생명', 'fin', 2.03, 16830, 10.87],

  // ---------- 경기소비재 ----------
  ['005380', 'Hyundai Motor Company', '현대자동차', 'cons-cyc', 94.11, 404500, 3.06],
  ['000270', 'Kia Corporation', '기아', 'cons-cyc', 50.36, 133000, 2.62],
  ['012330', 'Hyundai Mobis Co., Ltd.', '현대모비스', 'cons-cyc', 44.86, 503000, 4.47],
  ['021240', 'COWAY Co., Ltd.', '코웨이', 'cons-cyc', 6.51, 92400, -2.01],
  ['004170', 'Shinsegae Co., Ltd.', '신세계', 'cons-cyc', 3.77, 430000, 1.06],
  ['111770', 'Youngone Corporation', '영원무역', 'cons-cyc', 3.77, 88200, -1.12],
  ['018880', 'Hanon Systems', '한온시스템', 'cons-cyc', 3.46, 3530, 4.75],
  ['023530', 'Lotte Shopping Co., Ltd.', '롯데쇼핑', 'cons-cyc', 3.23, 114300, -0.35],
  ['035250', 'Kangwon Land, Inc.', '강원랜드', 'cons-cyc', 2.81, 14200, -2.07],
  ['005850', 'S.L. Corp.', 'SL', 'cons-cyc', 2.58, 56100, 3.7],
  ['007340', 'DN Automotive Corporation', 'DN오토모티브', 'cons-cyc', 2.4, 46400, 8.28],
  ['204320', 'HL Mando Co., Ltd.', 'HL만도', 'cons-cyc', 2.38, 50600, 3.8],
  ['383220', 'F&F Co., Ltd.', 'F&F', 'cons-cyc', 2.37, 65000, 2.69],
  ['069960', 'Hyundai Department Store Co., Ltd.', '현대백화점', 'cons-cyc', 2.35, 113800, -3.89],
  ['081660', 'Misto Holdings Co., Ltd.', '미스토홀딩스', 'cons-cyc', 2.34, 44050, -0.79],
  ['009970', 'Youngone Holdings Co., Ltd.', '영원홀딩스', 'cons-cyc', 2.11, 189900, -0.52],
  ['073240', 'Kumho Tire Co., Inc.', '금호타이어', 'cons-cyc', 2.01, 7380, 5.73],

  // ---------- 필수소비재 ----------
  ['033780', 'KT&G Corporation', 'KT&G', 'cons-def', 18.27, 176000, 0.23],
  ['278470', 'APR Corporation', 'APR', 'cons-def', 13.46, 357500, -0.56],
  ['003230', 'Samyang Foods Co., Ltd.', '삼양식품', 'cons-def', 9.11, 1210000, -0.74],
  ['090430', 'Amorepacific Corporation', '아모레퍼시픽', 'cons-def', 8.14, 131300, -0.45],
  ['271560', 'ORION Corp.', '오리온', 'cons-def', 5.15, 130300, -1.81],
  ['051900', 'LG Household & Health Care Ltd.', 'LG생활건강', 'cons-def', 4.52, 292500, 0.34],
  ['001040', 'CJ Corporation', 'CJ(주)', 'cons-def', 4.26, 137800, 4.39],
  ['097950', 'CJ CheilJedang Corp.', 'CJ제일제당', 'cons-def', 3.07, 198500, 1.74],
  ['483650', "d'Alba Global Co., Ltd.", '달바글로벌', 'cons-def', 2.89, 232000, -3.13],
  ['026960', 'Dongsuh Companies, Inc.', '동서', 'cons-def', 2.49, 25200, -0.79],
  ['161890', 'Kolmar Korea Co., Ltd.', '한국콜마', 'cons-def', 2.41, 102300, 0.99],
  ['192820', 'Cosmax, Inc.', '코스맥스', 'cons-def', 2.21, 195000, -0.1],
  ['005440', 'Hyundai G.F. Holdings Co.,Ltd.', '현대지에프홀딩스', 'cons-def', 2.18, 12110, 0.92],
  ['002790', 'Amorepacific Group, Inc.', '아모레퍼시픽그룹', 'cons-def', 2.14, 26100, 0.77],
  ['139480', 'Emart Inc.', '이마트', 'cons-def', 2.13, 79700, -0.5],
  ['282330', 'BGF Retail Co., Ltd.', 'BGF리테일', 'cons-def', 2.11, 122300, -2.39],
  ['007070', 'GS Retail Co., Ltd.', 'GS리테일', 'cons-def', 2.07, 24800, -1],

  // ---------- 에너지 ----------
  ['096770', 'SK Innovation Co., Ltd.', 'SK이노베이션', 'energy', 18.44, 109200, -1.89],
  ['010950', 'S-Oil Corporation', '에쓰오일', 'energy', 14.03, 122500, -2.62],
  ['078930', 'GS Holdings Corp.', 'GS', 'energy', 8.93, 95500, -1.44],

  // ---------- 산업재 ----------
  ['373220', 'LG Energy Solution, Ltd.', 'LG에너지솔루션', 'industrials', 78.51, 335500, 2.13],
  ['028260', 'Samsung C&T Corporation', '삼성물산', 'industrials', 55.55, 347500, 7.75],
  ['329180', 'HD Hyundai Heavy Industries Co., Ltd.', 'HD현대중공업', 'industrials', 53.41, 509000, 5.38],
  ['012450', 'Hanwha Aerospace Co., Ltd.', '한화에어로스페이스', 'industrials', 51.65, 1007000, 0.3],
  ['034020', 'Doosan Enerbility Co., Ltd.', '두산에너빌리티', 'industrials', 49.32, 77000, 5.48],
  ['006400', 'Samsung SDI Co., Ltd.', '삼성SDI', 'industrials', 32.67, 429000, 2.26],
  ['010120', 'LS ELECTRIC Co., Ltd.', 'LS일렉트릭', 'industrials', 31.52, 212000, 7.61],
  ['034730', 'SK Inc.', 'SK(주)', 'industrials', 30.64, 562000, 8.49],
  ['042660', 'Hanwha Ocean Co., Ltd.', '한화오션', 'industrials', 28.15, 91900, 5.03],
  ['009540', 'HD Korea Shipbuilding & Offshore Engineering Co., Ltd.', 'HD한국조선해양', 'industrials', 28, 396000, 5.88],
  ['298040', 'Hyosung Heavy Industries Corporation', '효성중공업', 'industrials', 27.8, 2985000, 12.43],
  ['267260', 'HD Hyundai Electric Co., Ltd.', 'HD현대일렉트릭', 'industrials', 27.79, 772000, 7.82],
  ['011200', 'HMM Co., Ltd.', 'HMM', 'industrials', 20, 21100, -0.47],
  ['000150', 'Doosan Corporation', '두산', 'industrials', 19.23, 1259000, -1.1],
  ['010140', 'Samsung Heavy Industries Co., Ltd.', '삼성중공업', 'industrials', 18.96, 22200, 2.54],
  ['079550', 'LIG Nex1 Co., Ltd.', 'LIG넥스원', 'industrials', 17.43, 798000, -0.37],
  ['003550', 'LG Corp.', 'LG(주)', 'industrials', 16.35, 106800, 4.71],
  ['064350', 'Hyundai Rotem Company', '현대로템', 'industrials', 16.12, 147700, 5.58],
  ['086280', 'Hyundai Glovis Co., Ltd.', '현대글로비스', 'industrials', 15, 205500, 2.75],
  ['267250', 'HD Hyundai Co., Ltd.', 'HD현대', 'industrials', 14.73, 219000, 5.04],
  ['272210', 'Hanwha Systems Co., Ltd.', '한화시스템', 'industrials', 13.54, 72400, 4.78],
  ['047810', 'Korea Aerospace Industries, Ltd.', '한국항공우주산업', 'industrials', 13.4, 146500, 6.55],
  ['000720', 'Hyundai Engineering & Construction Co., Ltd.', '현대건설', 'industrials', 12.31, 110100, 8.47],
  ['003490', 'Korean Air Lines Co., Ltd.', '대한항공', 'industrials', 9.93, 26900, 3.07],
  ['028050', 'Samsung E&A Co., Ltd.', '삼성E&A', 'industrials', 9.62, 49100, 2.83],
  ['006260', 'LS Corp.', 'LS', 'industrials', 9, 329000, 9.48],
  ['443060', 'HD Hyundai Marine Solution Co., Ltd.', 'HD현대마린솔루션', 'industrials', 8.66, 193100, 4.44],
  ['180640', 'Hanjin Kal Corp.', '한진칼', 'industrials', 8.19, 123900, 2.91],
  ['267270', 'HD Hyundai Construction Equipment Co., Ltd.', 'HD현대건설기계', 'industrials', 6.78, 141900, 11.64],
  ['047040', 'Daewoo Engineering & Construction Co., Ltd.', '대우건설', 'industrials', 6.59, 16230, 6.78],
  ['241560', 'Doosan Bobcat Inc.', '두산밥캣', 'industrials', 6.16, 63900, 2.55],
  ['001440', 'Taihan Cable & Solution Co., Ltd.', '대한전선', 'industrials', 5.55, 28450, 11.57],
  ['000880', 'Hanwha Corporation', '한화', 'industrials', 5.46, 83800, -3.46],
  ['454910', 'Doosan Robotics Inc.', '두산로보틱스', 'industrials', 4.73, 73000, 6.57],
  ['000500', 'Gaon Cable Co., Ltd.', '가온전선', 'industrials', 4.73, 158900, 8.46],
  ['062040', 'Sanil Electric Co., Ltd.', '산일전기', 'industrials', 4.67, 167200, 9.35],
  ['052690', 'KEPCO Engineering & Construction Company, Inc.', '한전기술', 'industrials', 3.9, 102500, 3.54],
  ['082740', 'Hanwha Engine Co., Ltd.', '한화엔진', 'industrials', 3.84, 46000, 12.88],
  ['028670', 'Pan Ocean Co., Ltd.', '팬오션', 'industrials', 3.13, 5860, 3.9],
  ['103590', 'Iljin Electric Co., Ltd.', '일진전기', 'industrials', 2.91, 61100, 8.91],
  ['375500', 'DL E&C Co., Ltd.', 'DL이앤씨', 'industrials', 2.76, 70700, 7.12],
  ['004800', 'Hyosung Corporation', '효성', 'industrials', 2.7, 161800, 9.1],
  ['017800', 'Hyundai Elevator Co., Ltd.', '현대엘리베이터', 'industrials', 2.5, 71200, 2.89],
  ['012750', 'S-1 Corporation', '에스원', 'industrials', 2.49, 73600, 1.8],
  ['006360', 'GS Engineering & Construction Corp.', 'GS건설', 'industrials', 2.44, 31150, 8.35],
  ['336260', 'Doosan Fuel Cell Co., Ltd.', '두산퓨얼셀', 'industrials', 2.27, 34600, 20.98],
  ['051600', 'KEPCO Plant Service & Engineering Co., Ltd.', '한전KPS', 'industrials', 2.1, 46600, 1.75],
  ['071970', 'HD Hyundai Marine Engine Co., Ltd.', 'HD현대마린엔진', 'industrials', 2.01, 59200, 12.55],

  // ---------- 의료 ----------
  ['207940', 'Samsung Biologics Co.,Ltd.', '삼성바이오로직스', 'healthcare', 69.02, 1491000, 1.02],
  ['068270', 'Celltrion, Inc.', '셀트리온', 'healthcare', 43.64, 190300, 2.42],
  ['326030', 'SK Biopharmaceuticals Co., Ltd.', 'SK바이오팜', 'healthcare', 6.42, 82000, 2.76],
  ['000100', 'Yuhan Corporation', '유한양행', 'healthcare', 5.6, 75100, 0.4],
  ['128940', 'Hanmi Pharm. Co., Ltd.', '한미약품', 'healthcare', 4.82, 380000, 0.53],
  ['302440', 'SK bioscience Co., Ltd.', 'SK바이오사이언스', 'healthcare', 2.71, 34700, 0.14],
  ['009420', 'HanAll Biopharma Co., Ltd.', '한올바이오파마', 'healthcare', 2.7, 53100, 2.12],
  ['008930', 'Hanmi Science Co., Ltd.', '한미사이언스', 'healthcare', 2.65, 39900, 1.79],

  // ---------- 기초 소재 ----------
  ['005490', 'POSCO Holdings Inc.', 'POSCO홀딩스', 'materials', 23.97, 317000, 1.28],
  ['010130', 'Korea Zinc Co., Ltd.', '고려아연', 'materials', 22.33, 1095000, 4.89],
  ['051910', 'LG Chem, Ltd.', 'LG화학', 'materials', 18.97, 255500, -0.39],
  ['003670', 'POSCO Future M Co., Ltd.', '포스코퓨처엠', 'materials', 12.7, 146200, 2.38],
  ['047050', 'POSCO International Corporation', '포스코인터내셔널', 'materials', 9.2, 54400, 0.74],
  ['009830', 'Hanwha Solutions Corporation', '한화솔루션', 'materials', 5.15, 30150, 12.5],
  ['010060', 'OCI Holdings Company, Ltd.', 'OCI홀딩스', 'materials', 4.59, 246000, 9.33],
  ['004020', 'Hyundai Steel Company', '현대제철', 'materials', 3.64, 27650, 4.54],
  ['066970', 'L&F Co., Ltd.', '엘앤에프', 'materials', 3.15, 79800, 2.97],
  ['002380', 'KCC Corporation', 'KCC', 'materials', 3.05, 432000, 8.95],
  ['011780', 'Kumho Petrochemical Co., Ltd.', '금호석유화학', 'materials', 2.85, 119800, 2.39],
  ['011790', 'SKC Co., Ltd.', 'SKC', 'materials', 2.78, 81400, 4.23],
  ['000240', 'Hankook & Company Co., Ltd.', '한국앤컴퍼니', 'materials', 2.41, 25450, 1.6],
  ['450080', 'Ecopro Materials Co., Ltd.', '에코프로머티', 'materials', 2.4, 33900, 3.51],
  ['014680', 'Hansol Chemical Co., Ltd.', '한솔케미칼', 'materials', 2.33, 225500, 5.13],

  // ---------- 유틸리티 ----------
  ['015760', 'Korea Electric Power Corporation', '한국전력공사', 'utilities', 22.92, 35700, 1.56],
  ['036460', 'Korea Gas Corporation', '한국가스공사', 'utilities', 2.96, 33950, -0.44],
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

/**
 * [symbol, name, nameKo, price/level, dayChangePct, unit] — market benchmarks.
 * Indices carry `unit: 'POINTS'`; the USD/KRW row carries `unit: 'KRW'`.
 */
type KrIndexRow = [string, string, string, number, number, InstrumentUnit];

export const KR_INDICES: KrIndexRow[] = [
  ['^KOSPI', 'KOSPI', '코스피', 6598.26, 3.76, 'POINTS'],
  ['^KOSDAQ', 'KOSDAQ', '코스닥', 799.59, 2.42, 'POINTS'],
  ['^KOSPI200', 'KOSPI 200', '코스피200', 1038.59, 3.86, 'POINTS'],
  ['USDKRW', 'US Dollar / Korean Won', '달러/원', 1423.05, -0.45, 'KRW'],
  ['^VKOSPI', 'KOSPI Volatility Index', 'VKOSPI', 78.55, -4.27, 'POINTS'],
];

function krIndexAsset([symbol, name, nameKo, price, changePct, unit]: KrIndexRow): SeedAsset {
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
