import { memo, useEffect, useMemo, useState } from 'react';
import { Card, ChangeBadge, ChipTabs } from '@/components/ui';
import { clsx, fmtDateKo, fmtUsdCompact } from '@/data/format';
import { apiFetch } from '@/live/apiClient';
import type { LivePredictionMarket, PredictionsResponse } from '@/shared/api';
import './predictions.css';

const SOURCE_TABS = [
  { key: 'all', label: '전체' },
  { key: 'polymarket', label: 'Polymarket' },
  { key: 'kalshi', label: 'Kalshi' },
];

function fmtProb(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

const PredictionCard = memo(function PredictionCard({ market, fallback }: { market: LivePredictionMarket; fallback: boolean }) {
  const leadIndex = market.outcomes.reduce((best, outcome, index, outcomes) => outcome.probability > outcomes[best].probability ? index : best, 0);
  const sourceName = market.provider === 'polymarket' ? 'Polymarket' : 'Kalshi';
  return (
    <Card className="pd-card">
      <div className="pd-top">
        <span className="pd-cat"><span aria-hidden>{market.provider === 'polymarket' ? '◆' : 'K'}</span>{sourceName}</span>
        <span className={clsx('pd-src', market.provider === 'polymarket' ? 'poly' : 'kalshi')}>
          {fallback ? '폴백 예시' : '공급자 데이터'}
        </span>
        {market.closesAt && <span className="pd-ends muted">~ {fmtDateKo(market.closesAt.slice(0, 10))} 마감</span>}
      </div>
      <div className="pd-qwrap">
        {market.url ? <a className="pd-q pd-live-link" href={market.url} target="_blank" rel="noopener noreferrer">{market.question}</a> : <div className="pd-q">{market.question}</div>}
      </div>
      <div className="pd-outcomes">
        {market.outcomes.map((outcome, index) => (
          <div className="pd-outcome" key={`${outcome.label}-${index}`}>
            <div className="pd-outcome-row">
              <span className="pd-outcome-label truncate">{outcome.label}</span>
              {outcome.priceDeltaPct !== undefined && <ChangeBadge value={outcome.priceDeltaPct} pill arrow className="pd-delta" />}
              <span className="pd-prob num">{fmtProb(outcome.probability)}</span>
            </div>
            <div className="pd-bar"><div className={clsx('pd-bar-fill', index === leadIndex && 'lead')} style={{ width: `${Math.min(100, Math.max(0, outcome.probability))}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="pd-foot">
        <span className="pd-vol muted">거래액 <span className="num">{fmtUsdCompact(market.volumeUsd)}</span></span>
        <time className="pd-foot-src muted" dateTime={market.providerTimestamp}>{new Date(market.providerTimestamp).toLocaleString('ko-KR')}</time>
      </div>
    </Card>
  );
});

export default function PredictionsPage() {
  const [source, setSource] = useState('all');
  const [response, setResponse] = useState<PredictionsResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    void apiFetch<PredictionsResponse>('/api/predictions?limit=16', { signal: controller.signal })
      .then((value) => {
        if (controller.signal.aborted) return;
        setResponse(value);
        setError('');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || (cause instanceof DOMException && cause.name === 'AbortError')) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const markets = useMemo(() => {
    const all = response?.markets ?? Object.freeze([]);
    return source === 'all' ? all : all.filter((market) => market.provider === source);
  }, [response, source]);

  return (
    <div className="page pd-page">
      <div className="pd-header">
        <div className="pd-header-text">
          <h1 className="section-title pd-title">예측 시장</h1>
          <div className="pd-sub muted">
            {loading ? '공급자 연결 중…' : response?.fallback ? '실제 공급자 응답 실패 · 명시적 로컬 폴백' : 'Polymarket·Kalshi 공개 시장 데이터'}
          </div>
        </div>
        <ChipTabs items={SOURCE_TABS} value={source} onChange={setSource} className="pd-chips" />
      </div>

      {response?.providers.length ? (
        <div className="pd-provider-strip" aria-label="예측시장 공급자 상태">
          {response.providers.map((provider) => (
            <span key={provider.provider} className={`pd-provider ${provider.status}`}>
              {provider.provider} · {provider.status} · {provider.message}
            </span>
          ))}
        </div>
      ) : null}
      {error && <div className="pd-api-error" role="status">API 연결 실패: {error}</div>}

      <div className="pd-grid fade-in-up" key={source}>
        {loading ? (
          <div className="pd-empty muted">예측시장을 불러오고 있습니다.</div>
        ) : markets.length === 0 ? (
          <div className="pd-empty muted">선택한 공급자의 시장이 없습니다.</div>
        ) : markets.map((market) => <PredictionCard key={market.id} market={market} fallback={response?.fallback ?? true} />)}
      </div>

      <div className="pd-disclaimer muted">
        확률은 각 공급자가 제공한 시장 가격을 표시합니다. 공급자 연결이 실패하면 화면에 폴백임을 명시하며, 해당 값은 실제 시장 데이터가 아닙니다. 투자 조언이 아닙니다.
      </div>
    </div>
  );
}
