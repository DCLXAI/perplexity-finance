/* ============================================================
   Editorial / static fallback content.
   Refreshed 2026-08-14 KST from primary/attributed public sources.
   ============================================================ */
import type {
  AppGalleryItem,
  EarningsDay,
  EarningsEntry,
  ExploreCard,
  MarketSummaryItem,
  NewsItem,
  PoliticianTrade,
  PredictionMarket,
} from './types.js';
import type { MarketRegion } from './region.js';
import { KR_EXPLORE_CARDS, KR_GENERAL_NEWS, KR_MARKET_SUMMARY } from './content.kr.js';

/* ---------- 시장 요약 (market summary accordion) ---------- */

export const MARKET_SUMMARY: MarketSummaryItem[] = [
  {
    id: 'ms-us-aug12-close',
    title: 'AI Rally Lifts S&P 500 and Nasdaq at the August 12 Close',
    body: 'The latest fully settled US session in this fallback snapshot ended with the S&P 500 up 20.30 points (+0.26%) at 7,748.50 and the Nasdaq Composite up 143.04 points (+0.54%) at 26,588.49. The Dow slipped 21.58 points (-0.04%) to 53,770.27.',
    sources: 2,
  },
  {
    id: 'ms-us-aug13-live',
    title: 'August 13 US Session Tracks Toward Records, but Is Still Intraday',
    body: 'At 2:10 PM ET Thursday, the S&P 500 was up about 0.6%, the Nasdaq about 0.7%, and the Dow up 22 points. These are explicitly intraday figures; the checked-in equity table remains anchored to the latest confirmed August 12 close.',
    sources: 1,
  },
  {
    id: 'ms-us-ppi',
    title: 'Wholesale Inflation Cools, Supporting Thursday’s Risk Appetite',
    body: 'US wholesale inflation was reported at 4.7% year over year in July, down from 5.5% in June and slightly better than economists expected. Easing oil prices added to the supportive macro backdrop, while prediction markets continued to price a September hold as the most likely outcome.',
    sources: 2,
  },
  {
    id: 'ms-us-ai',
    title: 'AI Infrastructure Names Lead the August 12 Advance',
    body: 'Super Micro Computer jumped about 19% after reporting profit roughly 84% above analysts’ expectations. The move joined gains across AI-linked hardware names and helped the Nasdaq outperform at the settled close.',
    sources: 2,
  },
  {
    id: 'ms-us-earnings',
    title: 'Applied Materials and Ross Stores Headline Thursday Earnings',
    body: 'Applied Materials and Ross Stores were the most prominent companies scheduled for August 13 results, with Applied Materials’ investor-relations calendar confirming the release date. Friday’s thinner slate includes VIPS and Madison Square Garden Entertainment.',
    sources: 3,
  },
  {
    id: 'ms-crypto',
    title: 'Crypto Snapshot Stays Soft as Bitcoin Holds Near $63K',
    body: 'CoinGecko’s 2026-08-13 18:49 UTC capture put Bitcoin at $63,126 (-0.5% over 24 hours) and Ether at $1,877.66 (-0.7%). The crypto table uses that provider timestamp rather than the older August 5 demo capture.',
    sources: 1,
  },
];

/* ---------- 둘러보기 (explore carousel) ---------- */

export const EXPLORE_CARDS: ExploreCard[] = [
  {
    id: 'ex-us-close',
    title: 'AI주 강세에 S&P 500·나스닥 상승…8월 12일 확정 종가 반영',
    sources: 2,
    gradient: 'linear-gradient(135deg,#3d4a35,#7d9463)',
    art: 'housing',
  },
  {
    id: 'ex-us-live',
    title: '8월 13일 미국장 장중 0.6% 상승…종가 확정 전 수치로 구분',
    sources: 1,
    gradient: 'linear-gradient(135deg,#2a3a44,#5d8296)',
    art: 'grid',
  },
  {
    id: 'ex-us-ppi',
    title: '미 7월 생산자물가 상승률 4.7%로 둔화…유가도 하락',
    sources: 2,
    gradient: 'linear-gradient(135deg,#37343f,#726c85)',
    art: 'bank',
  },
  {
    id: 'ex-us-ai',
    title: '슈퍼마이크로 실적 호조에 19% 급등…AI 인프라주 랠리',
    sources: 2,
    gradient: 'linear-gradient(135deg,#4a3527,#96674a)',
    art: 'oil',
  },
  {
    id: 'ex-us-earnings',
    title: '어플라이드 머티어리얼즈·로스스토어스 실적 발표 주목',
    sources: 3,
    gradient: 'linear-gradient(135deg,#1f3d33,#4f8a6d)',
    art: 'chips',
  },
  {
    id: 'ex-us-fed',
    title: '예측시장, 9월 연준 금리 동결 가능성 70.5% 반영',
    sources: 1,
    gradient: 'linear-gradient(135deg,#2d4a6b,#7291b5)',
    art: 'imf',
  },
  {
    id: 'ex-crypto',
    title: '비트코인 6만3천달러선·이더리움 1,877달러…24시간 약세',
    sources: 1,
    gradient: 'linear-gradient(135deg,#33454e,#6d8a96)',
    art: 'fab',
  },
];

