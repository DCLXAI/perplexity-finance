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
import type { MarketRegion } from './region.js';
import { KR_EXPLORE_CARDS, KR_GENERAL_NEWS, KR_MARKET_SUMMARY } from './content.kr.js';

/* ---------- 시장 요약 (market summary accordion) ----------
   2026-08-07 refresh: replaced with Thursday 2026-08-06 close-session stories, the last
   settled US close at research time (see `.superpowers/refresh-2026-08-07-us.md` — Friday
   08-07's session had not closed yet). Six items, matching the pre-refresh count; every figure
   below is a settled Thu 08-06 close or an explicitly-labeled estimate/consensus figure from
   that file, not a carried-forward Aug 4/5 number. */

export const MARKET_SUMMARY: MarketSummaryItem[] = [
  {
    id: 'ms-dow-streak',
    title: 'Dow Snaps Record Win Streak as Oil Rebound Revives Fed Concern',
    body: 'The Dow fell 464.02 points (-0.85%) to 53,885.10 on Thursday, ending a run of fresh records set August 3-4. The S&P 500 slipped 0.18% to 7,709.96 and the Nasdaq Composite eased 0.06% to 26,348.35. WTI and Brent crude both advanced on the session, the cited driver behind the pullback as traders weighed renewed inflation pressure and a slower path for Fed rate cuts.',
    sources: 34,
  },
  {
    id: 'ms-abnb',
    title: 'Airbnb Surges Toward 9% After Hours on a Blowout Q2',
    body: 'Airbnb posted EPS of $1.37 against a $1.25 estimate and revenue of $3.61B versus $3.58B expected. Shares rallied 7-9% in the regular session and extended gains by roughly another 9% after hours as investors welcomed the beat.',
    sources: 22,
  },
  {
    id: 'ms-net-dkng',
    title: 'Cloudflare Jumps ~16% on Strong Guidance; DraftKings Slides on a Revenue Miss',
    body: 'Cloudflare shares surged roughly 16% after hours on a stronger-than-expected full-year and current-quarter outlook. DraftKings moved the other way, falling after Q2 revenue of $1.44B missed the $1.51B estimate and the company posted a $0.14 per-share loss versus an expected profit — though FY2026 adjusted EBITDA and revenue guidance were reaffirmed.',
    sources: 19,
  },
  {
    id: 'ms-nasdaq-earnings',
    title: 'AppLovin, Western Digital Earnings Weigh on the Nasdaq',
    body: 'AppLovin and Western Digital both fell after reporting quarterly results, joined by a similar move in SanDisk, dragging on the Nasdaq even as the broader AI-chip demand narrative stayed intact.',
    sources: 16,
  },
  {
    id: 'ms-msft',
    title: 'Microsoft Leads Mega-Caps With a 2.54% Gain',
    body: 'Microsoft was the largest gainer among mega-cap tech on the session, closing at $499.86 with a $3.71T market cap — no single catalyst was identified beyond the move itself, notable against an otherwise lower tape.',
    sources: 12,
  },
  {
    id: 'ms-jobs-preview',
    title: 'Markets Position Defensively Ahead of the July Jobs Report',
    body: 'Consensus called for nonfarm payrolls of about +85K (range 83K-120K) and unemployment holding near 4.2%, after June was revised down to a four-month low of +57K. The report was due 8:30 AM ET the following morning, after this session had already closed.',
    sources: 20,
  },
];

/* ---------- 둘러보기 (explore carousel) ----------
   2026-08-07 refresh: replaced with the same Thursday 2026-08-06 story set above. Seven cards,
   fewer than the pre-refresh ten — the research corroborated seven distinct Thu 08-06 stories,
   and a shorter, honest carousel was judged better than padding it back to ten with old
   08-04 narrative or invented topics. */

