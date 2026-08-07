/* ============================================================
   Asset universe — seeded to the reference snapshot
   (2026-08-04 US market close, EDT).

   Equity prices, day changes and market caps for all 187 tickers were
   captured from stockanalysis.com at that close. Crypto rows are a
   separate 2026-08-05 capture from CoinGecko, which is why SNAPSHOT
   carries its own `cryptoAsOfISO`.

   Only ^GSPC, ^DJI, ^VIX and GC=F were re-captured among the macro rows,
   and only because two independent sources agreed on them. ^IXIC and the
   crude contracts were deliberately left at their earlier fills: reported
   values disagreed across outlets (Nasdaq +1.13% vs +2.59%; WTI $75.32 vs
   $77.77 vs $80.34), and a number we cannot corroborate does not belong in
   a financial surface even a labelled one. Futures, yields and FX were not
   re-captured either.

   This is seed data for the offline demo, not a provider feed. It is
   a point-in-time capture that goes stale immediately, and the UI
   labels everything driven by it as `DEMO · 합성 시세`. Nothing here is
   ever promoted to `verified` — see the provenance rules in
   ARCHITECTURE.md.

   2026-08-07 partial refresh (`.superpowers/refresh-2026-08-07-us.md`): 21 of
   the ~187 US rows below (8 individually-verified mega-caps plus 13 more
   matched exactly against a second table snapshot) and 3 of the macro rows
   (^GSPC, ^IXIC, ^DJI) were re-verified against a settled Thursday
   2026-08-06 close and now carry their own row-level `asOfISO` (see
   `US_ASOF_ISO` above). Every other row is still the original 2026-08-04
   capture — `US_PREV_ASOF_ISO` is what engine.ts falls back to for those.
   Crypto was not touched in this pass (no full-batch recapture; see
   `SNAPSHOT.cryptoAsOfISO`'s comment below).
   ============================================================ */
import type { AssetKind, AssetMeta, SectorId, SectorInfo } from './types.js';
import type { MarketRegion } from './region.js';
import { KR_ASOF_ISO, KR_SECTORS } from './universe.kr.js';

/**
 * 2026-08-07 partial refresh (`.superpowers/refresh-2026-08-07-us.md`). The US session had not
 * closed Friday 08-07 when the research ran — every settled close found was Thursday 2026-08-06,
 * 16:00 EDT — so `US_ASOF_ISO` is that Thursday close, not the Friday the refresh was run on.
 * Rows the research corroborated to that close carry this literal as their row-level `asOfISO`
 * override (see `AssetMeta.asOfISO` in types.ts); it's also `SNAPSHOT.asOfISO` below, so the two
 * stay identical by construction rather than by two independently-typed literals drifting apart.
 * `US_PREV_ASOF_ISO` is the previous 2026-08-04 close — what engine.ts falls back to for every US
 * row this pass did NOT re-verify, so bumping `SNAPSHOT.asOfISO` forward doesn't relabel the
 * ~85% of the US universe still priced as of the old close.
 */
export const US_ASOF_ISO = '2026-08-06T16:00:00-04:00';
export const US_PREV_ASOF_ISO = '2026-08-04T16:00:00-04:00';

/** US sector index levels (renamed from `SECTORS`; see `SECTORS_BY_REGION`). */
export const US_SECTORS: SectorInfo[] = [
  { id: 'tech',        nameKo: '기술',              nameEn: 'Technology',             indexValue: 185.78, changePct: 0.23 },
  { id: 'energy',      nameKo: '에너지',            nameEn: 'Energy',                 indexValue: 55.08,  changePct: 0.47 },
  { id: 'cons-cyc',    nameKo: '경기소비재',        nameEn: 'Consumer Cyclical',      indexValue: 117.24, changePct: 0.33 },
  { id: 'cons-def',    nameKo: '필수소비재',        nameEn: 'Consumer Defensive',     indexValue: 84.12,  changePct: 1.11 },
  { id: 'comm',        nameKo: '커뮤니케이션 서비스', nameEn: 'Communication Services', indexValue: 111.64, changePct: 1.02 },
  { id: 'industrials', nameKo: '산업재',            nameEn: 'Industrials',            indexValue: 181.92, changePct: 0.44 },
  { id: 'fin',         nameKo: '금융 서비스',       nameEn: 'Financial Services',     indexValue: 55.71,  changePct: 0.31 },
  { id: 'utilities',   nameKo: '유틸리티',          nameEn: 'Utilities',              indexValue: 45.41,  changePct: 0.62 },
  { id: 'materials',   nameKo: '기초 소재',         nameEn: 'Basic Materials',        indexValue: 50.89,  changePct: 1.25 },
  { id: 'realestate',  nameKo: '부동산',            nameEn: 'Real Estate',            indexValue: 44.45,  changePct: 0.50 },
  { id: 'healthcare',  nameKo: '의료',              nameEn: 'Healthcare',             indexValue: 160.84, changePct: -0.82 },
];

/** Kept as an alias of `US_SECTORS` so existing imports keep compiling; Task 7 onward migrates them. */
export const SECTORS = US_SECTORS;

export const SECTOR_BY_ID: Record<SectorId, SectorInfo> = Object.fromEntries(
  US_SECTORS.map((s) => [s.id, s]),
) as Record<SectorId, SectorInfo>;