/* ---------- 예측 시장 (prediction markets) ---------- */

export const PREDICTIONS: PredictionMarket[] = [
  {
    id: 'pm-fed-sep-hold',
    question: 'Will there be no change in Fed interest rates after the September 2026 meeting?',
    questionKo: '2026년 9월 FOMC에서 기준금리가 동결될까?',
    outcomes: [
      { label: 'Yes', prob: 70.5, deltaPct: 0 },
      { label: 'No', prob: 29.5, deltaPct: 0 },
    ],
    volumeUsd: 7_313_309,
    source: 'Polymarket-style',
    category: 'macro',
    endsAt: '2026-09-16',
  },
  {
    id: 'pm-fed-hike',
    question: 'Fed rate hike in 2026?',
    questionKo: '2026년 안에 연준이 금리를 인상할까?',
    outcomes: [
      { label: 'Yes', prob: 52.5, deltaPct: 0 },
      { label: 'No', prob: 47.5, deltaPct: 0 },
    ],
    volumeUsd: 7_381_273,
    source: 'Polymarket-style',
    category: 'macro',
    endsAt: '2026-12-09',
  },
  {
    id: 'pm-fed-no-cuts',
    question: 'Will no Fed rate cuts happen in 2026?',
    questionKo: '2026년에 연준 금리 인하가 한 번도 없을까?',
    outcomes: [
      { label: 'Yes', prob: 85.95, deltaPct: 0 },
      { label: 'No', prob: 14.05, deltaPct: 0 },
    ],
    volumeUsd: 7_199_173,
    source: 'Polymarket-style',
    category: 'macro',
    endsAt: '2026-12-31',
  },
  {
    id: 'pm-btc-55k',
    question: 'Will Bitcoin dip to $55,000 by December 31, 2026?',
    questionKo: '비트코인이 2026년 말까지 5만5천달러를 밑돌까?',
    outcomes: [
      { label: 'Yes', prob: 56.5, deltaPct: 0 },
      { label: 'No', prob: 43.5, deltaPct: 0 },
    ],
    volumeUsd: 5_024_028,
    source: 'Polymarket-style',
    category: 'crypto',
    endsAt: '2026-12-31',
  },
  {
    id: 'pm-btc-100k',
    question: 'Will Bitcoin reach $100,000 by December 31, 2026?',
    questionKo: '비트코인이 2026년 말까지 10만달러에 도달할까?',
    outcomes: [
      { label: 'Yes', prob: 8.5, deltaPct: 0 },
      { label: 'No', prob: 91.5, deltaPct: 0 },
    ],
    volumeUsd: 2_435_646,
    source: 'Polymarket-style',
    category: 'crypto',
    endsAt: '2026-12-31',
  },
  {
    id: 'pm-kraken-ipo',
    question: 'Kraken IPO by December 31, 2026?',
    questionKo: '크라켄이 2026년 말까지 기업공개를 할까?',
    outcomes: [
      { label: 'Yes', prob: 12, deltaPct: 0 },
      { label: 'No', prob: 88, deltaPct: 0 },
    ],
    volumeUsd: 556_571,
    source: 'Polymarket-style',
    category: 'tech',
    endsAt: '2026-12-31',
  },
];

/* ---------- 실적 일정 (week of Aug 10-16, 2026) ---------- */

