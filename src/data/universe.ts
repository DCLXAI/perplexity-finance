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
export const US_ASOF_ISO = '2026-10-09T16:00:00-04:00';
export const US_MID_ASOF_ISO = '2026-10-08T16:00:00-04:00';
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
  ['NVDA', 'NVIDIA Corporation', '엔비디아', 'tech', 5300, 229.28, -0.52, US_ASOF_ISO],
  ['MSFT', 'Microsoft Corporation', '마이크로소프트', 'tech', 3710, 535.07, 2.38, US_ASOF_ISO],
  ['AAPL', 'Apple Inc.', '애플', 'tech', 4560, 336.64, -1.11, US_ASOF_ISO],
  ['AVGO', 'Broadcom Inc.', '브로드컴', 'tech', 2000, 361.54, 0.39, US_ASOF_ISO],
  ['MU', 'Micron Technology, Inc.', '마이크론', 'tech', 995.53, 1029, -0.66, US_ASOF_ISO],
  ['AMD', 'Advanced Micro Devices, Inc.', 'AMD', 'tech', 798.74, 608.1, -2.03, US_ASOF_ISO],
  ['ORCL', 'Oracle Corporation', '오라클', 'tech', 413.26, 141.4, 4.59, US_ASOF_ISO],
  ['PLTR', 'Palantir Technologies Inc.', '팔란티어', 'tech', 391, 209.05, 5.17, US_ASOF_ISO],
  // HYNX is not a verified SK hynix ADR mapping; retain the older demo row rather than
  // importing the unrelated US-listed HYNX ETF history under the wrong company identity.
  ['HYNX', 'SK Hynix Inc. (ADR)', 'SK하이닉스', 'tech', 805, 154.38, 8.17],
  ['INTC', 'Intel Corporation', '인텔', 'tech', 503.44, 104.7, -2.22, US_ASOF_ISO],
  ['IBM', 'International Business Machines', 'IBM', 'tech', 222, 227.13, 0.23, US_ASOF_ISO],
  ['CSCO', 'Cisco Systems, Inc.', '시스코', 'tech', 480, 118.39, 3.05, US_ASOF_ISO],
  ['CRM', 'Salesforce, Inc.', '세일즈포스', 'tech', 156, 229.13, 0.58, US_ASOF_ISO],
  ['AMAT', 'Applied Materials, Inc.', '어플라이드 머티어리얼즈', 'tech', 434, 507.03, -0.5, US_ASOF_ISO],
  ['NOW', 'ServiceNow, Inc.', '서비스나우', 'tech', 122, 140.86, 0.79, US_ASOF_ISO],
  ['ADBE', 'Adobe Inc.', '어도비', 'tech', 102, 242.27, 0.51, US_ASOF_ISO],
  ['UBER', 'Uber Technologies, Inc.', '우버', 'tech', 147, 71.51, 1.81, US_ASOF_ISO],
  ['TXN', 'Texas Instruments Incorporated', '텍사스 인스트루먼츠', 'tech', 259, 283.74, -1.55, US_ASOF_ISO],
  ['QCOM', 'QUALCOMM Incorporated', '퀄컴', 'tech', 174, 175.5, -0.29, US_ASOF_ISO],
  ['INTU', 'Intuit Inc.', '인튜이트', 'tech', 89, 302.75, -0.37, US_ASOF_ISO],
  ['LRCX', 'Lam Research Corporation', '램 리서치', 'tech', 398, 318.84, -0.55, US_ASOF_ISO],
  ['APP', 'AppLovin Corporation', '앱러빈', 'tech', 141, 277.04, -1.1, US_ASOF_ISO],
  ['ANET', 'Arista Networks, Inc.', '아리스타 네트웍스', 'tech', 240, 216.74, 2.73, US_ASOF_ISO],
  ['KLAC', 'KLA Corporation', 'KLA', 'tech', 255, 195.57, -0.58, US_ASOF_ISO],
  ['PANW', 'Palo Alto Networks, Inc.', '팔로알토 네트웍스', 'tech', 299, 418.78, 5.09, US_ASOF_ISO],
  ['MRVL', 'Marvell Technology, Inc.', '마벨 테크놀로지', 'tech', 191, 275.28, 0.25, US_ASOF_ISO],
  ['ADI', 'Analog Devices, Inc.', '아날로그 디바이시스', 'tech', 185, 406.19, 0.06, US_ASOF_ISO],
  ['DELL', 'Dell Technologies Inc.', '델', 'tech', 302, 586.06, 2, US_ASOF_ISO],
  ['CRWD', 'CrowdStrike Holdings, Inc.', '크라우드스트라이크', 'tech', 215, 275.04, 4.57, US_ASOF_ISO],
  ['SNOW', 'Snowflake Inc.', '스노우플레이크', 'tech', 110, 368.89, 7.42, US_ASOF_ISO],
  ['FTNT', 'Fortinet, Inc.', '포티넷', 'tech', 123, 194.75, 2.99, US_ASOF_ISO],
  ['SMCI', 'Super Micro Computer, Inc.', '슈퍼마이크로', 'tech', 20, 41.86, -2.14, US_ASOF_ISO],
  ['WDC', 'Western Digital Corporation', '웨스턴 디지털', 'tech', 189, 397.28, 1.01, US_ASOF_ISO],
  ['STX', 'Seagate Technology Holdings', '씨게이트', 'tech', 192, 783, 1.06, US_ASOF_ISO],
  ['RXT', 'Rackspace Technology, Inc.', '랙스페이스', 'tech', 1.31, 3.9, 7.73, US_ASOF_ISO],
  ['XNDU', 'Xanadu Quantum Technologies', '자나두 퀀텀', 'tech', 3.48, 3.9, -5.34, US_ASOF_ISO],
  ['IONQ', 'IonQ, Inc.', '아이온큐', 'tech', 16, 39.89, 1.12, US_ASOF_ISO],
  ['RGTI', 'Rigetti Computing, Inc.', '리게티 컴퓨팅', 'tech', 5.8, 14.03, -0.78, US_ASOF_ISO],
  ['SOUN', 'SoundHound AI, Inc.', '사운드하운드 AI', 'tech', 2.82, 5.39, -2.36, US_ASOF_ISO],
  ['WOLF', 'Wolfspeed, Inc.', '울프스피드', 'tech', 1.41, 30.61, -1.32, US_ASOF_ISO],
  ['DOCN', 'DigitalOcean Holdings, Inc.', '디지털오션', 'tech', 15, 134.82, 8.81, US_ASOF_ISO],

  // ---------- 커뮤니케이션 서비스 ----------
  ['GOOGL', 'Alphabet Inc.', '알파벳', 'comm', 4380, 351.66, 0.97, US_ASOF_ISO],
  ['META', 'Meta Platforms, Inc.', '메타 플랫폼스', 'comm', 1500, 718.67, -0.31, US_ASOF_ISO],
  ['NFLX', 'Netflix, Inc.', '넷플릭스', 'comm', 306, 70.3, -1.77, US_ASOF_ISO],
  ['TMUS', 'T-Mobile US, Inc.', 'T모바일', 'comm', 190, 148.58, -13.27, US_ASOF_ISO],
  ['DIS', 'The Walt Disney Company', '디즈니', 'comm', 170, 108.05, 0.96, US_ASOF_ISO],
  ['T', 'AT&T Inc.', 'AT&T', 'comm', 160, 22.18, -9.81, US_ASOF_ISO],
  ['VZ', 'Verizon Communications Inc.', '버라이즌', 'comm', 195, 41.65, -8.75, US_ASOF_ISO],
  ['SPOT', 'Spotify Technology S.A.', '스포티파이', 'comm', 98, 529.14, 0.52, US_ASOF_ISO],
  ['CMCSA', 'Comcast Corporation', '컴캐스트', 'comm', 88, 20.66, -2.59, US_ASOF_ISO],
  ['RBLX', 'Roblox Corporation', '로블록스', 'comm', 26, 48.09, 5.65, US_ASOF_ISO],

  // ---------- 경기소비재 ----------
  ['AMZN', 'Amazon.com, Inc.', '아마존', 'cons-cyc', 2940, 262.43, 3.29, US_ASOF_ISO],
  ['TSLA', 'Tesla, Inc.', '테슬라', 'cons-cyc', 1260, 382.7, 2.05, US_ASOF_ISO],
  ['HD', 'The Home Depot, Inc.', '홈디포', 'cons-cyc', 347, 290.74, -1.6, US_ASOF_ISO],
  ['MCD', "McDonald's Corporation", '맥도날드', 'cons-cyc', 191, 235.23, -0.7, US_ASOF_ISO],
  ['BKNG', 'Booking Holdings Inc.', '부킹 홀딩스', 'cons-cyc', 151, 160.34, 0.23, US_ASOF_ISO],
  ['TJX', 'The TJX Companies, Inc.', 'TJX', 'cons-cyc', 174, 138.76, 0.01, US_ASOF_ISO],
  ['LOW', "Lowe's Companies, Inc.", '로우스', 'cons-cyc', 122, 186, -1.51, US_ASOF_ISO],
  ['NKE', 'NIKE, Inc.', '나이키', 'cons-cyc', 62, 34.71, -0.09, US_ASOF_ISO],
  ['SBUX', 'Starbucks Corporation', '스타벅스', 'cons-cyc', 120, 90.75, -2.64, US_ASOF_ISO],
  ['ABNB', 'Airbnb, Inc.', '에어비앤비', 'cons-cyc', 89, 165.87, 1.62, US_ASOF_ISO],
  ['CMG', 'Chipotle Mexican Grill, Inc.', '치폴레', 'cons-cyc', 43, 31.59, -3.34, US_ASOF_ISO],
  ['MAR', 'Marriott International, Inc.', '메리어트', 'cons-cyc', 90, 365.88, 1.33, US_ASOF_ISO],
  ['GM', 'General Motors Company', '제너럴 모터스', 'cons-cyc', 77, 82.73, 0.58, US_ASOF_ISO],
  ['F', 'Ford Motor Company', '포드', 'cons-cyc', 57, 12.17, -0.65, US_ASOF_ISO],
  ['LCID', 'Lucid Group, Inc.', '루시드', 'cons-cyc', 3.04, 3.79, -0.79, US_ASOF_ISO],
  ['PTON', 'Peloton Interactive, Inc.', '펠로톤', 'cons-cyc', 2.86, 5.12, 4.07, US_ASOF_ISO],
  ['CHWY', 'Chewy, Inc.', '츄이', 'cons-cyc', 9.87, 18.95, 0.21, US_ASOF_ISO],
  ['PLBL', 'Polibeli Group Ltd', '폴리벨리 그룹', 'cons-cyc', 2.21, 5.639999866485596, 0, US_ASOF_ISO],

  // ---------- 필수소비재 ----------
  ['WMT', 'Walmart Inc.', '월마트', 'cons-def', 891.86, 111.35, 0.71, US_ASOF_ISO],
  ['COST', 'Costco Wholesale Corporation', '코스트코', 'cons-def', 420.93, 946.92, -0.11, US_ASOF_ISO],
  ['PG', 'The Procter & Gamble Company', 'P&G', 'cons-def', 345, 151.23, 0.42, US_ASOF_ISO],
  ['KO', 'The Coca-Cola Company', '코카콜라', 'cons-def', 372, 88.05, 0.32, US_ASOF_ISO],
  ['PM', 'Philip Morris International', '필립모리스', 'cons-def', 291, 201.19, 0.34, US_ASOF_ISO],
  ['PEP', 'PepsiCo, Inc.', '펩시코', 'cons-def', 190, 125.97, -1.85, US_ASOF_ISO],
  ['MO', 'Altria Group, Inc.', '알트리아', 'cons-def', 114, 71.68, 0.36, US_ASOF_ISO],
  ['MDLZ', 'Mondelez International, Inc.', '몬델리즈', 'cons-def', 79, 60.41, -0.43, US_ASOF_ISO],
  ['CL', 'Colgate-Palmolive Company', '콜게이트', 'cons-def', 74, 88.27, 0.19, US_ASOF_ISO],
  ['TGT', 'Target Corporation', '타겟', 'cons-def', 67, 153.64, -0.72, US_ASOF_ISO],
  ['KMB', 'Kimberly-Clark Corporation', '킴벌리클라크', 'cons-def', 37, 97.59, -0.15, US_ASOF_ISO],

  // ---------- 금융 서비스 ----------
  ['BRK-B', 'Berkshire Hathaway Inc.', '버크셔 해서웨이', 'fin', 1130, 515.62, 0.89, US_ASOF_ISO],
  ['JPM', 'JPMorgan Chase & Co.', 'JP모건', 'fin', 947.12, 332.99, 0.47, US_ASOF_ISO],
  ['V', 'Visa Inc.', '비자', 'fin', 680.04, 385.45, 2.76, US_ASOF_ISO],
  ['MA', 'Mastercard Incorporated', '마스터카드', 'fin', 504.54, 589.14, 2.66, US_ASOF_ISO],
  ['BAC', 'Bank of America Corporation', '뱅크오브아메리카', 'fin', 440, 54.32, 1.32, US_ASOF_ISO],
  ['WFC', 'Wells Fargo & Company', '웰스파고', 'fin', 267, 83.55, 1.85, US_ASOF_ISO],
  ['AXP', 'American Express Company', '아메리칸 익스프레스', 'fin', 234, 308.17, 0.33, US_ASOF_ISO],
  ['GS', 'The Goldman Sachs Group, Inc.', '골드만삭스', 'fin', 319, 895.32, 1.44, US_ASOF_ISO],
  ['MS', 'Morgan Stanley', '모건스탠리', 'fin', 341, 190.02, 1.38, US_ASOF_ISO],
  ['BX', 'Blackstone Inc.', '블랙스톤', 'fin', 171, 114.29, 1.43, US_ASOF_ISO],
  ['BLK', 'BlackRock, Inc.', '블랙록', 'fin', 184, 1082.39, 1.6, US_ASOF_ISO],
  ['SPGI', 'S&P Global Inc.', 'S&P 글로벌', 'fin', 122, 407.82, 1.26, US_ASOF_ISO],
  ['PGR', 'The Progressive Corporation', '프로그레시브', 'fin', 123, 217.43, -0.59, US_ASOF_ISO],
  ['C', 'Citigroup Inc.', '씨티그룹', 'fin', 230, 129.64, 1.22, US_ASOF_ISO],
  ['SCHW', 'The Charles Schwab Corporation', '찰스슈왑', 'fin', 185, 96.7, -0.18, US_ASOF_ISO],
  ['KKR', 'KKR & Co. Inc.', 'KKR', 'fin', 97, 90.95, 1.55, US_ASOF_ISO],
  ['CB', 'Chubb Limited', '처브', 'fin', 134, 341.2, -0.75, US_ASOF_ISO],
  ['COF', 'Capital One Financial Corp.', '캐피털원', 'fin', 136, 199.26, -0.07, US_ASOF_ISO],
  ['BK', 'The Bank of New York Mellon', 'BNY 멜론', 'fin', 106, 142.71, -0.63, US_ASOF_ISO],
  ['TRV', 'The Travelers Companies, Inc.', '트래블러스', 'fin', 79, 368.75, -0.41, US_ASOF_ISO],
  ['TFC', 'Truist Financial Corporation', '트루이스트', 'fin', 64, 46.11, -0.15, US_ASOF_ISO],
  ['STT', 'State Street Corporation', '스테이트 스트리트', 'fin', 51, 174.96, -0.07, US_ASOF_ISO],
  ['RF', 'Regions Financial Corporation', '리전스 파이낸셜', 'fin', 27, 27.03, -0.15, US_ASOF_ISO],

  // ---------- 의료 ----------
  ['LLY', 'Eli Lilly and Company', '일라이 릴리', 'healthcare', 1060, 1179.27, 0.83, US_ASOF_ISO],
  ['JNJ', 'Johnson & Johnson', '존슨앤드존슨', 'healthcare', 619.3, 261.44, 1.93, US_ASOF_ISO],
  ['UNH', 'UnitedHealth Group Incorporated', '유나이티드헬스', 'healthcare', 370, 379.3, 2.25, US_ASOF_ISO],
  ['ABBV', 'AbbVie Inc.', '애브비', 'healthcare', 431, 276.47, 1.49, US_ASOF_ISO],
  ['MRK', 'Merck & Co., Inc.', '머크', 'healthcare', 316, 145.6, 2.26, US_ASOF_ISO],
  ['ABT', 'Abbott Laboratories', '애보트', 'healthcare', 182, 99.6, 1.13, US_ASOF_ISO],
  ['TMO', 'Thermo Fisher Scientific Inc.', '써모피셔', 'healthcare', 209, 658.02, 0.93, US_ASOF_ISO],
  ['ISRG', 'Intuitive Surgical, Inc.', '인튜이티브 서지컬', 'healthcare', 130, 423.96, 2.06, US_ASOF_ISO],
  ['AMGN', 'Amgen Inc.', '암젠', 'healthcare', 210, 414.87, 1.82, US_ASOF_ISO],
  ['PFE', 'Pfizer Inc.', '화이자', 'healthcare', 145, 28.28, 1.65, US_ASOF_ISO],
  ['GILD', 'Gilead Sciences, Inc.', '길리어드', 'healthcare', 168, 151.17, 2.77, US_ASOF_ISO],
  ['SYK', 'Stryker Corporation', '스트라이커', 'healthcare', 129, 277.33, 0.13, US_ASOF_ISO],
  ['BSX', 'Boston Scientific Corporation', '보스턴 사이언티픽', 'healthcare', 71, 42.73, 1.64, US_ASOF_ISO],
  ['VRTX', 'Vertex Pharmaceuticals', '버텍스', 'healthcare', 121, 510.08, 1.36, US_ASOF_ISO],
  ['MDT', 'Medtronic plc', '메드트로닉', 'healthcare', 110, 88.48, 0.83, US_ASOF_ISO],
  ['HCA', 'HCA Healthcare, Inc.', 'HCA 헬스케어', 'healthcare', 87, 451.09, 1.37, US_ASOF_ISO],
  ['CVS', 'CVS Health Corporation', 'CVS 헬스', 'healthcare', 133, 86.16, -1.87, US_ASOF_ISO],
  ['REGN', 'Regeneron Pharmaceuticals', '리제네론', 'healthcare', 76, 746.54, 0.94, US_ASOF_ISO],
  ['AARD', 'Aardvark Therapeutics, Inc.', '아드바크 테라퓨틱스', 'healthcare', 0.158, 4.76, 1.06, US_ASOF_ISO],
  ['FBRX', 'Forte Biosciences, Inc.', '포르테 바이오사이언스', 'healthcare', 1.87, 76.97, 0.03, '2026-08-25T16:00:00-04:00'],
  ['QURE', 'uniQure N.V.', '유니큐어', 'healthcare', 3.03, 22.59, 0.22, US_ASOF_ISO],
  ['SRPT', 'Sarepta Therapeutics, Inc.', '사렙타', 'healthcare', 1.73, 17.85, -1.98, US_ASOF_ISO],
  ['MRNA', 'Moderna, Inc.', '모더나', 'healthcare', 23, 225, 14.21, US_ASOF_ISO],

  // ---------- 에너지 ----------
  ['XOM', 'Exxon Mobil Corporation', '엑슨모빌', 'energy', 636.69, 168.94, 0.26, US_ASOF_ISO],
  ['CVX', 'Chevron Corporation', '셰브론', 'energy', 374, 211.98, 0.2, US_ASOF_ISO],
  ['COP', 'ConocoPhillips', '코노코필립스', 'energy', 144, 134.1, -0.07, US_ASOF_ISO],
  ['WMB', 'The Williams Companies, Inc.', '윌리엄스', 'energy', 87, 72.67, 0.46, US_ASOF_ISO],
  ['EOG', 'EOG Resources, Inc.', 'EOG 리소시스', 'energy', 76, 148.16, -0.24, US_ASOF_ISO],
  ['MPC', 'Marathon Petroleum Corporation', '마라톤 페트롤리엄', 'energy', 91, 455.03, -1.79, US_ASOF_ISO],
  ['KMI', 'Kinder Morgan, Inc.', '킨더모건', 'energy', 70, 32.49, 0.74, US_ASOF_ISO],
  ['PSX', 'Phillips 66', '필립스66', 'energy', 83, 278.18, -1.21, US_ASOF_ISO],
  ['OXY', 'Occidental Petroleum Corp.', '옥시덴탈', 'energy', 55, 60.11, -0.28, US_ASOF_ISO],
  ['SLB', 'Schlumberger Limited', '슐럼버거', 'energy', 75, 48.95, -0.06, US_ASOF_ISO],
  ['VLO', 'Valero Energy Corporation', '발레로', 'energy', 89, 433.75, -2.26, US_ASOF_ISO],
  ['ENPH', 'Enphase Energy, Inc.', '엔페이즈', 'energy', 5.52, 32.81, -0.3, US_ASOF_ISO],

  // ---------- 산업재 ----------
  ['GE', 'GE Aerospace', 'GE 에어로스페이스', 'industrials', 391, 308.2, 0.84, US_ASOF_ISO],
  ['CAT', 'Caterpillar Inc.', '캐터필러', 'industrials', 404, 800.47, 0.54, US_ASOF_ISO],
  ['RTX', 'RTX Corporation', 'RTX', 'industrials', 294, 185.97, 0.9, US_ASOF_ISO],
  ['ETN', 'Eaton Corporation plc', '이튼', 'industrials', 173, 429.65, 1.21, US_ASOF_ISO],
  ['HON', 'Honeywell International Inc.', '하니웰', 'industrials', 79, 207.73, 0.55, US_ASOF_ISO],
  ['UNP', 'Union Pacific Corporation', '유니언 퍼시픽', 'industrials', 176, 278.34, 0.05, US_ASOF_ISO],
  ['BA', 'The Boeing Company', '보잉', 'industrials', 187, 190.37, 1.4, US_ASOF_ISO],
  ['DE', 'Deere & Company', '디어', 'industrials', 167, 620.93, -4.85, US_ASOF_ISO],
  ['LMT', 'Lockheed Martin Corporation', '록히드마틴', 'industrials', 136, 509.59, 0.33, US_ASOF_ISO],
  ['PH', 'Parker-Hannifin Corporation', '파커 하니핀', 'industrials', 125, 962.56, 1.65, US_ASOF_ISO],
  ['UPS', 'United Parcel Service, Inc.', 'UPS', 'industrials', 93, 94.57, 0.47, US_ASOF_ISO],
  ['TT', 'Trane Technologies plc', '트레인 테크놀로지스', 'industrials', 104, 476.98, 1.5, US_ASOF_ISO],
  ['WM', 'Waste Management, Inc.', '웨이스트 매니지먼트', 'industrials', 90, 208.83, -0.6, US_ASOF_ISO],
  ['TDG', 'TransDigm Group Incorporated', '트랜스다임', 'industrials', 71, 1107.99, 1.72, US_ASOF_ISO],
  ['GD', 'General Dynamics Corporation', '제너럴 다이내믹스', 'industrials', 104, 331.27, 0.9, US_ASOF_ISO],
  ['MMM', '3M Company', '3M', 'industrials', 94, 159.96, -2.21, US_ASOF_ISO],
  ['NOC', 'Northrop Grumman Corporation', '노스럽 그러먼', 'industrials', 78, 480.72, -0.78, US_ASOF_ISO],
  ['ITW', 'Illinois Tool Works Inc.', 'ITW', 'industrials', 85, 264.13, -0.22, US_ASOF_ISO],
  ['CSX', 'CSX Corporation', 'CSX', 'industrials', 95, 47.26, -0.17, US_ASOF_ISO],
  ['EMR', 'Emerson Electric Co.', '에머슨', 'industrials', 89, 161.83, 1.74, US_ASOF_ISO],

  // ---------- 기초 소재 ----------
  ['LIN', 'Linde plc', '린데', 'materials', 223, 483.73, 0.42, US_ASOF_ISO],
  ['SHW', 'The Sherwin-Williams Company', '셔윈윌리엄스', 'materials', 87, 319.36, -0.52, US_ASOF_ISO],
  ['SCCO', 'Southern Copper Corporation', '서던 코퍼', 'materials', 163, 209.21, 5.31, US_ASOF_ISO],
  ['FCX', 'Freeport-McMoRan Inc.', '프리포트 맥모란', 'materials', 97, 73.69, 3.58, US_ASOF_ISO],
  ['APD', 'Air Products and Chemicals', '에어프로덕츠', 'materials', 66, 281.26, 1.03, US_ASOF_ISO],
  ['NEM', 'Newmont Corporation', '뉴몬트', 'materials', 103, 117.84, 1.98, US_ASOF_ISO],
  ['NUE', 'Nucor Corporation', '뉴코어', 'materials', 62, 250.33, 1.7, US_ASOF_ISO],
  ['DOW', 'Dow Inc.', '다우', 'materials', 22, 28.42, -0.59, US_ASOF_ISO],
  ['AA', 'Alcoa Corporation', '알코아', 'materials', 12, 42.2, -1.47, US_ASOF_ISO],

  // ---------- 유틸리티 ----------
  ['NEE', 'NextEra Energy, Inc.', '넥스트에라', 'utilities', 182, 77.38, 0.01, US_ASOF_ISO],
  ['CEG', 'Constellation Energy Corp.', '컨스텔레이션', 'utilities', 95, 298.07, 4.56, US_ASOF_ISO],
  ['SO', 'The Southern Company', '서던 컴퍼니', 'utilities', 107, 86.17, 0.02, US_ASOF_ISO],
  ['DUK', 'Duke Energy Corporation', '듀크 에너지', 'utilities', 97, 116.65, -0.16, US_ASOF_ISO],
  ['VST', 'Vistra Corp.', '비스트라', 'utilities', 48, 161.48, 3.42, US_ASOF_ISO],
  ['AEP', 'American Electric Power', 'AEP', 'utilities', 70, 122.81, 0.4, US_ASOF_ISO],
  ['SRE', 'Sempra', '셈프라', 'utilities', 57, 81.34, 1.57, US_ASOF_ISO],
  ['D', 'Dominion Energy, Inc.', '도미니언', 'utilities', 61, 61.64, -0.18, US_ASOF_ISO],
  ['EXC', 'Exelon Corporation', '엑셀론', 'utilities', 47, 41.76, 0.07, US_ASOF_ISO],
  ['XEL', 'Xcel Energy Inc.', '엑셀 에너지', 'utilities', 49, 73.78, 0.57, US_ASOF_ISO],

  // ---------- 부동산 ----------
  ['WELL', 'Welltower Inc.', '웰타워', 'realestate', 167, 225.47, 1.09, US_ASOF_ISO],
  ['PLD', 'Prologis, Inc.', '프로로지스', 'realestate', 135, 129.49, 0.15, US_ASOF_ISO],
  ['AMT', 'American Tower Corporation', '아메리칸 타워', 'realestate', 82, 182.24, 9.3, US_ASOF_ISO],
  ['EQIX', 'Equinix, Inc.', '이퀴닉스', 'realestate', 104, 1026.06, 1.47, US_ASOF_ISO],
  ['SPG', 'Simon Property Group, Inc.', '사이먼 프로퍼티', 'realestate', 86, 199.42, -0.1, US_ASOF_ISO],
  ['DLR', 'Digital Realty Trust, Inc.', '디지털 리얼티', 'realestate', 73, 178.76, 1.53, US_ASOF_ISO],
  ['PSA', 'Public Storage', '퍼블릭 스토리지', 'realestate', 61, 289.86, 1.52, US_ASOF_ISO],
  ['O', 'Realty Income Corporation', '리얼티 인컴', 'realestate', 59, 54.18, 0.02, US_ASOF_ISO],
  ['CBRE', 'CBRE Group, Inc.', 'CBRE', 'realestate', 44, 130.8, -0.21, US_ASOF_ISO],
  ['CCI', 'Crown Castle Inc.', '크라운 캐슬', 'realestate', 33, 79.64, 15.6, US_ASOF_ISO],
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
  ['^GSPC', 'S&P 500', 'S&P 500', 7748.5, 0.26, 'INDEX', '2026-08-12T16:00:00-04:00'],
  ['^IXIC', 'NASDAQ Composite', '나스닥 종합', 26588.49, 0.54, 'INDEX', '2026-08-12T16:00:00-04:00'],
  ['^DJI', 'Dow Jones Industrial', '다우존스 산업평균', 53770.27, -0.04, 'INDEX', '2026-08-12T16:00:00-04:00'],
  ['^TNX', 'US 10Y Treasury', '미 국채 10년물', 3.62, 0.83, 'BOND'],
  ['DX=F', 'US Dollar Index', '달러 인덱스', 96.42, -0.21, 'ICE'],
  ['GC=F', 'Gold', '금 선물', 4075.26, 1.01, 'COMEX'],
  ['CL=F', 'WTI Crude Oil', 'WTI 원유', 67.85, 0.04, 'NYMEX'],
  ['BZ=F', 'Brent Crude', '브렌트유', 71.24, 0.06, 'ICE'],
];