export const SECTORS_BY_REGION: Readonly<Record<MarketRegion, readonly SectorInfo[]>> =
  Object.freeze({
    US: US_SECTORS,
    KR: KR_SECTORS,
  });

/** [symbol, name, nameKo, sector, marketCap($B), price, dayChangePct, asOfISO?] */
type StockRow = [string, string, string, SectorId, number, number, number, string?];

const STOCKS: StockRow[] = [
  // ---------- 기술 ----------
  ['NVDA', 'NVIDIA Corporation', '엔비디아', 'tech', 5300, 218.99, -0.1, US_ASOF_ISO],
  ['MSFT', 'Microsoft Corporation', '마이크로소프트', 'tech', 3710, 499.86, 2.54, US_ASOF_ISO],
  ['AAPL', 'Apple Inc.', '애플', 'tech', 4560, 312.41, 0.45, US_ASOF_ISO],
  ['AVGO', 'Broadcom Inc.', '브로드컴', 'tech', 2000, 420.57, 0.55, US_ASOF_ISO],
  ['MU', 'Micron Technology, Inc.', '마이크론', 'tech', 995.53, 881.47, -1.31, US_ASOF_ISO],
  ['AMD', 'Advanced Micro Devices, Inc.', 'AMD', 'tech', 798.74, 489.28, 1.5, US_ASOF_ISO],
  ['ORCL', 'Oracle Corporation', '오라클', 'tech', 413.26, 143.47, -0.64, US_ASOF_ISO],
  ['PLTR', 'Palantir Technologies Inc.', '팔란티어', 'tech', 391, 162.66, 29.45],
  ['HYNX', 'SK Hynix Inc. (ADR)', 'SK하이닉스', 'tech', 805, 154.38, 8.17],
  ['INTC', 'Intel Corporation', '인텔', 'tech', 503.44, 99.81, -1.24, US_ASOF_ISO],
  ['IBM', 'International Business Machines', 'IBM', 'tech', 222, 235.15, 3.91],
  ['CSCO', 'Cisco Systems, Inc.', '시스코', 'tech', 480, 121.74, 5.08],
  ['CRM', 'Salesforce, Inc.', '세일즈포스', 'tech', 156, 190.99, 2.71],
  ['AMAT', 'Applied Materials, Inc.', '어플라이드 머티어리얼즈', 'tech', 434, 546.62, 5.48],
  ['NOW', 'ServiceNow, Inc.', '서비스나우', 'tech', 122, 118.14, 3.46],
  ['ADBE', 'Adobe Inc.', '어도비', 'tech', 102, 257.49, 2.45],
  ['UBER', 'Uber Technologies, Inc.', '우버', 'tech', 147, 71.99, 0.53],
  ['TXN', 'Texas Instruments Incorporated', '텍사스 인스트루먼츠', 'tech', 259, 283.63, 5.42],
  ['QCOM', 'QUALCOMM Incorporated', '퀄컴', 'tech', 174, 162.67, 7.32],
  ['INTU', 'Intuit Inc.', '인튜이트', 'tech', 89, 323.6, 1.64],
  ['LRCX', 'Lam Research Corporation', '램 리서치', 'tech', 398, 317.74, 7.85],
  ['APP', 'AppLovin Corporation', '앱러빈', 'tech', 141, 419.7, 3.33],
  ['ANET', 'Arista Networks, Inc.', '아리스타 네트웍스', 'tech', 240, 190.51, 3.04],
  ['KLAC', 'KLA Corporation', 'KLA', 'tech', 255, 195.45, 6.95],
  ['PANW', 'Palo Alto Networks, Inc.', '팔로알토 네트웍스', 'tech', 299, 366.34, 5.53],
  ['MRVL', 'Marvell Technology, Inc.', '마벨 테크놀로지', 'tech', 191, 218.59, 12.81],
  ['ADI', 'Analog Devices, Inc.', '아날로그 디바이시스', 'tech', 185, 380.29, 5.09],
  ['DELL', 'Dell Technologies Inc.', '델', 'tech', 302, 467.27, 8.92],
  ['CRWD', 'CrowdStrike Holdings, Inc.', '크라우드스트라이크', 'tech', 215, 211.22, 4.29],
  ['SNOW', 'Snowflake Inc.', '스노우플레이크', 'tech', 110, 316.77, 3.0],
  ['FTNT', 'Fortinet, Inc.', '포티넷', 'tech', 123, 168.29, 3.11],
  ['SMCI', 'Super Micro Computer, Inc.', '슈퍼마이크로', 'tech', 20, 31.69, 10.65],
  ['WDC', 'Western Digital Corporation', '웨스턴 디지털', 'tech', 189, 548.56, 4.05],
  ['STX', 'Seagate Technology Holdings', '씨게이트', 'tech', 192, 845.35, 1.72],
  ['RXT', 'Rackspace Technology, Inc.', '랙스페이스', 'tech', 1.31, 5.15, 7.97],
  ['XNDU', 'Xanadu Quantum Technologies', '자나두 퀀텀', 'tech', 3.48, 11.6, 2.56],
  ['IONQ', 'IonQ, Inc.', '아이온큐', 'tech', 16, 41.72, 7.39],
  ['RGTI', 'Rigetti Computing, Inc.', '리게티 컴퓨팅', 'tech', 5.8, 17.45, 8.93],
  ['SOUN', 'SoundHound AI, Inc.', '사운드하운드 AI', 'tech', 2.82, 6.51, 6.72],
  ['WOLF', 'Wolfspeed, Inc.', '울프스피드', 'tech', 1.41, 27.06, 11.13],
  ['DOCN', 'DigitalOcean Holdings, Inc.', '디지털오션', 'tech', 15, 128.89, 1.35],

  // ---------- 커뮤니케이션 서비스 ----------
  ['GOOGL', 'Alphabet Inc.', '알파벳', 'comm', 4380, 357.75, -1.29, US_ASOF_ISO],
  ['META', 'Meta Platforms, Inc.', '메타 플랫폼스', 'comm', 1500, 589.9, 0.19, US_ASOF_ISO],
  ['NFLX', 'Netflix, Inc.', '넷플릭스', 'comm', 306, 73.57, 0.33],
  ['TMUS', 'T-Mobile US, Inc.', 'T모바일', 'comm', 190, 177.21, 0.07],
  ['DIS', 'The Walt Disney Company', '디즈니', 'comm', 170, 98.18, 0.04],
  ['T', 'AT&T Inc.', 'AT&T', 'comm', 160, 23.38, -0.89],
  ['VZ', 'Verizon Communications Inc.', '버라이즌', 'comm', 195, 46.88, -1.01],
  ['SPOT', 'Spotify Technology S.A.', '스포티파이', 'comm', 98, 478.17, -1.68],
  ['CMCSA', 'Comcast Corporation', '컴캐스트', 'comm', 88, 24.93, 1.51],
  ['RBLX', 'Roblox Corporation', '로블록스', 'comm', 26, 37.0, 0.9],

  // ---------- 경기소비재 ----------
  ['AMZN', 'Amazon.com, Inc.', '아마존', 'cons-cyc', 2940, 272.26, -0.14, US_ASOF_ISO],
  ['TSLA', 'Tesla, Inc.', '테슬라', 'cons-cyc', 1260, 319.53, -0.63, US_ASOF_ISO],
  ['HD', 'The Home Depot, Inc.', '홈디포', 'cons-cyc', 347, 348.24, 2.42],
  ['MCD', "McDonald's Corporation", '맥도날드', 'cons-cyc', 191, 268.34, 1.17],
  ['BKNG', 'Booking Holdings Inc.', '부킹 홀딩스', 'cons-cyc', 151, 194.27, 0.81],
  ['TJX', 'The TJX Companies, Inc.', 'TJX', 'cons-cyc', 174, 157.55, 0.03],
  ['LOW', "Lowe's Companies, Inc.", '로우스', 'cons-cyc', 122, 218.08, 2.84],
  ['NKE', 'NIKE, Inc.', '나이키', 'cons-cyc', 62, 41.53, -2.6],
  ['SBUX', 'Starbucks Corporation', '스타벅스', 'cons-cyc', 120, 104.97, 1.55],
  ['ABNB', 'Airbnb, Inc.', '에어비앤비', 'cons-cyc', 89, 149.92, -0.48],
  ['CMG', 'Chipotle Mexican Grill, Inc.', '치폴레', 'cons-cyc', 43, 33.82, -9.72],
  ['MAR', 'Marriott International, Inc.', '메리어트', 'cons-cyc', 90, 345.2, -0.47],
  ['GM', 'General Motors Company', '제너럴 모터스', 'cons-cyc', 77, 88.31, 0.72],
  ['F', 'Ford Motor Company', '포드', 'cons-cyc', 57, 14.24, -1.32],
  ['LCID', 'Lucid Group, Inc.', '루시드', 'cons-cyc', 3.04, 7.78, 1.04],
  ['PTON', 'Peloton Interactive, Inc.', '펠로톤', 'cons-cyc', 2.86, 6.61, 2.48],
  ['CHWY', 'Chewy, Inc.', '츄이', 'cons-cyc', 9.87, 24.1, 4.92],
  ['PLBL', 'Polibeli Group Ltd', '폴리벨리 그룹', 'cons-cyc', 2.21, 6.02, -5.79],

  // ---------- 필수소비재 ----------
  ['WMT', 'Walmart Inc.', '월마트', 'cons-def', 891.86, 112.07, -0.24, US_ASOF_ISO],
  ['COST', 'Costco Wholesale Corporation', '코스트코', 'cons-def', 420.93, 949.15, 0.76, US_ASOF_ISO],
  ['PG', 'The Procter & Gamble Company', 'P&G', 'cons-def', 345, 148.01, 2.1],
  ['KO', 'The Coca-Cola Company', '코카콜라', 'cons-def', 372, 86.56, -0.35],
  ['PM', 'Philip Morris International', '필립모리스', 'cons-def', 291, 186.91, -0.27],
  ['PEP', 'PepsiCo, Inc.', '펩시코', 'cons-def', 190, 139.1, -0.38],
  ['MO', 'Altria Group, Inc.', '알트리아', 'cons-def', 114, 68.07, -0.28],
  ['MDLZ', 'Mondelez International, Inc.', '몬델리즈', 'cons-def', 79, 62.08, 0.57],
  ['CL', 'Colgate-Palmolive Company', '콜게이트', 'cons-def', 74, 92.53, 2.95],
  ['TGT', 'Target Corporation', '타겟', 'cons-def', 67, 148.11, -0.83],
  ['KMB', 'Kimberly-Clark Corporation', '킴벌리클라크', 'cons-def', 37, 111.57, 3.73],

  // ---------- 금융 서비스 ----------
  ['BRK-B', 'Berkshire Hathaway Inc.', '버크셔 해서웨이', 'fin', 1130, 524.61, 1.11, US_ASOF_ISO],
  ['JPM', 'JPMorgan Chase & Co.', 'JP모건', 'fin', 947.12, 356.3, -0.82, US_ASOF_ISO],
  ['V', 'Visa Inc.', '비자', 'fin', 680.04, 370.47, 0.52, US_ASOF_ISO],
  ['MA', 'Mastercard Incorporated', '마스터카드', 'fin', 504.54, 575.95, 0.96, US_ASOF_ISO],
  ['BAC', 'Bank of America Corporation', '뱅크오브아메리카', 'fin', 440, 62.9, 0.67],
  ['WFC', 'Wells Fargo & Company', '웰스파고', 'fin', 267, 88.39, 0.57],
  ['AXP', 'American Express Company', '아메리칸 익스프레스', 'fin', 234, 346.71, 0.58],
  ['GS', 'The Goldman Sachs Group, Inc.', '골드만삭스', 'fin', 319, 1052.98, 2.52],
  ['MS', 'Morgan Stanley', '모건스탠리', 'fin', 341, 217.04, 2.75],
  ['BX', 'Blackstone Inc.', '블랙스톤', 'fin', 171, 137.2, 1.87],
  ['BLK', 'BlackRock, Inc.', '블랙록', 'fin', 184, 1131.13, 0.4],
  ['SPGI', 'S&P Global Inc.', 'S&P 글로벌', 'fin', 122, 412.53, -0.89],
  ['PGR', 'The Progressive Corporation', '프로그레시브', 'fin', 123, 210.75, 0.14],
  ['C', 'Citigroup Inc.', '씨티그룹', 'fin', 230, 136.87, 2.47],
  ['SCHW', 'The Charles Schwab Corporation', '찰스슈왑', 'fin', 185, 106.35, 0.45],
  ['KKR', 'KKR & Co. Inc.', 'KKR', 'fin', 97, 108.21, 1.55],
  ['CB', 'Chubb Limited', '처브', 'fin', 134, 348.3, 0.02],
  ['COF', 'Capital One Financial Corp.', '캐피털원', 'fin', 136, 221.91, 1.94],
  ['BK', 'The Bank of New York Mellon', 'BNY 멜론', 'fin', 106, 156.82, 0.4],
  ['TRV', 'The Travelers Companies, Inc.', '트래블러스', 'fin', 79, 377.15, 0.89],
  ['TFC', 'Truist Financial Corporation', '트루이스트', 'fin', 64, 52.66, 1.43],
  ['STT', 'State Street Corporation', '스테이트 스트리트', 'fin', 51, 185.23, 0.85],
  ['RF', 'Regions Financial Corporation', '리전스 파이낸셜', 'fin', 27, 31.95, 1.49],

  // ---------- 의료 ----------
  ['LLY', 'Eli Lilly and Company', '일라이 릴리', 'healthcare', 1060, 1191.94, 1.89, US_ASOF_ISO],
  ['JNJ', 'Johnson & Johnson', '존슨앤드존슨', 'healthcare', 619.3, 256.98, -0.24, US_ASOF_ISO],
  ['UNH', 'UnitedHealth Group Incorporated', '유나이티드헬스', 'healthcare', 370, 407.55, -1.88],
  ['ABBV', 'AbbVie Inc.', '애브비', 'healthcare', 431, 243.8, -0.53],
  ['MRK', 'Merck & Co., Inc.', '머크', 'healthcare', 316, 128.0, 0.18],
  ['ABT', 'Abbott Laboratories', '애보트', 'healthcare', 182, 105.46, -1.55],
  ['TMO', 'Thermo Fisher Scientific Inc.', '써모피셔', 'healthcare', 209, 564.75, -1.62],
  ['ISRG', 'Intuitive Surgical, Inc.', '인튜이티브 서지컬', 'healthcare', 130, 368.27, -1.9],
  ['AMGN', 'Amgen Inc.', '암젠', 'healthcare', 210, 390.02, 2.94],
  ['PFE', 'Pfizer Inc.', '화이자', 'healthcare', 145, 25.41, 1.52],
  ['GILD', 'Gilead Sciences, Inc.', '길리어드', 'healthcare', 168, 135.25, 3.13],
  ['SYK', 'Stryker Corporation', '스트라이커', 'healthcare', 129, 335.96, -1.54],
  ['BSX', 'Boston Scientific Corporation', '보스턴 사이언티픽', 'healthcare', 71, 49.09, 1.36],
  ['VRTX', 'Vertex Pharmaceuticals', '버텍스', 'healthcare', 121, 478.71, 1.7],
  ['MDT', 'Medtronic plc', '메드트로닉', 'healthcare', 110, 86.2, -0.55],
  ['HCA', 'HCA Healthcare, Inc.', 'HCA 헬스케어', 'healthcare', 87, 400.73, -1.45],
  ['CVS', 'CVS Health Corporation', 'CVS 헬스', 'healthcare', 133, 104.42, -0.9],
  ['REGN', 'Regeneron Pharmaceuticals', '리제네론', 'healthcare', 76, 760.66, 0.19],
  ['AARD', 'Aardvark Therapeutics, Inc.', '아드바크 테라퓨틱스', 'healthcare', 0.158, 7.23, 2.12],
  ['FBRX', 'Forte Biosciences, Inc.', '포르테 바이오사이언스', 'healthcare', 1.87, 76.56, -0.07],
  ['QURE', 'uniQure N.V.', '유니큐어', 'healthcare', 3.03, 43.68, -0.86],
  ['SRPT', 'Sarepta Therapeutics, Inc.', '사렙타', 'healthcare', 1.73, 16.39, 3.21],
  ['MRNA', 'Moderna, Inc.', '모더나', 'healthcare', 23, 56.99, 3.36],

  // ---------- 에너지 ----------
  ['XOM', 'Exxon Mobil Corporation', '엑슨모빌', 'energy', 636.69, 154.84, 2.12, US_ASOF_ISO],
  ['CVX', 'Chevron Corporation', '셰브론', 'energy', 374, 190.4, -1.44],
  ['COP', 'ConocoPhillips', '코노코필립스', 'energy', 144, 117.94, -1.02],
  ['WMB', 'The Williams Companies, Inc.', '윌리엄스', 'energy', 87, 71.51, 1.53],
  ['EOG', 'EOG Resources, Inc.', 'EOG 리소시스', 'energy', 76, 143.52, -1.48],
  ['MPC', 'Marathon Petroleum Corporation', '마라톤 페트롤리엄', 'energy', 91, 312.61, 1.82],
  ['KMI', 'Kinder Morgan, Inc.', '킨더모건', 'energy', 70, 31.38, -0.06],
  ['PSX', 'Phillips 66', '필립스66', 'energy', 83, 205.89, -0.15],
  ['OXY', 'Occidental Petroleum Corp.', '옥시덴탈', 'energy', 55, 55.09, -0.69],
  ['SLB', 'Schlumberger Limited', '슐럼버거', 'energy', 75, 50.81, 3.04],
  ['VLO', 'Valero Energy Corporation', '발레로', 'energy', 89, 308.73, 0.39],
  ['ENPH', 'Enphase Energy, Inc.', '엔페이즈', 'energy', 5.52, 41.77, 6.15],

  // ---------- 산업재 ----------
  ['GE', 'GE Aerospace', 'GE 에어로스페이스', 'industrials', 391, 377.28, 2.26],
  ['CAT', 'Caterpillar Inc.', '캐터필러', 'industrials', 404, 876.54, 5.6],
  ['RTX', 'RTX Corporation', 'RTX', 'industrials', 294, 217.93, 0.59],
  ['ETN', 'Eaton Corporation plc', '이튼', 'industrials', 173, 444.77, 1.49],
  ['HON', 'Honeywell International Inc.', '하니웰', 'industrials', 79, 248.79, 0.82],
  ['UNP', 'Union Pacific Corporation', '유니언 퍼시픽', 'industrials', 176, 296.35, 1.76],
  ['BA', 'The Boeing Company', '보잉', 'industrials', 187, 237.16, 1.57],
  ['DE', 'Deere & Company', '디어', 'industrials', 167, 617.37, 2.03],
  ['LMT', 'Lockheed Martin Corporation', '록히드마틴', 'industrials', 136, 589.33, 0.52],
  ['PH', 'Parker-Hannifin Corporation', '파커 하니핀', 'industrials', 125, 992.65, -0.49],
  ['UPS', 'United Parcel Service, Inc.', 'UPS', 'industrials', 93, 109.11, 2.1],
  ['TT', 'Trane Technologies plc', '트레인 테크놀로지스', 'industrials', 104, 472.24, 2.39],
  ['WM', 'Waste Management, Inc.', '웨이스트 매니지먼트', 'industrials', 90, 225.25, -0.52],
  ['TDG', 'TransDigm Group Incorporated', '트랜스다임', 'industrials', 71, 1275.05, -0.82],
  ['GD', 'General Dynamics Corporation', '제너럴 다이내믹스', 'industrials', 104, 385.76, 0.87],
  ['MMM', '3M Company', '3M', 'industrials', 94, 181.45, 2.38],
  ['NOC', 'Northrop Grumman Corporation', '노스럽 그러먼', 'industrials', 78, 551.55, 0.56],
  ['ITW', 'Illinois Tool Works Inc.', 'ITW', 'industrials', 85, 295.06, 2.28],
  ['CSX', 'CSX Corporation', 'CSX', 'industrials', 95, 51.03, 2.41],
  ['EMR', 'Emerson Electric Co.', '에머슨', 'industrials', 89, 158.84, 2.58],

  // ---------- 기초 소재 ----------
  ['LIN', 'Linde plc', '린데', 'materials', 223, 484.64, 0.87],
  ['SHW', 'The Sherwin-Williams Company', '셔윈윌리엄스', 'materials', 87, 361.57, 2.07],
  ['SCCO', 'Southern Copper Corporation', '서던 코퍼', 'materials', 163, 195.16, 4.98],
  ['FCX', 'Freeport-McMoRan Inc.', '프리포트 맥모란', 'materials', 97, 67.3, 5.75],
  ['APD', 'Air Products and Chemicals', '에어프로덕츠', 'materials', 66, 294.71, 0.6],
  ['NEM', 'Newmont Corporation', '뉴몬트', 'materials', 103, 97.73, 2.47],
  ['NUE', 'Nucor Corporation', '뉴코어', 'materials', 62, 274.04, 4.88],
  ['DOW', 'Dow Inc.', '다우', 'materials', 22, 30.33, 1.47],
  ['AA', 'Alcoa Corporation', '알코아', 'materials', 12, 46.83, 4.44],

  // ---------- 유틸리티 ----------
  ['NEE', 'NextEra Energy, Inc.', '넥스트에라', 'utilities', 182, 87.2, 0.75],
  ['CEG', 'Constellation Energy Corp.', '컨스텔레이션', 'utilities', 95, 267.25, -2.36],
  ['SO', 'The Southern Company', '서던 컴퍼니', 'utilities', 107, 93.25, 0.33],
  ['DUK', 'Duke Energy Corporation', '듀크 에너지', 'utilities', 97, 124.27, -0.01],
  ['VST', 'Vistra Corp.', '비스트라', 'utilities', 48, 143.23, -8.15],
  ['AEP', 'American Electric Power', 'AEP', 'utilities', 70, 128.35, 0.02],
  ['SRE', 'Sempra', '셈프라', 'utilities', 57, 86.65, -1.23],
  ['D', 'Dominion Energy, Inc.', '도미니언', 'utilities', 61, 69.22, 0.68],
  ['EXC', 'Exelon Corporation', '엑셀론', 'utilities', 47, 45.84, 0.46],
  ['XEL', 'Xcel Energy Inc.', '엑셀 에너지', 'utilities', 49, 77.75, 0.08],

  // ---------- 부동산 ----------
  ['WELL', 'Welltower Inc.', '웰타워', 'realestate', 167, 231.57, -0.66],
  ['PLD', 'Prologis, Inc.', '프로로지스', 'realestate', 135, 139.05, -3.54],
  ['AMT', 'American Tower Corporation', '아메리칸 타워', 'realestate', 82, 175.25, 1.3],
  ['EQIX', 'Equinix, Inc.', '이퀴닉스', 'realestate', 104, 1051.53, 1.95],
  ['SPG', 'Simon Property Group, Inc.', '사이먼 프로퍼티', 'realestate', 86, 225.9, -1.42],
  ['DLR', 'Digital Realty Trust, Inc.', '디지털 리얼티', 'realestate', 73, 193.89, 1.4],
  ['PSA', 'Public Storage', '퍼블릭 스토리지', 'realestate', 61, 326.49, 0.18],
  ['O', 'Realty Income Corporation', '리얼티 인컴', 'realestate', 59, 62.9, -0.91],
  ['CBRE', 'CBRE Group, Inc.', 'CBRE', 'realestate', 44, 151.05, 1.77],
  ['CCI', 'Crown Castle Inc.', '크라운 캐슬', 'realestate', 33, 77.66, 1.2],
];