export const EARNINGS_WEEK: EarningsDay[] = [
  { dateISO: '2026-08-10', weekdayKo: '월', label: '8월 10일', count: 3, logos: ['SPG', 'RKLB', 'HIMS'] },
  { dateISO: '2026-08-11', weekdayKo: '화', label: '8월 11일', count: 3, logos: ['LITE', 'CAH', 'ONON'] },
  { dateISO: '2026-08-12', weekdayKo: '수', label: '8월 12일', count: 3, logos: ['COHR', 'CSCO', 'CRWV'] },
  { dateISO: '2026-08-13', weekdayKo: '목', label: '8월 13일', count: 4, logos: ['AMAT', 'ROST', 'TPR'] },
  { dateISO: '2026-08-14', weekdayKo: '금', label: '8월 14일', count: 2, logos: ['VIPS', 'MSGE'] },
  { dateISO: '2026-08-15', weekdayKo: '토', label: '8월 15일', count: 0, logos: [] },
  { dateISO: '2026-08-16', weekdayKo: '일', label: '8월 16일', count: 0, logos: [] },
];

export const EARNINGS: EarningsEntry[] = [
  {
    symbol: 'SPG', company: 'Simon Property Group, Inc.', fiscalLabel: '2026년 Q2', timeLabel: '장 마감 후',
    session: 'post', dateISO: '2026-08-10', bullets: ['8월 10일 주요 실적 발표 기업으로 일정에 포함됐습니다.'],
    logoBg: '#174a7e', logoText: 'S',
  },
  {
    symbol: 'RKLB', company: 'Rocket Lab USA, Inc.', fiscalLabel: '2026년 Q2', timeLabel: '장 마감 후',
    session: 'post', dateISO: '2026-08-10', bullets: ['우주·방산 성장주 실적과 수주잔고가 핵심 확인 항목입니다.'],
    logoBg: '#111827', logoText: 'R',
  },
  {
    symbol: 'HIMS', company: 'Hims & Hers Health, Inc.', fiscalLabel: '2026년 Q2', timeLabel: '장 마감 후',
    session: 'post', dateISO: '2026-08-10', bullets: [],
    logoBg: '#e5ddd1', logoText: 'H',
  },
  {
    symbol: 'LITE', company: 'Lumentum Holdings Inc.', fiscalLabel: '2026년 Q4', timeLabel: '장 시작 전',
    session: 'pre', dateISO: '2026-08-11', bullets: ['AI 광통신 수요와 데이터센터 매출 흐름이 관심사입니다.'],
    logoBg: '#253b80', logoText: 'L',
  },
  {
    symbol: 'CAH', company: 'Cardinal Health, Inc.', fiscalLabel: '2026년 Q4', timeLabel: '장 시작 전',
    session: 'pre', dateISO: '2026-08-11', bullets: [],
    logoBg: '#d9272e', logoText: 'C',
  },
  {
    symbol: 'ONON', company: 'On Holding AG', fiscalLabel: '2026년 Q2', timeLabel: '장 시작 전',
    session: 'pre', dateISO: '2026-08-11', bullets: [],
    logoBg: '#111111', logoText: 'O',
  },
  {
    symbol: 'COHR', company: 'Coherent Corp.', fiscalLabel: '2026년 Q4', timeLabel: '장 시작 전',
    session: 'pre', dateISO: '2026-08-12', bullets: ['광학 부품과 AI 네트워크 투자 수혜 여부가 핵심입니다.'],
    logoBg: '#0067b1', logoText: 'C',
  },
  {
    symbol: 'CSCO', company: 'Cisco Systems, Inc.', fiscalLabel: '2026년 Q4', timeLabel: '장 마감 후',
    session: 'post', dateISO: '2026-08-12', bullets: ['네트워킹 수요와 AI 인프라 주문이 주요 관전 포인트입니다.'],
    logoBg: '#049fd9', logoText: 'C',
  },
  {
    symbol: 'CRWV', company: 'CoreWeave, Inc.', fiscalLabel: '2026년 Q2', timeLabel: '장 마감 후',
    session: 'post', dateISO: '2026-08-12', bullets: ['AI 컴퓨팅 수요와 자본지출 부담을 함께 확인하는 일정입니다.'],
    logoBg: '#4f46e5', logoText: 'C',
  },
  {
    symbol: 'AMAT', company: 'Applied Materials, Inc.', fiscalLabel: '2026년 Q3', timeLabel: '장 마감 후',
    session: 'post', dateISO: '2026-08-13', epsEst: 3.46,
    bullets: ['회사 IR 일정에서 8월 13일 실적 발표가 확인됐습니다.', '반도체 장비 수요와 메모리 투자 전망이 핵심입니다.'],
    logoBg: '#0067a5', logoText: 'A',
  },
  {
    symbol: 'ROST', company: 'Ross Stores, Inc.', fiscalLabel: '2026년 Q2', timeLabel: '장 마감 후',
    session: 'post', dateISO: '2026-08-13', bullets: [],
    logoBg: '#233e8b', logoText: 'R',
  },
  {
    symbol: 'TPR', company: 'Tapestry, Inc.', fiscalLabel: '2026년 Q4', timeLabel: '장 시작 전',
    session: 'pre', dateISO: '2026-08-13', epsEst: 1.29, bullets: [],
    logoBg: '#111111', logoText: 'T',
  },
  {
    symbol: 'BN', company: 'Brookfield Corporation', fiscalLabel: '2026년 Q2', timeLabel: '장 시작 전',
    session: 'pre', dateISO: '2026-08-13', epsEst: 0.67, bullets: [],
    logoBg: '#0f4c5c', logoText: 'B',
  },
  {
    symbol: 'VIPS', company: 'Vipshop Holdings Limited', fiscalLabel: '2026년 Q2', timeLabel: '장 시작 전',
    session: 'pre', dateISO: '2026-08-14', bullets: ['8월 14일 실적 캘린더에 포함된 주요 중국 소비주입니다.'],
    logoBg: '#e4007f', logoText: 'V',
  },
  {
    symbol: 'MSGE', company: 'Madison Square Garden Entertainment Corp.', fiscalLabel: '2026년 Q4', timeLabel: '장 시작 전',
    session: 'pre', dateISO: '2026-08-14', epsEst: -0.42,
    bullets: ['확인된 캘린더 기준 8월 14일 장 시작 전 발표 예정입니다.'],
    logoBg: '#0057b8', logoText: 'M',
  },
];

