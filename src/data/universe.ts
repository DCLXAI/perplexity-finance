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
export const US_ASOF_ISO = '2026-11-13T16:00:00-05:00';
export const US_MID_ASOF_ISO = '2026-11-06T16:00:00-05:00';
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
  ['NVDA', 'NVIDIA Corporation', '엔비디아', 'tech', 5300, 162.85, -2.01, US_ASOF_ISO],
  ['MSFT', 'Microsoft Corporation', '마이크로소프트', 'tech', 3710, 523.88, 0.17, US_ASOF_ISO],
  ['AAPL', 'Apple Inc.', '애플', 'tech', 4560, 356.27, 0.39, US_ASOF_ISO],
  ['AVGO', 'Broadcom Inc.', '브로드컴', 'tech', 2000, 347.01, -4.76, US_ASOF_ISO],
  ['MU', 'Micron Technology, Inc.', '마이크론', 'tech', 995.53, 778.31, -2.52, US_ASOF_ISO],
  ['AMD', 'Advanced Micro Devices, Inc.', 'AMD', 'tech', 798.74, 534.06, -8.75, US_ASOF_ISO],
  ['ORCL', 'Oracle Corporation', '오라클', 'tech', 413.26, 125.35, -1.38, US_ASOF_ISO],
  ['PLTR', 'Palantir Technologies Inc.', '팔란티어', 'tech', 391, 167.99, -2.09, US_ASOF_ISO],
  // HYNX is not a verified SK hynix ADR mapping; retain the older demo row rather than
  // importing the unrelated US-listed HYNX ETF history under the wrong company identity.
  ['HYNX', 'SK Hynix Inc. (ADR)', 'SK하이닉스', 'tech', 805, 154.38, 8.17],
  ['INTC', 'Intel Corporation', '인텔', 'tech', 503.44, 59.66, -2.52, US_ASOF_ISO],
  ['IBM', 'International Business Machines', 'IBM', 'tech', 222, 247.13, 1.01, US_ASOF_ISO],
  ['CSCO', 'Cisco Systems, Inc.', '시스코', 'tech', 480, 95.64, -6.24, US_ASOF_ISO],
  ['CRM', 'Salesforce, Inc.', '세일즈포스', 'tech', 156, 217.84, 0.12, US_ASOF_ISO],
  ['AMAT', 'Applied Materials, Inc.', '어플라이드 머티어리얼즈', 'tech', 434, 370.5, -2.74, US_ASOF_ISO],
  ['NOW', 'ServiceNow, Inc.', '서비스나우', 'tech', 122, 102.25, 1.58, US_ASOF_ISO],
  ['ADBE', 'Adobe Inc.', '어도비', 'tech', 102, 243.08, 1.9, US_ASOF_ISO],
  ['UBER', 'Uber Technologies, Inc.', '우버', 'tech', 147, 69.69, 0.82, US_ASOF_ISO],
  ['TXN', 'Texas Instruments Incorporated', '텍사스 인스트루먼츠', 'tech', 259, 303.6, -2.84, US_ASOF_ISO],
  ['QCOM', 'QUALCOMM Incorporated', '퀄컴', 'tech', 174, 172.47, -2.64, US_ASOF_ISO],
  ['INTU', 'Intuit Inc.', '인튜이트', 'tech', 89, 341.7, 0.45, US_ASOF_ISO],
  ['LRCX', 'Lam Research Corporation', '램 리서치', 'tech', 398, 225.92, -3.36, US_ASOF_ISO],
  ['APP', 'AppLovin Corporation', '앱러빈', 'tech', 141, 409.1, 3.92, US_ASOF_ISO],
  ['ANET', 'Arista Networks, Inc.', '아리스타 네트웍스', 'tech', 240, 197.29, -4.52, US_ASOF_ISO],
  ['KLAC', 'KLA Corporation', 'KLA', 'tech', 255, 152.32, -3.17, US_ASOF_ISO],
  ['PANW', 'Palo Alto Networks, Inc.', '팔로알토 네트웍스', 'tech', 299, 322.24, -0.13, US_ASOF_ISO],
  ['MRVL', 'Marvell Technology, Inc.', '마벨 테크놀로지', 'tech', 191, 156.76, -4.68, US_ASOF_ISO],
  ['ADI', 'Analog Devices, Inc.', '아날로그 디바이시스', 'tech', 185, 397.97, -2.77, US_ASOF_ISO],
  ['DELL', 'Dell Technologies Inc.', '델', 'tech', 302, 344.53, -7.18, US_ASOF_ISO],
  ['CRWD', 'CrowdStrike Holdings, Inc.', '크라우드스트라이크', 'tech', 215, 226.61, -1.42, US_ASOF_ISO],
  ['SNOW', 'Snowflake Inc.', '스노우플레이크', 'tech', 110, 291, -2.58, US_ASOF_ISO],
  ['FTNT', 'Fortinet, Inc.', '포티넷', 'tech', 123, 127.22, -1.79, US_ASOF_ISO],
  ['SMCI', 'Super Micro Computer, Inc.', '슈퍼마이크로', 'tech', 20, 26.87, -0.46, US_ASOF_ISO],
  ['WDC', 'Western Digital Corporation', '웨스턴 디지털', 'tech', 189, 295.65, -5, US_ASOF_ISO],
  ['STX', 'Seagate Technology Holdings', '씨게이트', 'tech', 192, 528.29, -3.09, US_ASOF_ISO],
  ['RXT', 'Rackspace Technology, Inc.', '랙스페이스', 'tech', 1.31, 2.92, -2.99, US_ASOF_ISO],
  ['XNDU', 'Xanadu Quantum Technologies', '자나두 퀀텀', 'tech', 3.48, 2.29, -9.13, US_ASOF_ISO],
  ['IONQ', 'IonQ, Inc.', '아이온큐', 'tech', 16, 28.88, -6.42, US_ASOF_ISO],
  ['RGTI', 'Rigetti Computing, Inc.', '리게티 컴퓨팅', 'tech', 5.8, 9.62, -6.87, US_ASOF_ISO],
  ['SOUN', 'SoundHound AI, Inc.', '사운드하운드 AI', 'tech', 2.82, 3.49, -3.06, US_ASOF_ISO],
  ['WOLF', 'Wolfspeed, Inc.', '울프스피드', 'tech', 1.41, 24.83, -6.34, US_ASOF_ISO],
  ['DOCN', 'DigitalOcean Holdings, Inc.', '디지털오션', 'tech', 15, 86.32, -4.16, US_ASOF_ISO],

  // ---------- 커뮤니케이션 서비스 ----------
  ['GOOGL', 'Alphabet Inc.', '알파벳', 'comm', 4380, 295.77, -0.98, US_ASOF_ISO],
  ['META', 'Meta Platforms, Inc.', '메타 플랫폼스', 'comm', 1500, 641.69, 2.9, US_ASOF_ISO],
  ['NFLX', 'Netflix, Inc.', '넷플릭스', 'comm', 306, 62.15, -0.86, US_ASOF_ISO],
  ['TMUS', 'T-Mobile US, Inc.', 'T모바일', 'comm', 190, 169.95, -0.63, US_ASOF_ISO],
  ['DIS', 'The Walt Disney Company', '디즈니', 'comm', 170, 118.97, 0.63, US_ASOF_ISO],
  ['T', 'AT&T Inc.', 'AT&T', 'comm', 160, 22.18000030517578, 0, US_ASOF_ISO],
  ['VZ', 'Verizon Communications Inc.', '버라이즌', 'comm', 195, 46.36, -0.41, US_ASOF_ISO],
  ['SPOT', 'Spotify Technology S.A.', '스포티파이', 'comm', 98, 612.63, 2.36, US_ASOF_ISO],
  ['CMCSA', 'Comcast Corporation', '컴캐스트', 'comm', 88, 25.16, 1.45, US_ASOF_ISO],
  ['RBLX', 'Roblox Corporation', '로블록스', 'comm', 26, 49.91, -2.94, US_ASOF_ISO],

  // ---------- 경기소비재 ----------
  ['AMZN', 'Amazon.com, Inc.', '아마존', 'cons-cyc', 2940, 266.66, -0.29, US_ASOF_ISO],
  ['TSLA', 'Tesla, Inc.', '테슬라', 'cons-cyc', 1260, 390.22, -1.82, US_ASOF_ISO],
  ['HD', 'The Home Depot, Inc.', '홈디포', 'cons-cyc', 347, 348.69, 0.12, US_ASOF_ISO],
  ['MCD', "McDonald's Corporation", '맥도날드', 'cons-cyc', 191, 271.97, -0.61, US_ASOF_ISO],
  ['BKNG', 'Booking Holdings Inc.', '부킹 홀딩스', 'cons-cyc', 151, 159.58, -1, US_ASOF_ISO],
  ['TJX', 'The TJX Companies, Inc.', 'TJX', 'cons-cyc', 174, 134.37, -1.18, US_ASOF_ISO],
  ['LOW', "Lowe's Companies, Inc.", '로우스', 'cons-cyc', 122, 227.73, 0.12, US_ASOF_ISO],
  ['NKE', 'NIKE, Inc.', '나이키', 'cons-cyc', 62, 37.99, 0.61, US_ASOF_ISO],
  ['SBUX', 'Starbucks Corporation', '스타벅스', 'cons-cyc', 120, 106.44, -0.18, US_ASOF_ISO],
  ['ABNB', 'Airbnb, Inc.', '에어비앤비', 'cons-cyc', 89, 186.78, 3.12, US_ASOF_ISO],
  ['CMG', 'Chipotle Mexican Grill, Inc.', '치폴레', 'cons-cyc', 43, 35.28, 0.31, US_ASOF_ISO],
  ['MAR', 'Marriott International, Inc.', '메리어트', 'cons-cyc', 90, 423.16, -0.35, US_ASOF_ISO],
  ['GM', 'General Motors Company', '제너럴 모터스', 'cons-cyc', 77, 86, -0.29, US_ASOF_ISO],
  ['F', 'Ford Motor Company', '포드', 'cons-cyc', 57, 11.91, 0.08, US_ASOF_ISO],
  ['LCID', 'Lucid Group, Inc.', '루시드', 'cons-cyc', 3.04, 2.96, -9.22, US_ASOF_ISO],
  ['PTON', 'Peloton Interactive, Inc.', '펠로톤', 'cons-cyc', 2.86, 5.7, 3.07, US_ASOF_ISO],
  ['CHWY', 'Chewy, Inc.', '츄이', 'cons-cyc', 9.87, 22.52, -0.35, US_ASOF_ISO],
  ['PLBL', 'Polibeli Group Ltd', '폴리벨리 그룹', 'cons-cyc', 2.21, 7.24, -0.41, US_ASOF_ISO],

  // ---------- 필수소비재 ----------
  ['WMT', 'Walmart Inc.', '월마트', 'cons-def', 891.86, 128.09, 1.51, US_ASOF_ISO],
  ['COST', 'Costco Wholesale Corporation', '코스트코', 'cons-def', 420.93, 1106.21, 1.28, US_ASOF_ISO],
  ['PG', 'The Procter & Gamble Company', 'P&G', 'cons-def', 345, 169.8, 1.05, US_ASOF_ISO],
  ['KO', 'The Coca-Cola Company', '코카콜라', 'cons-def', 372, 99.25, 1.86, US_ASOF_ISO],
  ['PM', 'Philip Morris International', '필립모리스', 'cons-def', 291, 198.96, 1.17, US_ASOF_ISO],
  ['PEP', 'PepsiCo, Inc.', '펩시코', 'cons-def', 190, 145.44, 2.24, US_ASOF_ISO],
  ['MO', 'Altria Group, Inc.', '알트리아', 'cons-def', 114, 78.64, 0.92, US_ASOF_ISO],
  ['MDLZ', 'Mondelez International, Inc.', '몬델리즈', 'cons-def', 79, 67.54, 1.47, US_ASOF_ISO],
  ['CL', 'Colgate-Palmolive Company', '콜게이트', 'cons-def', 74, 99.67, 1.81, US_ASOF_ISO],
  ['TGT', 'Target Corporation', '타겟', 'cons-def', 67, 161.45, 0.34, US_ASOF_ISO],
  ['KMB', 'Kimberly-Clark Corporation', '킴벌리클라크', 'cons-def', 37, 109.43, 2.09, US_ASOF_ISO],

  // ---------- 금융 서비스 ----------
  ['BRK-B', 'Berkshire Hathaway Inc.', '버크셔 해서웨이', 'fin', 1130, 592.94, 0.53, US_ASOF_ISO],
  ['JPM', 'JPMorgan Chase & Co.', 'JP모건', 'fin', 947.12, 346.19, 0.98, US_ASOF_ISO],
  ['V', 'Visa Inc.', '비자', 'fin', 680.04, 425.76, 1.3, US_ASOF_ISO],
  ['MA', 'Mastercard Incorporated', '마스터카드', 'fin', 504.54, 661.19, 1.32, US_ASOF_ISO],
  ['BAC', 'Bank of America Corporation', '뱅크오브아메리카', 'fin', 440, 51.02, 1.01, US_ASOF_ISO],
  ['WFC', 'Wells Fargo & Company', '웰스파고', 'fin', 267, 86.05, 0.34, US_ASOF_ISO],
  ['AXP', 'American Express Company', '아메리칸 익스프레스', 'fin', 234, 320.6, 0.8, US_ASOF_ISO],
  ['GS', 'The Goldman Sachs Group, Inc.', '골드만삭스', 'fin', 319, 916.56, 0.32, US_ASOF_ISO],
  ['MS', 'Morgan Stanley', '모건스탠리', 'fin', 341, 190.65, 0.78, US_ASOF_ISO],
  ['BX', 'Blackstone Inc.', '블랙스톤', 'fin', 171, 120.19, 1.39, US_ASOF_ISO],
  ['BLK', 'BlackRock, Inc.', '블랙록', 'fin', 184, 1222.91, 0.52, US_ASOF_ISO],
  ['SPGI', 'S&P Global Inc.', 'S&P 글로벌', 'fin', 122, 473.59, 1.08, US_ASOF_ISO],
  ['PGR', 'The Progressive Corporation', '프로그레시브', 'fin', 123, 235.78, 0.12, US_ASOF_ISO],
  ['C', 'Citigroup Inc.', '씨티그룹', 'fin', 230, 124.01, -0.04, US_ASOF_ISO],
  ['SCHW', 'The Charles Schwab Corporation', '찰스슈왑', 'fin', 185, 92.98, 1.73, US_ASOF_ISO],
  ['KKR', 'KKR & Co. Inc.', 'KKR', 'fin', 97, 98.05, 0.87, US_ASOF_ISO],
  ['CB', 'Chubb Limited', '처브', 'fin', 134, 375.74, 1.07, US_ASOF_ISO],
  ['COF', 'Capital One Financial Corp.', '캐피털원', 'fin', 136, 195.08, 0.76, US_ASOF_ISO],
  ['BK', 'The Bank of New York Mellon', 'BNY 멜론', 'fin', 106, 153.41, 0.41, US_ASOF_ISO],
  ['TRV', 'The Travelers Companies, Inc.', '트래블러스', 'fin', 79, 403.23, 0.01, US_ASOF_ISO],
  ['TFC', 'Truist Financial Corporation', '트루이스트', 'fin', 64, 49.97, 1.22, US_ASOF_ISO],
  ['STT', 'State Street Corporation', '스테이트 스트리트', 'fin', 51, 173.45, -0.14, US_ASOF_ISO],
  ['RF', 'Regions Financial Corporation', '리전스 파이낸셜', 'fin', 27, 28.86, 1.23, US_ASOF_ISO],

  // ---------- 의료 ----------
  ['LLY', 'Eli Lilly and Company', '일라이 릴리', 'healthcare', 1060, 1443.5, 1.26, US_ASOF_ISO],
  ['JNJ', 'Johnson & Johnson', '존슨앤드존슨', 'healthcare', 619.3, 285.75, 0.79, US_ASOF_ISO],
  ['UNH', 'UnitedHealth Group Incorporated', '유나이티드헬스', 'healthcare', 370, 407.46, 0.58, US_ASOF_ISO],
  ['ABBV', 'AbbVie Inc.', '애브비', 'healthcare', 431, 295.03, 0.2, US_ASOF_ISO],
  ['MRK', 'Merck & Co., Inc.', '머크', 'healthcare', 316, 147.76, 0.55, US_ASOF_ISO],
  ['ABT', 'Abbott Laboratories', '애보트', 'healthcare', 182, 108.52, 1.18, US_ASOF_ISO],
  ['TMO', 'Thermo Fisher Scientific Inc.', '써모피셔', 'healthcare', 209, 700.22, 0.11, US_ASOF_ISO],
  ['ISRG', 'Intuitive Surgical, Inc.', '인튜이티브 서지컬', 'healthcare', 130, 443.59, 0.84, US_ASOF_ISO],
  ['AMGN', 'Amgen Inc.', '암젠', 'healthcare', 210, 465.67, -0.3, US_ASOF_ISO],
  ['PFE', 'Pfizer Inc.', '화이자', 'healthcare', 145, 28.89, 0.21, US_ASOF_ISO],
  ['GILD', 'Gilead Sciences, Inc.', '길리어드', 'healthcare', 168, 168.08, 0.08, US_ASOF_ISO],
  ['SYK', 'Stryker Corporation', '스트라이커', 'healthcare', 129, 309.64, -0.88, US_ASOF_ISO],
  ['BSX', 'Boston Scientific Corporation', '보스턴 사이언티픽', 'healthcare', 71, 44.34, 0.32, US_ASOF_ISO],
  ['VRTX', 'Vertex Pharmaceuticals', '버텍스', 'healthcare', 121, 538.6, -0.74, US_ASOF_ISO],
  ['MDT', 'Medtronic plc', '메드트로닉', 'healthcare', 110, 102.86, 1.85, US_ASOF_ISO],
  ['HCA', 'HCA Healthcare, Inc.', 'HCA 헬스케어', 'healthcare', 87, 499.05, -0.32, US_ASOF_ISO],
  ['CVS', 'CVS Health Corporation', 'CVS 헬스', 'healthcare', 133, 89.35, -0.49, US_ASOF_ISO],
  ['REGN', 'Regeneron Pharmaceuticals', '리제네론', 'healthcare', 76, 955.47, 0.45, US_ASOF_ISO],
  ['AARD', 'Aardvark Therapeutics, Inc.', '아드바크 테라퓨틱스', 'healthcare', 0.158, 1.33, -12.5, US_ASOF_ISO],
  ['FBRX', 'Forte Biosciences, Inc.', '포르테 바이오사이언스', 'healthcare', 1.87, 76.97, 0.03, '2026-08-25T16:00:00-04:00'],
  ['QURE', 'uniQure N.V.', '유니큐어', 'healthcare', 3.03, 23.81, -3.33, US_ASOF_ISO],
  ['SRPT', 'Sarepta Therapeutics, Inc.', '사렙타', 'healthcare', 1.73, 16.07, 0.37, US_ASOF_ISO],
  ['MRNA', 'Moderna, Inc.', '모더나', 'healthcare', 23, 223.37, -3.45, US_ASOF_ISO],

  // ---------- 에너지 ----------
  ['XOM', 'Exxon Mobil Corporation', '엑슨모빌', 'energy', 636.69, 170.59, 0.48, US_ASOF_ISO],
  ['CVX', 'Chevron Corporation', '셰브론', 'energy', 374, 219.89, 1.64, US_ASOF_ISO],
  ['COP', 'ConocoPhillips', '코노코필립스', 'energy', 144, 142.28, 1.59, US_ASOF_ISO],
  ['WMB', 'The Williams Companies, Inc.', '윌리엄스', 'energy', 87, 69.09, -0.5, US_ASOF_ISO],
  ['EOG', 'EOG Resources, Inc.', 'EOG 리소시스', 'energy', 76, 158.32, 1.73, US_ASOF_ISO],
  ['MPC', 'Marathon Petroleum Corporation', '마라톤 페트롤리엄', 'energy', 91, 414.65, 0.44, US_ASOF_ISO],
  ['KMI', 'Kinder Morgan, Inc.', '킨더모건', 'energy', 70, 31.92, -0.28, US_ASOF_ISO],
  ['PSX', 'Phillips 66', '필립스66', 'energy', 83, 264.9, 0.76, US_ASOF_ISO],
  ['OXY', 'Occidental Petroleum Corp.', '옥시덴탈', 'energy', 55, 58.75, 0.6, US_ASOF_ISO],
  ['SLB', 'Schlumberger Limited', '슐럼버거', 'energy', 75, 51.67, 1.49, US_ASOF_ISO],
  ['VLO', 'Valero Energy Corporation', '발레로', 'energy', 89, 379.83, 1.3, US_ASOF_ISO],
  ['ENPH', 'Enphase Energy, Inc.', '엔페이즈', 'energy', 5.52, 26.07, -2.65, US_ASOF_ISO],

  // ---------- 산업재 ----------
  ['GE', 'GE Aerospace', 'GE 에어로스페이스', 'industrials', 391, 331.81, 0.29, US_ASOF_ISO],
  ['CAT', 'Caterpillar Inc.', '캐터필러', 'industrials', 404, 600.2, -0.84, US_ASOF_ISO],
  ['RTX', 'RTX Corporation', 'RTX', 'industrials', 294, 198.58, 0.11, US_ASOF_ISO],
  ['ETN', 'Eaton Corporation plc', '이튼', 'industrials', 173, 352.97, -1.69, US_ASOF_ISO],
  ['HON', 'Honeywell International Inc.', '하니웰', 'industrials', 79, 222.46, -0.13, US_ASOF_ISO],
  ['UNP', 'Union Pacific Corporation', '유니언 퍼시픽', 'industrials', 176, 302.44, -0.58, US_ASOF_ISO],
  ['BA', 'The Boeing Company', '보잉', 'industrials', 187, 171.5, -0.03, US_ASOF_ISO],
  ['DE', 'Deere & Company', '디어', 'industrials', 167, 673.54, -0.77, US_ASOF_ISO],
  ['LMT', 'Lockheed Martin Corporation', '록히드마틴', 'industrials', 136, 596.04, -1.33, US_ASOF_ISO],
  ['PH', 'Parker-Hannifin Corporation', '파커 하니핀', 'industrials', 125, 955.68, -0.03, US_ASOF_ISO],
  ['UPS', 'United Parcel Service, Inc.', 'UPS', 'industrials', 93, 112.4, 1.83, US_ASOF_ISO],
  ['TT', 'Trane Technologies plc', '트레인 테크놀로지스', 'industrials', 104, 417.99, -1.43, US_ASOF_ISO],
  ['WM', 'Waste Management, Inc.', '웨이스트 매니지먼트', 'industrials', 90, 243.83, -0.11, US_ASOF_ISO],
  ['TDG', 'TransDigm Group Incorporated', '트랜스다임', 'industrials', 71, 1217.28, 1.19, US_ASOF_ISO],
  ['GD', 'General Dynamics Corporation', '제너럴 다이내믹스', 'industrials', 104, 363.46, 0.11, US_ASOF_ISO],
  ['MMM', '3M Company', '3M', 'industrials', 94, 183.66, -0.97, US_ASOF_ISO],
  ['NOC', 'Northrop Grumman Corporation', '노스럽 그러먼', 'industrials', 78, 550.43, 0.24, US_ASOF_ISO],
  ['ITW', 'Illinois Tool Works Inc.', 'ITW', 'industrials', 85, 287.52, 0.27, US_ASOF_ISO],
  ['CSX', 'CSX Corporation', 'CSX', 'industrials', 95, 52.05, -0.67, US_ASOF_ISO],
  ['EMR', 'Emerson Electric Co.', '에머슨', 'industrials', 89, 166.38, 0.03, US_ASOF_ISO],

  // ---------- 기초 소재 ----------
  ['LIN', 'Linde plc', '린데', 'materials', 223, 526.06, 0.68, US_ASOF_ISO],
  ['SHW', 'The Sherwin-Williams Company', '셔윈윌리엄스', 'materials', 87, 349.89, -0.2, US_ASOF_ISO],
  ['SCCO', 'Southern Copper Corporation', '서던 코퍼', 'materials', 163, 164.08, -2.46, US_ASOF_ISO],
  ['FCX', 'Freeport-McMoRan Inc.', '프리포트 맥모란', 'materials', 97, 59.24, -2, US_ASOF_ISO],
  ['APD', 'Air Products and Chemicals', '에어프로덕츠', 'materials', 66, 316.53, 0.1, US_ASOF_ISO],
  ['NEM', 'Newmont Corporation', '뉴몬트', 'materials', 103, 113.14, 0.44, US_ASOF_ISO],
  ['NUE', 'Nucor Corporation', '뉴코어', 'materials', 62, 251.73, -3.46, US_ASOF_ISO],
  ['DOW', 'Dow Inc.', '다우', 'materials', 22, 33.04, -0.33, US_ASOF_ISO],
  ['AA', 'Alcoa Corporation', '알코아', 'materials', 12, 39.74, -1.76, US_ASOF_ISO],

  // ---------- 유틸리티 ----------
  ['NEE', 'NextEra Energy, Inc.', '넥스트에라', 'utilities', 182, 85.12, -0.2, US_ASOF_ISO],
  ['CEG', 'Constellation Energy Corp.', '컨스텔레이션', 'utilities', 95, 280.2, -0.78, US_ASOF_ISO],
  ['SO', 'The Southern Company', '서던 컴퍼니', 'utilities', 107, 93.59, 1.21, US_ASOF_ISO],
  ['DUK', 'Duke Energy Corporation', '듀크 에너지', 'utilities', 97, 129.16, 1.3, US_ASOF_ISO],
  ['VST', 'Vistra Corp.', '비스트라', 'utilities', 48, 133.01, -1.12, US_ASOF_ISO],
  ['AEP', 'American Electric Power', 'AEP', 'utilities', 70, 129.18, 0.21, US_ASOF_ISO],
  ['SRE', 'Sempra', '셈프라', 'utilities', 57, 79.54, 0.71, US_ASOF_ISO],
  ['D', 'Dominion Energy, Inc.', '도미니언', 'utilities', 61, 67.66, 0.22, US_ASOF_ISO],
  ['EXC', 'Exelon Corporation', '엑셀론', 'utilities', 47, 46.25, 1.36, US_ASOF_ISO],
  ['XEL', 'Xcel Energy Inc.', '엑셀 에너지', 'utilities', 49, 81.61, 0.13, US_ASOF_ISO],

  // ---------- 부동산 ----------
  ['WELL', 'Welltower Inc.', '웰타워', 'realestate', 167, 244.46, -0.19, US_ASOF_ISO],
  ['PLD', 'Prologis, Inc.', '프로로지스', 'realestate', 135, 128.67, 0.09, US_ASOF_ISO],
  ['AMT', 'American Tower Corporation', '아메리칸 타워', 'realestate', 82, 191.64, 0.97, US_ASOF_ISO],
  ['EQIX', 'Equinix, Inc.', '이퀴닉스', 'realestate', 104, 1053.79, -1.77, US_ASOF_ISO],
  ['SPG', 'Simon Property Group, Inc.', '사이먼 프로퍼티', 'realestate', 86, 232.97, -0.27, US_ASOF_ISO],
  ['DLR', 'Digital Realty Trust, Inc.', '디지털 리얼티', 'realestate', 73, 179.99, -1.9, US_ASOF_ISO],
  ['PSA', 'Public Storage', '퍼블릭 스토리지', 'realestate', 61, 332.59, -0.22, US_ASOF_ISO],
  ['O', 'Realty Income Corporation', '리얼티 인컴', 'realestate', 59, 58.82, -0.74, US_ASOF_ISO],
  ['CBRE', 'CBRE Group, Inc.', 'CBRE', 'realestate', 44, 133.12, 0.44, US_ASOF_ISO],
  ['CCI', 'Crown Castle Inc.', '크라운 캐슬', 'realestate', 33, 90.83, 1.27, US_ASOF_ISO],
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
  ['BTCUSD', 'Bitcoin', '비트코인', 62276, -8.44817, 1252.49],
  ['ETHUSD', 'Ethereum', '이더리움', 1725.56, -10.2716, 210.9],
  ['XRPUSD', 'XRP', '리플', 0.904235, -9.80241, 57.43],
  ['BNBUSD', 'BNB', '바이낸스 코인', 569.25, -9.52351, 74.86],
  ['SOLUSD', 'Solana', '솔라나', 67.78, -11.82194, 40.1],
  ['DOGEUSD', 'Dogecoin', '도지코인', 0.05594, -12.65621, 8.77],
  ['ADAUSD', 'Cardano', '카르다노', 0.143322, -14.06949, 5.38],
  ['TRXUSD', 'TRON', '트론', 0.3049, -2.1433, 28.98],
  ['AVAXUSD', 'Avalanche', '아발란체', 6.81, -16.57413, 3.04],
  ['LINKUSD', 'Chainlink', '체인링크', 8.68, -11.02826, 6.66],
  ['DOTUSD', 'Polkadot', '폴카닷', 0.689597, -14.71637, 1.18],
  ['LTCUSD', 'Litecoin', '라이트코인', 42.96, -12.76339, 3.34],
  ['SHIBUSD', 'Shiba Inu', '시바이누', 0.00000373, -11.65366, 2.2],
  ['UNIUSD', 'Uniswap', '유니스왑', 4.72, -17.13216, 2.87],
  ['ATOMUSD', 'Cosmos', '코스모스', 1.23, -8.53799, 0.67],
  ['XLMUSD', 'Stellar', '스텔라', 0.131529, -9.17332, 4.66],
  ['NEARUSD', 'NEAR Protocol', '니어', 2.94, -13.97221, 3.85],
  ['APTUSD', 'Aptos', '앱토스', 0.43726, -17.35635, 0.39],
  ['ARBUSD', 'Arbitrum', '아비트럼', 0.123892, -13.24312, 0.85],
  ['ONDOUSD', 'Ondo', '온도', 0.289136, -14.05833, 1.41],
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
  closeLabel: 'Nov 13, 2026, 4:00 PM EST',
  closeLabelKo: '2026년 11월 13일 16:00 EST',
  // Thu 08-06: all three major US indices closed lower, oil/energy prices rose (typically read
  // as a headwind for equities and Fed policy), and the Dow's multi-day record-close streak
  // snapped — a mild risk-off session, not the sharp "낙관적" read the prior 08-04 anchor
  // (all three indices up, fresh records) supported.
  sentimentLabel: '예시 심리: 낙관',
  sentimentScore: 68, // 0-100, synthetic indicator
  asOfISO: US_ASOF_ISO,
  cryptoAsOfISO: '2026-11-15T01:58:53.000Z',
  cryptoAsOfLabelKo: '2026년 11월 15일 10:58 KST',
  // KR equities and the KOSPI/KOSDAQ/KOSPI200/USD-KRW/VKOSPI benchmarks refreshed in this pass
  // are all one 2026-08-07 KRX session close (see universe.kr.ts's `KR_ASOF_ISO`) — a day after
  // the US anchor above, and (per the refresh research's multi-source corroboration) the same
  // instant for both equities and indices, so one field covers both rather than implying a
  // false precision of separate KR equity vs. KR index capture times.
  krAsOfISO: KR_ASOF_ISO,
  krAsOfLabelKo: '2026년 11월 13일 15:30 KST',
  todayISO: '2026-11-15',
};
