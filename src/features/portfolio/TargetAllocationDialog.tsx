import { useId, useRef, useState, type FormEvent } from 'react';
import Modal from '@/components/ui/Modal';
import { validateAllocationTargets } from '@/domain/portfolio/rebalance';
import { apiFetch } from '@/live/apiClient';
import type {
  PortfolioAllocationPolicy,
  PortfolioAllocationResponse,
  PortfolioAllocationTarget,
  PortfolioOrderCostPolicy,
  PortfolioSummary,
} from '@/shared/api';

interface TargetAllocationDialogProps {
  readonly summary: PortfolioSummary;
  readonly policy: PortfolioAllocationPolicy | null;
  readonly accessToken?: string;
  readonly demo?: boolean;
  readonly onClose: () => void;
  readonly onSaved: (policy: PortfolioAllocationPolicy) => Promise<void> | void;
}

interface TargetDraft {
  readonly id: string;
  readonly symbol: string;
  readonly targetPct: string;
}

const DEFAULT_COST_POLICY: PortfolioOrderCostPolicy = Object.freeze({
  commissionFixedUsd: 0,
  commissionBps: 0,
  buySlippageBps: 5,
  sellSlippageBps: 5,
  sellTransactionTaxBps: 0,
  capitalGainsTaxPct: 0,
  maxCostPct: 2,
  taxLotMethod: 'fifo',
});

function id(): string {
  return globalThis.crypto?.randomUUID?.() ?? `target-${Date.now()}-${Math.random()}`;
}

function defaultTargets(summary: PortfolioSummary): readonly PortfolioAllocationTarget[] {
  const values = [
    ...summary.holdings.flatMap((holding) => holding.marketValue && holding.marketValue > 0
      ? [{ symbol: holding.symbol, value: holding.marketValue }]
      : []),
    ...(summary.cashBalance > 0 ? [{ symbol: 'CASH', value: summary.cashBalance }] : []),
  ];
  if (values.length === 0 || summary.totalValue <= 0) return Object.freeze([Object.freeze({ symbol: 'CASH', targetPct: 100 })]);
  let allocated = 0;
  return Object.freeze(values.map((entry, index) => {
    const targetPct = index === values.length - 1
      ? Math.round((100 - allocated) * 100) / 100
      : Math.round((entry.value / summary.totalValue) * 10_000) / 100;
    allocated += targetPct;
    return Object.freeze({ symbol: entry.symbol, targetPct });
  }));
}