/* ---------- 정치인 거래 (politician trades — mock disclosures) ---------- */

export const POLITICIAN_TRADES: PoliticianTrade[] = [
  { id: 'pt1', politician: 'Nancy Pelosi', party: '민주당', chamber: '하원', state: 'CA', symbol: 'NVDA', company: 'NVIDIA', action: '매수', amountRange: '$1M – $5M', tradedISO: '2026-06-24', disclosedISO: '2026-07-08', sincePct: 9.4 },
  { id: 'pt2', politician: 'Michael McCaul', party: '공화당', chamber: '하원', state: 'TX', symbol: 'MSFT', company: 'Microsoft', action: '매수', amountRange: '$250K – $500K', tradedISO: '2026-06-30', disclosedISO: '2026-07-09', sincePct: 2.1 },
  { id: 'pt3', politician: 'Josh Gottheimer', party: '민주당', chamber: '하원', state: 'NJ', symbol: 'META', company: 'Meta Platforms', action: '매수', amountRange: '$100K – $250K', tradedISO: '2026-07-01', disclosedISO: '2026-07-10', sincePct: 6.8 },
  { id: 'pt4', politician: 'Dan Crenshaw', party: '공화당', chamber: '하원', state: 'TX', symbol: 'XOM', company: 'Exxon Mobil', action: '매수', amountRange: '$50K – $100K', tradedISO: '2026-06-19', disclosedISO: '2026-07-06', sincePct: 3.2 },
  { id: 'pt5', politician: 'Ro Khanna', party: '민주당', chamber: '하원', state: 'CA', symbol: 'AAPL', company: 'Apple', action: '매도', amountRange: '$15K – $50K', tradedISO: '2026-06-26', disclosedISO: '2026-07-07', sincePct: -1.4 },
  { id: 'pt6', politician: 'Tommy Tuberville', party: '공화당', chamber: '상원', state: 'AL', symbol: 'CVX', company: 'Chevron', action: '매수', amountRange: '$100K – $250K', tradedISO: '2026-06-22', disclosedISO: '2026-07-08', sincePct: 4.1 },
  { id: 'pt7', politician: 'Debbie Wasserman Schultz', party: '민주당', chamber: '하원', state: 'FL', symbol: 'LLY', company: 'Eli Lilly', action: '매도', amountRange: '$50K – $100K', tradedISO: '2026-06-29', disclosedISO: '2026-07-09', sincePct: -5.6 },
  { id: 'pt8', politician: 'Marjorie Taylor Greene', party: '공화당', chamber: '하원', state: 'GA', symbol: 'MU', company: 'Micron', action: '매수', amountRange: '$15K – $50K', tradedISO: '2026-07-02', disclosedISO: '2026-07-10', sincePct: 1.8 },
  { id: 'pt9', politician: 'Mark Green', party: '공화당', chamber: '하원', state: 'TN', symbol: 'PLTR', company: 'Palantir', action: '매수', amountRange: '$100K – $250K', tradedISO: '2026-06-17', disclosedISO: '2026-07-02', sincePct: 7.9 },
  { id: 'pt10', politician: 'Suzan DelBene', party: '민주당', chamber: '하원', state: 'WA', symbol: 'AMZN', company: 'Amazon', action: '매수', amountRange: '$50K – $100K', tradedISO: '2026-06-25', disclosedISO: '2026-07-08', sincePct: 0.9 },
  { id: 'pt11', politician: 'John Boozman', party: '공화당', chamber: '상원', state: 'AR', symbol: 'WMT', company: 'Walmart', action: '매수', amountRange: '$15K – $50K', tradedISO: '2026-06-23', disclosedISO: '2026-07-07', sincePct: 2.6 },
  { id: 'pt12', politician: 'Sheldon Whitehouse', party: '민주당', chamber: '상원', state: 'RI', symbol: 'NEE', company: 'NextEra Energy', action: '매수', amountRange: '$1K – $15K', tradedISO: '2026-07-01', disclosedISO: '2026-07-10', sincePct: 1.2 },
];

