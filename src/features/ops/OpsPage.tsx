import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/cloud/AuthProvider';
import { apiFetch } from '@/live/apiClient';
import type { OpsAction, OpsActionResponse, OpsSummaryResponse } from '@/shared/api';
import './ops.css';

interface ActionInput {
  readonly action: OpsAction;
  readonly provider?: 'alpaca' | 'finnhub' | 'coinbase';
  readonly limit?: number;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
function time(value?: string): string {
  return value ? new Date(value).toLocaleString('ko-KR') : '—';
}
function actionLabel(action: OpsAction): string {
  switch (action) {
    case 'probe-providers': return '공급자 Probe';
    case 'reset-circuit': return '회로 초기화';
    case 'retry-failed-deliveries': return '실패 전달 재시도';
    case 'prune-operational-data': return '운영 원장 정리';
    case 'run-release-gate': return 'Release Gate 실행';
  }
}

export default function OpsPage() {
  const { loading: authLoading, user, accessToken, isOps, roles } = useAuth();
  const [summary, setSummary] = useState<OpsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken || !isOps) return;
    setLoading(true);
    setError('');
    try {
      setSummary(await apiFetch<OpsSummaryResponse>('/api/ops/summary', {}, accessToken));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '운영 상태를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, isOps]);

  useEffect(() => {
    void refresh();
    if (!accessToken || !isOps) return undefined;
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [accessToken, isOps, refresh]);

  const runAction = async (input: ActionInput) => {
    if (!accessToken) return;
    const key = `${input.action}:${input.provider ?? 'all'}`;
    setBusyAction(key);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch<OpsActionResponse>('/api/ops/actions', {
        method: 'POST',
        headers: { 'Idempotency-Key': globalThis.crypto.randomUUID() },
        body: JSON.stringify(input),
      }, accessToken);
      setMessage(`${actionLabel(response.action)} 완료 · 요청 ${response.requestId}`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '운영 작업을 실행하지 못했습니다.');
    } finally {
      setBusyAction(null);
    }
  };

  if (authLoading) {
    return <section className="page ops-page" role="status">운영자 권한을 확인하고 있습니다.</section>;
  }
  if (!user || !isOps) {
    return (
      <section className="page ops-page" aria-labelledby="ops-denied-title">
        <div className="ops-denied">
          <span aria-hidden="true">🔐</span>
          <h1 id="ops-denied-title">운영자 권한이 필요합니다</h1>
          <p>Supabase 사용자의 <code>app_metadata.role</code> 또는 <code>roles</code>에 <code>ops</code> 또는 <code>admin</code>을 설정하세요.</p>
          {user && <p>현재 역할: {roles.length ? roles.join(', ') : '없음'}</p>}
        </div>
      </section>
    );
  }

  const slo = summary?.marketSlo;
  const backlog = summary?.backlog;
  return (
    <section className="page ops-page fade-in-up" aria-labelledby="ops-title">
      <header className="ops-hero">
        <div>
          <span className="ops-kicker">ROLE-GATED OPERATIONS</span>
          <h1 id="ops-title">운영 제어 콘솔</h1>
          <p>공급자 복원력, 데이터 품질, 알림 전달 백로그와 배포 승인 조건을 한곳에서 점검합니다.</p>
        </div>
        <div className="ops-hero-actions">
          <span className={`ops-gate ${summary?.releaseGate.status ?? 'unknown'}`}>
            Gate {summary?.releaseGate.status ?? '—'}
          </span>
          <button type="button" className="ui-btn" disabled={loading} onClick={() => void refresh()}>
            {loading ? '새로고침 중…' : '새로고침'}
          </button>
        </div>
      </header>

      {error && <p className="ops-feedback error" role="alert">{error}</p>}
      {message && <p className="ops-feedback success" role="status">{message}</p>}

      <section className="ops-actions" aria-labelledby="ops-actions-title">
        <div>
          <h2 id="ops-actions-title">안전 작업</h2>
          <p>모든 변경 작업은 운영자 인증과 idempotency key를 통과하며 영속 감사 로그를 남깁니다.</p>
        </div>
        <div className="ops-action-buttons">
          {(['probe-providers', 'run-release-gate', 'retry-failed-deliveries', 'prune-operational-data'] as const).map((action) => (
            <button
              key={action}
              type="button"
              className="ui-btn"
              disabled={busyAction !== null}
              onClick={() => void runAction({ action })}
            >
              {busyAction === `${action}:all` ? '실행 중…' : actionLabel(action)}
            </button>
          ))}
        </div>
      </section>

      <section className="ops-metrics" aria-label="운영 핵심 지표">
        <article><span>가용성</span><strong>{slo ? percent(slo.availability) : '—'}</strong><small>{slo?.evidenceSource ?? '근거 없음'} · 목표 {slo ? percent(slo.availabilityTarget) : '—'}</small></article>
        <article><span>p95 지연</span><strong>{slo ? `${Math.round(slo.p95LatencyMs)}ms` : '—'}</strong><small>최근 {slo?.windowMinutes ?? 60}분</small></article>
        <article><span>신선도 통과율</span><strong>{slo ? percent(slo.freshnessPassRate) : '—'}</strong><small>기준 {slo?.freshnessTargetSeconds ?? '—'}초</small></article>
        <article><span>오류 예산</span><strong>{slo ? percent(slo.errorBudgetRemaining) : '—'}</strong><small>{slo?.status ?? 'no-data'}</small></article>
        <article><span>실패 전달</span><strong>{backlog?.failedDeliveries ?? 0}</strong><small>재시도 {backlog?.retryDeliveries ?? 0}</small></article>
        <article><span>24h 관측</span><strong>{backlog?.observations24h ?? 0}</strong><small>미해결 incident {backlog?.unresolvedIncidents ?? 0}</small></article>
      </section>

      <section className="ops-panel" aria-labelledby="ops-providers-title">
        <div className="ops-panel-head">
          <div><h2 id="ops-providers-title">시장 데이터 공급자</h2><p>회로 상태와 최근 60분 성공률을 기준으로 표시합니다.</p></div>
        </div>
        <div className="ops-table-wrap" tabIndex={0} role="region" aria-label="시장 데이터 공급자 상태 표">
          <table className="ops-table">
            <caption className="sr-only">시장 데이터 공급자 상태</caption>
            <thead><tr><th scope="col">공급자</th><th scope="col">상태</th><th scope="col">성공률</th><th scope="col">p95</th><th scope="col">회로</th><th scope="col">근거</th><th scope="col">최근 성공</th><th scope="col">작업</th></tr></thead>
            <tbody>
              {(summary?.providers ?? []).map((provider) => {
                const resettable = ['alpaca', 'finnhub', 'coinbase'].includes(provider.provider);
                const key = `reset-circuit:${provider.provider}`;
                return (
                  <tr key={provider.provider}>
                    <th scope="row">{provider.provider}</th>
                    <td><span className={`ops-status ${provider.status}`}>{provider.status}</span></td>
                    <td>{(provider.attempts ?? 0) > 0 ? percent(provider.successRate ?? 0) : '—'}</td>
                    <td>{(provider.attempts ?? 0) > 0 ? `${Math.round(provider.p95LatencyMs ?? 0)}ms` : '—'}</td>
                    <td>{provider.circuitState ?? '—'}</td>
                    <td>{provider.evidenceSource ?? 'runtime'}</td>
                    <td>{time(provider.lastSuccessAt ?? provider.sampledAt)}</td>
                    <td>
                      {resettable ? (
                        <button
                          type="button"
                          className="ui-btn ghost compact"
                          disabled={busyAction !== null}
                          onClick={() => void runAction({ action: 'reset-circuit', provider: provider.provider as 'alpaca' | 'finnhub' | 'coinbase' })}
                        >
                          {busyAction === key ? '초기화 중…' : '회로 초기화'}
                        </button>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
              {!summary?.providers.length && <tr><td colSpan={8}>공급자 상태를 아직 불러오지 못했습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="ops-grid">
        <section className="ops-panel" aria-labelledby="ops-gate-title">
          <div className="ops-panel-head"><div><h2 id="ops-gate-title">Release Gate</h2><p>필수 readiness, SLO와 데이터 품질을 합산한 판정입니다.</p></div></div>
          <ul className="ops-reasons">
            {(summary?.releaseGate.reasons ?? []).map((reason) => <li key={reason}>{reason}</li>)}
            {!summary?.releaseGate.reasons.length && <li>아직 판정 데이터가 없습니다.</li>}
          </ul>
        </section>
        <section className="ops-panel" aria-labelledby="ops-incidents-title">
          <div className="ops-panel-head"><div><h2 id="ops-incidents-title">데이터 품질 Incident</h2><p>공급자 실패·신선도·가격 편차·검증 거부 기록입니다.</p></div></div>
          <ul className="ops-incidents">
            {(summary?.incidents ?? []).slice(0, 12).map((incident) => (
              <li key={incident.id}>
                <span className={`ops-severity ${incident.severity}`}>{incident.severity}</span>
                <div><strong>{incident.symbol ? `${incident.symbol} · ` : ''}{incident.kind}</strong><p>{incident.message}</p><small>{time(incident.createdAt)}</small></div>
              </li>
            ))}
            {!summary?.incidents.length && <li className="empty">미해결 incident가 없습니다.</li>}
          </ul>
        </section>
      </div>
    </section>
  );
}
