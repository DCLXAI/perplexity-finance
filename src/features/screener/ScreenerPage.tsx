/* ============================================================
   주식 스크리너 — accessible sort/filter/pagination table.
   ============================================================ */
import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, ChipTabs, LogoChip, Sparkline } from '@/components/ui';
import { useAllQuotes } from '@/data/store';
import { SECTORS, SECTOR_BY_ID } from '@/data/universe';
import { clsx, fmtCompact, fmtPct, fmtQuoteValue } from '@/data/format';
import type { Quote, SectorId } from '@/data/types';
import './screener.css';

const PAGE_SIZE = 25;

type QuickKey = 'all' | 'up' | 'down' | 'large' | 'small';
type SortKey = 'symbol' | 'name' | 'price' | 'changePct' | 'marketCap' | 'volume' | 'sector';
type SortDir = 'asc' | 'desc';

const QUICK_FILTERS: { key: QuickKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'up', label: '상승' },
  { key: 'down', label: '하락' },
  { key: 'large', label: '대형주(≥$100B)' },
  { key: 'small', label: '중소형주(<$10B)' },
];

const COLUMNS: { key: SortKey | 'spark'; label: string; sortable: boolean; left?: boolean }[] = [
  { key: 'symbol', label: '심볼', sortable: true, left: true },
  { key: 'name', label: '회사명', sortable: true, left: true },
  { key: 'price', label: '가격', sortable: true },
  { key: 'changePct', label: '변동%', sortable: true },
  { key: 'marketCap', label: '시가총액', sortable: true },
  { key: 'volume', label: '거래량', sortable: true },
  { key: 'sector', label: '섹터', sortable: true },
  { key: 'spark', label: '차트', sortable: false },
];

function sectorNameKo(quote: Quote): string {
  return quote.sectorId ? SECTOR_BY_ID[quote.sectorId].nameKo : '';
}

function compareBy(a: Quote, b: Quote, key: SortKey): number {
  switch (key) {
    case 'symbol':
      return a.symbol.localeCompare(b.symbol);
    case 'name':
      return a.name.localeCompare(b.name);
    case 'price':
      return a.price - b.price;
    case 'changePct':
      return a.changePct - b.changePct;
    case 'marketCap':
      return (a.marketCap ?? 0) - (b.marketCap ?? 0);
    case 'volume':
      return a.volume - b.volume;
    case 'sector':
      return sectorNameKo(a).localeCompare(sectorNameKo(b), 'ko');
  }
}

function passesQuick(quote: Quote, quick: QuickKey): boolean {
  switch (quick) {
    case 'all':
      return true;
    case 'up':
      return quote.changePct > 0;
    case 'down':
      return quote.changePct < 0;
    case 'large':
      return (quote.marketCap ?? 0) >= 100e9;
    case 'small':
      return (quote.marketCap ?? 0) < 10e9;
  }
}

const ScreenerRow = memo(function ScreenerRow({ quote }: { quote: Quote }) {
  const up = quote.changePct >= 0;
  const destination = `/stock/${encodeURIComponent(quote.symbol)}`;
  return (
    <tr>
      <td className="sc-sym num">{quote.symbol}</td>
      <td className="sc-namecell">
        <Link
          className="sc-namewrap sc-row-link"
          to={destination}
          aria-label={`${quote.nameKo ?? quote.name} (${quote.symbol}) 상세 보기`}
        >
          <LogoChip bg={quote.logoBg} text={quote.logoText} size={20} />
          <span className="sc-name truncate">{quote.name}</span>
          <span className="sc-nameko muted truncate">{quote.nameKo}</span>
        </Link>
      </td>
      <td className="num">{fmtQuoteValue(quote, quote.price)}</td>
      <td className={clsx('num', up ? 'pos' : 'neg')}>{fmtPct(quote.changePct)}</td>
      <td className="num">{quote.marketCap ? fmtCompact(quote.marketCap) : '—'}</td>
      <td className="num">{fmtCompact(quote.volume)}</td>
      <td><span className="sc-sectorchip">{sectorNameKo(quote) || '—'}</span></td>
      <td className="sc-sparkcell">
        <Sparkline data={quote.spark} width={90} height={26} />
      </td>
    </tr>
  );
});

