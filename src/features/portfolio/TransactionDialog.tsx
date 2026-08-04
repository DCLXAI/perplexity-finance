import { useId, useRef, useState, type FormEvent } from 'react';
import Modal from '@/components/ui/Modal';
import { apiFetch } from '@/live/apiClient';
import type { PortfolioTransactionKind, PortfolioTransactionMutationResponse } from '@/shared/api';

const KINDS: readonly { key: Exclude<PortfolioTransactionKind, 'reversal'>; label: string }[] = Object.freeze([
  { key: 'deposit', label: '입금' },
  { key: 'buy', label: '매수' },
  { key: 'sell', label: '매도' },
  { key: 'dividend', label: '배당' },
  { key: 'withdrawal', label: '출금' },
  { key: 'fee', label: '비용' },
]);

interface TransactionDialogProps {
  readonly portfolioId: string;
  readonly accessToken: string;
  readonly onClose: () => void;
  readonly onSaved: () => Promise<void> | void;
}

function localDateTime(): string {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function TransactionDialog({ portfolioId, accessToken, onClose, onSaved }: TransactionDialogProps) {
  const titleId = useId();
  const firstRef = useRef<HTMLSelectElement>(null);
  const [kind, setKind] = useState<Exclude<PortfolioTransactionKind, 'reversal'>>('deposit');
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [fees, setFees] = useState('0');
  const [tradeAt, setTradeAt] = useState(localDateTime);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const security = kind === 'buy' || kind === 'sell';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = security
        ? {
          action: 'append',
          portfolioId,
          kind,
          symbol: symbol.trim().toUpperCase(),
          quantity: Number(quantity),
          price: Number(price),
          fees: Number(fees || 0),
          tradeAt: new Date(tradeAt).toISOString(),
          ...(note.trim() ? { note: note.trim() } : {}),
        }
        : {
          action: 'append',
          portfolioId,
          kind,
          cashAmount: Number(cashAmount),
          ...(symbol.trim() ? { symbol: symbol.trim().toUpperCase() } : {}),
          tradeAt: new Date(tradeAt).toISOString(),
          ...(note.trim() ? { note: note.trim() } : {}),
        };
      await apiFetch<PortfolioTransactionMutationResponse>('/api/portfolio/transactions', {
        method: 'POST',
        headers: { 'Idempotency-Key': globalThis.crypto.randomUUID() },
        body: JSON.stringify(body),
      }, accessToken);
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '거래를 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy={titleId} className="pf-dialog" initialFocusRef={firstRef}>
      <form onSubmit={submit}>
        <div className="pf-dialog-head">
          <div><span>APPEND-ONLY LEDGER</span><h2 id={titleId}>거래 추가</h2></div>
          <button type="button" className="pf-close" onClick={onClose} aria-label="거래 창 닫기">×</button>
        </div>
        <p className="pf-dialog-copy">저장된 거래는 수정·삭제하지 않습니다. 과거 거래는 시간순으로 입력하고, 잘못 입력한 경우 가장 최근 거래를 역분개합니다.</p>
        <div className="pf-form-grid">
          <label>
            <span>거래 종류</span>
            <select ref={firstRef} value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              {KINDS.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
            </select>
          </label>
          <label>
            <span>거래 시각</span>
            <input type="datetime-local" required value={tradeAt} onChange={(event) => setTradeAt(event.target.value)} />
          </label>
          {(security || kind === 'dividend' || kind === 'fee') && (
            <label>
              <span>심볼 {security ? '' : '· 선택'}</span>
              <input value={symbol} required={security} maxLength={20} placeholder="AMD" onChange={(event) => setSymbol(event.target.value)} />
            </label>
          )}
          {security ? (
            <>
              <label><span>수량</span><input type="number" min="0" step="any" required value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
              <label><span>체결가 · USD</span><input type="number" min="0" step="any" required value={price} onChange={(event) => setPrice(event.target.value)} /></label>
              <label><span>수수료 · USD</span><input type="number" min="0" step="any" required value={fees} onChange={(event) => setFees(event.target.value)} /></label>
            </>
          ) : (
            <label><span>현금 금액 · USD</span><input type="number" min="0" step="any" required value={cashAmount} onChange={(event) => setCashAmount(event.target.value)} /></label>
          )}
          <label className="pf-form-wide">
            <span>메모 · 선택</span>
            <textarea maxLength={500} rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>
        {error && <p className="pf-form-error" role="alert">{error}</p>}
        <div className="pf-dialog-actions">
          <button type="button" className="ui-btn" onClick={onClose}>취소</button>
          <button type="submit" className="ui-btn primary" disabled={busy}>{busy ? '저장 중…' : '원장에 추가'}</button>
        </div>
      </form>
    </Modal>
  );
}
