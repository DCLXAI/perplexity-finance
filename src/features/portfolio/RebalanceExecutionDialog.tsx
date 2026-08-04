import { useId, useRef, useState, type FormEvent } from 'react';
import Modal from '@/components/ui/Modal';
import type {
  PortfolioRebalanceExecutionLink,
  PortfolioRebalanceRun,
} from '@/shared/api';
import { enteredSlippage, signedUsd, usd } from './order-cost-ui.js';

interface RebalanceExecutionDialogProps {
  readonly run: PortfolioRebalanceRun;
  readonly onClose: () => void;
  readonly onSubmit: (fills: readonly PortfolioRebalanceExecutionLink[]) => Promise<void>;
}

interface FillDraft {
  readonly itemId: string;
  readonly symbol: string;
  readonly action: 'buy' | 'sell';
  readonly plannedQuantity?: number;
  readonly referencePrice?: number;
  readonly quantity: string;
  readonly price: string;
  readonly fees: string;
  readonly tradeAt: string;
}

function localDateTime(value = new Date()): string {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

export function RebalanceExecutionDialog({
  run,
  onClose,
  onSubmit,
}: RebalanceExecutionDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const firstRef = useRef<HTMLInputElement>(null);
  const [fills, setFills] = useState<readonly FillDraft[]>(() => run.items
    .filter((item): item is typeof item & { action: 'buy' | 'sell' } => item.action !== 'hold')
    .map((item) => ({
      itemId: item.id,
      symbol: item.symbol,
      action: item.action,
      plannedQuantity: item.estimatedQuantity,
      referencePrice: item.referencePrice,
      quantity: item.estimatedQuantity === undefined ? '' : String(item.estimatedQuantity),
      price: item.referencePrice === undefined ? '' : String(item.referencePrice),
      fees: '0',
      tradeAt: localDateTime(),
    })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const itemById = new Map(run.items.map((item) => [item.id, item]));

  const close = () => {
    if (!busy) onClose();
  };

  const updateFill = (itemId: string, patch: Partial<Pick<FillDraft, 'quantity' | 'price' | 'fees' | 'tradeAt'>>) => {
    setFills((current) => current.map((fill) => fill.itemId === itemId ? { ...fill, ...patch } : fill));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const invalidDraft = fills.some((fill) => !Number.isFinite(Number(fill.quantity)) || Number(fill.quantity) <= 0
      || (fill.plannedQuantity !== undefined && Number(fill.quantity) > fill.plannedQuantity + 1e-9)
      || !Number.isFinite(Number(fill.price)) || Number(fill.price) <= 0
      || !Number.isFinite(Number(fill.fees || 0)) || Number(fill.fees || 0) < 0
      || Number.isNaN(Date.parse(fill.tradeAt)));
    if (invalidDraft || fills.length === 0) {
      setError('모든 제안 주문의 실제 수량·체결가·체결 시각을 확인해 주세요.');
      return;
    }
    const normalized = fills.map((fill) => ({
      itemId: fill.itemId,
      quantity: Number(fill.quantity),
      price: Number(fill.price),
      fees: Number(fill.fees || 0),
      tradeAt: new Date(Date.parse(fill.tradeAt)).toISOString(),
    }));

    setBusy(true);
    setError('');
    try {
      await onSubmit(normalized);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '실제 체결을 원장에 반영하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={close}
      labelledBy={titleId}
      describedBy={descriptionId}
      className="pf-dialog pf-rebalance-execution-dialog"
      initialFocusRef={firstRef}
    >
      <form onSubmit={submit} aria-busy={busy}>
        <div className="pf-dialog-head">
          <div>
            <span>P7 VERIFIED EXECUTION</span>
            <h2 id={titleId}>실제 체결 원장 반영</h2>
            <p id={descriptionId} className="pf-dialog-copy">
              승인된 계획과 실제 체결을 연결합니다. 아래 입력을 저장하면 거래 원장에 반영되며, 브로커 주문은 실행하지 않습니다.
            </p>
          </div>
          <button type="button" className="pf-close" disabled={busy} onClick={close} aria-label="실제 체결 입력 닫기">×</button>
        </div>

        <div className="pf-execution-summary" role="note">
          <strong>계획 {run.id.slice(0, 8)}</strong>
          <span>승인 {run.approvedAt ? new Date(run.approvedAt).toLocaleString('ko-KR') : '—'}</span>
          <span>계획 총비용 {usd(run.estimatedCosts.total)} · 수수료 {usd(run.estimatedCosts.commission)} · 슬리피지 {signedUsd(run.estimatedCosts.slippage)} · 추정세금 {usd(run.estimatedCosts.tax)}</span>
          <span>가격 변동·현금·최소 주문금액은 저장 직전에 서버에서 다시 검증합니다.</span>
        </div>

        <div className="pf-execution-list">
          {fills.map((fill, index) => {
            const enteredPrice = Number(fill.price);
            const enteredQuantity = Number(fill.quantity);
            const enteredFees = Number(fill.fees || 0);
            const priceMove = fill.referencePrice && Number.isFinite(enteredPrice)
              ? ((enteredPrice / fill.referencePrice) - 1) * 100
              : undefined;
            const adversePriceMove = priceMove !== undefined
              && (fill.action === 'buy' ? priceMove > 3 : priceMove < -3);
            const slippage = enteredSlippage(fill.action, enteredQuantity, enteredPrice, fill.referencePrice);
            const enteredExecutionCost = slippage === undefined || !Number.isFinite(enteredFees)
              ? undefined
              : Math.round((enteredFees + slippage) * 100) / 100;
            const planned = itemById.get(fill.itemId);
            const plannedExecutionCost = planned
              ? planned.estimatedCosts.commission + planned.estimatedCosts.slippage
              : undefined;
            return (
              <fieldset key={fill.itemId} className="pf-execution-fill">
                <legend>
                  <span className={`pf-trade-action ${fill.action}`}>{fill.action === 'buy' ? '매수' : '매도'}</span>
                  <strong>{fill.symbol}</strong>
                  <small>
                    계획 {fill.plannedQuantity?.toLocaleString(undefined, { maximumFractionDigits: 8 }) ?? '—'}주
                    {' · '}기준가 {fill.referencePrice === undefined ? '—' : usd(fill.referencePrice)}
                    {planned ? ` · 계획 비용 ${usd(planned.estimatedCosts.total)}` : ''}
                  </small>
                </legend>
                <div className="pf-execution-fields">
                  <label>
                    <span>실제 수량</span>
                    <input
                      ref={index === 0 ? firstRef : undefined}
                      type="number"
                      min="0"
                      max={fill.plannedQuantity}
                      step="0.000000000001"
                      required
                      value={fill.quantity}
                      onChange={(event) => updateFill(fill.itemId, { quantity: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>실제 체결가 · USD</span>
                    <input
                      type="number"
                      min="0"
                      step="0.00000001"
                      required
                      value={fill.price}
                      onChange={(event) => updateFill(fill.itemId, { price: event.target.value })}
                    />
                    {priceMove !== undefined && (
                      <small className={adversePriceMove ? 'neg' : ''}>기준가 대비 {priceMove > 0 ? '+' : ''}{priceMove.toFixed(2)}%</small>
                    )}
                  </label>
                  <label>
                    <span>수수료 · USD</span>
                    <input
                      type="number"
                      min="0"
                      step="0.00000001"
                      required
                      value={fill.fees}
                      onChange={(event) => updateFill(fill.itemId, { fees: event.target.value })}
                    />
                    {planned && <small>계획 수수료 {usd(planned.estimatedCosts.commission)}</small>}
                  </label>
                  <label>
                    <span>체결 시각</span>
                    <input
                      type="datetime-local"
                      min={run.approvedAt ? localDateTime(new Date(run.approvedAt)) : undefined}
                      required
                      value={fill.tradeAt}
                      onChange={(event) => updateFill(fill.itemId, { tradeAt: event.target.value })}
                    />
                  </label>
                </div>
                <output className="pf-entered-cost" aria-live="polite">
                  {slippage === undefined || enteredExecutionCost === undefined
                    ? '수량과 체결가를 입력하면 체결 슬리피지와 수수료 합계를 비교합니다.'
                    : `입력 기준 슬리피지 ${signedUsd(slippage)} · 수수료 포함 실행비용 ${signedUsd(enteredExecutionCost)}${plannedExecutionCost === undefined ? '' : ` · 수수료·슬리피지 계획 대비 ${signedUsd(enteredExecutionCost - plannedExecutionCost)}`}`}
                </output>
              </fieldset>
            );
          })}
        </div>

        <p className="pf-execution-warning">
          기준가 대비 변동이 크거나 계획이 만료된 경우 현재 계획은 만료 처리되고 새 계획의 재승인이 필요합니다. 세금은 입력받지 않고 서버가 실행 당시 FIFO 비용 정책으로 다시 추정합니다. 체결 기준 추정세금은 원장 납부액이나 세무 자문이 아닙니다. 모든 거래는 한 번에 반영되며 하나라도 실패하면 원장 전체가 변경되지 않습니다.
        </p>
        {error && <p className="pf-form-error" role="alert">{error}</p>}
        <div className="pf-dialog-actions">
          <button type="button" className="ui-btn" disabled={busy} onClick={close}>취소</button>
          <button type="submit" className="ui-btn primary" disabled={busy || fills.length === 0}>
            {busy ? '검증·반영 중…' : '검증 후 원장 반영'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
