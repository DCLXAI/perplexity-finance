import { useId, useRef, useState, type FormEvent } from 'react';
import Modal from '@/components/ui/Modal';
import { apiFetch } from '@/live/apiClient';
import type { PortfolioMutationResponse, PortfolioRecord } from '@/shared/api';

interface CreatePortfolioDialogProps {
  readonly accessToken: string;
  readonly onClose: () => void;
  readonly onCreated: (portfolio: PortfolioRecord) => Promise<void> | void;
}

export default function CreatePortfolioDialog({ accessToken, onClose, onCreated }: CreatePortfolioDialogProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('장기 투자');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch<PortfolioMutationResponse>('/api/portfolios', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      }, accessToken);
      await onCreated(response.portfolio);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '포트폴리오를 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy={titleId} className="pf-dialog pf-create-dialog" initialFocusRef={inputRef}>
      <form onSubmit={submit}>
        <div className="pf-dialog-head">
          <div><span>PERSONAL DECISION LEDGER</span><h2 id={titleId}>새 포트폴리오</h2></div>
          <button type="button" className="pf-close" onClick={onClose} aria-label="창 닫기">×</button>
        </div>
        <label className="pf-single-field"><span>이름</span><input ref={inputRef} required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label>
        {error && <p className="pf-form-error" role="alert">{error}</p>}
        <div className="pf-dialog-actions">
          <button type="button" className="ui-btn" onClick={onClose}>취소</button>
          <button type="submit" className="ui-btn primary" disabled={busy}>{busy ? '생성 중…' : '포트폴리오 생성'}</button>
        </div>
      </form>
    </Modal>
  );
}