/** [symbol, name, nameKo, price, changePct, kindLabel, asOfISO?] — indices/futures/macro */
type MacroRow = [string, string, string, number, number, string, string?];

const MACRO: MacroRow[] = [
  // Futures levels are DERIVED, not captured: each carries the ~+0.5% basis over its own
  // cash index that the original seed already used. ES and YM were re-derived because their
  // cash indices moved; NQ is unchanged because ^IXIC was not re-captured. Leaving the old
  // ES level would have put S&P futures 1.5% BELOW an index that had just closed, which no
  // reader would believe. The change percentages are left alone — a futures move measured
  // from prior settle legitimately differs from the cash session's change.
  //
  // 2026-08-07 refresh: ^GSPC/^IXIC/^DJI below moved to a newer, settled 2026-08-06 close
  // (`.superpowers/refresh-2026-08-07-us.md`), but ES=F/NQ=F/YM=F were NOT re-derived this
  // time — the research found no corroborated futures print for any session, and futures
  // rows carry no `asOfISO` override, so they still read as the 2026-08-04-vintage basis
  // documented above. That basis is now a little more visibly stale (ES sits further above
  // the new S&P close than the intended ~0.5%) but a fabricated re-derivation would be worse
  // than an honest, unlabeled stale row — the futures rows simply weren't touched.
  ['ES=F', 'S&P Futures', 'S&P 선물', 7775.68, 0.42, 'CME'],
  ['NQ=F', 'NASDAQ Fut.', '나스닥 선물', 30032.25, 0.32, 'CME'],
  ['YM=F', 'Dow Futures', '다우 선물', 54356.43, 0.27, 'CBOT'],
  ['^VIX', 'VIX', 'VIX 변동성지수', 15.86, -0.8, 'CBOE'],
  ['^GSPC', 'S&P 500', 'S&P 500', 7709.96, -0.18, 'INDEX', US_ASOF_ISO],
  ['^IXIC', 'NASDAQ Composite', '나스닥 종합', 26348.35, -0.06, 'INDEX', US_ASOF_ISO],
  ['^DJI', 'Dow Jones Industrial', '다우존스 산업평균', 53885.1, -0.85, 'INDEX', US_ASOF_ISO],
  ['^TNX', 'US 10Y Treasury', '미 국채 10년물', 3.62, 0.83, 'BOND'],
  ['DX=F', 'US Dollar Index', '달러 인덱스', 96.42, -0.21, 'ICE'],
  ['GC=F', 'Gold', '금 선물', 4075.26, 1.01, 'COMEX'],
  ['CL=F', 'WTI Crude Oil', 'WTI 원유', 67.85, 0.04, 'NYMEX'],
  ['BZ=F', 'Brent Crude', '브렌트유', 71.24, 0.06, 'ICE'],
];

