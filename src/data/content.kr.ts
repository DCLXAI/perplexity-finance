/* Korean (KRX) editorial fallback — refreshed from the 2026-08-13 settled close. */
import type { ExploreCard, MarketSummaryItem, NewsItem } from './types.js';

export const KR_MARKET_SUMMARY: MarketSummaryItem[] = [
  {
    id: 'ms-kr-index-rally',
    title: '코스피 3.56% 급등해 6,813.34 마감…코스닥도 0.29% 상승',
    body: '네이버 증권 일별 지수 기준 8월 13일 코스피는 234.30포인트(+3.56%) 오른 6,813.34에 마감했다. 코스닥은 2.46포인트(+0.29%) 상승한 861.37로 거래를 마쳤다.',
    sources: 1,
  },
  {
    id: 'ms-kr-semiconductor',
    title: '삼성전자 4.89%·SK하이닉스 5.92% 동반 강세',
    body: '정규장 종가 기준 삼성전자는 26만 8,000원(+4.89%), SK하이닉스는 159만 3,000원(+5.92%)에 마감했다. 두 종목 모두 8월 13일 정규장 확정 종가를 사용했다.',
    sources: 2,
  },
  {
    id: 'ms-kr-platform',
    title: 'NAVER 5.10% 상승, 카카오도 1.39% 강세',
    body: 'NAVER는 22만 6,500원으로 전일 대비 1만 1,000원(+5.10%) 올랐고, 카카오는 4만 100원으로 550원(+1.39%) 상승했다.',
    sources: 2,
  },
  {
    id: 'ms-kr-breadth',
    title: '삼성전기 12.58% 급등…보험·전력 일부 종목은 약세',
    body: '삼성전기가 150만 3,000원(+12.58%)으로 추적 종목 중 상승률 선두를 기록했다. 반면 삼성생명은 -3.64%, 삼성화재는 -2.71%, 한국전력은 -6.63%로 지수 흐름과 엇갈렸다.',
    sources: 4,
  },
  {
    id: 'ms-kr-freshness',
    title: '한국 상장주 159개를 동일한 8월 13일 종가로 재수집',
    body: '종목별 정규장 마감 상태와 거래일을 확인한 뒤 가격과 등락률을 갱신했다. 코스피·코스닥도 같은 거래일로 맞췄고, 확인되지 않은 코스피200·환율·VKOSPI는 이전 시점 표기를 유지한다.',
    sources: 2,
  },
];
export const KR_EXPLORE_CARDS: ExploreCard[] = [
  { id: 'ex-kr-index', title: '코스피 3.56% 급등해 6,813.34…코스닥도 상승 마감', sources: 1, gradient: 'linear-gradient(135deg,#1f3d33,#4f8a6d)', art: 'bank' },
  { id: 'ex-kr-chip', title: '삼성전자 4.89%·SK하이닉스 5.92% 동반 강세', sources: 2, gradient: 'linear-gradient(135deg,#33454e,#6d8a96)', art: 'chips' },
  { id: 'ex-kr-platform', title: 'NAVER 5.10% 상승…카카오도 1.39% 올라', sources: 2, gradient: 'linear-gradient(135deg,#2a3a44,#5d8296)', art: 'grid' },
  { id: 'ex-kr-electronics', title: '삼성전기 12.58% 급등…SK스퀘어·이수페타시스 강세', sources: 3, gradient: 'linear-gradient(135deg,#37343f,#726c85)', art: 'fab' },
  { id: 'ex-kr-laggards', title: '한국전력 6.63% 하락…보험주 일부도 지수와 엇갈려', sources: 3, gradient: 'linear-gradient(135deg,#4a3527,#96674a)', art: 'oil' },
  { id: 'ex-kr-data', title: '한국 상장주 159개, 8월 13일 확정 종가로 일괄 갱신', sources: 2, gradient: 'linear-gradient(135deg,#2d4a6b,#7291b5)', art: 'imf' },
];

export const KR_GENERAL_NEWS: NewsItem[] = [
  {
    id: 'n-kr-1', title: '코스피 6,813.34 마감…하루 3.56% 급등',
    summary: '8월 13일 코스피는 234.30포인트 오른 6,813.34, 코스닥은 2.46포인트 오른 861.37에 마감했다.',
    source: '네이버 증권', timeAgo: '8월 13일 종가', publishedAt: '2026-08-13T06:30:00Z',
    url: 'https://m.stock.naver.com/domestic/index/KOSPI/total', symbols: [],
  },
  {
    id: 'n-kr-2', title: '삼성전자 26만8천원 마감…전일 대비 4.89% 상승',
    summary: '정규장 종가 기준 1만 2,500원 오른 26만 8,000원을 기록했다.',
    source: '네이버 증권', timeAgo: '8월 13일 종가', publishedAt: '2026-08-13T07:10:19Z',
    url: 'https://m.stock.naver.com/domestic/stock/005930/total', symbols: ['005930'],
  },
  {
    id: 'n-kr-3', title: 'SK하이닉스 159만3천원 마감…5.92% 상승',
    summary: '정규장 종가 기준 전일보다 8만 9,000원 오른 159만 3,000원을 기록했다.',
    source: '네이버 증권', timeAgo: '8월 13일 종가', publishedAt: '2026-08-13T07:10:21Z',
    url: 'https://m.stock.naver.com/domestic/stock/000660/total', symbols: ['000660'],
  },
  {
    id: 'n-kr-4', title: 'NAVER 5.10% 상승해 22만6,500원 마감',
    summary: '전일 대비 1만 1,000원 오른 22만 6,500원에 정규 거래를 마쳤다.',
    source: '네이버 증권', timeAgo: '8월 13일 종가', publishedAt: '2026-08-13T07:10:18Z',
    url: 'https://m.stock.naver.com/domestic/stock/035420/total', symbols: ['035420'],
  },
  {
    id: 'n-kr-5', title: '카카오 1.39% 오른 4만100원 마감',
    summary: '카카오는 전일 대비 550원 상승한 4만 100원에 8월 13일 정규장을 마쳤다.',
    source: '네이버 증권', timeAgo: '8월 13일 종가', publishedAt: '2026-08-13T07:10:21Z',
    url: 'https://m.stock.naver.com/domestic/stock/035720/total', symbols: ['035720'],
  },
  {
    id: 'n-kr-6', title: '삼성전기 12.58% 급등해 150만3천원',
    summary: '추적 중인 한국 대형주 가운데 가장 높은 상승률을 기록했다.',
    source: '네이버 증권', timeAgo: '8월 13일 종가', publishedAt: '2026-08-13T07:10:00Z',
    url: 'https://m.stock.naver.com/domestic/stock/009150/total', symbols: ['009150'],
  },
  {
    id: 'n-kr-7', title: '한국전력 6.63% 하락…강한 지수 흐름과 대비',
    summary: '한국전력은 3만 3,100원에 마감해 전일 대비 6.63% 하락했다.',
    source: '네이버 증권', timeAgo: '8월 13일 종가', publishedAt: '2026-08-13T07:10:00Z',
    url: 'https://m.stock.naver.com/domestic/stock/015760/total', symbols: ['015760'],
  },
];
