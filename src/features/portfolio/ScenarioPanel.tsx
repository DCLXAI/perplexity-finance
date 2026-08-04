import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/live/apiClient';
import { runPortfolioScenario } from '@/domain/portfolio/scenario';
import type {
  PortfolioScenarioResponse,
  PortfolioScenarioShock,
  PortfolioSummary,
  ScenarioTargetType,
} from '@/shared/api';

interface ScenarioPanelProps {
  readonly summary: PortfolioSummary;
  readonly accessToken?: string;
  readonly demo?: boolean;
}

const PRESETS = [
  { key: 'broad', label: '전시장 -10%', shocks: Object.freeze([{ targetType: 'all', target: '*', changePct: -10 }]) },
  { key: 'tech', label: '기술주 -20%', shocks: Object.freeze([{ targetType: 'sector', target: '기술', changePct: -20 }]) },
  { key: 'crypto', label: '암호화폐 -30%', shocks: Object.freeze([{ targetType: 'asset-kind', target: 'crypto', changePct: -30 }]) },
  { key: 'risk-on', label: '위험자산 반등', shocks: Object.freeze([
    { targetType: 'sector', target: '기술', changePct: 15 },
    { targetType: 'asset-kind', target: 'crypto', changePct: 20 },
  ]) },
] satisfies readonly { key: string; label: string; shocks: readonly PortfolioScenarioShock[] }[];

function usd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export default function ScenarioPanel({ summary, accessToken, demo = false }: ScenarioPanelProps) {
  const [targetType, setTargetType] = useState<ScenarioTargetType>('all');
  const [target, setTarget] = useState('*');
  const [changePct, setChangePct] = useState('-15');
  const [result, setResult] = useState<PortfolioScenarioResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestVersionRef = useRef(0);
  const sectorOptions = useMemo(
    () => [...new Set(summary.holdings.map((holding) => holding.sector).filter((value): value is string => Boolean(value)))],
    [summary.holdings],
  );

  useEffect(() => {
    requestVersionRef.current += 1;
    setResult(null);
    setBusy(false);
    setError('');
    return () => {
      requestVersionRef.current += 1;
    };
  }, [summary.portfolio.id]);

  const execute = async (shocks: readonly PortfolioScenarioShock[]) => {
    const requestVersion = ++requestVersionRef.current;
    setBusy(true);
    setError('');
    try {
      if (demo || !accessToken) {
        const local = runPortfolioScenario(summary, shocks);
        if (requestVersionRef.current !== requestVersion) return;
        setResult(Object.freeze({
          requestId: 'local-demo',
          portfolioId: summary.portfolio.id,
          generatedAt: new Date().toISOString(),
          ...local,
          shocks,
        }));
      } else {
        const response = await apiFetch<PortfolioScenarioResponse>('/api/portfolio/scenario', {
          method: 'POST',
          body: JSON.stringify({ portfolioId: summary.portfolio.id, shocks }),
        }, accessToken);
        if (requestVersionRef.current !== requestVersion) return;
        setResult(response);
      }
    } catch (cause) {
      if (requestVersionRef.current !== requestVersion) return;
      setError(cause instanceof Error ? cause.message : '시나리오를 실행하지 못했습니다.');
    } finally {
      if (requestVersionRef.current === requestVersion) setBusy(false);
    }
  };

  const customTarget = targetType === 'all' ? '*' : target.trim();
  return (
    <section className="pf-panel pf-scenario" aria-labelledby="pf-scenario-title">
      <div className="pf-panel-head">
        <div><h2 id="pf-scenario-title">스트레스 테스트</h2><p>충격은 예측이 아니라 현재 보유자산의 민감도 계산입니다.</p></div>
      </div>
      <div className="pf-preset-row">
        {PRESETS.map((preset) => (
          <button key={preset.key} type="button" className="ui-btn ghost" disabled={busy} onClick={() => void execute(preset.shocks)}>
            {preset.label}
          </button>
        ))}
      </div>
      <div className="pf-scenario-form">
        <label>
          <span>대상</span>
          <select value={targetType} onChange={(event) => {
            const next = event.target.value as ScenarioTargetType;
            setTargetType(next);
            setTarget(next === 'all' ? '*' : next === 'asset-kind' ? 'crypto' : next === 'sector' ? sectorOptions[0] ?? '기술' : 'AMD');
          }}>
            <option value="all">전체</option>
            <option value="symbol">개별 심볼</option>
            <option value="sector">섹터</option>
            <option value="asset-kind">자산 종류</option>
          </select>
        </label>
        <label>
          <span>대상 값</span>
          {targetType === 'sector' ? (
            <select value={target} onChange={(event) => setTarget(event.target.value)}>
              {(sectorOptions.length ? sectorOptions : ['기술']).map((sector) => <option key={sector} value={sector}>{sector}</option>)}
            </select>
          ) : targetType === 'asset-kind' ? (
            <select value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="stock">주식</option><option value="etf">ETF</option><option value="crypto">암호화폐</option>
              <option value="index">지수</option><option value="future">선물</option>
            </select>
          ) : (
            <input disabled={targetType === 'all'} value={target} onChange={(event) => setTarget(event.target.value)} />
          )}
        </label>
        <label><span>가격 충격 %</span><input type="number" min="-100" max="1000" step="0.1" value={changePct} onChange={(event) => setChangePct(event.target.value)} /></label>
        <button
          type="button"
          className="ui-btn primary"
          disabled={busy || !customTarget || !Number.isFinite(Number(changePct))}
          onClick={() => void execute(Object.freeze([{ targetType, target: customTarget, changePct: Number(changePct) }]))}
        >
          {busy ? '계산 중…' : '시나리오 실행'}
        </button>
      </div>
      {error && <p className="pf-form-error" role="alert">{error}</p>}
      {result && (
        <div className="pf-scenario-result" aria-live="polite">
          <div>
            <span>예상 평가액 변화</span>
            <strong className={result.absoluteChange >= 0 ? 'pos' : 'neg'}>{usd(result.absoluteChange)} · {result.changePct.toFixed(2)}%</strong>
            <small>{usd(result.beforeValue)} → {usd(result.afterValue)}</small>
          </div>
          <ol>
            {result.impacts.slice(0, 6).map((impact) => (
              <li key={impact.symbol}>
                <strong>{impact.symbol}</strong>
                <span className={impact.change >= 0 ? 'pos' : 'neg'}>{usd(impact.change)}</span>
                <small>{impact.appliedShockPct.toFixed(1)}%</small>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
