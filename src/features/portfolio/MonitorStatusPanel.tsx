import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/live/apiClient';
import type {
  MonitorBreach,
  MonitorRuleKind,
  MonitorRuleOutcome,
  MonitorRuleState,
  MonitorRuleStatus,
  MonitorStatusResponse,
} from '@/shared/api';

interface MonitorStatusPanelProps {
  readonly portfolioId: string;
  readonly accessToken?: string;
}

const KIND_LABEL: Readonly<Record<MonitorRuleKind, string>> = Object.freeze({
  thesis_invalidation: '논지 무효화 조건',
  risk_threshold: '리스크 임계치',
  stress_scenario: '스트레스 시나리오 손실',
});
const STATE_LABEL: Readonly<Record<MonitorRuleState, string>> = Object.freeze({
  armed: '감시 중',
  latched: '경보 발동 · 재확인 필요',
});
const OUTCOME_LABEL: Readonly<Record<MonitorRuleOutcome, string>> = Object.freeze({
  breached: '위반',
  clear: '정상',
  deferred: '판정 보류',
  error: '평가 오류',
});

function formatDateTime(iso: string | null): string {
  if (!iso) return '기록 없음';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '기록 없음' : date.toLocaleString('ko-KR');
}
function formatNumber(value: number | string | null): string {
  if (value === null) return '없음';
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(numeric) : String(value);
}
function ruleLabel(status: MonitorRuleStatus): string {
  const base = KIND_LABEL[status.kind];
  return status.symbol ? `${base} · ${status.symbol}` : base;
}
function observationDetail(observation: Record<string, unknown>): {
  readonly observedValue: number | null;
  readonly threshold: number | null;
  readonly reason: string | null;
} {
  return {
    observedValue: typeof observation.observedValue === 'number' ? observation.observedValue : null,
    threshold: typeof observation.threshold === 'number' ? observation.threshold : null,
    reason: typeof observation.reason === 'string' ? observation.reason : null,
  };
}

function BreachRow({ breach }: { readonly breach: MonitorBreach }) {
  return (
    <li>
      <span>{formatDateTime(breach.observedAt)}</span>
      <span>{formatNumber(breach.observedValue)} / 기준 {formatNumber(breach.thresholdValue)}</span>
      <span className={`pf-quality ${breach.inputQuality}`}>{breach.inputQuality}</span>
    </li>
  );
}

export default function MonitorStatusPanel({ portfolioId, accessToken }: MonitorStatusPanelProps) {
  const [statuses, setStatuses] = useState<readonly MonitorRuleStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch<MonitorStatusResponse>(
        `/api/portfolio/monitor-status?portfolioId=${encodeURIComponent(portfolioId)}`,
        {},
        accessToken,
      );
      setStatuses(response.statuses);
      setGeneratedAt(response.generatedAt);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '감시 상태를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, portfolioId]);

  useEffect(() => {
    if (!accessToken) {
      setStatuses([]);
      setError('');
      setGeneratedAt(null);
      return;
    }
    void refresh();
  }, [accessToken, refresh]);

  return (
    <section className="pf-panel pf-monitor-status" aria-labelledby="pf-monitor-status-title">
      <div className="pf-panel-head">
        <div>
          <h2 id="pf-monitor-status-title">감시 규칙 상태</h2>
          <p>규칙이 위반으로 전환되면 정기 점검에서 한 번만 알림을 보냅니다. 아직 발동하지 않았다면 그 이유도 여기서 확인합니다.</p>
        </div>
        {accessToken && (
          <button type="button" className="ui-btn ghost" disabled={loading} onClick={() => void refresh()}>
            {loading ? '갱신 중…' : '새로고침'}
          </button>
        )}
      </div>

      {!accessToken && (
        <div className="pf-workflow-demo" role="note">
          <strong>데모에서는 감시 상태를 확인할 수 없습니다.</strong>
          <span>로그인하면 규칙별 상태와 최근 위반 이력을 확인할 수 있습니다.</span>
        </div>
      )}

      {accessToken && error && <p className="pf-form-error" role="alert">{error}</p>}
      {accessToken && loading && statuses.length === 0 && <div className="pf-loading" role="status">감시 상태를 불러오고 있습니다.</div>}
      {accessToken && !loading && !error && statuses.length === 0 && (
        <p className="pf-empty">등록된 감시 규칙이 없습니다. 위에서 규칙을 추가하면 상태가 여기에 표시됩니다.</p>
      )}

      {statuses.length > 0 && (
        <div className="pf-monitor-status-list">
          {statuses.map((status) => {
            const observation = observationDetail(status.lastObservation);
            return (
              <article key={status.ruleId} className="pf-monitor-status-card">
                <header>
                  <strong>{ruleLabel(status)}</strong>
                  <div className="pf-monitor-badges">
                    <span className={`pf-monitor-state ${status.state}`}>{STATE_LABEL[status.state]}</span>
                    {status.lastOutcome && (
                      <span className={`pf-monitor-outcome ${status.lastOutcome}`}>{OUTCOME_LABEL[status.lastOutcome]}</span>
                    )}
                  </div>
                </header>
                <dl className="pf-monitor-status-meta">
                  <div><dt>마지막 평가</dt><dd>{formatDateTime(status.lastEvaluatedAt)}</dd></div>
                  <div><dt>다음 평가 예정</dt><dd>{formatDateTime(status.nextEvaluationAt)}</dd></div>
                  <div><dt>관측값</dt><dd>{formatNumber(observation.observedValue)}</dd></div>
                  <div><dt>기준값</dt><dd>{formatNumber(observation.threshold)}</dd></div>
                </dl>
                {status.lastOutcome === 'deferred' && observation.reason && (
                  <p className="pf-monitor-deferred-reason" role="status">
                    <strong>판정 보류 이유</strong>
                    <span>{observation.reason}</span>
                  </p>
                )}
                {status.recentBreaches.length > 0 && (
                  <details className="pf-monitor-breach-history">
                    <summary>최근 위반 이력 {status.recentBreaches.length}건</summary>
                    <ul>
                      {status.recentBreaches.map((breach) => <BreachRow key={breach.id} breach={breach} />)}
                    </ul>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}

      {generatedAt && statuses.length > 0 && <p className="pf-monitor-generated-at">{new Date(generatedAt).toLocaleString('ko-KR')} 기준</p>}
    </section>
  );
}