export default function TargetAllocationDialog({
  summary,
  policy,
  accessToken,
  demo = false,
  onClose,
  onSaved,
}: TargetAllocationDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const costDescriptionId = useId();
  const firstRef = useRef<HTMLInputElement>(null);
  const initialTargets = policy?.targets ?? defaultTargets(summary);
  const initialCostPolicy = policy?.costPolicy ?? DEFAULT_COST_POLICY;
  const [targets, setTargets] = useState<readonly TargetDraft[]>(() => initialTargets.map((target) => ({
    id: id(),
    symbol: target.symbol,
    targetPct: String(target.targetPct),
  })));
  const [driftThresholdPct, setDriftThresholdPct] = useState(String(policy?.driftThresholdPct ?? 5));
  const [minTradeValue, setMinTradeValue] = useState(String(policy?.minTradeValue ?? 100));
  const [emailEnabled, setEmailEnabled] = useState(policy?.emailEnabled ?? false);
  const [pushEnabled, setPushEnabled] = useState(policy?.pushEnabled ?? false);
  const [commissionFixedUsd, setCommissionFixedUsd] = useState(String(initialCostPolicy.commissionFixedUsd));
  const [commissionBps, setCommissionBps] = useState(String(initialCostPolicy.commissionBps));
  const [buySlippageBps, setBuySlippageBps] = useState(String(initialCostPolicy.buySlippageBps));
  const [sellSlippageBps, setSellSlippageBps] = useState(String(initialCostPolicy.sellSlippageBps));
  const [sellTransactionTaxBps, setSellTransactionTaxBps] = useState(String(initialCostPolicy.sellTransactionTaxBps));
  const [capitalGainsTaxPct, setCapitalGainsTaxPct] = useState(String(initialCostPolicy.capitalGainsTaxPct));
  const [maxCostPct, setMaxCostPct] = useState(String(initialCostPolicy.maxCostPct));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const total = targets.reduce((sum, target) => sum + (Number(target.targetPct) || 0), 0);

  const updateTarget = (targetId: string, patch: Partial<Pick<TargetDraft, 'symbol' | 'targetPct'>>) => {
    setTargets((current) => current.map((target) => target.id === targetId ? { ...target, ...patch } : target));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedTargets = targets.map((target) => ({
      symbol: target.symbol.trim().toUpperCase(),
      targetPct: Number(target.targetPct),
    }));
    const warnings = validateAllocationTargets(normalizedTargets);
    const drift = Number(driftThresholdPct);
    const minimum = Number(minTradeValue);
    const costPolicy: PortfolioOrderCostPolicy = {
      commissionFixedUsd: Number(commissionFixedUsd),
      commissionBps: Number(commissionBps),
      buySlippageBps: Number(buySlippageBps),
      sellSlippageBps: Number(sellSlippageBps),
      sellTransactionTaxBps: Number(sellTransactionTaxBps),
      capitalGainsTaxPct: Number(capitalGainsTaxPct),
      maxCostPct: Number(maxCostPct),
      taxLotMethod: 'fifo',
    };
    const costDrafts = [
      commissionFixedUsd,
      commissionBps,
      buySlippageBps,
      sellSlippageBps,
      sellTransactionTaxBps,
      capitalGainsTaxPct,
      maxCostPct,
    ];
    const costValues = [
      costPolicy.commissionFixedUsd,
      costPolicy.commissionBps,
      costPolicy.buySlippageBps,
      costPolicy.sellSlippageBps,
      costPolicy.sellTransactionTaxBps,
      costPolicy.capitalGainsTaxPct,
      costPolicy.maxCostPct,
    ];
    const invalidCostPolicy = costDrafts.some((value) => value.trim() === '')
      || costValues.some((value) => !Number.isFinite(value) || value < 0)
      || costPolicy.commissionFixedUsd > 1e9
      || costPolicy.commissionBps > 10_000
      || costPolicy.buySlippageBps > 10_000
      || costPolicy.sellSlippageBps > 10_000
      || costPolicy.sellTransactionTaxBps > 10_000
      || costPolicy.capitalGainsTaxPct > 100
      || costPolicy.maxCostPct > 100;
    if (warnings.length > 0 || !Number.isFinite(drift) || drift <= 0 || drift > 100 || !Number.isFinite(minimum) || minimum < 0) {
      setError(warnings[0] ?? '편차 임계치와 최소 주문금액을 확인하세요.');
      return;
    }
    if (invalidCostPolicy) {
      setError('수수료·슬리피지·세금·최대 비용 가정의 범위를 확인하세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let saved: PortfolioAllocationPolicy;
      if (demo || !accessToken) {
        saved = Object.freeze({
          portfolioId: summary.portfolio.id,
          driftThresholdPct: drift,
          minTradeValue: minimum,
          emailEnabled,
          pushEnabled,
          costPolicy: Object.freeze(costPolicy),
          targets: Object.freeze(normalizedTargets.map((target) => Object.freeze(target))),
          updatedAt: new Date().toISOString(),
        });
      } else {
        const response = await apiFetch<PortfolioAllocationResponse>('/api/portfolio/allocation', {
          method: 'PUT',
          body: JSON.stringify({
            portfolioId: summary.portfolio.id,
            driftThresholdPct: drift,
            minTradeValue: minimum,
            emailEnabled,
            pushEnabled,
            costPolicy,
            targets: normalizedTargets,
          }),
        }, accessToken);
        if (!response.policy) throw new Error('저장된 목표배분을 불러오지 못했습니다.');
        saved = response.policy;
      }
      await onSaved(saved);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '목표배분을 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Modal
      onClose={close}
      labelledBy={titleId}
      describedBy={descriptionId}
      className="pf-dialog pf-allocation-dialog"
      initialFocusRef={firstRef}
    >
      <form onSubmit={submit} aria-busy={busy}>
        <div className="pf-dialog-head">
          <div>
            <span>P9 COST-AWARE ALLOCATION</span>
            <h2 id={titleId}>목표배분 설정</h2>
            <p id={descriptionId} className="pf-dialog-copy">모든 목표 비중의 합계는 100%여야 합니다. CASH를 현금 목표로 사용할 수 있습니다.</p>
          </div>
          <button type="button" className="pf-close" disabled={busy} onClick={close} aria-label="닫기">×</button>
        </div>

        <div className="pf-allocation-settings">
          <label><span>리밸런싱 편차 임계치 · %</span><input type="number" min="0.01" max="100" step="0.01" required value={driftThresholdPct} onChange={(event) => setDriftThresholdPct(event.target.value)} /></label>
          <label><span>최소 주문금액 · USD</span><input type="number" min="0" step="0.01" required value={minTradeValue} onChange={(event) => setMinTradeValue(event.target.value)} /></label>
        </div>

        <fieldset className="pf-allocation-notifications">
          <legend>P7 자동 편차 알림</legend>
          <label>
            <input type="checkbox" checked={emailEnabled} onChange={(event) => setEmailEnabled(event.target.checked)} />
            <span>이메일 알림</span>
          </label>
          <label>
            <input type="checkbox" checked={pushEnabled} onChange={(event) => setPushEnabled(event.target.checked)} />
            <span>Web Push 알림</span>
          </label>
          <p>Hobby 배포에서는 일일 유지관리 때 한 번 확인합니다. 알림은 주문 제안이며 자동 주문이 아닙니다.</p>
        </fieldset>

        <fieldset className="pf-cost-policy-fields" aria-describedby={costDescriptionId}>
          <legend>P9 주문 비용 가정</legend>
          <label><span>주문당 고정 수수료 · USD</span><input type="number" min="0" max="1000000000" step="0.01" required value={commissionFixedUsd} onChange={(event) => setCommissionFixedUsd(event.target.value)} /></label>
          <label><span>비율 수수료 · bp</span><input type="number" min="0" max="10000" step="0.01" required value={commissionBps} onChange={(event) => setCommissionBps(event.target.value)} /></label>
          <label><span>매수 슬리피지 · bp</span><input type="number" min="0" max="10000" step="0.01" required value={buySlippageBps} onChange={(event) => setBuySlippageBps(event.target.value)} /></label>
          <label><span>매도 슬리피지 · bp</span><input type="number" min="0" max="10000" step="0.01" required value={sellSlippageBps} onChange={(event) => setSellSlippageBps(event.target.value)} /></label>
          <label><span>매도 거래세 · bp</span><input type="number" min="0" max="10000" step="0.01" required value={sellTransactionTaxBps} onChange={(event) => setSellTransactionTaxBps(event.target.value)} /></label>
          <label><span>양도소득세율 · %</span><input type="number" min="0" max="100" step="0.01" required value={capitalGainsTaxPct} onChange={(event) => setCapitalGainsTaxPct(event.target.value)} /></label>
          <label><span>허용 최대 비용 · 주문금액 %</span><input type="number" min="0" max="100" step="0.01" required value={maxCostPct} onChange={(event) => setMaxCostPct(event.target.value)} /></label>
          <div className="pf-cost-lot-method"><span>세금 lot 방식</span><strong>FIFO · 선입선출 고정</strong></div>
          <p id={costDescriptionId}>모든 값은 주문 최적화를 위한 추정 가정입니다. 체결 기준 추정세금은 실제 신고·납부액이 아니며 세무 자문을 대신하지 않습니다.</p>
        </fieldset>

        <div className="pf-target-editor">
          <div className="pf-target-editor-head"><strong>목표 자산</strong><span className={Math.abs(total - 100) <= 0.01 ? 'pos' : 'neg'}>합계 {total.toFixed(2)}%</span></div>
          {targets.map((target, index) => (
            <div className="pf-target-row" key={target.id}>
              <label>
                <span className="sr-only">심볼</span>
                <input
                  ref={index === 0 ? firstRef : undefined}
                  required
                  maxLength={20}
                  placeholder="SPY"
                  value={target.symbol}
                  onChange={(event) => updateTarget(target.id, { symbol: event.target.value.toUpperCase() })}
                />
              </label>
              <label>
                <span className="sr-only">목표 비중</span>
                <input type="number" min="0.01" max="100" step="0.01" required value={target.targetPct} onChange={(event) => updateTarget(target.id, { targetPct: event.target.value })} />
              </label>
              <span aria-hidden="true">%</span>
              <button type="button" className="ui-btn ghost" disabled={targets.length === 1} onClick={() => setTargets((current) => current.filter((entry) => entry.id !== target.id))}>삭제</button>
            </div>
          ))}
          <button type="button" className="ui-btn ghost pf-add-target" disabled={targets.length >= 50} onClick={() => setTargets((current) => [...current, { id: id(), symbol: '', targetPct: '' }])}>+ 목표 추가</button>
        </div>

        {demo && <p className="pf-demo-save-note">데모에서 변경한 목표는 현재 브라우저 세션에서만 계산됩니다.</p>}
        {error && <p className="pf-form-error" role="alert">{error}</p>}
        <div className="pf-dialog-actions">
          <button type="button" className="ui-btn" disabled={busy} onClick={close}>취소</button>
          <button type="submit" className="ui-btn primary" disabled={busy}>{busy ? '저장 중…' : demo ? '데모에 적용' : '목표 저장'}</button>
        </div>
      </form>
    </Modal>
  );
}
