/* ============================================================
   Search palette — modal combobox with active-descendant keyboard
   navigation and full focus management.
   ============================================================ */
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ChangeBadge, LogoChip } from '@/components/ui';
import Modal from '@/components/ui/Modal';
import { engine } from '@/data/engine';
import { clsx, fmtQuoteValue } from '@/data/format';
import { useQuotes, useWatchlist } from '@/data/store';
import type { Quote } from '@/data/types';
import './search.css';

interface Group {
  label: string | null;
  quotes: readonly Quote[];
}

export default function SearchPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { symbols: watchlistSymbols } = useWatchlist();
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const titleId = useId();
  const helpId = useId();

  const trimmed = term.trim();
  const groups: Group[] = trimmed
    ? [{ label: null, quotes: engine.search(trimmed, 10) }]
    : [
        { label: '관심목록', quotes: engine.getQuotes(watchlistSymbols) },
        { label: '인기', quotes: engine.movers('active', 4) },
      ].filter((group) => group.quotes.length > 0);
  const flat = groups.flatMap((group) => [...group.quotes]);

  useQuotes(flat.map((quote) => quote.symbol));

  const selectedIndex = flat.length === 0 ? 0 : Math.min(selected, flat.length - 1);
  const activeOptionId = flat.length > 0 ? `${listId}-option-${selectedIndex}` : undefined;

  useEffect(() => {
    setSelected(0);
  }, [trimmed]);

  useEffect(() => {
    listRef.current?.querySelector('.sp-active')?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const go = (symbol: string) => {
    navigate(`/stock/${encodeURIComponent(symbol)}`);
    onClose();
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((current) => Math.min(current + 1, Math.max(0, flat.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      const quote = flat[selectedIndex];
      if (quote) {
        event.preventDefault();
        go(quote.symbol);
      }
    }
  };

  let optionIndex = -1;

  return (
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      className="sp-panel"
      backdropClassName="sp-backdrop"
      initialFocusRef={inputRef}
    >
        <h2 id={titleId} className="sr-only">자산 검색</h2>
        <div className="sp-inputrow">
          <span className="sp-icon" aria-hidden="true">🔍</span>
          <input
            ref={inputRef}
            className="sp-input"
            type="text"
            role="combobox"
            aria-label="주식, 암호화폐 등 자산 검색"
            aria-autocomplete="list"
            aria-expanded={true}
            aria-controls={listId}
            aria-activedescendant={activeOptionId}
            aria-describedby={helpId}
            value={term}
            placeholder="주식, 암호화폐 등을 검색하세요..."
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={onInputKeyDown}
          />
          <span id={helpId} className="sr-only">위아래 화살표로 이동하고 Enter로 선택하세요.</span>
          <kbd className="sp-kbd" aria-hidden="true">esc</kbd>
          <button type="button" className="sp-close" onClick={onClose} aria-label="검색 닫기">✕</button>
        </div>

        <div id={listId} className="sp-list" ref={listRef} role="listbox" aria-label="검색 결과">
          {flat.length === 0 ? (
            <div className="sp-empty muted" role="status">
              {trimmed ? `“${trimmed}”에 대한 검색 결과가 없습니다` : '검색할 자산 이름이나 심볼을 입력하세요'}
            </div>
          ) : (
            groups.map((group) => (
              <div
                key={group.label ?? 'results'}
                className="sp-group"
                role="group"
                aria-label={group.label ?? '검색 결과'}
              >
                {group.label && <div className="sp-label" aria-hidden="true">{group.label}</div>}
                {group.quotes.map((quote) => {
                  optionIndex += 1;
                  const index = optionIndex;
                  return (
                    <div
                      id={`${listId}-option-${index}`}
                      key={`${group.label ?? ''}${quote.symbol}`}
                      className={clsx('sp-item', index === selectedIndex && 'sp-active')}
                      role="option"
                      aria-selected={index === selectedIndex}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => go(quote.symbol)}
                      onMouseMove={() => setSelected(index)}
                    >
                      <LogoChip bg={quote.logoBg} text={quote.logoText} size={26} />
                      <div className="sp-item-main">
                        <div className="sp-item-name">{quote.name}</div>
                        <div className="sp-item-sub">
                          {quote.nameKo ? `${quote.nameKo} · ` : ''}
                          {quote.symbol} · {quote.exchange}
                        </div>
                      </div>
                      <div className="sp-item-right">
                        <div className="sp-price num">{fmtQuoteValue(quote, quote.price)}</div>
                        <ChangeBadge value={quote.changePct} pill={false} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
    </Modal>
  );
}
