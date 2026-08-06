import { memo, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Card, LogoChip } from '@/components/ui';
import { engine } from '@/data/engine';
import { SNAPSHOT } from '@/data/universe';
import { apiFetch } from '@/live/apiClient';
import type { EarningsResponse, LiveEarningsEntry } from '@/shared/api';
import { MarketRail } from '@/features/rail/RailWidgets';
import AskBar from '@/features/ai/AskBar';
import './earnings.css';

const EntryRow = memo(function EntryRow({ entry }: { entry: LiveEarningsEntry }) {
  const quote = engine.getQuote(entry.symbol);
  const name = (
    <>
      <span className="er-entry-company truncate">{entry.name}</span>
      <span className="er-entry-symbol num">{entry.symbol}</span>
    </>
  );
  return (
    <div className="er-entry">
      <div className="er-entry-head">
        <LogoChip symbol={quote?.symbol} bg={quote?.logoBg} text={quote?.logoText ?? entry.symbol.slice(0, 1)} size={36} />
        {quote ? <Link className="er-entry-names" to={`/stock/${encodeURIComponent(entry.symbol)}`}>{name}</Link> : <div className="er-entry-names">{name}</div>}
        <div className="er-entry-when num">
          <span className="er-entry-fiscal">{entry.fiscalDateEnding ? `회계기간 ${entry.fiscalDateEnding}` : '회계기간 미제공'}</span>
          <span className="er-entry-time">EPS 추정 {entry.estimate === undefined ? '—' : `${entry.currency ?? 'USD'} ${entry.estimate.toFixed(2)}`}</span>
        </div>
      </div>
    </div>
  );
});

export default function EarningsPage() {
  const [response, setResponse] = useState<EarningsResponse | null>(null);
  const [selected, setSelected] = useState(SNAPSHOT.todayISO);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void apiFetch<EarningsResponse>('/api/earnings', { signal: controller.signal })
      .then((value) => {
        setResponse(value);
        setError('');
        const dates = [...new Set(value.entries.map((entry) => entry.reportDate))].sort();
        const first = dates.find((date) => date >= SNAPSHOT.todayISO) ?? dates[0];
        if (first) setSelected(first);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => controller.abort();
  }, []);

  const dates = useMemo(() => [...new Set((response?.entries ?? []).map((entry) => entry.reportDate))].sort().slice(0, 14), [response]);
  const entries = useMemo(() => {
    const source = response?.entries ?? Object.freeze([]);
    return showAll ? source.slice(0, 100) : source.filter((entry) => entry.reportDate === selected);
  }, [response, selected, showAll]);

  const step = (direction: -1 | 1) => {
    const index = dates.indexOf(selected);
    const next = Math.min(dates.length - 1, Math.max(0, (index < 0 ? 0 : index) + direction));
    if (dates[next]) { setSelected(dates[next]); setShowAll(false); }
  };

  return (
    <>
      <div className="page page-with-rail">
        <div className="er-main">
          <div className="er-head">
            <div>
              <h1 className="section-title">실적 일정</h1>
              <div className="er-sub muted">
                {!response ? '공급자 연결 중…' : response.fallback ? 'Alpha Vantage 미연결 · 정적 폴백 예시' : `Alpha Vantage 스냅숏 · ${response.entries.length}개 일정`}
              </div>
            </div>
            <div className="er-actions">
              <div className="er-pager">
                <button type="button" className="er-pager-arrow" aria-label="이전 날짜" onClick={() => step(-1)}>‹</button>
                <button type="button" className="er-pager-today" onClick={() => { setSelected(SNAPSHOT.todayISO); setShowAll(false); }}>오늘</button>
                <button type="button" className="er-pager-arrow" aria-label="다음 날짜" onClick={() => step(1)}>›</button>
              </div>
            </div>
          </div>

          {response && (
            <div className={`er-provider-status ${response.provider.status}`}>
              <span>{response.provider.provider}</span>
              <strong>{response.provider.status}</strong>
              <span>{response.provider.message}</span>
              <time dateTime={response.generatedAt}>{new Date(response.generatedAt).toLocaleString('ko-KR')}</time>
            </div>
          )}
          {error && <div className="er-api-error" role="status">실적 API 연결 실패: {error}</div>}

          <div className="er-week" role="group" aria-label="실적 발표 날짜">
            {dates.map((date) => {
              const dayCount = response?.entries.filter((entry) => entry.reportDate === date).length ?? 0;
              const day = new Date(`${date}T12:00:00Z`);
              return (
                <button key={date} type="button" className={`er-day${!showAll && selected === date ? ' selected' : ''}`} onClick={() => { setSelected(date); setShowAll(false); }} aria-pressed={!showAll && selected === date}>
                  <span className="er-day-wd">{new Intl.DateTimeFormat('ko-KR', { weekday: 'short', timeZone: 'UTC' }).format(day)}</span>
                  <span className="er-day-label num">{date.slice(5).replace('-', '/')}</span>
                  <span className="er-day-count num">{dayCount}개 기업</span>
                </button>
              );
            })}
          </div>

          <div key={showAll ? 'all' : selected} className="fade-in-up">
            {entries.length > 0 ? (
              <Card className="er-feed">
                {showAll && <div className="er-feed-note">공급자 일정 최대 100개 표시</div>}
                {entries.map((entry, index) => <EntryRow key={`${entry.symbol}-${entry.reportDate}-${index}`} entry={entry} />)}
              </Card>
            ) : (
              <Card className="er-empty">
                <div className="er-empty-title">{selected}에 등록된 실적 발표가 없습니다.</div>
                <div className="er-empty-copy muted">빈 날짜를 다른 날짜의 데이터로 대체하지 않습니다.</div>
                <button type="button" className="ui-btn er-empty-action" onClick={() => setShowAll(true)}>공급자 일정 전체 보기</button>
              </Card>
            )}
            <p className="er-footnote">
              {response?.fallback ? '현재 값은 제품 폴백 예시이며 실제 일정이 아닙니다.' : '발표 일정과 추정치는 공급자 기준이며 변경될 수 있습니다.'} 투자 조언이 아닙니다.
            </p>
          </div>
        </div>
        <aside><MarketRail predictionsFilter="earnings" /></aside>
      </div>
      <AskBar placeholder="실적 일정과 종목에 대해 물어보세요" />
    </>
  );
}
