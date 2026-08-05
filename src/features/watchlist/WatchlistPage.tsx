/* ============================================================
   Watchlist page — accessible quote table + validated, persisted
   symbol combobox.
   ============================================================ */
import { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Card, ChangeBadge, LogoChip, Sparkline } from '@/components/ui';
import { engine } from '@/data/engine';
import { clsx, fmtMarketCap, fmtQuoteChange, fmtQuoteValue } from '@/data/format';
import { useQuotes, useWatchlist } from '@/data/store';
import type { Quote } from '@/data/types';
import './watchlist.css';

const WlRow = memo(function WlRow({
  quote,
  onRemove,
}: {
  quote: Quote;
  onRemove: (symbol: string) => void;
}) {
  return (
    <tr>
      <td>
        <Link
          className="wl-name-cell wl-row-link"
          to={`/stock/${encodeURIComponent(quote.symbol)}`}
          aria-label={`${quote.nameKo ?? quote.name} 상세 보기`}
        >
          <LogoChip symbol={quote.symbol} bg={quote.logoBg} text={quote.logoText} size={24} />
          <span className="wl-name-txt">
            <span className="wl-name">{quote.name}</span>
            <span className="wl-name-sub">
              {quote.symbol} · {quote.exchange}
            </span>
          </span>
        </Link>
      </td>
      <td className="num">{fmtQuoteValue(quote, quote.price)}</td>
      <td className={clsx('num', quote.change > 0 ? 'pos' : quote.change < 0 ? 'neg' : undefined)}>
        {fmtQuoteChange(quote, quote.change)}
      </td>
      <td><ChangeBadge value={quote.changePct} /></td>
      <td className="num">{quote.marketCap ? fmtMarketCap(quote) : '—'}</td>
      <td className="wl-spark-cell">
        <Sparkline data={quote.spark} width={110} height={30} baseline={quote.prevClose} />
      </td>
      <td className="wl-del-cell">
        <button
          type="button"
          className="wl-del"
          aria-label={`${quote.nameKo ?? quote.name} 관심목록에서 삭제`}
          title="관심목록에서 삭제"
          onClick={() => onRemove(quote.symbol)}
        >
          ✕
        </button>
      </td>
    </tr>
  );
});

function AddSymbol({
  onAdd,
  has,
}: {
  onAdd: (symbol: string) => void;
  has: (symbol: string) => boolean;
}) {
  const [term, setTerm] = useState('');
  const [focused, setFocused] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const trimmed = term.trim();
  const results = trimmed ? engine.search(trimmed, 6) : [];
  const open = focused && results.length > 0;
  const selectedIndex = Math.min(selected, Math.max(0, results.length - 1));

  useEffect(() => setSelected(0), [trimmed]);

  const pick = (symbol: string) => {
    onAdd(symbol);
    setTerm('');
    setSelected(0);
    inputRef.current?.focus();
  };

  return (
    <div className="wl-add">
      <span className="wl-add-icon" aria-hidden="true">+</span>
      <input
        ref={inputRef}
        className="wl-add-input"
        type="text"
        role="combobox"
        aria-label="관심목록에 종목 추가"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-option-${selectedIndex}` : undefined}
        value={term}
        placeholder="종목 추가..."
        onChange={(event) => setTerm(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSelected((current) => Math.min(current + 1, Math.max(0, results.length - 1)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelected((current) => Math.max(0, current - 1));
          } else if (event.key === 'Enter' && results[selectedIndex]) {
            event.preventDefault();
            pick(results[selectedIndex].symbol);
          } else if (event.key === 'Escape') {
            setTerm('');
            inputRef.current?.blur();
          }
        }}
      />
      {open && (
        <div id={listId} className="wl-add-drop" role="listbox" aria-label="종목 검색 결과">
          {results.map((quote, index) => (
            <div
              id={`${listId}-option-${index}`}
              key={quote.symbol}
              className={clsx('wl-add-item', index === selectedIndex && 'active')}
              role="option"
              aria-selected={index === selectedIndex}
              onMouseMove={() => setSelected(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(quote.symbol);
              }}
            >
              <LogoChip symbol={quote.symbol} bg={quote.logoBg} text={quote.logoText} size={22} />
              <span className="wl-add-name truncate">{quote.name}</span>
              <span className="wl-add-sym num">{quote.symbol}</span>
              {has(quote.symbol) && <span className="wl-add-has">추가됨</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WatchlistPage() {
  const { symbols, add, remove, has } = useWatchlist();
  const quotes = useQuotes(symbols);
  const removeRef = useRef(remove);
  removeRef.current = remove;
  const handleRemove = useCallback((symbol: string) => removeRef.current(symbol), []);

  const up = quotes.filter((quote) => quote.changePct > 0).length;
  const down = quotes.filter((quote) => quote.changePct < 0).length;

  return (
    <div className="page wl-page fade-in-up">
      <div className="wl-head">
        <div>
          <h1 className="wl-title">관심목록</h1>
          <div className="wl-sub muted">
            <span className="num">{quotes.length}</span>개 종목 · 상승{' '}
            <span className="num pos">{up}</span> · 하락 <span className="num neg">{down}</span>
          </div>
        </div>
        <AddSymbol onAdd={add} has={has} />
      </div>

      <Card className="wl-card">
        {quotes.length === 0 ? (
          <div className="wl-empty">
            <div className="wl-empty-title muted">관심목록이 비어 있습니다</div>
            <div className="wl-empty-hint">
              상단의 <b>종목 추가</b> 입력창에서 관심 종목을 검색해 등록하세요.
            </div>
          </div>
        ) : (
          <div className="wl-table-scroll" role="region" aria-label="관심 종목 시세" tabIndex={0}>
            <table className="ui-table wl-table">
              <caption className="sr-only">브라우저에 저장된 관심 종목 목록</caption>
              <thead>
                <tr>
                  <th scope="col">이름</th>
                  <th scope="col">가격</th>
                  <th scope="col">변동</th>
                  <th scope="col">변동%</th>
                  <th scope="col">시가총액</th>
                  <th scope="col">차트</th>
                  <th scope="col"><span className="sr-only">작업</span></th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((quote) => (
                  <WlRow key={quote.symbol} quote={quote} onRemove={handleRemove} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
