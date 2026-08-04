/* ============================================================
   Editorial / static content — matches the reference snapshot
   (fictional July 2026 market narrative, mock data only)
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

/* ---------- 시장 요약 (market summary accordion) ---------- */

export const MARKET_SUMMARY: MarketSummaryItem[] = [
  {
    id: 'ms-hynix',
    title: 'SK Hynix Makes Historic Nasdaq Debut, Surging 12.8%',
    body: "SK Hynix, the world's leading high-bandwidth memory manufacturer, raised $26.5 billion in the largest U.S. listing ever by a foreign company, marking the second-largest share sale in U.S. history behind SpaceX's $86 billion IPO. Shares soared 12.8% on their first day of trading, buoyed by surging AI-driven demand for memory chips.",
    sources: 48,
  },
  {
    id: 'ms-btc',
    title: 'Bitcoin Holds Above $64,000 Amid U.S. Crypto Policy Shifts',
    body: 'Bitcoin steadied above the $64,000 level this week as markets digested a new U.S. digital-asset framework that clarifies custody rules for banks. Spot ETF inflows resumed after three weeks of outflows, while altcoins broadly lagged, keeping bitcoin dominance near a two-year high.',
    sources: 36,
  },
  {
    id: 'ms-gold',
    title: 'Gold Slides Over 1.4% on the Week as Fed Inflation Concerns Persist',
    body: 'Gold retreated more than 1.4% for the week to settle near $3,890 an ounce as sticky services inflation pushed back expectations for Federal Reserve rate cuts. Real yields firmed and the dollar stabilized, prompting profit-taking after gold’s record-setting first half of 2026.',
    sources: 29,
  },
  {
    id: 'ms-oil',
    title: 'Oil Flat as Iran Talks and Geopolitical Tensions Balance the Market',
    body: 'WTI crude closed nearly unchanged at $67.85 as progress in Iran nuclear talks offset fresh tanker incidents in the Red Sea. Traders weighed the prospect of additional Iranian barrels against OPEC+ discipline and record U.S. refinery runs heading into peak driving season.',
    sources: 31,
  },
  {
    id: 'ms-chips',
    title: 'AI Chip Boom Drives Big Tech Spending as NVIDIA and Intel Draw Attention',
    body: 'Hyperscaler capital expenditure guidance keeps climbing, with 2026 AI infrastructure spending now tracking above $600 billion. NVIDIA rallied 4% on reports of fully booked Rubin capacity, while Intel slid on foundry delays. Memory names diverged ahead of Micron’s update.',
    sources: 44,
  },
  {
    id: 'ms-housing',
    title: 'New U.S. Housing Law Aims to Boost Supply Amid Ongoing Crisis',
    body: 'The bipartisan HOMES Act signed this week offers tax incentives for converting commercial property and streamlines permitting on federal land. Homebuilders rallied on the news, though economists caution the measures will take years to meaningfully lift housing supply.',
    sources: 27,
  },
];

/* ---------- 둘러보기 (explore carousel) ---------- */

export const EXPLORE_CARDS: ExploreCard[] = [
  {
    id: 'ex-asml',
    title: 'ASML, 사상 최대 수주 잔고 속 수요일 2분기 실적 발표 예정',
    sources: 26,
    gradient: 'linear-gradient(135deg,#33454e,#6d8a96)',
    art: 'fab',
  },
  {
    id: 'ex-refining',
    title: '정제 마진 사상 최고치 기록, 크랙 스프레드 60달러 돌파',
    sources: 42,
    gradient: 'linear-gradient(135deg,#7a5a3a,#c9a06a)',
    art: 'refinery',
  },
  {
    id: 'ex-imf',
    title: 'IMF, 달러 스테이블코인이 통화 위기를 심화시킬 수 있다고 경고',
    sources: 43,
    gradient: 'linear-gradient(135deg,#2d4a6b,#7291b5)',
    art: 'imf',
  },
  {
    id: 'ex-hbm',
    title: 'HBM4 경쟁 본격화 — 마이크론·삼성·SK하이닉스 3파전 구도',
    sources: 38,
    gradient: 'linear-gradient(135deg,#1f3d33,#4f8a6d)',
    art: 'chips',
  },
  {
    id: 'ex-banks',
    title: '대형 은행 2분기 실적 시즌 개막, 트레이딩 수익 사상 최대 전망',
    sources: 31,
    gradient: 'linear-gradient(135deg,#37343f,#726c85)',
    art: 'bank',
  },
  {
    id: 'ex-opec',
    title: 'OPEC+, 8월 증산 유지 결정… 유가 60달러대 공방 지속',
    sources: 24,
    gradient: 'linear-gradient(135deg,#4a3527,#96674a)',
    art: 'oil',
  },
  {
    id: 'ex-housing',
    title: '미 주택법 통과에 건설주 급등 — 공급 부족 해소 기대감',
    sources: 22,
    gradient: 'linear-gradient(135deg,#3d4a35,#7d9463)',
    art: 'housing',
  },
  {
    id: 'ex-gold',
    title: '금값 주간 1.4% 하락, 연준 인하 기대 후퇴에 조정 국면',
    sources: 19,
    gradient: 'linear-gradient(135deg,#6b5a2d,#bfa04f)',
    art: 'gold',
  },
  {
    id: 'ex-space',
    title: 'SpaceX 스타링크 매출 300억 달러 돌파… IPO 재점화',
    sources: 35,
    gradient: 'linear-gradient(135deg,#1d2438,#4a5a8a)',
    art: 'satellite',
  },
  {
    id: 'ex-grid',
    title: 'AI 데이터센터 전력난 — 유틸리티주 사상 최고가 랠리',
    sources: 28,
    gradient: 'linear-gradient(135deg,#2a3a44,#5d8296)',
    art: 'grid',
  },
];

