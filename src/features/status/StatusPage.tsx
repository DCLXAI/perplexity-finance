import { useCallback, useEffect, useState } from 'react';
import type { HealthResponse, ProviderStatus, ReadinessResponse } from '@/shared/api';
import { apiFetch, ClientApiError } from '@/live/apiClient';
import './status.css';

interface StatusState {
  readonly health: HealthResponse | null;
  readonly readiness: ReadinessResponse | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly lastCheckedAt?: string;
}

function time(value?: string): string {
  if (!value) return '없음';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'medium' }).format(parsed)
    : value;
}

function percent(value?: number): string {
  if (value === undefined) return '표본 없음';
  return `${Math.round(value * 10_000) / 100}%`;
}

function ProviderCard({ provider }: { provider: ProviderStatus }) {
  return (
    <article className="status-provider-card">
      <header>
        <div>
          <span className={`status-light ${provider.status}`} aria-hidden="true" />
          <strong>{provider.provider}</strong>
        </div>
        <span className={`status-pill ${provider.status}`}>{provider.status}</span>
      </header>
      <p>{provider.message}</p>
      <dl>
        <div><dt>모드</dt><dd>{provider.mode}</dd></div>
        <div><dt>회로</dt><dd>{provider.circuitState ?? '없음'}</dd></div>
        <div><dt>근거</dt><dd>{provider.evidenceSource ?? 'runtime'}</dd></div>
        <div><dt>성공률</dt><dd className="num">{(provider.attempts ?? 0) > 0 ? percent(provider.successRate) : '표본 없음'}</dd></div>
        <div><dt>P95</dt><dd className="num">{provider.p95LatencyMs ? `${provider.p95LatencyMs}ms` : '표본 없음'}</dd></div>
        <div><dt>마지막 표본</dt><dd className="num">{time(provider.lastSuccessAt ?? provider.sampledAt)}</dd></div>
      </dl>
    </article>
  );
}

export default function StatusPage() {
  const [state, setState] = useState<StatusState>({ health: null, readiness: null, loading: true, error: null });
  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    const settled = await Promise.allSettled([
      apiFetch<HealthResponse>('/api/health'),
      apiFetch<ReadinessResponse>('/api/ready'),
    ]);
    const health = settled[0].status === 'fulfilled' ? settled[0].value : null;
    const readiness = settled[1].status === 'fulfilled'
      ? settled[1].value
      : settled[1].reason instanceof ClientApiError && settled[1].reason.status === 503
        ? await fetch('/api/ready').then((response) => response.json() as Promise<ReadinessResponse>).catch(() => null)
        : null;
    const failures = settled.filter((result) => result.status === 'rejected');
    const error = !health && !readiness
      ? failures.map((result) => result.status === 'rejected' && result.reason instanceof Error ? result.reason.message : '상태 API 오류').join(' · ')
      : null;
    setState({ health, readiness, loading: false, error, lastCheckedAt: new Date().toISOString() });
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const overall = state.readiness?.status ?? state.health?.status ?? 'unknown';
  return (
    <section className="page status-page fade-in-up" aria-labelledby="status-title">
      <header className="status-hero">
        <div>
          <span className="status-kicker">PRODUCTION CONTROL PLANE</span>
          <h1 id="status-title">시스템 상태</h1>
          <p>설정 여부가 아니라 실제 공급자 호출, 회로 차단기, 배포 준비 조건을 분리해 표시합니다.</p>
        </div>
        <div className="status-hero-actions">
          <span className={`status-overall ${overall}`}>{overall}</span>
          <button type="button" className="ui-btn" disabled={state.loading} onClick={() => void refresh()}>
            {state.loading ? '점검 중…' : '다시 점검'}
          </button>
        </div>
      </header>

      {state.error && <div className="status-error" role="alert">{state.error}</div>}

      <section className="status-summary" aria-label="배포 상태 요약">
        <article><span>버전</span><strong className="num">{state.health?.version ?? '—'}</strong></article>
        <article><span>릴리스 채널</span><strong>{state.health?.releaseChannel ?? '—'}</strong></article>
        <article><span>환경</span><strong>{state.health?.deploymentStage ?? '—'}</strong></article>
        <article><span>마지막 점검</span><strong className="num">{time(state.lastCheckedAt)}</strong></article>
      </section>

      <div className="status-grid">
        <section className="status-panel" aria-labelledby="readiness-title">
          <div className="status-panel-head">
            <div><h2 id="readiness-title">배포 준비 조건</h2><p>필수 조건 실패 시 `/api/ready`는 HTTP 503을 반환합니다.</p></div>
            <span className={`status-pill ${state.readiness?.ready ? 'up' : 'down'}`}>
              {state.readiness?.ready ? 'READY' : 'NOT READY'}
            </span>
          </div>
          <ul className="status-checks">
            {(state.readiness?.checks ?? []).map((check) => (
              <li key={check.name}>
                <span className={`status-light ${check.status === 'pass' ? 'up' : check.status === 'warn' ? 'degraded' : 'down'}`} aria-hidden="true" />
                <div><strong>{check.name}{check.required ? ' · 필수' : ''}</strong><p>{check.message}</p></div>
                <span className={`status-pill ${check.status === 'pass' ? 'up' : check.status === 'warn' ? 'degraded' : 'down'}`}>{check.status}</span>
              </li>
            ))}
            {!state.readiness?.checks.length && <li className="status-empty">준비 상태를 아직 받지 못했습니다.</li>}
          </ul>
        </section>

        <section className="status-panel" aria-labelledby="capability-title">
          <div className="status-panel-head"><div><h2 id="capability-title">런타임 기능</h2><p>현재 배포에 실제로 연결된 계층입니다.</p></div></div>
          <dl className="status-capabilities">
            {Object.entries(state.health?.capabilities ?? {}).map(([key, enabled]) => (
              <div key={key}><dt>{key}</dt><dd className={enabled ? 'enabled' : 'disabled'}>{enabled ? 'ON' : 'OFF'}</dd></div>
            ))}
          </dl>
        </section>
      </div>

      <section className="status-providers" aria-labelledby="providers-title">
        <div className="status-panel-head"><div><h2 id="providers-title">공급자 상태</h2><p>현재 인스턴스 표본과 최근 60분 영속 운영 원장 중 더 신뢰할 수 있는 근거를 사용합니다.</p></div></div>
        <div className="status-provider-grid">
          {(state.health?.providers ?? []).map((provider) => <ProviderCard key={provider.provider} provider={provider} />)}
        </div>
      </section>

      {(state.readiness?.errors.length || state.readiness?.warnings.length) ? (
        <section className="status-notes" aria-labelledby="status-notes-title">
          <h2 id="status-notes-title">운영 메모</h2>
          {state.readiness.errors.map((entry) => <p className="error" key={entry}>실패 · {entry}</p>)}
          {state.readiness.warnings.map((entry) => <p className="warning" key={entry}>주의 · {entry}</p>)}
        </section>
      ) : null}
    </section>
  );
}