/** [symbol, name, nameKo, price, changePct, marketCap($B)] */
type CryptoRow = [string, string, string, number, number, number];

const CRYPTO: CryptoRow[] = [
  ['BTCUSD', 'Bitcoin', '비트코인', 64196.46, 0.6, 1288],
  ['ETHUSD', 'Ethereum', '이더리움', 1867.76, 0.3, 225],
  ['XRPUSD', 'XRP', '리플', 1.07, 0.8, 66.8],
  ['BNBUSD', 'BNB', '바이낸스 코인', 600.55, 1.8, 80.0],
  ['SOLUSD', 'Solana', '솔라나', 74.01, 0.5, 43.0],
  ['DOGEUSD', 'Dogecoin', '도지코인', 0.06976, 0.5, 10.8],
  ['ADAUSD', 'Cardano', '카르다노', 0.1908, 2.6, 7.1],
  ['TRXUSD', 'TRON', '트론', 0.3268, 0.6, 31.0],
  ['AVAXUSD', 'Avalanche', '아발란체', 14.21, 1.12, 5.9],
  ['LINKUSD', 'Chainlink', '체인링크', 8.17, 0.5, 6.1],
  ['DOTUSD', 'Polkadot', '폴카닷', 3.12, -0.42, 4.8],
  ['LTCUSD', 'Litecoin', '라이트코인', 62.4, 0.81, 4.7],
  ['SHIBUSD', 'Shiba Inu', '시바이누', 0.0000071, 1.21, 4.2],
  ['UNIUSD', 'Uniswap', '유니스왑', 5.42, 1.62, 3.3],
  ['ATOMUSD', 'Cosmos', '코스모스', 3.41, -0.91, 1.3],
  ['XLMUSD', 'Stellar', '스텔라', 0.1666, 2.6, 5.7],
  ['NEARUSD', 'NEAR Protocol', '니어', 1.92, 2.21, 2.3],
  ['APTUSD', 'Aptos', '앱토스', 4.61, -1.32, 2.9],
  ['ARBUSD', 'Arbitrum', '아비트럼', 0.342, 0.71, 1.7],
  ['ONDOUSD', 'Ondo', '온도', 0.552, 3.12, 1.7],
];

