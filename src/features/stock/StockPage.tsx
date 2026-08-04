/* ============================================================
   /stock/:symbol — asset detail page: quote header,
   interactive chart, key stats, related news, sector peers.
   ============================================================ */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardHeader, ChangeBadge, LogoChip, QuoteRow } from '@/components/ui';
import { engine } from '@/data/engine';
import { useQuote, useQuotes, useWatchlist } from '@/data/store';
import { GENERAL_NEWS } from '@/data/content';
import { SECTOR_BY_ID } from '@/data/universe';
import { clsx, fmtAssetVolume, fmtQuoteChange, fmtQuoteValue, fmtUsdCompact } from '@/data/format';
import type { AssetKind, NewsItem, Quote, QuoteSessionSnapshot } from '@/data/types';
import AlertDialog from '@/features/alerts/AlertDialog';
import PriceChart from './PriceChart.js';
import './stock.css';

const KIND_LABEL: Record<AssetKind, string> = {
  stock: '주식',
  index: '지수',
  future: '선물',
  crypto: '암호화폐',
  etf: 'ETF',
};

function displaySession(quote: Quote): QuoteSessionSnapshot {
  const session = quote.sessions.continuous ?? quote.sessions.afterHours ?? quote.sessions.regular;
  if (!session) throw new Error(`Missing session snapshot for ${quote.symbol}`);
  return session;
}

function sessionName(session: QuoteSessionSnapshot): string {
  if (session.kind === 'continuous') return '24/7 세션';
  if (session.kind === 'after-hours') return '시간외 세션';
  return '정규장';
}

function sessionAsOfLabel(quote: Quote, session: QuoteSessionSnapshot): string {
  const timeZone = quote.kind === 'crypto' ? 'Asia/Seoul' : 'America/New_York';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(session.asOfISO));
}

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

/* ---------- Quote row (isolated so ticks re-render only this) ---------- */

function LivePrice({ symbol }: { symbol: string }) {
  const quote = useQuote(symbol);
  const prevPrice = usePrevious(quote?.price);
  if (!quote) return null;
  const flash =
    prevPrice === undefined || quote.price === prevPrice
      ? undefined
      : quote.price > prevPrice
        ? 'flash-up'
        : 'flash-down';
  const session = displaySession(quote);
  return (
    <div className="st-pricerow">
      <span key={quote.seq} className={clsx('st-price num', flash)}>
        {fmtQuoteValue(quote, session.price)}
      </span>
      <span className={clsx('st-chg num', quote.change >= 0 ? 'pos' : 'neg')}>{fmtQuoteChange(quote, quote.change)}</span>
      <ChangeBadge value={quote.changePct} />
      <span className="st-close muted">
        {sessionName(session)} · {session.status === 'open' ? '열림' : '마감'} · 기준 {sessionAsOfLabel(quote, session)}
      </span>
    </div>
  );
}

/* ---------- Key stats grid ---------- */

