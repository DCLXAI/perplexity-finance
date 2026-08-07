/* ============================================================
   Korean (KRX) editorial content.

   2026-08-07 refresh: `KR_MARKET_SUMMARY`, `KR_EXPLORE_CARDS`, and
   `KR_GENERAL_NEWS` were all replaced with Friday 2026-08-07 KRX
   close-session stories (`.superpowers/refresh-2026-08-07-kr.md`,
   `SNAPSHOT.krAsOfISO` in universe.ts) — the same research pass and the
   same set of underlying stories, just three different presentational
   shapes (accordion body, carousel card, news-feed item). All three now
   agree on the trading day; none narrates the prior 2026-08-05 session
   under a 2026-08-07 timestamp.

   The original 2026-08-05 version of this file (one day after the US
   seed's original 2026-08-04 anchor) sourced every figure straight from
   `universe.kr.ts` (already corroborated in Task 5) or a real news item
   independently fetched for that task — see
   `.superpowers/sdd/2026-08-05-p11-korean-market/task-6-report.md` for
   that pass's per-item source list. A story whose figures two sources
   disagreed on was dropped rather than shipped (same rule Task 5 used
   for the seed itself, and the same rule this refresh used for NAVER).
   ============================================================ */
import type { ExploreCard, MarketSummaryItem, NewsItem } from './types.js';

/* ---------- 시장 요약 (market summary accordion) ---------- */

export const KR_MARKET_SUMMARY: MarketSummaryItem[] = [
  {
    id: 'ms-kr-hynix-samsung',
    title: '반도체 대장주 희비 엇갈려…SK하이닉스 4.88% 급락, 삼성전자는 강보합',
    body: 'SK하이닉스가 이날 4.88% 급락한 142만 2,000원에, 삼성전자는 0.22% 소폭 상승한 23만 1,000원에 거래를 마감했다. 통상적인 반도체 동반 랠리와 반대되는 흐름으로, 시장에서는 SK하이닉스의 주주환원 확대안 관련 불확실성과 엔비디아향 데이터센터 제품 가격을 둘러싼 소문이 하락 배경으로 지목됐다.',
    sources: 12,
  },
  {
    id: 'ms-kr-hynix-dividend',
    title: 'SK하이닉스, 주당 375원 분기배당 결정…주주환원 확대안은 3분기 발표',
    body: 'SK하이닉스가 8월 7일 공시를 통해 분기배당(주당 375원)을 위한 주주명부 폐쇄 기준일(2026년 8월 31일)을 결정했다. 앞서 로이터는 SK하이닉스가 연말까지 "의미 있는 수준"의 주주환원 확대 방안을 준비 중이라고 보도했지만, 이날 공시는 구체적 확대안 없이 정기 배당만 확정해 투자자들의 기대에는 못 미쳤다는 평가가 나왔다.',
    sources: 8,
  },
  {
    id: 'ms-kr-apple-cxmt',
    title: '애플-CXMT 메모리 공급 협상 결렬…삼성전자·SK하이닉스 반사이익 기대',
    body: '애플이 원가 절감을 위해 추진하던 중국 창신메모리(CXMT)와의 메모리 반도체 공급 협상이 가격 이견으로 결렬됐다. 미 상원의 초당적 압박과 국방부의 CXMT "1260H 리스트" 등재도 겹치며, 애플의 대체 공급망 확보가 어려워져 삼성전자·SK하이닉스가 LPDDR5X 가격 방어에 유리해질 것이라는 전망이 나왔다. 이 소식에 이날 장 초반 반도체주가 반등했다.',
    sources: 14,
  },
  {
    id: 'ms-kr-hanwha-oci',
    title: '美 폴리실리콘·태양광 관세 부과에 한화솔루션·OCI홀딩스 급등',
    body: '트럼프 행정부가 폴리실리콘 등 태양광 소재에 최저가격 기준을 도입하고 일부 제품에 15% 관세를 부과하는 수입규제를 발표(시행일 12월 4일)하면서, 미국 내 생산기지를 갖춘 한화솔루션과 비중국산 폴리실리콘 공급망을 보유한 OCI홀딩스가 반사이익 기대감에 급등했다. 오전 9시10분 기준 한화솔루션은 전일 대비 20.56% 오른 3만 6,650원, OCI홀딩스는 14.14% 오른 27만 8,500원에 거래됐다 — 이는 장중 수치이며 종가는 아니다.',
    sources: 11,
  },
  {
    id: 'ms-kr-foreign-outflow',
    title: '외국인, 코스피서 8,562억원 순매도 전환…코스피 0.60% 하락 마감',
    body: '기관과 개인이 각각 5,790억원, 2,653억원을 순매수했지만 외국인의 8,562억원 순매도를 방어하지 못하며 코스피는 37.61포인트(0.60%) 내린 6,258.77에 거래를 마쳤다. 코스닥도 2.86포인트(0.36%) 내린 798.81로 동반 하락했다. 다만 전체 상장사 912개 중 60.7%(554개)는 상승해 지수 하락에도 개별 종목 장세는 견조했다.',
    sources: 20,
  },
  {
    id: 'ms-kr-kosdaq-streak',
    title: '코스닥, 6거래일 연속 상승 행진 마감…종가 기준 하락 전환',
    body: '코스닥은 7월 31일부터 시작된 상승세를 이어가며 이날도 강세로 출발했으나(오전 9시30분 기준 805.87, +0.52%), 결국 종가 기준으로는 798.81(-0.36%)로 하락 반전해 6거래일 연속 상승 행진이 끊겼다.',
    sources: 9,
  },
  {
    id: 'ms-kr-hanwha-aero',
    title: "한화에어로스페이스, 실적 개선 기대감에 반등세 지속…'황제주' 지위 근접",
    body: '한화에어로스페이스는 지난달 말 52주 신저가를 기록한 뒤 양호한 실적 전망에 힘입어 반등, 8월 5일 종가 기준 100만 4,000원(+9.25%)까지 오르며 약 한 달 만에 황제주(주당 100만원 이상) 지위를 회복했다. 8월 7일에도 4.08% 추가 상승해 109만 7,000원에 마감했다.',
    sources: 13,
  },
];