/* ---------- Brand colors for logo chips ---------- */
const BRAND: Record<string, string> = {
  NVDA: '#76b900', AMD: '#111111', META: '#0668e1', GOOGL: '#4285f4', AAPL: '#555555',
  MSFT: '#00a4ef', AMZN: '#ff9900', TSLA: '#cc0000', NFLX: '#e50914', INTC: '#0071c5',
  MU: '#0d4ea3', AVGO: '#cc092f', ORCL: '#f80000', IBM: '#0f62fe', UBER: '#000000',
  JPM: '#5a3f2b', V: '#1a1f71', MA: '#eb001b', WMT: '#0071ce', KO: '#f40009',
  XOM: '#e51937', CVX: '#0054a4', LLY: '#e01f27', PFE: '#0093d0', DIS: '#113ccf',
  BTCUSD: '#f7931a', ETHUSD: '#627eea', SOLUSD: '#14f195', XRPUSD: '#25292e',
  DOGEUSD: '#c2a633', BNBUSD: '#f3ba2f', ADAUSD: '#0033ad', LINKUSD: '#2a5ada',
  HYNX: '#ee2e24', PLTR: '#101113', BA: '#0039a6', CAT: '#ffcd11', GE: '#026cb6',
  NKE: '#111111', SBUX: '#00704a', MCD: '#ffc72c', PLD: '#3d7f66', TRV: '#e01719',
  TFC: '#40135f', STT: '#0058a8', RF: '#5c8118', AA: '#0d6cb5', ISRG: '#2a2a72',
};