function StatsCard({ symbol }: { symbol: string }) {
  const symbols = useMemo(() => [symbol], [symbol]);
  const [quote] = useQuotes(symbols, 1000);

  const yearRange = useMemo(() => {
    const hist = engine.getHistory(symbol, '1Y');
    if (hist.length === 0) return null;
    let hi = -Infinity;
    let lo = Infinity;
    for (const c of hist) {
      if (c.high > hi) hi = c.high;
      if (c.low < lo) lo = c.low;
    }
    return { hi, lo };
  }, [symbol]);

  if (!quote) return null;
  const session = displaySession(quote);
  const label = sessionName(session);
  const sectorLabel = quote.sectorId ? SECTOR_BY_ID[quote.sectorId].nameKo : KIND_LABEL[quote.kind];
  const stats: { label: string; value: string; numeric?: boolean }[] = [
    { label: `${label} 시가`, value: fmtQuoteValue(quote, session.open) },
    { label: `${label} 고가`, value: fmtQuoteValue(quote, session.high) },
    { label: `${label} 저가`, value: fmtQuoteValue(quote, session.low) },
    { label: '전일 종가', value: fmtQuoteValue(quote, quote.prevClose) },
    { label: `${label} 거래량`, value: fmtAssetVolume(quote, session.volume) },
    { label: '시가총액', value: quote.marketCap !== undefined ? fmtUsdCompact(quote.marketCap) : '-' },
    { label: '52주 최고 · 최저', value: yearRange ? `${fmtQuoteValue(quote, yearRange.hi)} · ${fmtQuoteValue(quote, yearRange.lo)}` : '-' },
    { label: '섹터', value: sectorLabel, numeric: false },
    { label: '세션 상태', value: session.status === 'open' ? '열림' : '마감', numeric: false },
    { label: '세션 기준', value: sessionAsOfLabel(quote, session), numeric: false },
  ];
  return (
    <Card className="fade-in-up st-d2">
      <CardHeader title="주요 지표" />
      <div className="st-stats">
        {stats.map((s) => (
          <div key={s.label} className="st-stat">
            <div className="st-stat-label">{s.label}</div>
            <div className={clsx('st-stat-value', s.numeric !== false && 'num')}>{s.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------- Related news ---------- */

const NewsRow = memo(function NewsRow({ item }: { item: NewsItem }) {
  return (
    <div className="st-news-row">
      <div className="st-news-title">{item.title}</div>
      <div className="st-news-summary">{item.summary}</div>
      <div className="st-news-foot">
        예시 뉴스 · {item.source} · {item.timeAgo}
      </div>
    </div>
  );
});

function NewsCard({ symbol }: { symbol: string }) {
  const items = useMemo(() => {
    const related = GENERAL_NEWS.filter((n) => n.symbols.includes(symbol));
    return related.length > 0 ? related : GENERAL_NEWS.slice(0, 3);
  }, [symbol]);
  return (
    <Card className="fade-in-up st-d3">
      <CardHeader title="관련 뉴스" />
      <div className="st-news-list">
        {items.map((n) => (
          <NewsRow key={n.id} item={n} />
        ))}
      </div>
    </Card>
  );
}

/* ---------- Sector peers ---------- */

const PeerRow = memo(function PeerRow({ quote }: { quote: Quote }) {
  return <QuoteRow quote={quote} />;
});

function PeersCard({ symbol }: { symbol: string }) {
  const meta = engine.getQuote(symbol);
  const peerSymbols = useMemo(() => {
    const q = engine.getQuote(symbol);
    if (!q) return [];
    let pool: readonly Quote[];
    if (q.kind === 'crypto') {
      pool = engine.getCrypto();
    } else if (q.kind === 'stock' || q.kind === 'etf') {
      pool = engine.getStocks().filter((p) => !q.sectorId || p.sectorId === q.sectorId);
    } else {
      // index / future → show the other macro quotes
      pool = engine.getAll().filter((p) => p.kind === 'index' || p.kind === 'future');
    }
    return pool
      .filter((p) => p.symbol !== q.symbol)
      .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
      .slice(0, 6)
      .map((p) => p.symbol);
  }, [symbol]);
  const peers = useQuotes(peerSymbols);

  const title =
    !meta || meta.kind === 'stock' || meta.kind === 'etf'
      ? '동종 섹터'
      : meta.kind === 'crypto'
        ? '주요 암호화폐'
        : '주요 지수 · 선물';

  return (
    <Card className="fade-in-up st-d3">
      <CardHeader title={title} />
      <div className="st-peers">
        {peers.map((p) => (
          <PeerRow key={p.symbol} quote={p} />
        ))}
      </div>
    </Card>
  );
}

/* ---------- Page ---------- */

function StockDetail({ quote }: { quote: Quote }) {
  const watchlist = useWatchlist();
  const inList = watchlist.has(quote.symbol);
  const [alertOpen, setAlertOpen] = useState(false);
  return (
    <div className="page st-page">
      <header className="st-header fade-in-up">
        <div className="st-header-top">
          <LogoChip bg={quote.logoBg} text={quote.logoText} size={40} />
          <div className="st-idblock">
            <h1 className="st-name">{quote.nameKo ?? quote.name}</h1>
            <div className="st-meta muted truncate">
              {quote.name} · {quote.symbol} · {quote.exchange}
            </div>
          </div>
          <div className="st-actions">
            <button
              type="button"
              className="ui-btn"
              onClick={() => watchlist.toggle(quote.symbol)}
              aria-pressed={inList}
              title={inList ? '관심목록에서 제거' : '관심목록에 추가'}
            >
              <span className={clsx(inList && 'st-star-on')}>{inList ? '★' : '☆'}</span> 관심목록
            </button>
            <button
              type="button"
              className="ui-btn ghost"
              onClick={() => setAlertOpen(true)}
              disabled={quote.kind !== 'crypto'}
              title={quote.kind === 'crypto' ? '암호화폐 모의 가격 알림 만들기' : '현재 모의 틱은 암호화폐만 지원합니다'}
            >
              알림 🔔
            </button>
          </div>
        </div>
        <LivePrice symbol={quote.symbol} />
      </header>

      <PriceChart symbol={quote.symbol} />
      <StatsCard symbol={quote.symbol} />

      <div className="st-bottom">
        <NewsCard symbol={quote.symbol} />
        <PeersCard symbol={quote.symbol} />
      </div>

      {alertOpen && <AlertDialog symbol={quote.symbol} onClose={() => setAlertOpen(false)} />}
    </div>
  );
}

export default function StockPage() {
  const params = useParams<{ symbol: string }>();
  let symbol = params.symbol ?? '';
  try {
    symbol = decodeURIComponent(symbol);
  } catch {
    /* keep the raw param */
  }
  const quote = engine.getQuote(symbol);

  if (!quote) {
    return (
      <div className="page st-notfound fade-in-up">
        <div className="st-notfound-icon" aria-hidden>
          🔍
        </div>
        <h1 className="st-notfound-title">종목을 찾을 수 없습니다</h1>
        <p className="muted st-notfound-sub">'{symbol}' 심볼에 해당하는 자산이 없습니다.</p>
        <Link to="/" className="ui-btn primary st-notfound-link">
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  return <StockDetail key={quote.symbol} quote={quote} />;
}
