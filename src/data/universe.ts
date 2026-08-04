/* ============================================================
   Asset universe — seeded to match the reference snapshot
   (2026-07-10 US market close, EDT). Prices/changes for visible
   tickers replicate the snapshot; the rest are realistic fills.
   ============================================================ */
import type { AssetKind, AssetMeta, SectorId, SectorInfo } from './types.js';

export const SECTORS: SectorInfo[] = [
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

export const SECTOR_BY_ID: Record<SectorId, SectorInfo> = Object.fromEntries(
  SECTORS.map((s) => [s.id, s]),
) as Record<SectorId, SectorInfo>;

/** [symbol, name, nameKo, sector, marketCap($B), price, dayChangePct] */
type StockRow = [string, string, string, SectorId, number, number, number];

const STOCKS: StockRow[] = [
  // ---------- 기술 ----------
  ['NVDA', 'NVIDIA Corporation', '엔비디아', 'tech', 5310, 217.55, 4.03],
  ['MSFT', 'Microsoft Corporation', '마이크로소프트', 'tech', 3920, 527.3, 0.19],
  ['AAPL', 'Apple Inc.', '애플', 'tech', 3410, 228.9, -0.28],
  ['AVGO', 'Broadcom Inc.', '브로드컴', 'tech', 1660, 351.4, -0.28],
  ['MU', 'Micron Technology, Inc.', '마이크론', 'tech', 862, 771.2, -1.24],
  ['AMD', 'Advanced Micro Devices, Inc.', 'AMD', 'tech', 904, 557.89, 2.04],
  ['ORCL', 'Oracle Corporation', '오라클', 'tech', 748, 268.4, -2.45],
  ['PLTR', 'Palantir Technologies Inc.', '팔란티어', 'tech', 618, 262.9, -1.85],
  ['HYNX', 'SK Hynix Inc. (ADR)', 'SK하이닉스', 'tech', 352, 42.15, 12.8],
  ['INTC', 'Intel Corporation', '인텔', 'tech', 318, 74.2, -2.4],
  ['IBM', 'International Business Machines', 'IBM', 'tech', 302, 326.1, 0.82],
  ['CSCO', 'Cisco Systems, Inc.', '시스코', 'tech', 291, 73.4, 2.54],
  ['CRM', 'Salesforce, Inc.', '세일즈포스', 'tech', 258, 269.5, -0.34],
  ['AMAT', 'Applied Materials, Inc.', '어플라이드 머티어리얼즈', 'tech', 242, 296.8, 2.35],
  ['NOW', 'ServiceNow, Inc.', '서비스나우', 'tech', 221, 1082, -0.41],
  ['ADBE', 'Adobe Inc.', '어도비', 'tech', 219, 511.2, -0.92],
  ['UBER', 'Uber Technologies, Inc.', '우버', 'tech', 218, 104.6, 1.31],
  ['TXN', 'Texas Instruments Incorporated', '텍사스 인스트루먼츠', 'tech', 211, 232.4, 0.95],
  ['QCOM', 'QUALCOMM Incorporated', '퀄컴', 'tech', 203, 183.2, 0.42],
  ['INTU', 'Intuit Inc.', '인튜이트', 'tech', 198, 719.5, 0.31],
  ['LRCX', 'Lam Research Corporation', '램 리서치', 'tech', 189, 147.8, -0.8],
  ['APP', 'AppLovin Corporation', '앱러빈', 'tech', 181, 532.4, 2.12],
  ['ANET', 'Arista Networks, Inc.', '아리스타 네트웍스', 'tech', 178, 144.9, 1.63],
  ['KLAC', 'KLA Corporation', 'KLA', 'tech', 156, 1163, 0.87],
  ['PANW', 'Palo Alto Networks, Inc.', '팔로알토 네트웍스', 'tech', 141, 209.8, 0.53],
  ['MRVL', 'Marvell Technology, Inc.', '마벨 테크놀로지', 'tech', 132, 151.6, 1.12],
  ['ADI', 'Analog Devices, Inc.', '아날로그 디바이시스', 'tech', 131, 264.3, 0.61],
  ['DELL', 'Dell Technologies Inc.', '델', 'tech', 129, 187.9, 1.88],
  ['CRWD', 'CrowdStrike Holdings, Inc.', '크라우드스트라이크', 'tech', 121, 481.5, -0.63],
  ['SNOW', 'Snowflake Inc.', '스노우플레이크', 'tech', 81, 241.2, 1.24],
  ['FTNT', 'Fortinet, Inc.', '포티넷', 'tech', 74, 97.6, -0.52],
  ['SMCI', 'Super Micro Computer, Inc.', '슈퍼마이크로', 'tech', 61, 96.3, 3.21],
  ['WDC', 'Western Digital Corporation', '웨스턴 디지털', 'tech', 46, 131.4, -0.43],
  ['STX', 'Seagate Technology Holdings', '씨게이트', 'tech', 41, 191.2, -0.71],
  ['RXT', 'Rackspace Technology, Inc.', '랙스페이스', 'tech', 1.3, 5.34, 22.2],
  ['XNDU', 'Xanadu Quantum Technologies', '자나두 퀀텀', 'tech', 2.1, 11.17, -0.89],
  ['IONQ', 'IonQ, Inc.', '아이온큐', 'tech', 9.4, 41.2, 11.2],
  ['RGTI', 'Rigetti Computing, Inc.', '리게티 컴퓨팅', 'tech', 4.1, 13.9, 10.8],
  ['SOUN', 'SoundHound AI, Inc.', '사운드하운드 AI', 'tech', 5.2, 13.1, 12.9],
  ['WOLF', 'Wolfspeed, Inc.', '울프스피드', 'tech', 1.1, 6.8, -14.2],
  ['DOCN', 'DigitalOcean Holdings, Inc.', '디지털오션', 'tech', 3.4, 36.2, -5.2],

  // ---------- 커뮤니케이션 서비스 ----------
  ['GOOGL', 'Alphabet Inc.', '알파벳', 'comm', 4340, 357.18, -0.48],
  ['META', 'Meta Platforms, Inc.', '메타 플랫폼스', 'comm', 1693, 669.21, 5.97],
  ['NFLX', 'Netflix, Inc.', '넷플릭스', 'comm', 561, 1312, 0.64],
  ['TMUS', 'T-Mobile US, Inc.', 'T모바일', 'comm', 281, 246.2, 0.44],
  ['DIS', 'The Walt Disney Company', '디즈니', 'comm', 212, 117.8, 0.91],
  ['T', 'AT&T Inc.', 'AT&T', 'comm', 193, 26.9, 0.72],
  ['VZ', 'Verizon Communications Inc.', '버라이즌', 'comm', 181, 43.1, 0.53],
  ['SPOT', 'Spotify Technology S.A.', '스포티파이', 'comm', 161, 782.4, 1.81],
  ['CMCSA', 'Comcast Corporation', '컴캐스트', 'comm', 129, 33.8, 0.32],
  ['RBLX', 'Roblox Corporation', '로블록스', 'comm', 91, 131.2, 2.31],

  // ---------- 경기소비재 ----------
  ['AMZN', 'Amazon.com, Inc.', '아마존', 'cons-cyc', 2455, 229.4, -0.69],
  ['TSLA', 'Tesla, Inc.', '테슬라', 'cons-cyc', 1312, 407.76, 0.3],
  ['HD', 'The Home Depot, Inc.', '홈디포', 'cons-cyc', 401, 404.8, 0.51],
  ['MCD', "McDonald's Corporation", '맥도날드', 'cons-cyc', 221, 309.5, 0.22],
  ['BKNG', 'Booking Holdings Inc.', '부킹 홀딩스', 'cons-cyc', 182, 5612, 0.93],
  ['TJX', 'The TJX Companies, Inc.', 'TJX', 'cons-cyc', 154, 137.8, 0.81],
  ['LOW', "Lowe's Companies, Inc.", '로우스', 'cons-cyc', 151, 266.3, 0.42],
  ['NKE', 'NIKE, Inc.', '나이키', 'cons-cyc', 111, 74.2, -1.21],
  ['SBUX', 'Starbucks Corporation', '스타벅스', 'cons-cyc', 104, 91.8, 0.62],
  ['ABNB', 'Airbnb, Inc.', '에어비앤비', 'cons-cyc', 86, 136.2, 1.14],
  ['CMG', 'Chipotle Mexican Grill, Inc.', '치폴레', 'cons-cyc', 74, 54.6, -0.81],
  ['MAR', 'Marriott International, Inc.', '메리어트', 'cons-cyc', 76, 271.4, 0.52],
  ['GM', 'General Motors Company', '제너럴 모터스', 'cons-cyc', 61, 55.3, -0.32],
  ['F', 'Ford Motor Company', '포드', 'cons-cyc', 46, 11.42, 0.21],
  ['LCID', 'Lucid Group, Inc.', '루시드', 'cons-cyc', 4.8, 1.58, -9.8],
  ['PTON', 'Peloton Interactive, Inc.', '펠로톤', 'cons-cyc', 2.6, 6.9, -8.4],
  ['CHWY', 'Chewy, Inc.', '츄이', 'cons-cyc', 13.2, 31.4, -5.9],
  ['PLBL', 'Polibeli Group Ltd', '폴리벨리 그룹', 'cons-cyc', 1.2, 8.12, 26.48],

  // ---------- 필수소비재 ----------
  ['WMT', 'Walmart Inc.', '월마트', 'cons-def', 851, 106.2, 1.51],
  ['COST', 'Costco Wholesale Corporation', '코스트코', 'cons-def', 481, 1084, 1.22],
  ['PG', 'The Procter & Gamble Company', 'P&G', 'cons-def', 379, 161.8, 0.13],
  ['KO', 'The Coca-Cola Company', '코카콜라', 'cons-def', 301, 69.9, 0.92],
  ['PM', 'Philip Morris International', '필립모리스', 'cons-def', 278, 178.6, 1.41],
  ['PEP', 'PepsiCo, Inc.', '펩시코', 'cons-def', 229, 167.2, 1.02],
  ['MO', 'Altria Group, Inc.', '알트리아', 'cons-def', 99, 58.7, 1.12],
  ['MDLZ', 'Mondelez International, Inc.', '몬델리즈', 'cons-def', 89, 66.8, 0.71],
  ['CL', 'Colgate-Palmolive Company', '콜게이트', 'cons-def', 74, 90.6, 0.82],
  ['TGT', 'Target Corporation', '타겟', 'cons-def', 66, 143.1, 1.83],
  ['KMB', 'Kimberly-Clark Corporation', '킴벌리클라크', 'cons-def', 45, 134.2, 0.61],

  // ---------- 금융 서비스 ----------
  ['BRK-B', 'Berkshire Hathaway Inc.', '버크셔 해서웨이', 'fin', 1121, 519.4, -0.35],
  ['JPM', 'JPMorgan Chase & Co.', 'JP모건', 'fin', 948, 341.2, 0.3],
  ['V', 'Visa Inc.', '비자', 'fin', 721, 372.5, 0.22],
  ['MA', 'Mastercard Incorporated', '마스터카드', 'fin', 562, 611.4, 0.68],
  ['BAC', 'Bank of America Corporation', '뱅크오브아메리카', 'fin', 381, 50.2, 0.41],
  ['WFC', 'Wells Fargo & Company', '웰스파고', 'fin', 279, 85.6, 0.52],
  ['AXP', 'American Express Company', '아메리칸 익스프레스', 'fin', 241, 341.8, 0.63],
  ['GS', 'The Goldman Sachs Group, Inc.', '골드만삭스', 'fin', 231, 722.5, -0.07],
  ['MS', 'Morgan Stanley', '모건스탠리', 'fin', 219, 136.2, 0.31],
  ['BX', 'Blackstone Inc.', '블랙스톤', 'fin', 189, 154.8, 1.52],
  ['BLK', 'BlackRock, Inc.', '블랙록', 'fin', 171, 1124, 0.43],
  ['SPGI', 'S&P Global Inc.', 'S&P 글로벌', 'fin', 169, 544.2, -0.21],
  ['PGR', 'The Progressive Corporation', '프로그레시브', 'fin', 164, 279.6, -0.52],
  ['C', 'Citigroup Inc.', '씨티그룹', 'fin', 161, 85.4, 0.71],
  ['SCHW', 'The Charles Schwab Corporation', '찰스슈왑', 'fin', 149, 81.9, 0.32],
  ['KKR', 'KKR & Co. Inc.', 'KKR', 'fin', 131, 146.3, 1.21],
  ['CB', 'Chubb Limited', '처브', 'fin', 119, 294.6, 0.12],
  ['COF', 'Capital One Financial Corp.', '캐피털원', 'fin', 91, 231.4, 0.91],
  ['BK', 'The Bank of New York Mellon', 'BNY 멜론', 'fin', 66, 91.2, 0.81],
  ['TRV', 'The Travelers Companies, Inc.', '트래블러스', 'fin', 56, 241.6, -0.22],
  ['TFC', 'Truist Financial Corporation', '트루이스트', 'fin', 59, 44.8, 0.62],
  ['STT', 'State Street Corporation', '스테이트 스트리트', 'fin', 31, 106.4, 0.93],
  ['RF', 'Regions Financial Corporation', '리전스 파이낸셜', 'fin', 22, 24.3, 0.52],

  // ---------- 의료 ----------
  ['LLY', 'Eli Lilly and Company', '일라이 릴리', 'healthcare', 902, 949.8, -2.33],
  ['JNJ', 'Johnson & Johnson', '존슨앤드존슨', 'healthcare', 421, 174.9, -0.82],
  ['UNH', 'UnitedHealth Group Incorporated', '유나이티드헬스', 'healthcare', 351, 386.4, -1.64],
  ['ABBV', 'AbbVie Inc.', '애브비', 'healthcare', 339, 191.8, -0.94],
  ['MRK', 'Merck & Co., Inc.', '머크', 'healthcare', 249, 98.6, -1.12],
  ['ABT', 'Abbott Laboratories', '애보트', 'healthcare', 229, 131.6, -0.61],
  ['TMO', 'Thermo Fisher Scientific Inc.', '써모피셔', 'healthcare', 201, 531.2, -0.42],
  ['ISRG', 'Intuitive Surgical, Inc.', '인튜이티브 서지컬', 'healthcare', 194, 546.2, 0.31],
  ['AMGN', 'Amgen Inc.', '암젠', 'healthcare', 161, 297.4, -0.91],
  ['PFE', 'Pfizer Inc.', '화이자', 'healthcare', 151, 26.6, -0.72],
  ['GILD', 'Gilead Sciences, Inc.', '길리어드', 'healthcare', 139, 111.6, -1.32],
  ['SYK', 'Stryker Corporation', '스트라이커', 'healthcare', 141, 369.8, -0.31],
  ['BSX', 'Boston Scientific Corporation', '보스턴 사이언티픽', 'healthcare', 129, 87.6, -0.21],
  ['VRTX', 'Vertex Pharmaceuticals', '버텍스', 'healthcare', 119, 464.2, -0.53],
  ['MDT', 'Medtronic plc', '메드트로닉', 'healthcare', 111, 86.4, -0.51],
  ['HCA', 'HCA Healthcare, Inc.', 'HCA 헬스케어', 'healthcare', 94, 381.2, -0.62],
  ['CVS', 'CVS Health Corporation', 'CVS 헬스', 'healthcare', 89, 70.8, 0.41],
  ['REGN', 'Regeneron Pharmaceuticals', '리제네론', 'healthcare', 61, 561.4, -1.81],
  ['AARD', 'Aardvark Therapeutics, Inc.', '아드바크 테라퓨틱스', 'healthcare', 0.35, 7.6, 52.0],
  ['FBRX', 'Forte Biosciences, Inc.', '포르테 바이오사이언스', 'healthcare', 0.9, 43.92, 19.67],
  ['QURE', 'uniQure N.V.', '유니큐어', 'healthcare', 1.1, 22.4, 15.4],
  ['SRPT', 'Sarepta Therapeutics, Inc.', '사렙타', 'healthcare', 2.2, 22.8, -21.35],
  ['MRNA', 'Moderna, Inc.', '모더나', 'healthcare', 11.2, 29.1, -7.9],

  // ---------- 에너지 ----------
  ['XOM', 'Exxon Mobil Corporation', '엑슨모빌', 'energy', 479, 111.8, 0.99],
  ['CVX', 'Chevron Corporation', '셰브론', 'energy', 271, 152.4, 1.35],
  ['COP', 'ConocoPhillips', '코노코필립스', 'energy', 131, 102.3, 0.71],
  ['WMB', 'The Williams Companies, Inc.', '윌리엄스', 'energy', 74, 61.8, 0.42],
  ['EOG', 'EOG Resources, Inc.', 'EOG 리소시스', 'energy', 71, 121.9, 0.52],
  ['MPC', 'Marathon Petroleum Corporation', '마라톤 페트롤리엄', 'energy', 66, 206.4, 2.11],
  ['KMI', 'Kinder Morgan, Inc.', '킨더모건', 'energy', 64, 28.9, 0.53],
  ['PSX', 'Phillips 66', '필립스66', 'energy', 59, 146.2, 1.92],
  ['OXY', 'Occidental Petroleum Corp.', '옥시덴탈', 'energy', 54, 54.8, 0.32],
  ['SLB', 'Schlumberger Limited', '슐럼버거', 'energy', 54, 37.9, 1.21],
  ['VLO', 'Valero Energy Corporation', '발레로', 'energy', 51, 161.2, 2.41],
  ['ENPH', 'Enphase Energy, Inc.', '엔페이즈', 'energy', 4.1, 30.2, -6.3],

  // ---------- 산업재 ----------
  ['GE', 'GE Aerospace', 'GE 에어로스페이스', 'industrials', 289, 269.8, 0.06],
  ['CAT', 'Caterpillar Inc.', '캐터필러', 'industrials', 189, 386.2, 1.49],
  ['RTX', 'RTX Corporation', 'RTX', 'industrials', 179, 134.8, 0.62],
  ['ETN', 'Eaton Corporation plc', '이튼', 'industrials', 151, 381.4, 1.11],
  ['HON', 'Honeywell International Inc.', '하니웰', 'industrials', 144, 224.6, 0.41],
  ['UNP', 'Union Pacific Corporation', '유니언 퍼시픽', 'industrials', 141, 234.8, 0.32],
  ['BA', 'The Boeing Company', '보잉', 'industrials', 131, 211.4, 0.81],
  ['DE', 'Deere & Company', '디어', 'industrials', 129, 479.6, 0.92],
  ['LMT', 'Lockheed Martin Corporation', '록히드마틴', 'industrials', 111, 471.2, 0.21],
  ['PH', 'Parker-Hannifin Corporation', '파커 하니핀', 'industrials', 91, 701.4, 0.72],
  ['UPS', 'United Parcel Service, Inc.', 'UPS', 'industrials', 89, 104.6, -0.31],
  ['TT', 'Trane Technologies plc', '트레인 테크놀로지스', 'industrials', 86, 379.8, 0.61],
  ['WM', 'Waste Management, Inc.', '웨이스트 매니지먼트', 'industrials', 84, 209.6, 0.31],
  ['TDG', 'TransDigm Group Incorporated', '트랜스다임', 'industrials', 81, 1421, 0.32],
  ['GD', 'General Dynamics Corporation', '제너럴 다이내믹스', 'industrials', 79, 294.8, 0.42],
  ['MMM', '3M Company', '3M', 'industrials', 79, 144.6, 0.51],
  ['NOC', 'Northrop Grumman Corporation', '노스럽 그러먼', 'industrials', 74, 511.2, 0.11],
  ['ITW', 'Illinois Tool Works Inc.', 'ITW', 'industrials', 71, 241.2, 0.21],
  ['CSX', 'CSX Corporation', 'CSX', 'industrials', 64, 33.8, 0.52],
  ['EMR', 'Emerson Electric Co.', '에머슨', 'industrials', 66, 116.2, 0.41],

  // ---------- 기초 소재 ----------
  ['LIN', 'Linde plc', '린데', 'materials', 221, 466.2, 1.31],
  ['SHW', 'The Sherwin-Williams Company', '셔윈윌리엄스', 'materials', 91, 361.4, 0.92],
  ['SCCO', 'Southern Copper Corporation', '서던 코퍼', 'materials', 74, 94.8, 1.81],
  ['FCX', 'Freeport-McMoRan Inc.', '프리포트 맥모란', 'materials', 66, 45.4, 2.21],
  ['APD', 'Air Products and Chemicals', '에어프로덕츠', 'materials', 61, 271.2, 1.12],
  ['NEM', 'Newmont Corporation', '뉴몬트', 'materials', 54, 47.8, -1.21],
  ['NUE', 'Nucor Corporation', '뉴코어', 'materials', 39, 144.8, 1.52],
  ['DOW', 'Dow Inc.', '다우', 'materials', 36, 50.4, 0.81],
  ['AA', 'Alcoa Corporation', '알코아', 'materials', 14, 54.6, 1.71],

  // ---------- 유틸리티 ----------
  ['NEE', 'NextEra Energy, Inc.', '넥스트에라', 'utilities', 169, 82.4, 0.71],
  ['CEG', 'Constellation Energy Corp.', '컨스텔레이션', 'utilities', 111, 351.2, 1.21],
  ['SO', 'The Southern Company', '서던 컴퍼니', 'utilities', 101, 92.1, 0.52],
  ['DUK', 'Duke Energy Corporation', '듀크 에너지', 'utilities', 91, 117.8, 0.61],
  ['VST', 'Vistra Corp.', '비스트라', 'utilities', 66, 191.4, 1.51],
  ['AEP', 'American Electric Power', 'AEP', 'utilities', 56, 104.8, 0.42],
  ['SRE', 'Sempra', '셈프라', 'utilities', 51, 79.8, 0.31],
  ['D', 'Dominion Energy, Inc.', '도미니언', 'utilities', 46, 54.9, 0.61],
  ['EXC', 'Exelon Corporation', '엑셀론', 'utilities', 41, 40.2, 0.52],
  ['XEL', 'Xcel Energy Inc.', '엑셀 에너지', 'utilities', 36, 64.1, 0.71],

  // ---------- 부동산 ----------
  ['WELL', 'Welltower Inc.', '웰타워', 'realestate', 104, 164.8, 0.81],
  ['PLD', 'Prologis, Inc.', '프로로지스', 'realestate', 101, 108.2, 0.61],
  ['AMT', 'American Tower Corporation', '아메리칸 타워', 'realestate', 96, 206.4, 0.52],
  ['EQIX', 'Equinix, Inc.', '이퀴닉스', 'realestate', 86, 881.2, 0.41],
  ['SPG', 'Simon Property Group, Inc.', '사이먼 프로퍼티', 'realestate', 61, 186.2, 0.32],
  ['DLR', 'Digital Realty Trust, Inc.', '디지털 리얼티', 'realestate', 56, 164.8, 0.72],
  ['PSA', 'Public Storage', '퍼블릭 스토리지', 'realestate', 51, 286.4, 0.21],
  ['O', 'Realty Income Corporation', '리얼티 인컴', 'realestate', 49, 56.2, 0.62],
  ['CBRE', 'CBRE Group, Inc.', 'CBRE', 'realestate', 46, 146.2, 0.91],
  ['CCI', 'Crown Castle Inc.', '크라운 캐슬', 'realestate', 41, 91.8, 0.12],
];

/** [symbol, name, nameKo, price, changePct, kindLabel] — indices/futures/macro */
type MacroRow = [string, string, string, number, number, string];

const MACRO: MacroRow[] = [
  ['ES=F', 'S&P Futures', 'S&P 선물', 7620.25, 0.42, 'CME'],
  ['NQ=F', 'NASDAQ Fut.', '나스닥 선물', 30032.25, 0.32, 'CME'],
  ['YM=F', 'Dow Futures', '다우 선물', 52906.0, 0.27, 'CBOT'],
  ['^VIX', 'VIX', 'VIX 변동성지수', 15.03, -5.11, 'CBOE'],
  ['^GSPC', 'S&P 500', 'S&P 500', 7581.94, 0.38, 'INDEX'],
  ['^IXIC', 'NASDAQ Composite', '나스닥 종합', 29856.11, 0.29, 'INDEX'],
  ['^DJI', 'Dow Jones Industrial', '다우존스 산업평균', 52644.32, 0.24, 'INDEX'],
  ['^TNX', 'US 10Y Treasury', '미 국채 10년물', 3.62, 0.83, 'BOND'],
  ['DX=F', 'US Dollar Index', '달러 인덱스', 96.42, -0.21, 'ICE'],
  ['GC=F', 'Gold', '금 선물', 3891.4, -0.36, 'COMEX'],
  ['CL=F', 'WTI Crude Oil', 'WTI 원유', 67.85, 0.04, 'NYMEX'],
  ['BZ=F', 'Brent Crude', '브렌트유', 71.24, 0.06, 'ICE'],
];

/** [symbol, name, nameKo, price, changePct, marketCap($B)] */
type CryptoRow = [string, string, string, number, number, number];

const CRYPTO: CryptoRow[] = [
  ['BTCUSD', 'Bitcoin', '비트코인', 64284.07, 0.77, 1268],
  ['ETHUSD', 'Ethereum', '이더리움', 1824.06, 2.2, 219],
  ['XRPUSD', 'XRP', '리플', 1.12, -0.82, 63],
  ['BNBUSD', 'BNB', '바이낸스 코인', 412.4, 0.41, 60],
  ['SOLUSD', 'Solana', '솔라나', 78.02, 0.52, 36],
  ['DOGEUSD', 'Dogecoin', '도지코인', 0.0821, 1.92, 12.1],
  ['ADAUSD', 'Cardano', '카르다노', 0.312, -0.51, 11.2],
  ['TRXUSD', 'TRON', '트론', 0.214, 0.31, 18.4],
  ['AVAXUSD', 'Avalanche', '아발란체', 14.21, 1.12, 5.9],
  ['LINKUSD', 'Chainlink', '체인링크', 9.84, 2.61, 6.4],
  ['DOTUSD', 'Polkadot', '폴카닷', 3.12, -0.42, 4.8],
  ['LTCUSD', 'Litecoin', '라이트코인', 62.4, 0.81, 4.7],
  ['SHIBUSD', 'Shiba Inu', '시바이누', 0.0000071, 1.21, 4.2],
  ['UNIUSD', 'Uniswap', '유니스왑', 5.42, 1.62, 3.3],
  ['ATOMUSD', 'Cosmos', '코스모스', 3.41, -0.91, 1.3],
  ['XLMUSD', 'Stellar', '스텔라', 0.192, 0.52, 5.8],
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

function stockAsset([symbol, name, nameKo, sectorId, capB, price, changePct]: StockRow): SeedAsset {
  const nasdaq = new Set(['NVDA','MSFT','AAPL','AVGO','MU','AMD','PLTR','HYNX','INTC','CSCO','AMAT','ADBE','TXN','QCOM','INTU','LRCX','APP','ANET','KLAC','PANW','MRVL','ADI','CRWD','SNOW','FTNT','SMCI','WDC','STX','RXT','XNDU','IONQ','RGTI','SOUN','WOLF','DOCN','GOOGL','META','NFLX','TMUS','CMCSA','RBLX','AMZN','TSLA','BKNG','SBUX','ABNB','CMG','MAR','LCID','PTON','CHWY','PLBL','COST','PEP','MDLZ','KMB','MO','ISRG','AMGN','GILD','VRTX','REGN','AARD','FBRX','QURE','SRPT','MRNA','ENPH','CEG','XEL','EXC','AEP','EQIX','PSA','CCI','LIN','NEM']);
  return {
    symbol, name, nameKo,
    exchange: nasdaq.has(symbol) ? 'NASDAQ' : 'NYSE',
    kind: 'stock',
    unit: 'USD',
    sectorId,
    marketCap: capB * 1e9,
    price, changePct,
    logoBg: chipColor(symbol),
    logoText: symbol.replace('-B', '').slice(0, 1),
  };
}

function macroAsset([symbol, name, nameKo, price, changePct, exchange]: MacroRow): SeedAsset {
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
    price,
    changePct,
    logoBg: '#20808d',
    logoText: name.slice(0, 1),
  };
}

function cryptoAsset([symbol, name, nameKo, price, changePct, capB]: CryptoRow): SeedAsset {
  return {
    symbol, name, nameKo, exchange: 'CRYPTO', kind: 'crypto', unit: 'USD',
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

/** Snapshot metadata */
export const SNAPSHOT = {
  dataMode: 'synthetic' as const,
  dataModeLabel: '모의 데이터',
  provenanceLabel: '외부 API 미연결 · 결정론적 로컬 시뮬레이션',
  closeLabel: 'Jul 10, 2026, 4:00 PM EDT',
  closeLabelKo: '2026년 7월 10일 16:00 EDT',
  sentimentLabel: '예시 심리: 낙관적',
  sentimentScore: 72, // 0-100, synthetic indicator
  asOfISO: '2026-07-10T16:00:00-04:00',
  cryptoAsOfISO: '2026-07-12T05:00:00Z',
  cryptoAsOfLabelKo: '2026년 7월 12일 14:00 KST',
  todayISO: '2026-07-12',
};