const CHIP_FALLBACK = ['#20808d', '#5b6ee1', '#b4654a', '#8459a4', '#3e8e5a', '#c2703e', '#356a86', '#a04f68'];

function chipColor(symbol: string): string {
  if (BRAND[symbol]) return BRAND[symbol];
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  return CHIP_FALLBACK[h % CHIP_FALLBACK.length];
}

export interface SeedAsset extends AssetMeta {
  price: number;
  changePct: number;
}

function stockAsset([symbol, name, nameKo, sectorId, capB, price, changePct, asOfISO]: StockRow): SeedAsset {
  const nasdaq = new Set(['NVDA','MSFT','AAPL','AVGO','MU','AMD','PLTR','HYNX','INTC','CSCO','AMAT','ADBE','TXN','QCOM','INTU','LRCX','APP','ANET','KLAC','PANW','MRVL','ADI','CRWD','SNOW','FTNT','SMCI','WDC','STX','RXT','XNDU','IONQ','RGTI','SOUN','WOLF','DOCN','GOOGL','META','NFLX','TMUS','CMCSA','RBLX','AMZN','TSLA','BKNG','SBUX','ABNB','CMG','MAR','LCID','PTON','CHWY','PLBL','COST','PEP','MDLZ','KMB','MO','ISRG','AMGN','GILD','VRTX','REGN','AARD','FBRX','QURE','SRPT','MRNA','ENPH','CEG','XEL','EXC','AEP','EQIX','PSA','CCI','LIN','NEM']);
  return {
    symbol, name, nameKo,
    exchange: nasdaq.has(symbol) ? 'NASDAQ' : 'NYSE',
    kind: 'stock',
    unit: 'USD',
    region: 'US',
    sectorId,
    marketCap: capB * 1e9,
    price, changePct,
    asOfISO,
    logoBg: chipColor(symbol),
    logoText: symbol.replace('-B', '').slice(0, 1),
  };
}

