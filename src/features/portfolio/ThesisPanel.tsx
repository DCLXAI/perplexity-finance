import { useState } from 'react';
import { apiFetch } from '@/live/apiClient';
import type {
  InvestmentThesis,
  InvestmentThesisStatus,
  ResearchMutationResponse,
} from '@/shared/api';
import ThesisDialog from './ThesisDialog.js';

interface ThesisPanelProps {
  readonly portfolioId: string;
  readonly accessToken?: string;
  readonly theses: readonly InvestmentThesis[];
  readonly onRefresh?: () => Promise<void> | void;
  readonly demo?: boolean;
}

const STATUS_LABEL: Readonly<Record<InvestmentThesisStatus, string>> = Object.freeze({
  watching: '관찰',
  active: '활성',
  invalidated: '무효화',
  realized: '실현',
  archived: '보관',
});

export default function ThesisPanel({ portfolioId, accessToken, theses, onRefresh, demo = false }: ThesisPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const updateStatus = async (entry: InvestmentThesis, status: InvestmentThesisStatus) => {
    if (!accessToken) return;
    setBusyId(entry.id);
    setError('');
    try {
      await apiFetch<ResearchMutationResponse>('/api/research', {
        method: 'PATCH',
        body: JSON.stringify({ id: entry.id, status }),
      }, accessToken);
      await onRefresh?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '논지 상태를 변경하지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const archive = async (id: string) => {
    if (!accessToken) return;
    setBusyId(id);
    setError('');
    try {
      await apiFetch('/api/research', { method: 'DELETE', body: JSON.stringify({ id }) }, accessToken);
      await onRefresh?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '논지를 보관하지 못했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="pf-panel pf-theses" aria-labelledby="pf-theses-title">
      <div className="pf-panel-head">
        <div><h2 id="pf-theses-title">투자 논지 원장</h2><p>촉매보다 무효화 조건을 먼저 확인할 수 있게 구조화합니다.</p></div>
        {!demo && <button type="button" className="ui-btn" onClick={() => setDialogOpen(true)}>논지 추가</button>}
      </div>
      {error && <p className="pf-form-error" role="alert">{error}</p>}
      <div className="pf-thesis-list">
        {theses.map((entry) => (
          <article key={entry.id}>
            <header>
              <div><strong>{entry.symbol}</strong><span className={`pf-thesis-status ${entry.status}`}>{STATUS_LABEL[entry.status]}</span></div>
              <span className="num">확신 {entry.confidence}</span>
            </header>
            <h3>{entry.title}</h3>
            <p>{entry.thesis}</p>
            <div className="pf-thesis-cases">
              <div><span>상방</span><p>{entry.bullCase || '기록 없음'}</p></div>
              <div><span>하방</span><p>{entry.bearCase || '기록 없음'}</p></div>
            </div>
            <div className="pf-invalidation"><strong>무효화 조건</strong><p>{entry.invalidation || '반드시 추가해야 합니다.'}</p></div>
            {entry.catalysts.length > 0 && (
              <ul className="pf-catalysts">
                {[...new Set(entry.catalysts)].map((value) => <li key={value}>{value}</li>)}
              </ul>
            )}
            <footer>
              <span>{entry.targetPrice ? `목표가 $${entry.targetPrice.toLocaleString()}` : '목표가 없음'} · {new Date(entry.updatedAt).toLocaleDateString('ko-KR')}</span>
              {!demo && (
                <div>
                  <select
                    aria-label={`${entry.symbol} 논지 상태`}
                    value={entry.status}
                    disabled={busyId === entry.id}
                    onChange={(event) => void updateStatus(entry, event.target.value as InvestmentThesisStatus)}
                  >
                    {Object.entries(STATUS_LABEL).filter(([key]) => key !== 'archived').map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <button type="button" className="ui-btn ghost" disabled={busyId === entry.id} onClick={() => void archive(entry.id)}>보관</button>
                </div>
              )}
            </footer>
          </article>
        ))}
        {!theses.length && <p className="pf-empty">투자 논지가 없습니다. 보유 이유와 틀렸음을 인정할 조건부터 기록하세요.</p>}
      </div>
      {dialogOpen && accessToken && (
        <ThesisDialog
          portfolioId={portfolioId}
          accessToken={accessToken}
          onClose={() => setDialogOpen(false)}
          onSaved={async () => { await onRefresh?.(); }}
        />
      )}
    </section>
  );
}