/* ---------- 둘러보기 (explore carousel) ---------- */

export const KR_EXPLORE_CARDS: ExploreCard[] = [
  {
    id: 'ex-kr-hynix-samsung',
    title: '반도체 대장주 희비…SK하이닉스 4.88% 급락, 삼성전자는 강보합',
    sources: 12,
    gradient: 'linear-gradient(135deg,#1f3d33,#4f8a6d)',
    art: 'chips',
  },
  {
    id: 'ex-kr-apple-cxmt',
    title: '애플-CXMT 협상 결렬…삼성전자·SK하이닉스 반사이익 기대',
    sources: 14,
    gradient: 'linear-gradient(135deg,#33454e,#6d8a96)',
    art: 'fab',
  },
  {
    id: 'ex-kr-hanwha-oci',
    title: '美 태양광 관세 부과에 한화솔루션·OCI홀딩스 급등',
    sources: 11,
    gradient: 'linear-gradient(135deg,#2a3a44,#5d8296)',
    art: 'grid',
  },
  {
    id: 'ex-kr-foreign',
    title: '외국인 8,562억원 순매도 전환, 코스피 0.60% 하락 마감',
    sources: 20,
    gradient: 'linear-gradient(135deg,#37343f,#726c85)',
    art: 'bank',
  },
  {
    id: 'ex-kr-kosdaq',
    title: '코스닥, 6거래일 연속 상승 행진 끝내고 하락 전환',
    sources: 9,
    gradient: 'linear-gradient(135deg,#2d4a6b,#7291b5)',
    art: 'imf',
  },
  {
    id: 'ex-kr-hanwha-aero',
    title: "한화에어로스페이스, 실적 기대감에 반등…'황제주' 근접",
    sources: 13,
    gradient: 'linear-gradient(135deg,#1d2438,#4a5a8a)',
    art: 'satellite',
  },
];

/* ---------- 뉴스 (stock-detail page) ----------
   2026-08-07 refresh: replaced with Friday 2026-08-07 KRX close-session stories
   (`.superpowers/refresh-2026-08-07-kr.md` §4). `timeAgo` is relative to that
   Friday 15:30 KST close (`SNAPSHOT.krAsOfLabelKo`). */