function macroAsset([symbol, name, nameKo, price, changePct, exchange, asOfISO]: MacroRow): SeedAsset {
  const kind: AssetKind = symbol.endsWith('=F') ? 'future' : 'index';
  const unit =
    symbol === '^TNX'
      ? 'PERCENT'
      : symbol === 'GC=F'
        ? 'USD_PER_OZ'
        : symbol === 'CL=F' || symbol === 'BZ=F'
          ? 'USD_PER_BBL'
          : 'POINTS';
  return {
    symbol,
    name,
    nameKo,
    exchange,
    kind,
    unit,
    region: 'US',
    price,
    changePct,
    asOfISO,
    logoBg: '#20808d',
    logoText: name.slice(0, 1),
  };
}

function cryptoAsset([symbol, name, nameKo, price, changePct, capB]: CryptoRow): SeedAsset {
  return {
    symbol, name, nameKo, exchange: 'CRYPTO', kind: 'crypto', unit: 'USD', region: 'US',
    marketCap: capB * 1e9, price, changePct,
    logoBg: chipColor(symbol), logoText: name.slice(0, 1),
  };
}

export const SEED_ASSETS: SeedAsset[] = [
  ...MACRO.map(macroAsset),
  ...STOCKS.map(stockAsset),
  ...CRYPTO.map(cryptoAsset),
];

