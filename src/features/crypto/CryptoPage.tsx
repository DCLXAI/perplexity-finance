/* ============================================================
   암호화폐 대시보드 — /crypto
   히어로 시세 카드 + 공포·탐욕 게이지 + 시장 통계 타일 +
   전체 암호화폐 모의 시세 테이블 + 예시 뉴스
   ============================================================ */
import { memo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Card, ChangeBadge, LogoChip, Sparkline } from '@/components/ui';
import { engine } from '@/data/engine';
import { useAllQuotes, useQuotes } from '@/data/store';
import { fmtPct, fmtQuoteValue, fmtUsdCompact } from '@/data/format';
import { GENERAL_NEWS, MARKET_SUMMARY } from '@/data/content';
import type { Quote } from '@/data/types';
import AskBar from '@/features/ai/AskBar';
import './crypto.css';

const HERO_SYMBOLS = ['BTCUSD', 'ETHUSD', 'SOLUSD'];

/* ---------- 공포·탐욕 반원 게이지 ---------- */

const GAUGE_VALUE = 62; // 0 공포 — 100 탐욕
const G_CX = 60;
const G_CY = 58;

function gaugePoint(value: number, r: number): [number, number] {
  const a = ((180 - value * 1.8) * Math.PI) / 180;
  return [G_CX + r * Math.cos(a), G_CY - r * Math.sin(a)];
}

