/* ============================================================
   정치인 거래 — 미 의회 주식 공시 추적 (route: /politicians)
   ============================================================ */
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Card, ChangeBadge, ChipTabs, LogoChip } from '@/components/ui';
import { POLITICIAN_TRADES } from '@/data/content';
import { engine } from '@/data/engine';
import { SNAPSHOT } from '@/data/universe';
import { clsx, fmtDateKo } from '@/data/format';
import type { PoliticianTrade } from '@/data/types';
import './politicians.css';

/* 정당 컬러 — 데이터 컬러로 허용된 고정 hex */
const PARTY_COLOR: Record<PoliticianTrade['party'], string> = {
  민주당: '#2f6fb3',
  공화당: '#b34a3f',
};

type FilterKey = 'all' | 'dem' | 'rep' | 'senate' | 'house' | 'buy' | 'sell';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'dem', label: '민주당' },
  { key: 'rep', label: '공화당' },
  { key: 'senate', label: '상원' },
  { key: 'house', label: '하원' },
  { key: 'buy', label: '매수' },
  { key: 'sell', label: '매도' },
];

function passes(t: PoliticianTrade, f: FilterKey): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'dem':
      return t.party === '민주당';
    case 'rep':
      return t.party === '공화당';
    case 'senate':
      return t.chamber === '상원';
    case 'house':
      return t.chamber === '하원';
    case 'buy':
      return t.action === '매수';
    case 'sell':
      return t.action === '매도';
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function TradeRow({ trade }: { trade: PoliticianTrade }) {
  const meta = engine.getQuote(trade.symbol);
  const buy = trade.action === '매수';
  return (
    <div className="po-row">
      <div className="po-who">
        <span className="po-avatar" style={{ background: PARTY_COLOR[trade.party] }}>
          {initials(trade.politician)}
        </span>
        <div className="po-whotxt">
          <div className="po-name">{trade.politician}</div>
          <div className="po-meta muted">
            {trade.party} · {trade.chamber} · {trade.state}
          </div>
        </div>
      </div>

      <div className="po-trade">
        <span className={clsx('po-action', buy ? 'buy' : 'sell')}>{trade.action}</span>
        <Link className="po-stock" to={'/stock/' + encodeURIComponent(trade.symbol)}>
          <LogoChip bg={meta?.logoBg} text={meta?.logoText} size={18} />
          <span className="po-sym num">{trade.symbol}</span>
        </Link>
        <span className="po-company muted truncate">{trade.company}</span>
      </div>

      <div className="po-amt">
        <div className="po-amount num">{trade.amountRange}</div>
        <div className="po-dates muted num">
          거래 {fmtDateKo(trade.tradedISO)} · 공시 {fmtDateKo(trade.disclosedISO)}
        </div>
      </div>

      <div className="po-since">
        <ChangeBadge value={trade.sincePct} />
        <span className="po-sincelabel muted">거래 후</span>
      </div>
    </div>
  );
}

export default function PoliticiansPage() {
  const [filter, setFilter] = useState<FilterKey>('all');

  const stats = useMemo(() => {
    const today = new Date(SNAPSHOT.todayISO + 'T00:00:00').getTime();
    const weekAgo = today - 7 * 86_400_000;
    let week = 0;
    let buys = 0;
    let sells = 0;
    const freq = new Map<string, number>();
    for (const t of POLITICIAN_TRADES) {
      if (new Date(t.disclosedISO + 'T00:00:00').getTime() >= weekAgo) week++;
      if (t.action === '매수') buys++;
      else sells++;
      freq.set(t.symbol, (freq.get(t.symbol) ?? 0) + 1);
    }
    let top = '—';
    let topN = 0;
    for (const [sym, n] of freq) {
      if (n > topN) {
        topN = n;
        top = sym;
      }
    }
    return { week, buys, sells, top };
  }, []);

  const trades = useMemo(
    () =>
      POLITICIAN_TRADES.filter((t) => passes(t, filter)).sort((a, b) =>
        b.disclosedISO.localeCompare(a.disclosedISO),
      ),
    [filter],
  );

  return (
    <div className="page fade-in-up">
      <div className="po-head">
        <h1 className="po-title">정치인 거래</h1>
        <p className="po-sub muted">미 의회 주식 공시 추적 (STOCK Act) · 모의 데이터</p>
      </div>

      <div className="po-stats">
        <Card className="ui-card-pad po-stat">
          <div className="po-statlabel">이번 주 공시</div>
          <div className="po-statvalue">
            <span className="num">{stats.week}</span>건
          </div>
        </Card>
        <Card className="ui-card-pad po-stat">
          <div className="po-statlabel">매수 · 매도</div>
          <div className="po-statvalue">
            <span className="pos">
              매수 <span className="num">{stats.buys}</span>건
            </span>
            <span className="po-statdot muted"> · </span>
            <span className="neg">
              매도 <span className="num">{stats.sells}</span>건
            </span>
          </div>
        </Card>
        <Card className="ui-card-pad po-stat">
          <div className="po-statlabel">최다 거래 종목</div>
          <div className="po-statvalue num">{stats.top}</div>
        </Card>
      </div>

      <ChipTabs
        className="po-chips"
        items={FILTERS}
        value={filter}
        onChange={(k) => setFilter(k as FilterKey)}
      />

      <Card className="po-list">
        {trades.map((t) => (
          <TradeRow key={t.id} trade={t} />
        ))}
        {trades.length === 0 && <div className="po-empty muted">해당 조건의 공시가 없습니다</div>}
      </Card>
    </div>
  );
}