export default function ScreenerPage() {
  const all = useAllQuotes(2000);
  const [quick, setQuick] = useState<QuickKey>('all');
  const [sector, setSector] = useState<SectorId | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('marketCap');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);

  const term = search.trim().toLowerCase();
  const filtered = all.filter((quote) => {
    if (quote.kind !== 'stock') return false;
    if (!passesQuick(quote, quick)) return false;
    if (sector !== 'all' && quote.sectorId !== sector) return false;
    if (
      term &&
      !quote.symbol.toLowerCase().includes(term) &&
      !quote.name.toLowerCase().includes(term) &&
      !(quote.nameKo ?? '').toLowerCase().includes(term)
    ) {
      return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const comparison = compareBy(a, b, sortKey);
    return sortDir === 'asc' ? comparison : -comparison;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

  const clickSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((direction) => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'symbol' || key === 'name' || key === 'sector' ? 'asc' : 'desc');
    }
    setPage(0);
  };

  return (
    <div className="page fade-in-up">
      <div className="sc-head">
        <h1 className="sc-title">주식 스크리너</h1>
        <span className="sc-count num" aria-live="polite">{filtered.length}개 종목</span>
      </div>

      <Card className="ui-card-pad sc-filtercard">
        <div className="sc-filterbar">
          <ChipTabs
            items={QUICK_FILTERS}
            value={quick}
            onChange={(key) => {
              setQuick(key as QuickKey);
              setPage(0);
            }}
          />
          <select
            className="ui-btn sc-select"
            value={sector}
            aria-label="섹터 필터"
            onChange={(event) => {
              setSector(event.target.value as SectorId | 'all');
              setPage(0);
            }}
          >
            <option value="all">전체 섹터</option>
            {SECTORS.map((item) => (
              <option key={item.id} value={item.id}>{item.nameKo}</option>
            ))}
          </select>
          <label className="sc-search">
            <span className="sr-only">심볼 또는 회사명 검색</span>
            <span className="sc-searchic" aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.2" y2="16.2" />
              </svg>
            </span>
            <input
              value={search}
              placeholder="심볼·회사명 검색"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
            />
          </label>
        </div>
      </Card>

      <Card className="sc-tablecard">
        <div className="sc-tablewrap" role="region" aria-label="주식 스크리너 결과" tabIndex={0}>
          <table className="ui-table sc-table">
            <caption className="sr-only">필터와 정렬 조건에 따른 미국 주식 표본 결과</caption>
            <thead>
              <tr>
                {COLUMNS.map((column) => {
                  const active = column.key === sortKey;
                  const ariaSort = column.sortable
                    ? active
                      ? sortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                    : undefined;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      className={clsx(column.left && 'sc-th-left', active && 'sc-th-active', !column.sortable && 'sc-th-plain')}
                      aria-sort={ariaSort}
                    >
                      {column.sortable ? (
                        <button
                          type="button"
                          className="sc-sort-btn"
                          onClick={() => clickSort(column.key as SortKey)}
                          aria-label={`${column.label} 기준 ${active && sortDir === 'asc' ? '내림차순' : '오름차순'} 정렬`}
                        >
                          <span>{column.label}</span>
                          {active && <span className="sc-arrow" aria-hidden="true">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                        </button>
                      ) : (
                        column.label
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((quote) => <ScreenerRow key={quote.symbol} quote={quote} />)}
              {rows.length === 0 && (
                <tr className="sc-emptyrow">
                  <td colSpan={COLUMNS.length} className="sc-empty">조건에 맞는 종목이 없습니다</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="sc-foot">
          <span className="sc-range num">
            {filtered.length === 0
              ? '0개 표시'
              : `${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} / 전체 ${filtered.length}개 표시`}
          </span>
          <div className="sc-pager" aria-label="스크리너 페이지 이동">
            <button type="button" aria-label="이전 페이지" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>‹</button>
            <span className="sc-pagelabel num" aria-live="polite">{currentPage + 1} / {pageCount}</span>
            <button type="button" aria-label="다음 페이지" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>›</button>
          </div>
        </div>
      </Card>
    </div>
  );
}