/* ---------- 예측 시장 (prediction markets) ---------- */

export const PREDICTIONS: PredictionMarket[] = [
  {
    id: 'pm-wti',
    question: 'What will WTI Crude Oil (WTI) hit in July 2026?',
    questionKo: 'WTI 원유, 7월 중 도달 가격은?',
    outcomes: [
      { label: '↓ $65', prob: 34.0, deltaPct: -2.0 },
      { label: '↑ $80', prob: 30.0, deltaPct: 0.5 },
      { label: '↑ $85', prob: 13.0, deltaPct: -1.0 },
    ],
    volumeUsd: 2_680_000,
    extraCount: 17,
    source: 'Polymarket-style',
    category: 'commodities',
    endsAt: '2026-07-31',
  },
  {
    id: 'pm-fed',
    question: 'How many Fed rate cuts in 2026?',
    questionKo: '2026년 연준 금리 인하 횟수는?',
    outcomes: [
      { label: '0 (0 bps)', prob: 77.0, deltaPct: -0.1 },
      { label: '1 (25 bps)', prob: 16.0, deltaPct: 1.0 },
      { label: '2 (50 bps)', prob: 4.0, deltaPct: 0.6 },
    ],
    volumeUsd: 41_740_000,
    extraCount: 10,
    source: 'Polymarket-style',
    category: 'macro',
    endsAt: '2026-12-31',
  },
  {
    id: 'pm-largest',
    question: 'Largest Company end of July?',
    questionKo: '7월 말 시가총액 1위 기업은?',
    outcomes: [
      { label: 'NVIDIA', prob: 91.0, deltaPct: 1.0 },
      { label: 'Apple', prob: 5.0, deltaPct: -0.9 },
      { label: 'Alphabet', prob: 1.0, deltaPct: -0.5 },
    ],
    volumeUsd: 2_060_000,
    extraCount: 5,
    source: 'Polymarket-style',
    category: 'tech',
    endsAt: '2026-07-31',
  },
  {
    id: 'pm-tsla',
    question: 'Will Tesla (TSLA) beat quarterly earnings?',
    questionKo: '테슬라, 분기 실적 예상치 상회할까?',
    outcomes: [
      { label: 'Yes', prob: 84.0, deltaPct: -4.5 },
      { label: 'No', prob: 16.0, deltaPct: 4.5 },
    ],
    volumeUsd: 1_200,
    source: 'Polymarket-style',
    category: 'earnings',
    endsAt: '2026-07-22',
  },
  {
    id: 'pm-ctas',
    question: 'Will Cintas (CTAS) beat quarterly earnings?',
    questionKo: '신타스, 분기 실적 예상치 상회할까?',
    outcomes: [
      { label: 'Yes', prob: 81.0, deltaPct: 5.5 },
      { label: 'No', prob: 19.0, deltaPct: -5.5 },
    ],
    volumeUsd: 5_100,
    source: 'Polymarket-style',
    category: 'earnings',
    endsAt: '2026-07-17',
  },
  {
    id: 'pm-lmt',
    question: 'Will Lockheed Martin (LMT) beat quarterly earnings?',
    questionKo: '록히드마틴, 분기 실적 예상치 상회할까?',
    outcomes: [
      { label: 'Yes', prob: 60.0, deltaPct: 2.0 },
      { label: 'No', prob: 40.0, deltaPct: -2.0 },
    ],
    volumeUsd: 259,
    source: 'Polymarket-style',
    category: 'earnings',
    endsAt: '2026-07-21',
  },
  {
    id: 'pm-btc-100k',
    question: 'Will Bitcoin reclaim $100K in 2026?',
    questionKo: '비트코인, 2026년 내 10만 달러 회복할까?',
    outcomes: [
      { label: 'Yes', prob: 22.0, deltaPct: 1.2 },
      { label: 'No', prob: 78.0, deltaPct: -1.2 },
    ],
    volumeUsd: 18_400_000,
    source: 'Polymarket-style',
    category: 'crypto',
    endsAt: '2026-12-31',
  },
  {
    id: 'pm-recession',
    question: 'US recession declared in 2026?',
    questionKo: '2026년 미국 경기침체 공식 선언될까?',
    outcomes: [
      { label: 'Yes', prob: 9.0, deltaPct: -0.4 },
      { label: 'No', prob: 91.0, deltaPct: 0.4 },
    ],
    volumeUsd: 9_800_000,
    source: 'Kalshi-style',
    category: 'macro',
    endsAt: '2026-12-31',
  },
  {
    id: 'pm-spx-8000',
    question: 'S&P 500 above 8,000 by year end?',
    questionKo: 'S&P 500, 연말까지 8,000 돌파할까?',
    outcomes: [
      { label: 'Yes', prob: 41.0, deltaPct: 2.1 },
      { label: 'No', prob: 59.0, deltaPct: -2.1 },
    ],
    volumeUsd: 12_300_000,
    source: 'Kalshi-style',
    category: 'macro',
    endsAt: '2026-12-31',
  },
  {
    id: 'pm-spacex',
    question: 'SpaceX IPO announced in 2026?',
    questionKo: 'SpaceX, 2026년 내 IPO 발표할까?',
    outcomes: [
      { label: 'Yes', prob: 31.0, deltaPct: 3.4 },
      { label: 'No', prob: 69.0, deltaPct: -3.4 },
    ],
    volumeUsd: 7_200_000,
    source: 'Polymarket-style',
    category: 'tech',
    endsAt: '2026-12-31',
  },
];

