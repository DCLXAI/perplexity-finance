/* ============================================================
   Korean (KRX) editorial content — 2026-08-05 KRX close session
   (`SNAPSHOT.krAsOfISO` in universe.kr.ts), one day after the US
   seed's 2026-08-04 anchor. Every figure here either comes straight
   from `universe.kr.ts` (already corroborated in Task 5) or from a
   real news item independently fetched for this task; see
   `.superpowers/sdd/2026-08-05-p11-korean-market/task-6-report.md`
   for the per-item source list. A story whose figures two sources
   disagreed on was dropped rather than shipped (same rule Task 5
   used for the seed itself).
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
    title: '월가 증권사 6곳, SK하이닉스 ADR에 일제히 매수 의견',
    body: '뱅크오브아메리카·UBS·로젠블랫증권·니덤·RBC캐피털마켓·윌리엄블레어 등 월가 증권사 6곳이 SK하이닉스 ADR에 매수 또는 비중확대 의견을 내며 목표주가를 최고 320달러(로젠블랫증권)까지 제시했다. 마이크론 대비 저평가됐다는 분석이 이어지며 ADR은 장중 8% 넘게 올랐고, 국내 SK하이닉스 주가가 상승 폭을 키우는 데도 힘을 보탰다.',
    sources: 27,
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
    body: '한화엔진이 이날 오후 1시 57분 전 거래일 대비 13.01% 오른 4만 6,050원까지 치솟으며 정적 변동성완화장치(VI)가 발동됐다. STX엔진, HD현대마린엔진 등 엔진·기자재주가 동반 강세를 보이며 코스피·코스닥 상승에 힘을 보탰다.',
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
    title: '월가 증권사 6곳, SK하이닉스 ADR 매수 총공세…목표가 최고 320달러',
    sources: 27,
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

/* ---------- 뉴스 (stock-detail page) ---------- */

export const KR_GENERAL_NEWS: NewsItem[] = [
  {
    id: 'n-kr-1',
    title: '코스피, 반도체 대장주 동반 반등에 3.76% 급등 마감',
    summary: '코스피가 239.31포인트(3.76%) 오른 6,598.26에, 코스닥은 2.42% 오른 799.59에 마감했다. 외국인이 1조 4,460억원을 순매수하며 삼성전자와 SK하이닉스 반등을 이끌었다.',
    source: '헤럴드경제',
    timeAgo: '1시간 전',
    symbols: ['005930', '000660'],
  },
  {
    id: 'n-kr-2',
    title: '월가 증권사 6곳, SK하이닉스 ADR에 매수 러브콜…목표가 최고 320달러',
    summary: 'BofA·UBS·로젠블랫증권 등이 SK하이닉스 ADR에 매수 또는 비중확대 의견을 제시했다. 마이크론 대비 저평가 논리가 부각되며 ADR은 장중 8% 넘게 올랐다.',
    source: '이투데이',
    timeAgo: '3시간 전',
    symbols: ['000660'],
  },
  {
    id: 'n-kr-3',
    title: 'LG이노텍, MSCI 한국 지수 편입 기대감에 장중 14%대 급등',
    summary: '8월 13일 발표될 MSCI 정기 리뷰에서 LG이노텍의 신규 편입 가능성이 높다는 관측이 나오며 주가가 급등했다. 편입이 확정되면 약 3,130억원의 패시브 자금 유입이 예상된다.',
    source: '글로벌이코노믹',
    timeAgo: '4시간 전',
    symbols: ['011070'],
  },
  {
    id: 'n-kr-4',
    title: '중국向 반도체 수입 규제설에 광통신주 상한가 랠리',
    summary: '대한광통신이 18.57% 오른 1만 2,070원에 마감하는 등 비트젬전자, RFHIC, 오솔루션 등 광통신 관련주가 미국의 대중 반도체 규제 강화 우려 속에 동반 급등했다.',
    source: '헤럴드경제',
    timeAgo: '5시간 전',
    symbols: [],
  },
  {
    id: 'n-kr-5',
    title: '한화엔진, 장중 VI 발동…조선기자재주 동반 강세',
    summary: '한화엔진이 전 거래일 대비 13.01% 오른 4만 6,050원까지 치솟으며 변동성완화장치가 발동됐다. STX엔진, HD현대마린엔진 등도 함께 올랐다.',
    source: 'CBC뉴스',
    timeAgo: '6시간 전',
    symbols: ['082740', '071970'],
  },
  {
    id: 'n-kr-6',
    title: '원/달러 환율, 외국인 순매수 속 1,423원대로 하락',
    summary: '원/달러 환율이 전 거래일 대비 0.45% 내린 1,423.05원에 마감했다. 유가증권시장에서 외국인이 1조 4,460억원을 순매수하며 원화 강세에 힘을 보탰다.',
    source: '헤럴드경제',
    timeAgo: '7시간 전',
    symbols: ['USDKRW'],
  },
  {
    id: 'n-kr-7',
    title: '뉴욕發 반도체 훈풍…마이크론 급등이 국내 증시로 이어져',
    summary: '전날 뉴욕증시에서 마이크론이 7.6% 급등하는 등 반도체 랠리가 이어지며, 국내 대형 반도체주 매수세로 연결됐다.',
    source: '서울경제',
    timeAgo: '8시간 전',
    symbols: [],
  },
];
