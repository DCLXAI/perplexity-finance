/* ============================================================
   Korean (KRX) editorial content. `KR_MARKET_SUMMARY`/`KR_EXPLORE_CARDS`
   below are still the original 2026-08-05 KRX close-session stories (one day
   after the US seed's original 2026-08-04 anchor); every figure in them
   comes straight from `universe.kr.ts` (already corroborated in Task 5) or
   a real news item independently fetched for that task — see
   `.superpowers/sdd/2026-08-05-p11-korean-market/task-6-report.md` for the
   per-item source list. A story whose figures two sources disagreed on was
   dropped rather than shipped (same rule Task 5 used for the seed itself).

   `KR_GENERAL_NEWS` was replaced in the 2026-08-07 partial refresh with that
   day's close-session stories (`.superpowers/refresh-2026-08-07-kr.md` §4,
   `SNAPSHOT.krAsOfISO` in universe.ts) — it now sits one session ahead of
   the summary/explore content above, which this refresh did not touch.
   ============================================================ */
import type { ExploreCard, MarketSummaryItem, NewsItem } from './types.js';

/* ---------- 시장 요약 (market summary accordion) ---------- */

export const KR_MARKET_SUMMARY: MarketSummaryItem[] = [
  {
    id: 'ms-kr-kospi',
    title: '코스피 3.76% 급등한 6,598.26 마감…반도체 대장주가 지수 견인',
    body: '코스피가 전 거래일보다 239.31포인트(3.76%) 오른 6,598.26에 마감하며 2거래일 연속 상승했다. 코스닥도 18.87포인트(2.42%) 오른 799.59로 4거래일 연속 올랐다. 미국 팔란티어의 2분기 실적 서프라이즈(매출 전년比 93% 증가)를 계기로 되살아난 글로벌 기술주 투자심리와 외국인의 1조 4,460억원 순매수가 맞물리며, 최근 조정을 받았던 삼성전자(+2.50%, 24만 6,000원)와 SK하이닉스(+5.77%, 166만 8,000원)가 나란히 반등해 지수 상승을 이끌었다.',
    sources: 34,
  },
  {
    id: 'ms-kr-hynix-adr',
    title: '월가 다수 증권사, SK하이닉스 ADR에 매수 러브콜…목표주가 최고 330달러',
    body: '이투데이에 따르면 뱅크오브아메리카를 포함해 최소 6개 금융회사가 SK하이닉스 ADR에 대한 분석을 새로 개시하며 매수 또는 비중확대 의견을 냈다. 글로벌이코노믹은 이를 더 넓게 짚어 ADR을 다루는 11개 증권사 중 10곳이 매수 이상 의견이며 평균 목표주가는 245.5달러, 개별 목표주가는 바클레이즈의 330달러부터 UBS의 204달러까지 다양하다고 전했다. 마이크론 대비 저평가됐다는 논리 속에 ADR은 장중 8% 넘게 올랐다(머니투데이).',
    sources: 18,
  },
  {
    id: 'ms-kr-lginnotek',
    title: 'LG이노텍, MSCI 한국 지수 편입 기대감에 장중 14%대 급등',
    body: 'LG이노텍이 8월 13일(한국시간) 발표될 MSCI 8월 정기 리뷰에서 한국 지수에 신규 편입될 가능성이 높다는 관측에 장중 전 거래일 대비 14.10% 오른 59만 9,000원까지 상승했다. 삼성증권은 편입이 확정될 경우 약 3,130억원 규모의 패시브 자금이 유입될 것으로 추산했다.',
    sources: 22,
  },
  {
    id: 'ms-kr-optical',
    title: '중국向 반도체 수입 규제설에 코스닥 광통신주 상한가 랠리',
    body: '미국의 대중 반도체 수출 규제 강화 가능성이 보도되며 국내 광통신 관련주가 일제히 급등했다. 대한광통신이 18.57% 오른 1만 2,070원에 마감했고, 비트젬전자(+29.89%), RFHIC(+7.28%), 오솔루션(+29.84%)도 큰 폭으로 뛰며 코스닥 상승을 도왔다.',
    sources: 19,
  },
  {
    id: 'ms-kr-engines',
    title: '한화엔진 변동성완화장치 발동…조선기자재주 동반 급등',
    body: '한화엔진이 이날 장중인 오후 1시 57분 전 거래일 대비 13.01% 오른 4만 6,050원까지 치솟으며 정적 변동성완화장치(VI)가 발동됐다(종가는 4만 6,000원, +12.88%). STX엔진, HD현대마린엔진 등 엔진·기자재주가 동반 강세를 보이며 코스피·코스닥 상승에 힘을 보탰다.',
    sources: 15,
  },
  {
    id: 'ms-kr-usdkrw',
    title: '원/달러 환율, 외국인 순매수 속 1,423원대로 하락',
    body: '국내 증시로 외국인 자금이 몰리며 원/달러 환율은 전 거래일 대비 0.45% 내린 1,423.05원에 마감했다. 이날 유가증권시장에서 외국인은 1조 4,460억원을 순매수하며 이틀째 매수 우위를 이어갔고, 이는 원화 강세 요인으로 작용했다.',
    sources: 24,
  },
];

/* ---------- 둘러보기 (explore carousel) ---------- */

export const KR_EXPLORE_CARDS: ExploreCard[] = [
  {
    id: 'ex-kr-hynix-adr',
    title: 'SK하이닉스 ADR, 월가 매수 의견 확산…목표주가 최고 330달러',
    sources: 18,
    gradient: 'linear-gradient(135deg,#1f3d33,#4f8a6d)',
    art: 'chips',
  },
  {
    id: 'ex-kr-lginnotek',
    title: 'LG이노텍, MSCI 한국 지수 편입 기대감에 장중 14%대 급등',
    sources: 22,
    gradient: 'linear-gradient(135deg,#33454e,#6d8a96)',
    art: 'fab',
  },
  {
    id: 'ex-kr-optical',
    title: '中 반도체 수입 규제설에 광통신주 상한가 랠리',
    sources: 19,
    gradient: 'linear-gradient(135deg,#1d2438,#4a5a8a)',
    art: 'satellite',
  },
  {
    id: 'ex-kr-engines',
    title: '한화엔진 VI 발동 속 조선기자재주 동반 급등',
    sources: 15,
    gradient: 'linear-gradient(135deg,#7a5a3a,#c9a06a)',
    art: 'refinery',
  },
  {
    id: 'ex-kr-foreign',
    title: '외국인 1.4조원 순매수, 코스피 2거래일 연속 상승',
    sources: 34,
    gradient: 'linear-gradient(135deg,#37343f,#726c85)',
    art: 'bank',
  },
  {
    id: 'ex-kr-usdkrw',
    title: '위험선호 회복에 원/달러 1,423원대로 하락',
    sources: 24,
    gradient: 'linear-gradient(135deg,#2d4a6b,#7291b5)',
    art: 'imf',
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