/* ---------- 실적 일정 (earnings calendar, week of Jul 12-18 2026) ---------- */

export const EARNINGS_WEEK: EarningsDay[] = [
  { dateISO: '2026-07-12', weekdayKo: '일', label: '7월 12일', count: 0, logos: [] },
  { dateISO: '2026-07-13', weekdayKo: '월', label: '7월 13일', count: 1, logos: ['FAST'] },
  { dateISO: '2026-07-14', weekdayKo: '화', label: '7월 14일', count: 3, logos: ['JPM', 'WFC', 'C'] },
  { dateISO: '2026-07-15', weekdayKo: '수', label: '7월 15일', count: 3, logos: ['BAC', 'MS', 'GS'] },
  { dateISO: '2026-07-16', weekdayKo: '목', label: '7월 16일', count: 5, logos: ['NFLX', 'ISRG', 'PLD'] },
  { dateISO: '2026-07-17', weekdayKo: '금', label: '7월 17일', count: 3, logos: ['TRV', 'TFC', 'STT'] },
  { dateISO: '2026-07-18', weekdayKo: '토', label: '7월 18일', count: 2, logos: ['ALLY', 'FITB'] },
];

export const EARNINGS: EarningsEntry[] = [
  {
    symbol: 'NFLX', company: 'Netflix, Inc.', fiscalLabel: '2026년 Q2', timeLabel: '오전 5:45',
    session: 'pre', dateISO: '2026-07-16', epsEst: 7.42, revenueEst: '$12.4B',
    bullets: [],
    logoBg: '#e50914', logoText: 'N',
  },
  {
    symbol: 'ISRG', company: 'Intuitive Surgical, Inc.', fiscalLabel: '2026년 Q2', timeLabel: '오전 5:30',
    session: 'pre', dateISO: '2026-07-16', epsEst: 2.51, revenueEst: '$2.82B',
    bullets: [
      'Q2 FY2026 earnings due July 16; EPS est. $2.51, revenue est. $2.82B.',
      'ISRG beat estimates in 5 of last 7 quarters; shares avg. +2.58% post-earnings.',
      'Investors watching da Vinci adoption, margin pressure, and AI strategy.',
    ],
    logoBg: '#2a2a72', logoText: 'I',
  },
  {
    symbol: 'PLD', company: 'Prologis, Inc.', fiscalLabel: '2026년 Q2', timeLabel: '오전 1:00',
    session: 'pre', dateISO: '2026-07-16', epsEst: 1.42, revenueEst: '$2.1B',
    bullets: [
      'Q2 FY2026 earnings due July 16; revenue trends under pressure.',
      'Data-center conversions and build-to-suit pipeline alter future milestone income.',
      'Cash runway and cost reduction progress remain key investor focus.',
    ],
    logoBg: '#3d7f66', logoText: 'P',
  },
  {
    symbol: 'TRV', company: 'The Travelers Companies, Inc.', fiscalLabel: '2026년 Q2', timeLabel: '오후 10:00',
    session: 'post', dateISO: '2026-07-16', epsEst: 5.12, revenueEst: '$12.1B',
    bullets: [],
    logoBg: '#e01719', logoText: 'T',
  },
  {
    symbol: 'TFC', company: 'Truist Financial Corporation', fiscalLabel: '2026년 Q2', timeLabel: '오후 9:00',
    session: 'post', dateISO: '2026-07-17', epsEst: 1.24, revenueEst: '$5.47B',
    bullets: [
      'Analysts expect Q2 FY2026 EPS of $1.24 and revenue of $5.47B.',
      'Truist beat estimates in 4 of the last 5 quarters.',
      'CEO transition and loan growth trends are key investor focus areas.',
    ],
    logoBg: '#40135f', logoText: 'T',
  },
  {
    symbol: 'STT', company: 'State Street Corporation', fiscalLabel: '2026년 Q2', timeLabel: '오전 12:00',
    session: 'pre', dateISO: '2026-07-17', epsEst: 3.31, revenueEst: '$3.86B',
    bullets: [
      'Q2 FY2026 earnings due July 16; EPS est. $3.31, revenue est. $3.86B.',
      'Has beaten estimates in each of the last 5 consecutive quarters.',
      'Investors watching dividend hike, AUM trends, and H2 2026 guidance.',
    ],
    logoBg: '#0058a8', logoText: 'S',
  },
  {
    symbol: 'RF', company: 'Regions Financial Corporation', fiscalLabel: '2026년 Q2', timeLabel: '오후 11:00',
    session: 'post', dateISO: '2026-07-17', epsEst: 0.63, revenueEst: '$1.94B',
    bullets: [
      'Q2 FY2026 results due July 17, EPS estimate $0.63, revenue $1.94B.',
      'Beat EPS estimates in 4 of last 5 quarters reported.',
      'Investors watching net interest margin, loan growth, and credit quality.',
    ],
    logoBg: '#5c8118', logoText: 'R',
  },
  {
    symbol: 'AA', company: 'Alcoa Corporation', fiscalLabel: '2026년 Q2', timeLabel: '오전 6:00',
    session: 'pre', dateISO: '2026-07-16', epsEst: 2.3, revenueEst: '$3.98B',
    bullets: [
      'Q2 FY2026 earnings due July 16; EPS est. $2.30, revenue est. $3.98B.',
      'Beat estimates in 5 of last 7 quarters, including strong Q4 FY2025.',
      'Aluminum price declines and operational efficiency in focus.',
    ],
    logoBg: '#0d6cb5', logoText: 'A',
  },
  {
    symbol: 'JPM', company: 'JPMorgan Chase & Co.', fiscalLabel: '2026년 Q2', timeLabel: '오전 6:45',
    session: 'pre', dateISO: '2026-07-14', epsEst: 5.21, revenueEst: '$46.8B',
    bullets: [
      'Kicks off big-bank earnings; EPS est. $5.21, revenue est. $46.8B.',
      'Record trading revenue expected on H1 volatility; NII guidance in focus.',
      'Beat estimates in 8 straight quarters; avg. +1.4% post-earnings move.',
    ],
    logoBg: '#5a3f2b', logoText: 'J',
  },
  {
    symbol: 'WFC', company: 'Wells Fargo & Company', fiscalLabel: '2026년 Q2', timeLabel: '오전 7:00',
    session: 'pre', dateISO: '2026-07-14', epsEst: 1.52, revenueEst: '$21.3B',
    bullets: [
      'First full quarter since asset-cap removal; loan growth reacceleration watched.',
      'EPS est. $1.52, revenue est. $21.3B; efficiency ratio improvement expected.',
    ],
    logoBg: '#d71e28', logoText: 'W',
  },
  {
    symbol: 'C', company: 'Citigroup Inc.', fiscalLabel: '2026년 Q2', timeLabel: '오전 8:00',
    session: 'pre', dateISO: '2026-07-14', epsEst: 1.98, revenueEst: '$21.9B',
    bullets: [
      'Services and markets segments expected to drive the beat.',
      'Banamex IPO timeline and buyback pace are key catalysts.',
    ],
    logoBg: '#255be3', logoText: 'C',
  },
  {
    symbol: 'BAC', company: 'Bank of America Corporation', fiscalLabel: '2026년 Q2', timeLabel: '오전 6:45',
    session: 'pre', dateISO: '2026-07-15', epsEst: 1.02, revenueEst: '$27.6B',
    bullets: [
      'EPS est. $1.02, revenue est. $27.6B; NII trajectory in focus.',
      'Consumer credit quality and deposit costs remain the swing factors.',
    ],
    logoBg: '#012169', logoText: 'B',
  },
  {
    symbol: 'MS', company: 'Morgan Stanley', fiscalLabel: '2026년 Q2', timeLabel: '오전 7:30',
    session: 'pre', dateISO: '2026-07-15', epsEst: 2.31, revenueEst: '$16.9B',
    bullets: [
      'Wealth management net new assets and IB pipeline recovery watched.',
      'Beat estimates in 6 of last 7 quarters.',
    ],
    logoBg: '#00285e', logoText: 'M',
  },
  {
    symbol: 'GS', company: 'The Goldman Sachs Group, Inc.', fiscalLabel: '2026년 Q2', timeLabel: '오전 7:30',
    session: 'pre', dateISO: '2026-07-15', epsEst: 11.42, revenueEst: '$14.8B',
    bullets: [
      'M&A rebound expected to lift advisory fees to a three-year high.',
      'EPS est. $11.42; markets revenue seen up 18% YoY.',
    ],
    logoBg: '#6b96c3', logoText: 'G',
  },
  {
    symbol: 'FAST', company: 'Fastenal Company', fiscalLabel: '2026년 Q2', timeLabel: '오전 7:00',
    session: 'pre', dateISO: '2026-07-13', epsEst: 0.31, revenueEst: '$2.12B',
    bullets: [
      'Industrial demand bellwether; daily sales growth trend in focus.',
    ],
    logoBg: '#00529b', logoText: 'F',
  },
  {
    symbol: 'ALLY', company: 'Ally Financial Inc.', fiscalLabel: '2026년 Q2', timeLabel: '오전 8:00',
    session: 'pre', dateISO: '2026-07-18', epsEst: 1.08, revenueEst: '$2.1B',
    bullets: ['Auto credit normalization and NIM expansion story continues.'],
    logoBg: '#650360', logoText: 'A',
  },
  {
    symbol: 'FITB', company: 'Fifth Third Bancorp', fiscalLabel: '2026년 Q2', timeLabel: '오전 6:30',
    session: 'pre', dateISO: '2026-07-18', epsEst: 0.94, revenueEst: '$2.3B',
    bullets: ['Southeast branch expansion and fee income growth watched.'],
    logoBg: '#0f3f93', logoText: 'F',
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
  { id: 'n1', title: 'NVIDIA Rubin capacity fully booked through mid-2027, say supply chain sources', summary: 'TSMC CoWoS allocation for Rubin-generation GPUs is reportedly sold out, with hyperscalers pre-paying to lock capacity.', source: 'SemiAnalysis', timeAgo: '2시간 전', symbols: ['NVDA', 'TSM'] },
  { id: 'n2', title: 'Meta raises 2026 capex guidance to $92B on AI infrastructure push', summary: 'The company cited "unprecedented demand" for Llama-powered enterprise agents as it broke ground on two new data-center campuses.', source: 'Bloomberg', timeAgo: '4시간 전', symbols: ['META'] },
  { id: 'n3', title: 'SK Hynix ADR debut adds $350B memory giant to Nasdaq', summary: 'The listing pressures Micron valuations while giving US investors direct HBM exposure for the first time.', source: 'Reuters', timeAgo: '6시간 전', symbols: ['HYNX', 'MU'] },
  { id: 'n4', title: 'Fed officials split on inflation path as services prices stay sticky', summary: 'June minutes show a growing camp arguing the neutral rate has risen, reducing scope for 2026 cuts.', source: 'WSJ', timeAgo: '8시간 전', symbols: [] },
  { id: 'n5', title: 'Refining crack spreads top $60 for first time since 2022', summary: 'Valero and Marathon Petroleum hit record highs as diesel inventories sit at 20-year seasonal lows.', source: 'FT', timeAgo: '10시간 전', symbols: ['VLO', 'MPC', 'PSX'] },
  { id: 'n6', title: 'Bitcoin ETF inflows resume after custody rule clarity', summary: 'Spot funds absorbed $1.8B this week, the strongest tape since March, as bank custody rules were finalized.', source: 'CoinDesk', timeAgo: '12시간 전', symbols: ['BTCUSD'] },
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
