/* ============================================================
   Right-rail widget cards shared by several pages
   (watchlist / predictions / movers / sectors / crypto)
   ============================================================ */
import { memo, useMemo, useState, type JSX } from 'react';
import { Link } from 'react-router';
import { Card, CardHeader, ChangeBadge, QuoteRow, SegTabs } from '@/components/ui';
import { engine } from '@/data/engine';
import { useAllQuotes, useQuotes, useWatchlist } from '@/data/store';
import { PREDICTIONS } from '@/data/content';
import { SECTORS_BY_REGION } from '@/data/universe';
import { fmtAssetVolume, fmtPrice, fmtUsdCompact } from '@/data/format';
import type { MarketRegion } from '@/data/region';
import type { PredictionMarket, Quote } from '@/data/types';
import './rail.css';

/* ---------- memoized quote row (immutable Quote snapshots) ---------- */

const RailQuoteRow = memo(function RailQuoteRow({
  quote,
  sub,
  showVolume,
}: {
  quote: Quote;
  sub?: string;
  showVolume?: boolean;
}) {
  const right = showVolume ? (
    <>
      <div className="qr-price num">{fmtAssetVolume(quote, quote.volume)}</div>
      <ChangeBadge value={quote.changePct} pill={false} arrow={false} />
    </>
  ) : undefined;
  return <QuoteRow quote={quote} sub={sub} right={right} />;
});

/* ============================================================
   1. 관심목록
   ============================================================ */

const WL_PER_PAGE = 5;

export function WatchlistCard(): JSX.Element {
  const { symbols } = useWatchlist();
  const quotes = useQuotes(symbols);
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(quotes.length / WL_PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = quotes.slice(safePage * WL_PER_PAGE, safePage * WL_PER_PAGE + WL_PER_PAGE);

  return (
    <Card className="rail-card">
      <CardHeader
        title="관심목록"
        to="/watchlist"
        right={
          <Link to="/watchlist" className="ui-btn ghost rail-gear" aria-label="관심목록 설정">
            ⚙
          </Link>
        }
      />
      <div className="rail-rows">
        {visible.map((q) => (
          <RailQuoteRow key={q.symbol} quote={q} />
        ))}
        {visible.length === 0 && <div className="rail-empty">관심 종목이 없습니다</div>}
      </div>
      {pageCount > 1 && (
        <div className="rail-pager">
          <button
            type="button"
            aria-label="이전 페이지"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            ‹
          </button>
          <span className="rail-page-num num">
            {safePage + 1}/{pageCount}
          </span>
          <button
            type="button"
            aria-label="다음 페이지"
            disabled={safePage === pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            ›
          </button>
        </div>
      )}
    </Card>
  );
}

/* ============================================================
   2. 예측 시장
   ============================================================ */

function PredictionBlock({ market }: { market: PredictionMarket }) {
  const source = market.source === 'Polymarket-style' ? 'Polymarket 형식' : 'Kalshi 형식';
  const extra = market.extraCount ? ` · 기타 ${market.extraCount}개 결과` : ''; 
  return (
    <div className="rail-pred-block">
      <div className="rail-pred-q">{market.question}</div>
      {market.outcomes.map((o) => (
        <div className="rail-pred-row" key={o.label}>
          <span className="rail-pred-label truncate">{o.label}</span>
          <span className="rail-pred-right">
            <span className="rail-pred-prob num">{o.prob.toFixed(1)}%</span>
            <ChangeBadge value={o.deltaPct} className="rail-pred-delta" />
          </span>
        </div>
      ))}
      <div className="rail-pred-meta">
        <span className="num">{fmtUsdCompact(market.volumeUsd)}</span> · 모의 거래액 · {source}{extra}
      </div>
    </div>
  );
}

export function PredictionsCard({ filter }: { filter?: 'earnings' }): JSX.Element {
  const markets = useMemo(
    () =>
      filter === 'earnings'
        ? PREDICTIONS.filter((m) => m.category === 'earnings')
        : PREDICTIONS.filter((m) => m.category !== 'earnings').slice(0, 3),
    [filter],
  );
  const moreCount = Math.max(0, PREDICTIONS.length - markets.length);

  return (
    <Card className="rail-card">
      <CardHeader title="예측 시장 모의값" />
      <div className="rail-pred-list">
        {markets.map((m) => (
          <PredictionBlock key={m.id} market={m} />
        ))}
      </div>
      <Link className="rail-pred-more" to="/predictions">
        {moreCount}개 더 보기 ↗
      </Link>
    </Card>
  );
}

/* ============================================================
   3. 상승/하락/활성화 movers
   ============================================================ */

type MoverKey = 'up' | 'down' | 'active';

const MOVER_TABS: { key: MoverKey; label: string }[] = [
  { key: 'up', label: '상승 주식' },
  { key: 'down', label: '하락 종목' },
  { key: 'active', label: '활성화' },
];

export function MoversCard({ region }: { readonly region?: MarketRegion }): JSX.Element {
  const [tab, setTab] = useState<MoverKey>('up');
  useAllQuotes(2000); // 로컬 모의 틱 재계산 트리거 (스로틀)
  const rows = engine.movers(tab, 4, 0, region);

  return (
    <Card className="rail-card">
      <div className="rail-seg-wrap">
        <SegTabs items={MOVER_TABS} value={tab} onChange={(k) => setTab(k as MoverKey)} />
      </div>
      <div className="rail-rows">
        {rows.map((q) => (
          <RailQuoteRow key={q.symbol} quote={q} showVolume={tab === 'active'} />
        ))}
      </div>
      <Link className="rail-more-link" to="/screener">
        모두 보기 ›
      </Link>
    </Card>
  );
}

/* ============================================================
   4. 주식 섹터
   ============================================================ */

export function SectorsCard({ region = 'US' }: { readonly region?: MarketRegion }): JSX.Element {
  const sectors = SECTORS_BY_REGION[region];
  return (
    <Card className="rail-card">
      <CardHeader title="주식 섹터" />
      <div className="rail-rows">
        {sectors.map((s) => (
          <div className="rail-sector-row" key={s.id}>
            <span className="rail-sector-name truncate">{s.nameKo}</span>
            <span className="rail-sector-right">
              <span className="rail-sector-val num">{fmtPrice(s.indexValue)} pt</span>
              <ChangeBadge value={s.changePct} />
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ============================================================
   5. 인기 암호화폐
   ============================================================ */

const CRYPTO_SYMBOLS = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD'];

export function CryptoCard(): JSX.Element {
  const quotes = useQuotes(CRYPTO_SYMBOLS);
  const sorted = [...quotes].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));

  return (
    <Card className="rail-card">
      <CardHeader title="인기 암호화폐" to="/crypto" />
      <div className="rail-rows">
        {sorted.map((q) => (
          <RailQuoteRow key={q.symbol} quote={q} sub={`${q.symbol} · CRYPTO`} />
        ))}
      </div>
    </Card>
  );
}

/* ============================================================
   전체 레일 스택
   ============================================================ */

export function MarketRail({
  region,
  predictionsFilter,
}: {
  readonly region?: MarketRegion;
  predictionsFilter?: 'earnings';
}): JSX.Element {
  return (
    <div className="rail-stack">
      <WatchlistCard />
      <PredictionsCard filter={predictionsFilter} />
      <MoversCard region={region} />
      <SectorsCard region={region} />
      <CryptoCard />
    </div>
  );
}