/* ---------- 뉴스 (stock-detail page) ---------- */

export const GENERAL_NEWS: NewsItem[] = [
  {
    id: 'n1',
    title: 'US stocks move toward records as inflation cools and oil eases',
    summary: 'At 2:10 PM ET on August 13, the S&P 500 was up about 0.6%, the Nasdaq 0.7%, and the Dow 22 points. The figures are intraday, so the static quote table remains on the August 12 settled close.',
    source: 'Associated Press',
    timeAgo: '8월 13일 장중',
    publishedAt: '2026-08-13T18:10:00Z',
    url: 'https://apnews.com/article/3a23f22469cd0e0062f711096906525c',
    symbols: [],
  },
  {
    id: 'n2',
    title: 'S&P 500 and Nasdaq rise at the August 12 close; Dow edges lower',
    summary: 'The S&P 500 closed at 7,748.50 (+0.26%), the Nasdaq at 26,588.49 (+0.54%), and the Dow at 53,770.27 (-0.04%).',
    source: 'Associated Press',
    timeAgo: '8월 12일 종가',
    publishedAt: '2026-08-12T20:00:00Z',
    url: 'https://apnews.com/article/c2b9200bd737220ef848a37ffea21f95',
    symbols: [],
  },
  {
    id: 'n3',
    title: 'AI infrastructure stocks lead Wall Street’s Wednesday advance',
    summary: 'Super Micro Computer surged about 19% after an earnings beat, helping AI-linked hardware names lift the broader market.',
    source: 'Associated Press',
    timeAgo: '8월 12일',
    publishedAt: '2026-08-12T20:00:00Z',
    url: 'https://apnews.com/article/db541ced9f928f993bd3a17958a3deaa',
    symbols: ['SMCI', 'NVDA'],
  },
  {
    id: 'n4',
    title: 'July wholesale inflation cools to 4.7% year over year',
    summary: 'The latest producer-price reading eased from 5.5% in June and came in slightly better than expected, supporting risk appetite during Thursday trading.',
    source: 'BLS / Associated Press',
    timeAgo: '8월 13일',
    publishedAt: '2026-08-13T12:30:00Z',
    url: 'https://www.bls.gov/schedule/2026/08_sched_list.htm',
    symbols: [],
  },
  {
    id: 'n5',
    title: 'Applied Materials scheduled to report after the August 13 close',
    summary: 'The semiconductor-equipment company’s investor-relations calendar confirms the reporting date; consensus EPS in the tracked calendar is $3.46.',
    source: 'Applied Materials IR',
    timeAgo: '8월 13일',
    publishedAt: '2026-08-13T12:00:00Z',
    url: 'https://ir.appliedmaterials.com/',
    symbols: ['AMAT'],
  },
  {
    id: 'n6',
    title: 'Friday earnings slate includes VIPS and Madison Square Garden Entertainment',
    summary: 'The August 14 calendar is lighter after Thursday’s AMAT and ROST reports; MSGE is listed before the opening bell with a -$0.42 EPS estimate.',
    source: 'TipRanks / QuarterCharts',
    timeAgo: '8월 14일 예정',
    publishedAt: '2026-08-13T18:00:00Z',
    url: 'https://www.tipranks.com/calendars/earnings/2026-8-14',
    symbols: ['MSGE'],
  },
  {
    id: 'n7',
    title: 'Bitcoin holds near $63K while Ether trades near $1,878',
    summary: 'CoinGecko’s 18:49 UTC snapshot showed Bitcoin down 0.5% over 24 hours and Ether down 0.7%; all 20 crypto fallback rows were refreshed from the same capture.',
    source: 'CoinGecko',
    timeAgo: '오늘 03:49 KST',
    publishedAt: '2026-08-13T18:49:20Z',
    url: 'https://www.coingecko.com/',
    symbols: ['BTCUSD', 'ETHUSD'],
  },
  {
    id: 'n8',
    title: 'Prediction market prices a September Fed hold at 70.5%',
    summary: 'The active Polymarket contract showed 70.5% for no rate change after the September 2026 meeting, with roughly $7.31M in volume at capture time.',
    source: 'Polymarket',
    timeAgo: '오늘 03:45 KST',
    publishedAt: '2026-08-13T18:45:07Z',
    url: 'https://polymarket.com/event/will-there-be-no-change-in-fed-interest-rates-after-the-september-2026-meeting-615',
    symbols: [],
  },
];