function gaugeArc(from: number, to: number, r: number): string {
  const [x1, y1] = gaugePoint(from, r);
  const [x2, y2] = gaugePoint(to, r);
  const large = (to - from) * 1.8 > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function SentimentGauge() {
  const [nx, ny] = gaugePoint(GAUGE_VALUE, 33);
  return (
    <Card className="cr-hero-card cr-gauge-card">
      <div className="cr-hero-top">
        <span className="cr-gauge-emoji" aria-hidden="true">🌡️</span>
        <div className="cr-hero-names">
          <span className="cr-hero-name">예시 시장 심리</span>
          <span className="cr-hero-sym">모의 공포·탐욕 지수</span>
        </div>
      </div>
      <svg className="cr-gauge-svg" viewBox="0 0 120 64" aria-label="모의 공포·탐욕 지수 62, 탐욕">
        <path d={gaugeArc(0, 39, 46)} stroke="var(--neg)" strokeWidth="7" fill="none" strokeLinecap="round" opacity="0.85" />
        <path d={gaugeArc(41, 59, 46)} stroke="var(--warn)" strokeWidth="7" fill="none" strokeLinecap="round" opacity="0.85" />
        <path d={gaugeArc(61, 100, 46)} stroke="var(--pos)" strokeWidth="7" fill="none" strokeLinecap="round" opacity="0.85" />
        <line
          x1={G_CX}
          y1={G_CY}
          x2={nx.toFixed(2)}
          y2={ny.toFixed(2)}
          stroke="var(--ink-strong)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx={G_CX} cy={G_CY} r="3.2" fill="var(--ink-strong)" />
      </svg>
      <div className="cr-gauge-read">
        <span className="cr-gauge-num num">{GAUGE_VALUE}</span>
        <span className="cr-gauge-word">탐욕</span>
      </div>
    </Card>
  );
}

/* ---------- 히어로 시세 카드 ---------- */

function HeroCard({ quote }: { quote: Quote }) {
  return (
    <Card className="cr-hero-card cr-hero-quote">
      <Link className="cr-hero-hit" to={`/stock/${encodeURIComponent(quote.symbol)}`} aria-label={`${quote.nameKo ?? quote.name} 상세 보기`}>
        <div className="cr-hero-top">
          <LogoChip bg={quote.logoBg} text={quote.logoText} size={26} />
          <div className="cr-hero-names">
            <span className="cr-hero-name">{quote.nameKo ?? quote.name}</span>
            <span className="cr-hero-sym">{quote.symbol.replace(/USD$/, '')}</span>
          </div>
        </div>
        <div className="cr-hero-price num">{fmtQuoteValue(quote, quote.price)}</div>
        <div className="cr-hero-row">
          <ChangeBadge value={quote.changePct} />
          <Sparkline data={quote.spark} baseline={quote.prevClose} width={116} height={34} />
        </div>
      </Link>
    </Card>
  );
}

/* ---------- 테이블 행 (memo — 해당 심볼 틱에만 리렌더) ---------- */

const CryptoRow = memo(function CryptoRow({
  quote,
  rank,
  hist,
}: {
  quote: Quote;
  rank: number;
  hist: readonly number[];
}) {
  return (
    <tr>
      <td className="cr-td-rank num">{rank}</td>
      <td className="cr-td-name">
        <Link
          className="cr-name-wrap cr-row-link"
          to={`/stock/${encodeURIComponent(quote.symbol)}`}
          aria-label={`${quote.nameKo ?? quote.name} 상세 보기`}
        >
          <LogoChip bg={quote.logoBg} text={quote.logoText} size={22} />
          <span className="cr-name">{quote.name}</span>
          <span className="cr-sym">{quote.symbol.replace(/USD$/, '')}</span>
        </Link>
      </td>
      <td className="num">{fmtQuoteValue(quote, quote.price)}</td>
      <td>
        <ChangeBadge value={quote.changePct} pill={false} />
      </td>
      <td className="num">{fmtUsdCompact(quote.marketCap ?? 0)}</td>
      <td className="cr-td-spark">
        <Sparkline data={hist} width={110} height={30} />
      </td>
    </tr>
  );
});

/* ---------- 뉴스 카드 ---------- */

function NewsCard({ title, body, meta }: { title: string; body: string; meta: string }) {
  return (
    <Card className="cr-news-card">
      <div className="cr-news-title">{title}</div>
      <p className="cr-news-summary">{body}</p>
      <div className="cr-news-meta">{meta}</div>
    </Card>
  );
}

/* ---------- 페이지 ---------- */

export default function CryptoPage() {
  const heroQuotes = useQuotes(HERO_SYMBOLS);
  const all = useAllQuotes(1500);

  const cryptos = all
    .filter((q) => q.kind === 'crypto')
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));

  const totalCap = cryptos.reduce((s, q) => s + (q.marketCap ?? 0), 0);
  const btcCap = cryptos.find((q) => q.symbol === 'BTCUSD')?.marketCap ?? 0;
  const volume24h = totalCap * 0.04;
  const dominance = totalCap > 0 ? (btcCap / totalCap) * 100 : 0;

  /* 7일 스파크 데이터 — 심볼별 1회 계산 후 캐시 (틱마다 재생성 방지) */
  const histCache = useRef(new Map<string, readonly number[]>());
  const histFor = (symbol: string): readonly number[] => {
    let h = histCache.current.get(symbol);
    if (!h) {
      // 실제 7×24시간 범위의 15분봉 모의 히스토리
      h = engine.getHistory(symbol, '7D').map((c) => c.close);
      histCache.current.set(symbol, h);
    }
    return h;
  };

  const btcNews = GENERAL_NEWS.filter((n) => n.symbols.includes('BTCUSD'));
  const btcSummary = MARKET_SUMMARY.find((m) => m.id === 'ms-btc');

  return (
    <div className="page cr-page">
      <AskBar placeholder="암호화폐에 대해 무엇이든 질문하세요" />

      <header className="cr-head">
        <h1 className="cr-title">암호화폐</h1>
        <p className="cr-sub">24/7 모의 시세 · 예시 심리 · 예시 뉴스</p>
      </header>

      {/* 1. 히어로 스트립 */}
      <section className="cr-hero">
        {heroQuotes.map((q) => (
          <HeroCard key={q.symbol} quote={q} />
        ))}
        <SentimentGauge />
      </section>

      {/* 2. 시장 통계 타일 */}
      <section className="cr-tiles">
        <Card className="cr-tile">
          <div className="cr-tile-label">전체 시가총액</div>
          <div className="cr-tile-value num">{fmtUsdCompact(totalCap)}</div>
        </Card>
        <Card className="cr-tile">
          <div className="cr-tile-label">모의 24시간 거래액</div>
          <div className="cr-tile-value num">{fmtUsdCompact(volume24h)}</div>
        </Card>
        <Card className="cr-tile">
          <div className="cr-tile-label">BTC 도미넌스</div>
          <div className="cr-tile-value num">{fmtPct(dominance, { sign: false })}</div>
        </Card>
        <Card className="cr-tile">
          <div className="cr-tile-label">상장 자산 수</div>
          <div className="cr-tile-value num">{cryptos.length}개</div>
        </Card>
      </section>

      {/* 3. 전체 시세 테이블 */}
      <div className="cr-section">
        <h2 className="section-title">시가총액 순위</h2>
        <span className="cr-section-note">시가총액 기준 내림차순 · 로컬 모의 틱</span>
      </div>
      <Card className="cr-table-card">
        <div className="cr-table-scroll" role="region" aria-label="암호화폐 시가총액 순위" tabIndex={0}>
          <table className="ui-table cr-table">
            <caption className="sr-only">로컬 모의 시가총액 기준 암호화폐 순위</caption>
            <thead>
              <tr>
                <th scope="col" className="cr-td-rank">#</th>
                <th scope="col" className="cr-td-name">이름</th>
                <th scope="col">가격</th>
                <th scope="col">24시간</th>
                <th scope="col">시가총액</th>
                <th scope="col">지난 7일</th>
              </tr>
            </thead>
            <tbody>
              {cryptos.map((q, i) => (
                <CryptoRow
                  key={q.symbol}
                  quote={q}
                  rank={i + 1}
                  hist={histFor(q.symbol)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 4. 암호화폐 뉴스 */}
      <div className="cr-section">
        <h2 className="section-title">암호화폐 뉴스</h2>
      </div>
      <section className="cr-news">
        {btcSummary && (
          <NewsCard
            title={btcSummary.title}
            body={btcSummary.body}
            meta={`모의 시나리오 · 예시 자료 ${btcSummary.sources}개`}
          />
        )}
        {btcNews.map((n) => (
          <NewsCard key={n.id} title={n.title} body={n.summary} meta={`예시 뉴스 · ${n.source} · ${n.timeAgo}`} />
        ))}
      </section>
    </div>
  );
}
