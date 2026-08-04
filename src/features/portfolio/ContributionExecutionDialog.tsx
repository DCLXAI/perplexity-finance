import { useId, useRef, useState, type FormEvent } from 'react';
import Modal from '../../components/ui/Modal.js';
import type {
  PortfolioContributionRun,
  PortfolioRebalanceExecutionLink,
} from '../../shared/api.js';
import { enteredSlippage, signedUsd, usd } from './order-cost-ui.js';

interface ContributionExecutionDialogProps {
  readonly run: PortfolioContributionRun;
  readonly onClose: () => void;
  readonly onSubmit: (
    depositAt: string,
    fills: readonly PortfolioRebalanceExecutionLink[],
  ) => Promise<void>;
}

interface FillDraft {
  readonly itemId: string;
  readonly symbol: string;
  readonly plannedQuantity?: number;
  readonly referencePrice?: number;
  readonly quantity: string;
  readonly price: string;
  readonly fees: string;
}

function localDateTime(value = new Date()): string {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

export function ContributionExecutionDialog({ run, onClose, onSubmit }: ContributionExecutionDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const firstRef = useRef<HTMLInputElement>(null);
  const [depositAt, setDepositAt] = useState(localDateTime());
  const [fills, setFills] = useState<readonly FillDraft[]>(() => run.items
    .filter((item) => item.action === 'buy')
    .map((item) => ({
      itemId: item.id,
      symbol: item.symbol,
      plannedQuantity: item.estimatedQuantity,
      referencePrice: item.referencePrice,
      quantity: item.estimatedQuantity === undefined ? '' : String(item.estimatedQuantity),
      price: item.referencePrice === undefined ? '' : String(item.referencePrice),
      fees: '0',
    })));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const itemById = new Map(run.items.map((item) => [item.id, item]));

  const updateFill = (itemId: string, patch: Partial<Pick<FillDraft, 'quantity' | 'price' | 'fees'>>) => {
    setFills((current) => current.map((fill) => fill.itemId === itemId ? { ...fill, ...patch } : fill));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const depositTime = Date.parse(depositAt);
    const invalidFill = fills.some((fill) => (
      !Number.isFinite(Number(fill.quantity))
      || Number(fill.quantity) <= 0
      || (fill.plannedQuantity !== undefined && Number(fill.quantity) > fill.plannedQuantity + 1e-9)
      || !Number.isFinite(Number(fill.price))
      || Number(fill.price) <= 0
      || !Number.isFinite(Number(fill.fees))
      || Number(fill.fees) < 0
    ));
    if (Number.isNaN(depositTime) || invalidFill) {
      setError('실제 입금 시각과 각 매수의 수량·체결가·수수료를 확인해 주세요.');
      return;
    }

    const depositAtISO = new Date(depositTime).toISOString();
    const normalized = fills.map((fill): PortfolioRebalanceExecutionLink => ({
      itemId: fill.itemId,
      quantity: Number(fill.quantity),
      price: Number(fill.price),
      fees: Number(fill.fees),
      tradeAt: depositAtISO,
    }));
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(depositAtISO, normalized);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '실제 입금과 체결 내역을 반영하지 못했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    if (!submitting) onClose();
  };

  return (
    <Modal
      onClose={close}
      labelledBy={titleId}
      describedBy={descriptionId}
      className="gc-dialog gc-execution-dialog"
      initialFocusRef={firstRef}
    >
      <form onSubmit={submit} aria-busy={submitting}>
        <header className="gc-dialog-head">
          <div>
            <span>P8 VERIFIED CONTRIBUTION</span>
            <h2 id={titleId}>실제 적립 내역 반영</h2>
            <p id={descriptionId}>승인된 계획에 실제 입금 시각과 매수 체결 내역을 연결합니다.</p>
          </div>
          <button type="button" className="gc-close" disabled={submitting} onClick={close} aria-label="적립 내역 창 닫기">×</button>
        </header>

        <dl className="gc-execution-summary">
          <div><dt>계획 적립금</dt><dd>{usd(run.contributionAmount)}</dd></div>
          <div><dt>비용 반영 후 현금 유지</dt><dd>{usd(Math.max(0, run.estimatedCashAfter - run.cashBalance))}</dd></div>
          <div><dt>계획 총비용</dt><dd>{usd(run.estimatedCosts.total)}</dd></div>
          <div><dt>계획 수수료</dt><dd>{usd(run.estimatedCosts.commission)}</dd></div>
          <div><dt>계획 슬리피지</dt><dd>{signedUsd(run.estimatedCosts.slippage)}</dd></div>
          <div><dt>계획 번호</dt><dd>{run.id.slice(0, 8)}</dd></div>
        </dl>

        <label className="gc-field gc-field-wide">
          <span>실제 입금 시각</span>
          <input
            ref={firstRef}
            type="datetime-local"
            required
            value={depositAt}
            onChange={(event) => setDepositAt(event.target.value)}
          />
        </label>

        {fills.length === 0 ? (
          <div className="gc-empty-note" role="note">이 계획은 목표 현금만 유지하므로 기록할 매수 체결이 없습니다.</div>
        ) : (
          <div className="gc-fill-list">
            {fills.map((fill) => {
              const price = Number(fill.price);
              const quantity = Number(fill.quantity);
              const fees = Number(fill.fees);
              const movePct = fill.referencePrice && Number.isFinite(price)
                ? (price / fill.referencePrice - 1) * 100
                : undefined;
              const slippage = enteredSlippage('buy', quantity, price, fill.referencePrice);
              const enteredExecutionCost = slippage === undefined || !Number.isFinite(fees)
                ? undefined
                : Math.round((fees + slippage) * 100) / 100;
              const planned = itemById.get(fill.itemId);
              const plannedExecutionCost = planned
                ? planned.estimatedCosts.commission + planned.estimatedCosts.slippage
                : undefined;
              return (
                <fieldset key={fill.itemId} className="gc-fill">
                  <legend>
                    <strong>{fill.symbol}</strong>
                    <span>계획 {fill.plannedQuantity?.toLocaleString(undefined, { maximumFractionDigits: 8 }) ?? '—'}주 · 기준가 {fill.referencePrice === undefined ? '—' : usd(fill.referencePrice)}{planned ? ` · 계획 비용 ${usd(planned.estimatedCosts.total)}` : ''}</span>
                  </legend>
                  <div className="gc-form-grid">
                    <label className="gc-field">
                      <span>실제 수량</span>
                      <input type="number" min="0" max={fill.plannedQuantity} step="0.000000000001" required value={fill.quantity} onChange={(event) => updateFill(fill.itemId, { quantity: event.target.value })} />
                    </label>
                    <label className="gc-field">
                      <span>실제 체결가 · USD</span>
                      <input type="number" min="0" step="0.00000001" required value={fill.price} onChange={(event) => updateFill(fill.itemId, { price: event.target.value })} />
                      {movePct !== undefined && <small className={movePct > 3 ? 'gc-negative' : ''}>기준가 대비 {movePct > 0 ? '+' : ''}{movePct.toFixed(2)}%</small>}
                    </label>
                    <label className="gc-field">
                      <span>수수료 · USD</span>
                      <input type="number" min="0" step="0.00000001" required value={fill.fees} onChange={(event) => updateFill(fill.itemId, { fees: event.target.value })} />
                      {planned && <small>계획 수수료 {usd(planned.estimatedCosts.commission)}</small>}
                    </label>
                  </div>
                  <output className="gc-entered-cost" aria-live="polite">
                    {slippage === undefined || enteredExecutionCost === undefined
                      ? '수량과 체결가를 입력하면 체결 슬리피지와 수수료 합계를 비교합니다.'
                      : `입력 기준 슬리피지 ${signedUsd(slippage)} · 수수료 포함 실행비용 ${signedUsd(enteredExecutionCost)}${plannedExecutionCost === undefined ? '' : ` · 수수료·슬리피지 계획 대비 ${signedUsd(enteredExecutionCost - plannedExecutionCost)}`}`}
                  </output>
                </fieldset>
              );
            })}
          </div>
        )}

        <p className="gc-form-note">이 입력은 사용자가 이미 실행한 입금과 매수를 원장에 기록할 뿐, 은행 이체나 브로커 주문을 실행하지 않습니다. 적립 계획은 매수 전용이므로 양도세를 입력하지 않으며, 서버가 체결가 기준 수수료·슬리피지를 다시 계산합니다.</p>
        {error && <p className="gc-error" role="alert">{error}</p>}
        <footer className="gc-dialog-actions">
          <button type="button" className="ui-btn" disabled={submitting} onClick={close}>취소</button>
          <button type="submit" className="ui-btn primary" disabled={submitting}>{submitting ? '검증 중…' : '입금·체결 반영'}</button>
        </footer>
      </form>
    </Modal>
  );
}