export const KR_GENERAL_NEWS: NewsItem[] = [
  {
    id: 'n-kr-1',
    title: '반도체 대장주 희비 엇갈려…SK하이닉스 4.88% 급락, 삼성전자는 강보합',
    summary: 'SK하이닉스가 이날 4.88% 급락한 반면 삼성전자는 0.22% 소폭 상승해 통상적인 반도체 동반 랠리와 반대 흐름을 보였다. 주주환원 확대안 관련 불확실성과 엔비디아향 데이터센터 제품 가격을 둘러싼 소문이 하락 배경으로 지목됐다.',
    source: 'inews24',
    timeAgo: '1시간 전',
    symbols: ['000660', '005930'],
  },
  {
    id: 'n-kr-2',
    title: 'SK하이닉스, 주당 375원 분기배당 결정…주주환원 확대안은 3분기 발표',
    summary: 'SK하이닉스가 8월 7일 공시를 통해 분기배당(주당 375원)을 위한 주주명부 폐쇄 기준일(8월 31일)을 결정했다. 앞서 로이터는 연말까지 "의미 있는 수준"의 주주환원 확대 방안을 준비 중이라고 보도했지만, 이날 공시는 구체적 확대안 없이 정기 배당만 확정해 투자자들의 기대에는 못 미쳤다는 평가가 나왔다.',
    source: '파이낸셜뉴스',
    timeAgo: '2시간 전',
    symbols: ['000660'],
  },
  {
    id: 'n-kr-3',
    title: '애플-CXMT 메모리 공급 협상 결렬…삼성전자·SK하이닉스 반사이익 기대',
    summary: '애플이 원가 절감을 위해 추진하던 중국 창신메모리(CXMT)와의 메모리 반도체 공급 협상이 가격 이견으로 결렬됐다. 미 상원의 압박과 국방부의 CXMT 제재 명단 등재까지 겹치며 삼성전자·SK하이닉스가 LPDDR5X 가격 방어에 유리해질 것이라는 전망이 나왔다.',
    source: '한국경제',
    timeAgo: '3시간 전',
    symbols: ['005930', '000660'],
  },
  {
    id: 'n-kr-4',
    title: '美 폴리실리콘·태양광 관세 부과에 한화솔루션·OCI홀딩스 급등',
    summary: '트럼프 행정부가 폴리실리콘 등 태양광 소재에 최저가격 기준과 최대 15% 관세를 부과하는 수입규제를 발표(시행일 12월 4일)하면서, 미국 내 생산기지를 갖춘 한화솔루션과 비중국산 폴리실리콘 공급망을 보유한 OCI홀딩스가 반사이익 기대감에 급등했다.',
    source: '헤럴드경제',
    timeAgo: '4시간 전',
    symbols: ['009830', '010060'],
  },
  {
    id: 'n-kr-5',
    title: '외국인, 코스피서 8,562억원 순매도 전환…지수 하락 주도',
    summary: '기관과 개인이 각각 5,790억원, 2,653억원을 순매수했지만 외국인의 8,562억원 순매도를 방어하지 못하며 코스피는 0.60% 하락 마감했다. 다만 전체 상장사 912개 중 60.7%(554개)는 상승해 개별 종목 장세는 견조했다.',
    source: '오피니언뉴스',
    timeAgo: '1시간 전',
    symbols: [],
  },
  {
    id: 'n-kr-6',
    title: '코스닥, 6거래일 연속 상승 행진 마감…종가 기준 하락 전환',
    summary: '코스닥은 7월 31일부터 이어온 상승 흐름을 타고 이날도 강세로 출발했으나(오전 9시30분 기준 805.87, +0.52%), 종가는 798.81(-0.36%)로 하락 반전해 6거래일 연속 상승 행진이 끊겼다.',
    source: 'Seoul Economic Daily',
    timeAgo: '2시간 전',
    symbols: [],
  },
  {
    id: 'n-kr-7',
    title: "한화에어로스페이스, 실적 개선 기대감에 반등 지속…'황제주' 지위 근접",
    summary: '지난달 말 52주 신저가를 기록했던 한화에어로스페이스가 양호한 실적 전망에 힘입어 반등, 8월 5일 종가 100만 4,000원(+9.25%)까지 오르며 한 달여 만에 황제주(주당 100만원 이상) 지위를 회복했다. 8월 7일에도 4.08% 추가 상승해 109만 7,000원에 마감했다.',
    source: '아시아경제',
    timeAgo: '3시간 전',
    symbols: ['012450'],
  },
];