/** Default watchlist — mirrors the reference snapshot */
export const DEFAULT_WATCHLIST = ['AMD', 'XNDU', 'META', 'GOOGL', 'TSLA', 'NVDA', 'MU', 'HYNX', 'BTCUSD', 'AAPL'];

/**
 * Snapshot metadata.
 *
 * 2026-08-07 partial refresh: `asOfISO`/`closeLabel*` moved forward to the settled Thursday
 * 2026-08-06 US close (`US_ASOF_ISO` above — Friday 08-07's session had not closed when the
 * refresh research ran, see `.superpowers/refresh-2026-08-07-us.md`), and `krAsOfISO`/
 * `krAsOfLabelKo` moved to the settled Friday 2026-08-07 KRX close (`KR_ASOF_ISO` in
 * universe.kr.ts). These two fields are the "latest verified close" pointer used for display
 * (this banner, AI-answer captions) AND the per-row default for any seed row that carries no
 * `asOfISO` override — engine.ts's `equityAsOfISO`/`equityAsOfTs` resolve that fallback to
 * `US_PREV_ASOF_ISO`/`KR_PREV_ASOF_ISO` instead, precisely so the ~85% of rows this pass didn't
 * re-verify keep reading as the older close they actually are, not this newer one.
 *
 * `cryptoAsOfISO` is untouched: the research found one corroborated BTC print (a different,
 * sub-day timestamp — see refresh-2026-08-07-us.md §3) but no full-batch crypto recapture, and
 * this field is meant to describe the whole crypto batch, not one row.
 */
export const SNAPSHOT = {
  dataMode: 'synthetic' as const,
  dataModeLabel: '모의 데이터',
  provenanceLabel: '외부 API 미연결 · 결정론적 로컬 시뮬레이션',
  closeLabel: 'Aug 6, 2026, 4:00 PM EDT',
  closeLabelKo: '2026년 8월 6일 16:00 EDT',
  // Thu 08-06: all three major US indices closed lower, oil/energy prices rose (typically read
  // as a headwind for equities and Fed policy), and the Dow's multi-day record-close streak
  // snapped — a mild risk-off session, not the sharp "낙관적" read the prior 08-04 anchor
  // (all three indices up, fresh records) supported.
  sentimentLabel: '예시 심리: 신중',
  sentimentScore: 44, // 0-100, synthetic indicator
  asOfISO: US_ASOF_ISO,
  cryptoAsOfISO: '2026-08-05T05:00:00Z',
  cryptoAsOfLabelKo: '2026년 8월 5일 14:00 KST',
  // KR equities and the KOSPI/KOSDAQ/KOSPI200/USD-KRW/VKOSPI benchmarks refreshed in this pass
  // are all one 2026-08-07 KRX session close (see universe.kr.ts's `KR_ASOF_ISO`) — a day after
  // the US anchor above, and (per the refresh research's multi-source corroboration) the same
  // instant for both equities and indices, so one field covers both rather than implying a
  // false precision of separate KR equity vs. KR index capture times.
  krAsOfISO: KR_ASOF_ISO,
  krAsOfLabelKo: '2026년 8월 7일 15:30 KST',
  todayISO: '2026-08-07',
};