/** [symbol, name, nameKo, price, changePct, marketCap($B)] */
type CryptoRow = [string, string, string, number, number, number];

const CRYPTO: CryptoRow[] = [
  ['BTCUSD', 'Bitcoin', '비트코인', 82634, 0.92149, 1660.59],
  ['ETHUSD', 'Ethereum', '이더리움', 2491.96, 0.40829, 304.29],
  ['XRPUSD', 'XRP', '리플', 1.4, 0.87438, 88.69],
  ['BNBUSD', 'BNB', '바이낸스 코인', 744.9, 1.17251, 99.19],
  ['SOLUSD', 'Solana', '솔라나', 109.74, 0.35138, 64.61],
  ['DOGEUSD', 'Dogecoin', '도지코인', 0.086138, 1.61519, 13.46],
  ['ADAUSD', 'Cardano', '카르다노', 0.253135, 8.3031, 9.52],
  ['TRXUSD', 'TRON', '트론', 0.330991, -0.41726, 31.44],
  ['AVAXUSD', 'Avalanche', '아발란체', 10.39, 1.80925, 4.61],
  ['LINKUSD', 'Chainlink', '체인링크', 12.84, 0.30638, 9.85],
  ['DOTUSD', 'Polkadot', '폴카닷', 1.25, 9.34409, 2.13],
  ['LTCUSD', 'Litecoin', '라이트코인', 63.77, 0.21893, 4.96],
  ['SHIBUSD', 'Shiba Inu', '시바이누', 0.00000548, 2.70729, 3.23],
  ['UNIUSD', 'Uniswap', '유니스왑', 7.37, 0.76037, 4.61],
  ['ATOMUSD', 'Cosmos', '코스모스', 2.01, 10.01028, 1.08],
  ['XLMUSD', 'Stellar', '스텔라', 0.195495, 0.94583, 6.85],
  ['NEARUSD', 'NEAR Protocol', '니어', 4.97, 7.21311, 6.5],
  ['APTUSD', 'Aptos', '앱토스', 0.82926, 9.84817, 0.72],
  ['ARBUSD', 'Arbitrum', '아비트럼', 0.184451, 6.06323, 1.25],
  ['ONDOUSD', 'Ondo', '온도', 0.487892, 3.23406, 2.38],
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
  closeLabel: 'Oct 9, 2026, 4:00 PM EDT',
  closeLabelKo: '2026년 10월 9일 16:00 EDT',
  // Thu 08-06: all three major US indices closed lower, oil/energy prices rose (typically read
  // as a headwind for equities and Fed policy), and the Dow's multi-day record-close streak
  // snapped — a mild risk-off session, not the sharp "낙관적" read the prior 08-04 anchor
  // (all three indices up, fresh records) supported.
  sentimentLabel: '예시 심리: 낙관',
  sentimentScore: 68, // 0-100, synthetic indicator
  asOfISO: US_ASOF_ISO,
  cryptoAsOfISO: '2026-10-10T01:48:53.000Z',
  cryptoAsOfLabelKo: '2026년 10월 10일 10:48 KST',
  // KR equities and the KOSPI/KOSDAQ/KOSPI200/USD-KRW/VKOSPI benchmarks refreshed in this pass
  // are all one 2026-08-07 KRX session close (see universe.kr.ts's `KR_ASOF_ISO`) — a day after
  // the US anchor above, and (per the refresh research's multi-source corroboration) the same
  // instant for both equities and indices, so one field covers both rather than implying a
  // false precision of separate KR equity vs. KR index capture times.
  krAsOfISO: KR_ASOF_ISO,
  krAsOfLabelKo: '2026년 10월 8일 15:30 KST',
  todayISO: '2026-10-10',
};
