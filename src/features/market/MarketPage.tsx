/* ============================================================
   지역별 시장 대시보드 — route "/" (region-scoped: US 기본, ?region=kr 지원)
   상위 자산 · 시장 요약 · 지역별 주식 표본 히트맵 · 둘러보기 + 우측 레일
   ============================================================ */
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useSearchParams } from 'react-router';
import { Card, CardHeader, ChangeBadge, Sparkline } from '@/components/ui';
import Modal from '@/components/ui/Modal';
import { useQuotes } from '@/data/store';
import { CONTENT_BY_REGION } from '@/data/content';
import { clsx, fmtQuoteChange, fmtQuoteValue } from '@/data/format';
import { apiFetch } from '@/live/apiClient';
import { REGION_LABELS, regionAdj, regionFromSearch, type MarketRegion } from '@/data/region';
import { RegionSwitcher } from '@/components/layout/RegionSwitcher';
import type { NewsResponse } from '@/shared/api';
import type { ExploreCard as ExploreCardData, Quote } from '@/data/types';
import Heatmap from '@/features/heatmap/Heatmap';
import { MarketRail } from '@/features/rail/RailWidgets';
import AskBar from '@/features/ai/AskBar';
import ExploreArt from './ExploreArt.js';
import './market.css';

/* ---------- 공용: 요소 너비 측정 (스파크라인 반응형) ---------- */

function useElementWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width);
      setWidth((prev) => (prev === w ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/* ---------- 1. 상위 자산 ---------- */

const INDEX_SYMBOLS_BY_REGION: Readonly<Record<MarketRegion, readonly string[]>> = Object.freeze({
  US: ['ES=F', 'NQ=F', 'YM=F', '^VIX'],
  KR: ['^KOSPI', '^KOSDAQ', '^KOSPI200', '^VKOSPI'],
});

/* `seq` prop은 memo 더티체크 전용 (엔진이 Quote 객체를 제자리 변경하므로) */
const IndexCard = memo(function IndexCard({ quote }: { quote: Quote; seq: number }) {
  const [sparkRef, sparkW] = useElementWidth();
  return (
    <Card className="mkt-idx-card">
      <div className="mkt-idx-top">
        <span className="mkt-idx-name truncate">{quote.nameKo ?? quote.name}</span>
        <ChangeBadge value={quote.changePct} />
      </div>
      <div className="mkt-idx-price num">{fmtQuoteValue(quote, quote.price)}</div>
      <div className="mkt-idx-chg num">{fmtQuoteChange(quote, quote.change)}</div>
      <div className="mkt-idx-spark" ref={sparkRef}>
        {sparkW > 0 && (
          <Sparkline data={quote.spark} baseline={quote.prevClose} width={sparkW} height={44} />
        )}
      </div>
    </Card>
  );
});

function TopAssets({ region }: { readonly region: MarketRegion }) {
  const quotes = useQuotes(INDEX_SYMBOLS_BY_REGION[region], 800);
  return (
    <section className="mkt-section mkt-rise">
      <div className="mkt-sec-head">
        <h2 className="section-title">상위 자산</h2>
        <RegionSwitcher />
      </div>
      <div className="mkt-idx-grid">
        {quotes.map((q) => (
          <IndexCard key={q.symbol} quote={q} seq={q.seq} />
        ))}
      </div>
    </section>
  );
}

/* ---------- 2. 시장 요약 (아코디언) ---------- */

function SourceDots({ small }: { small?: boolean }) {
  return (
    <span className="mkt-srcs" aria-hidden="true">
      <span className={clsx('mkt-src-dot', small && 'sm')} style={{ background: 'var(--teal)' }} />
      <span className={clsx('mkt-src-dot', small && 'sm')} style={{ background: 'var(--warn)' }} />
      <span className={clsx('mkt-src-dot', small && 'sm')} style={{ background: 'var(--pos)' }} />
    </span>
  );
}

function MarketSummarySection({ region }: { readonly region: MarketRegion }) {
  const summary = CONTENT_BY_REGION[region].summary;
  const [openId, setOpenId] = useState<string>(summary[0]?.id ?? '');
  useEffect(() => setOpenId(summary[0]?.id ?? ''), [summary]);
  const openItem = summary.find((m) => m.id === openId) ?? summary[0];
  return (
    <section className="mkt-section mkt-rise" style={{ animationDelay: '0.05s' }}>
      <Card>
        <CardHeader
          title="시장 요약"
          right={<span className="mkt-note">모의 스냅숏 요약</span>}
        />
        <div className="mkt-sum-list">
          {summary.map((item) => {
            const open = item.id === openId;
            return (
              <div key={item.id} className={clsx('mkt-sum-item', open && 'open')}>
                <button
                  type="button"
                  className="mkt-sum-head"
                  aria-expanded={open}
                  onClick={() => setOpenId((cur) => (cur === item.id ? '' : item.id))}
                >
                  <span className="mkt-sum-title">{item.title}</span>
                  <span className="mkt-sum-chev" aria-hidden="true">
                    {open ? 'ˆ' : '˅'}
                  </span>
                </button>
                {open && <div className="mkt-sum-body">{item.body}</div>}
              </div>
            );
          })}
        </div>
        <div className="mkt-sum-foot">
          <SourceDots />
          <span className="mkt-chip mkt-src-chip num">
            예시 자료 {openItem ? openItem.sources : 48}개
          </span>
        </div>
      </Card>
    </section>
  );
}

/* ---------- 3. 공급자 뉴스 ---------- */

/** Live Alpaca news is a US-only feed — showing it under KR would mix in US tickers, so
 *  KR reads the static editorial set (`CONTENT_BY_REGION.KR.news`) instead of calling the API. */
function ProviderNewsSection({ region }: { readonly region: MarketRegion }) {
  const [response, setResponse] = useState<NewsResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (region !== 'US') return;
    setResponse(null);
    setError('');
    const controller = new AbortController();
    void apiFetch<NewsResponse>('/api/news?limit=6', { signal: controller.signal })
      .then((value) => {
        setResponse(value);
        setError('');
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => controller.abort();
  }, [region]);

  if (region !== 'US') {
    const items = CONTENT_BY_REGION[region].news;
    return (
      <section className="mkt-section mkt-rise" style={{ animationDelay: '0.08s' }}>
        <Card>
          <CardHeader title="최신 시장 뉴스" right={<span className="mkt-note">예시 자료</span>} />
          <div className="mkt-news-list">
            {items.map((item) => (
              <article className="mkt-news-item" key={item.id}>
                <div className="mkt-news-copy">
                  <h3 className="mkt-news-title">{item.title}</h3>
                  {item.summary && <p>{item.summary}</p>}
                  <div className="mkt-news-meta">
                    <span>{item.source}</span>
                    <span>{item.timeAgo}</span>
                    {item.symbols.length > 0 && <span className="num">{item.symbols.slice(0, 4).join(' · ')}</span>}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="mkt-news-foot">실시간 뉴스 공급자 연동 전 정적 예시 자료입니다.</div>
        </Card>
      </section>
    );
  }

  return (
    <section className="mkt-section mkt-rise" style={{ animationDelay: '0.08s' }}>
      <Card>
        <CardHeader
          title="최신 시장 뉴스"
          right={response ? <span className={`mkt-news-mode ${response.fallback ? 'fallback' : 'live'}`}>{response.fallback ? '폴백 예시' : response.provider.provider}</span> : <span className="mkt-note">연결 중…</span>}
        />
        <div className="mkt-news-list">
          {error && <div className="mkt-news-error" role="status">뉴스 API 연결 실패: {error}</div>}
          {!response && !error && <div className="mkt-news-loading">뉴스 공급자를 확인하고 있습니다.</div>}
          {response?.items.map((item) => (
            <article className="mkt-news-item" key={item.id}>
              <div className="mkt-news-copy">
                <h3 className="mkt-news-title">
                  {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="mkt-news-title">{item.title}</a> : item.title}
                </h3>
                {item.summary && <p>{item.summary}</p>}
                <div className="mkt-news-meta">
                  <span>{item.source}</span>
                  <time dateTime={item.publishedAt}>{new Date(item.publishedAt).toLocaleString('ko-KR')}</time>
                  {item.symbols.length > 0 && <span className="num">{item.symbols.slice(0, 4).join(' · ')}</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
        {response && (
          <div className="mkt-news-foot">
            {response.fallback ? 'Alpaca News 자격증명 또는 공급자 응답이 없어 정적 예시를 표시합니다.' : `${response.provider.message} · 공급자 시각 기준`}
          </div>
        )}
      </Card>
    </section>
  );
}

/* ---------- 4. 주식 표본 히트맵 ---------- */

function HeatmapDialog({ region, onClose }: { readonly region: MarketRegion; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      onClose={onClose}
      labelledBy="heatmap-dialog-title"
      className="mkt-hm-modal"
      initialFocusRef={closeRef}
    >
        <div className="mkt-hm-modal-head">
          <h2 id="heatmap-dialog-title" className="section-title">{regionAdj(region)} 주식 표본 히트맵</h2>
          <button
            ref={closeRef}
            type="button"
            className="mkt-icon-btn"
            aria-label="히트맵 확장 보기 닫기"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="mkt-hm-modal-body">
          <Heatmap region={region} height={Math.min(720, window.innerHeight - 160)} />
        </div>
    </Modal>
  );
}

function HeatmapSection({ region }: { readonly region: MarketRegion }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="mkt-section mkt-rise" style={{ animationDelay: '0.1s' }}>
      <div className="mkt-sec-head">
        <h2 className="section-title">{regionAdj(region)} 주식 표본 히트맵</h2>
        <button type="button" className="ui-btn ghost" onClick={() => setExpanded(true)}>
          확장 <span aria-hidden="true">⤢</span>
        </button>
      </div>
      <Card className="mkt-hm-card">
        <Heatmap region={region} height={430} />
      </Card>
      {expanded && <HeatmapDialog region={region} onClose={() => setExpanded(false)} />}
    </section>
  );
}

/* ---------- 4. 둘러보기 (캐러셀) ---------- */

const CARD_STEP = 272; // 카드 260px + 간격 12px

const ExploreCardView = memo(function ExploreCardView({ card }: { card: ExploreCardData }) {
  return (
    <Card className="mkt-exp-card">
      <div className="mkt-exp-visual" style={{ background: card.gradient }}>
        <ExploreArt art={card.art} />
      </div>
      <div className="mkt-exp-title">{card.title}</div>
      <div className="mkt-exp-foot">
        <SourceDots small />
        <span className="mkt-exp-src num">예시 자료 {card.sources}개</span>
      </div>
    </Card>
  );
});

function ExploreSection({ region }: { readonly region: MarketRegion }) {
  const cards = CONTENT_BY_REGION[region].explore;
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const [pos, setPos] = useState({ idx: 0, atStart: true, atEnd: false });

  const sync = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // scrollLeft 는 max 로 클램프되므로 끝에 닿으면 마지막 인덱스로 스냅
    const idx =
      el.scrollLeft >= max - 4
        ? cards.length - 1
        : Math.min(cards.length - 1, Math.max(0, Math.round(el.scrollLeft / CARD_STEP)));
    setPos((prev) => {
      const next = { idx, atStart: el.scrollLeft <= 4, atEnd: el.scrollLeft >= max - 4 };
      return prev.idx === next.idx && prev.atStart === next.atStart && prev.atEnd === next.atEnd
        ? prev
        : next;
    });
  }, [cards.length]);

  const onScroll = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      sync();
    });
  }, [sync]);

  useEffect(() => {
    // `sync` is recreated whenever the card count changes (region switch), so this also
    // snaps the rail back to the start instead of leaving a stale scroll offset behind.
    scrollRef.current?.scrollTo({ left: 0 });
    sync();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [sync]);

  return (
    <section className="mkt-section mkt-rise" style={{ animationDelay: '0.15s' }}>
      <div className="mkt-sec-head">
        <h2 className="section-title">둘러보기</h2>
      </div>
      <div className="mkt-exp-wrap">
        <div className="mkt-exp-scroll" ref={scrollRef} onScroll={onScroll}>
          {cards.map((card) => (
            <ExploreCardView key={card.id} card={card} />
          ))}
        </div>
        {!pos.atStart && (
          <button
            type="button"
            className="mkt-exp-arrow left"
            aria-label="이전 카드"
            onClick={() => scrollRef.current?.scrollBy({ left: -540, behavior: 'smooth' })}
          >
            ‹
          </button>
        )}
        {!pos.atEnd && (
          <button
            type="button"
            className="mkt-exp-arrow right"
            aria-label="다음 카드"
            onClick={() => scrollRef.current?.scrollBy({ left: 540, behavior: 'smooth' })}
          >
            ›
          </button>
        )}
      </div>
      <div className="mkt-exp-dots">
        {cards.map((card, i) => (
          <button
            key={card.id}
            type="button"
            className={clsx('mkt-exp-dot', i === pos.idx && 'active')}
            aria-label={`${i + 1}번째 카드로 이동`}
            onClick={() =>
              scrollRef.current?.scrollTo({ left: i * CARD_STEP, behavior: 'smooth' })
            }
          />
        ))}
      </div>
    </section>
  );
}

/* ---------- 페이지 ---------- */

export default function MarketPage() {
  const [searchParams] = useSearchParams();
  const region = regionFromSearch(searchParams);
  const label = REGION_LABELS[region].label;

  return (
    <>
      <h1 className="sr-only">{label}</h1>
      <div className="page page-with-rail">
        <div className="mkt-main">
          <TopAssets region={region} />
          <MarketSummarySection region={region} />
          <ProviderNewsSection region={region} />
          <HeatmapSection region={region} />
          <ExploreSection region={region} />
        </div>
        <aside className="mkt-rail mkt-rise" style={{ animationDelay: '0.08s' }}>
          <MarketRail region={region} />
        </aside>
      </div>
      {/* `marketBrief()` (the no-symbol fallback answer) is pinned to US data — this rule-based
          bot has no request-time region context (see answers.ts). Under `?region=kr` the old
          placeholder ("한국 시장에 대해 무엇이든 질문하세요") promised Korean market coverage the
          general-question path can't deliver; per-symbol questions ARE region-aware (`quote.region`),
          so the accurate, still-cheap fix is to point the placeholder at that working path instead
          of the market-wide brief. */}
      <AskBar placeholder={region === 'KR' ? '삼성전자, 005930 등 한국 종목을 질문하세요' : `${label}에 대해 무엇이든 질문하세요`} />
    </>
  );
}