/* ---------- 앱 갤러리 ---------- */

export const APP_GALLERY: AppGalleryItem[] = [
  { id: 'ag1', nameKo: '포트폴리오 추적기', description: '모의 시세로 보유 종목 수익률과 배분을 확인', icon: '📊', category: '포트폴리오' },
  { id: 'ag2', nameKo: 'DCF 밸류에이션', description: '현금흐름 할인 모델로 적정주가 계산', icon: '🧮', category: '밸류에이션' },
  { id: 'ag3', nameKo: '배당 캘린더', description: '배당락일·지급일 한눈에 보기', icon: '📅', category: '인컴' },
  { id: 'ag4', nameKo: '옵션 체인 뷰어', description: '행사가별 IV·OI·그릭스 시각화', icon: '⛓️', category: '파생' },
  { id: 'ag5', nameKo: '백테스터', description: '전략 아이디어를 과거 데이터로 검증', icon: '⏪', category: '퀀트' },
  { id: 'ag6', nameKo: '공포·탐욕 지수', description: '시장 심리 복합 지표 대시보드', icon: '😨', category: '심리' },
  { id: 'ag7', nameKo: '수익률 곡선 모니터', description: '미 국채 커브와 스프레드 추적', icon: '📈', category: '매크로' },
  { id: 'ag8', nameKo: '환율 컨버터', description: '예시 환율로 주요 통화 환산 흐름을 체험', icon: '💱', category: '외환' },
  { id: 'ag9', nameKo: '13F 추적기', description: '헤지펀드 분기 보유 변화 분석', icon: '🐋', category: '기관' },
  { id: 'ag10', nameKo: 'IPO 캘린더', description: '예정된 상장과 락업 해제 일정', icon: '🔔', category: '이벤트' },
  { id: 'ag11', nameKo: '어닝콜 요약기', description: 'AI 기반 실적 발표 콜 요약 콘셉트', icon: '🎙️', category: 'AI' },
  { id: 'ag12', nameKo: '상관관계 매트릭스', description: '자산 간 상관계수 히트맵', icon: '🧩', category: '퀀트' },
];

/* ---------- region-keyed content map (Task 8 migrates consumers to this) ---------- */

export const CONTENT_BY_REGION: Readonly<
  Record<MarketRegion, Readonly<{ summary: MarketSummaryItem[]; news: NewsItem[]; explore: ExploreCard[] }>>
> = Object.freeze({
  US: Object.freeze({ summary: MARKET_SUMMARY, news: GENERAL_NEWS, explore: EXPLORE_CARDS }),
  KR: Object.freeze({ summary: KR_MARKET_SUMMARY, news: KR_GENERAL_NEWS, explore: KR_EXPLORE_CARDS }),
});
