import { useId, useRef, useState, type FormEvent } from 'react';
import Modal from '@/components/ui/Modal';
import { apiFetch } from '@/live/apiClient';
import type { InvestmentThesis, MonitorRuleKind, ResearchMutationResponse } from '@/shared/api';
import MonitorRuleEditor from './MonitorRuleEditor.js';

const MONITOR_KINDS_THESIS: readonly MonitorRuleKind[] = Object.freeze(['thesis_invalidation']);

interface ThesisDialogProps {
  readonly portfolioId: string;
  readonly accessToken: string;
  readonly onClose: () => void;
  readonly onSaved: () => Promise<void> | void;
}

export default function ThesisDialog({ portfolioId, accessToken, onClose, onSaved }: ThesisDialogProps) {
  const titleId = useId();
  const firstRef = useRef<HTMLInputElement>(null);
  const [symbol, setSymbol] = useState('');
  const [title, setTitle] = useState('');
  const [thesis, setThesis] = useState('');
  const [bullCase, setBullCase] = useState('');
  const [bearCase, setBearCase] = useState('');
  const [catalysts, setCatalysts] = useState('');
  const [invalidation, setInvalidation] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [confidence, setConfidence] = useState('50');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Set once the thesis row is persisted. A monitor rule needs a real thesisId to link to
  // (server/monitors/rules.ts rejects nothing here, but the association would otherwise never
  // be created), so the rule editor for `thesis_invalidation` only appears after this save
  // succeeds -- it can never produce an orphaned rule pointing at a thesis that doesn't exist.
  const [savedThesis, setSavedThesis] = useState<InvestmentThesis | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch<ResearchMutationResponse>('/api/research', {
        method: 'POST',
        body: JSON.stringify({
          portfolioId,
          symbol: symbol.trim().toUpperCase(),
          title: title.trim(),
          thesis: thesis.trim(),
          bullCase: bullCase.trim(),
          bearCase: bearCase.trim(),
          catalysts: [...new Set(catalysts.split(',').map((value) => value.trim()).filter(Boolean))].slice(0, 12),
          invalidation: invalidation.trim(),
          ...(targetPrice ? { targetPrice: Number(targetPrice) } : {}),
          confidence: Number(confidence),
          status: 'watching',
        }),
      }, accessToken);
      await onSaved();
      setSavedThesis(response.thesis);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '투자 논지를 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (savedThesis) {
    return (
      <Modal onClose={onClose} labelledBy={titleId} className="pf-dialog pf-thesis-dialog">
        <div className="pf-dialog-head">
          <div><span>RESEARCH LEDGER</span><h2 id={titleId}>{savedThesis.symbol} 논지 저장 완료</h2></div>
          <button type="button" className="pf-close" onClick={onClose} aria-label="논지 창 닫기">×</button>
        </div>
        <p className="pf-dialog-copy">
          위 무효화 조건은 사람이 읽는 기록입니다. 아래 규칙을 등록해야 실제로 조건을 감시하고 위반 시 한 번만 알림을 보냅니다.
        </p>
        <MonitorRuleEditor
          portfolioId={portfolioId}
          thesisId={savedThesis.id}
          symbol={savedThesis.symbol}
          allowedKinds={MONITOR_KINDS_THESIS}
          accessToken={accessToken}
        />
        <div className="pf-dialog-actions">
          <button type="button" className="ui-btn primary" onClick={onClose}>완료</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} labelledBy={titleId} className="pf-dialog pf-thesis-dialog" initialFocusRef={firstRef}>
      <form onSubmit={submit}>
        <div className="pf-dialog-head">
          <div><span>RESEARCH LEDGER</span><h2 id={titleId}>투자 논지 기록</h2></div>
          <button type="button" className="pf-close" onClick={onClose} aria-label="논지 창 닫기">×</button>
        </div>
        <p className="pf-dialog-copy">주장, 반대 논거, 촉매와 무효화 조건을 분리해 기록합니다. 확신도는 사실의 정확도가 아니라 현재 판단 강도입니다.</p>
        <div className="pf-form-grid">
          <label><span>심볼</span><input ref={firstRef} required maxLength={20} placeholder="AMD" value={symbol} onChange={(event) => setSymbol(event.target.value)} /></label>
          <label><span>확신도 · 0~100</span><input type="number" min="0" max="100" required value={confidence} onChange={(event) => setConfidence(event.target.value)} /></label>
          <label className="pf-form-wide"><span>제목</span><input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="pf-form-wide"><span>핵심 논지</span><textarea required maxLength={6000} rows={4} value={thesis} onChange={(event) => setThesis(event.target.value)} /></label>
          <label><span>상방 근거</span><textarea maxLength={4000} rows={4} value={bullCase} onChange={(event) => setBullCase(event.target.value)} /></label>
          <label><span>하방 근거</span><textarea maxLength={4000} rows={4} value={bearCase} onChange={(event) => setBearCase(event.target.value)} /></label>
          <label className="pf-form-wide"><span>촉매 · 쉼표로 구분</span><input value={catalysts} onChange={(event) => setCatalysts(event.target.value)} /></label>
          <label className="pf-form-wide"><span>무효화 조건</span><textarea maxLength={3000} rows={3} value={invalidation} onChange={(event) => setInvalidation(event.target.value)} /></label>
          <p className="pf-monitor-precondition pf-form-wide">
            감시 규칙은 논지를 저장한 뒤에 추가할 수 있습니다. 저장하면 바로 이어서 이 무효화 조건을 실제로 감시할 규칙을 만들 수 있습니다.
          </p>
          <label><span>목표가 · 선택</span><input type="number" min="0" step="any" value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} /></label>
        </div>
        {error && <p className="pf-form-error" role="alert">{error}</p>}
        <div className="pf-dialog-actions">
          <button type="button" className="ui-btn" onClick={onClose}>취소</button>
          <button type="submit" className="ui-btn primary" disabled={busy}>{busy ? '저장 중…' : '논지 저장'}</button>
        </div>
      </form>
    </Modal>
  );
}