export const EXPLORE_CARDS: ExploreCard[] = [
  {
    id: 'ex-abnb',
    title: '에어비앤비, 2분기 실적 서프라이즈에 시간외 9%대 급등',
    sources: 24,
    gradient: 'linear-gradient(135deg,#3d4a35,#7d9463)',
    art: 'housing',
  },
  {
    id: 'ex-net',
    title: '클라우드플레어, 강력한 연간 가이던스에 시간외 16% 급등',
    sources: 19,
    gradient: 'linear-gradient(135deg,#2a3a44,#5d8296)',
    art: 'grid',
  },
  {
    id: 'ex-dkng',
    title: '드래프트킹스, 매출 부진에 실적 발표 후 하락',
    sources: 13,
    gradient: 'linear-gradient(135deg,#37343f,#726c85)',
    art: 'bank',
  },
  {
    id: 'ex-dow-oil',
    title: '유가 반등에 3대 지수 동반 하락…다우 기록 행진 마감',
    sources: 31,
    gradient: 'linear-gradient(135deg,#4a3527,#96674a)',
    art: 'oil',
  },
  {
    id: 'ex-nasdaq-earnings',
    title: '앱러빈·웨스턴디지털 실적 부진에 나스닥 상승폭 제한',
    sources: 16,
    gradient: 'linear-gradient(135deg,#1f3d33,#4f8a6d)',
    art: 'chips',
  },
  {
    id: 'ex-jobs',
    title: '금요일 7월 고용보고서 발표 앞두고 시장 관망세 지속',
    sources: 20,
    gradient: 'linear-gradient(135deg,#2d4a6b,#7291b5)',
    art: 'imf',
  },
  {
    id: 'ex-msft',
    title: '마이크로소프트, 메가캡 중 최대 상승폭인 2.54% 기록',
    sources: 12,
    gradient: 'linear-gradient(135deg,#33454e,#6d8a96)',
    art: 'fab',
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

/* ---------- 뉴스 (stock-detail page) ----------
   2026-08-07 refresh: replaced with Thursday 2026-08-06 close-session stories, the last
   settled US close at research time (see `.superpowers/refresh-2026-08-07-us.md` §5 —
   Friday 08-07's session had not closed yet). `timeAgo` is relative to that Thursday
   16:00 EDT close (`SNAPSHOT.closeLabelKo`), not to whenever this seed is read. */

export const GENERAL_NEWS: NewsItem[] = [
  { id: 'n1', title: 'Airbnb (ABNB) beats on Q2 earnings, jumps toward 9% after hours', summary: 'EPS of $1.37 topped the $1.25 estimate and revenue of $3.61B beat $3.58B expected; shares rallied further after the print on top of a 7-9% regular-session gain.', source: 'CNBC', timeAgo: '1시간 전', symbols: ['ABNB'] },
  { id: 'n2', title: 'Cloudflare (NET) surges roughly 16% on strong full-year outlook', summary: 'A stronger-than-expected full-year and current-quarter guide sent shares sharply higher in after-hours trading.', source: 'CNBC', timeAgo: '1시간 전', symbols: [] },
  { id: 'n3', title: 'DraftKings (DKNG) slips after missing on revenue', summary: 'Q2 revenue of $1.44B fell short of the $1.51B estimate and the company posted a per-share loss of $0.14 versus an expected profit, though FY2026 guidance was reaffirmed.', source: 'CNBC', timeAgo: '2시간 전', symbols: [] },
  { id: 'n4', title: 'Oil rebound revives Fed rate-hike concern, pressures major indices', summary: 'WTI and Brent both advanced on the session, the cited driver behind the Dow’s roughly 0.85% decline as Treasury yields also rose.', source: 'Yahoo Finance', timeAgo: '3시간 전', symbols: ['XOM'] },
  { id: 'n5', title: 'Dow snaps its record-breaking win streak', summary: 'After closing at fresh records Aug 3-4, the index fell 464.02 points (-0.85%) to 53,885.10, ending the run.', source: 'Yahoo Finance', timeAgo: '3시간 전', symbols: [] },
  { id: 'n6', title: 'AppLovin, Western Digital earnings weigh on Nasdaq', summary: 'Both names fell after reporting, dragging on the Nasdaq alongside a similar move in SanDisk.', source: 'Proactive Investors', timeAgo: '5시간 전', symbols: ['APP', 'WDC'] },
  { id: 'n7', title: 'Markets position defensively ahead of Friday’s July jobs report', summary: 'Consensus called for +85K nonfarm payrolls and unemployment holding near 4.2%; June was revised down to a four-month-low +57K.', source: 'CNBC', timeAgo: '6시간 전', symbols: [] },
  { id: 'n8', title: 'Microsoft (MSFT) leads mega-caps with a 2.54% gain', summary: 'Microsoft was the largest gainer among mega-cap tech on the session, closing at $499.86 with a $3.71T market cap.', source: 'stockanalysis.com', timeAgo: '4시간 전', symbols: ['MSFT'] },
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
