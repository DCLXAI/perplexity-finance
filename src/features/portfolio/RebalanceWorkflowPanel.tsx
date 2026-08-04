import { useEffect, useRef, useState } from 'react';
import type {
  PortfolioRebalanceExecutionLink,
  PortfolioRebalanceItem,
  PortfolioRebalanceRun,
  PortfolioRebalanceStatus,
} from '@/shared/api';
import { OrderCostBreakdown } from './OrderCostBreakdown.js';
import { RebalanceExecutionDialog } from './RebalanceExecutionDialog.js';
import { signedUsd } from './order-cost-ui.js';

interface RebalanceWorkflowPanelProps {
  readonly runs: readonly PortfolioRebalanceRun[];
  readonly demo?: boolean;
  readonly hasPolicy: boolean;
  readonly blockedByContribution?: boolean;
  readonly busy?: boolean;
  readonly focusRunId?: string;
  readonly onGenerate: () => Promise<void>;
  readonly onApprove: (runId: string) => Promise<void>;
  readonly onReject: (runId: string, reason: string) => Promise<void>;
  readonly onComplete: (runId: string, fills: readonly PortfolioRebalanceExecutionLink[]) => Promise<void>;
}

const STATUS_LABELS: Readonly<Record<PortfolioRebalanceStatus, string>> = Object.freeze({
  pending: '검토 대기',
  approved: '승인됨',
  completed: '완료',
  rejected: '거절',
  expired: '만료',
});

const EVENT_LABELS: Readonly<Record<PortfolioRebalanceRun['audit'][number]['event'], string>> = Object.freeze({
  created: '계획 생성',
  approved: '승인',
  completed: '원장 반영 완료',
  rejected: '거절',
  expired: '만료',
  execution_reversed: '연결 거래 역분개',
});

const OPTIMIZATION_LABELS: Readonly<Record<PortfolioRebalanceItem['optimizationDecision'], string>> = Object.freeze({
  execute: '비용 검증 통과',
  'not-required': '주문 불필요',
  'below-minimum': '최소 주문 미만',
  'cost-inefficient': '비용 한도 초과',
  'cash-limited': '현금 한도',
  'invalid-tax-lots': '세금 lot 근거 부족',
});

function usd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function pct(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function quantity(value: number | undefined): string {
  return value === undefined ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function actualNotional(item: PortfolioRebalanceItem): number | undefined {
  return item.actualQuantity === undefined || item.actualPrice === undefined
    ? undefined
    : item.actualQuantity * item.actualPrice;
}

function residualDrift(item: PortfolioRebalanceItem, run: PortfolioRebalanceRun): number | undefined {
  if (run.status !== 'completed') return undefined;
  const totalFees = run.items.reduce((sum, entry) => sum + (entry.actualFees ?? 0), 0);
  const postExecutionTotal = run.totalValue - totalFees;
  if (postExecutionTotal <= 0) return undefined;
  if (item.symbol === 'CASH') {
    const cashAfter = run.items.reduce((cash, entry) => {
      const notional = actualNotional(entry);
      if (notional === undefined) return cash;
      return entry.action === 'buy'
        ? cash - notional - (entry.actualFees ?? 0)
        : entry.action === 'sell'
          ? cash + notional - (entry.actualFees ?? 0)
          : cash;
    }, run.cashBalance);
    return (cashAfter / postExecutionTotal) * 100 - item.targetPct;
  }
  const notional = actualNotional(item);
  if (item.action !== 'hold' && notional === undefined) return undefined;
  const signedNotional = item.action === 'buy' ? notional ?? 0 : item.action === 'sell' ? -(notional ?? 0) : 0;
  return ((item.currentValue + signedNotional) / postExecutionTotal) * 100 - item.targetPct;
}

export function RebalanceWorkflowPanel({
  runs,
  demo = false,
  hasPolicy,
  blockedByContribution = false,
  busy = false,
  focusRunId,
  onGenerate,
  onApprove,
  onReject,
  onComplete,
}: RebalanceWorkflowPanelProps) {
  const [executionRunId, setExecutionRunId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const focusedRef = useRef<string | null>(null);
  const openRun = runs.find((run) => run.status === 'pending' || run.status === 'approved');
  const executionRun = executionRunId
    ? runs.find((run) => run.id === executionRunId && run.status === 'approved') ?? null
    : null;

  useEffect(() => {
    if (executionRunId && !executionRun) setExecutionRunId(null);
  }, [executionRun, executionRunId]);

  useEffect(() => {
    if (!focusRunId || focusedRef.current === focusRunId) return;
    const element = document.getElementById(`pf-rebalance-run-${focusRunId}`);
    if (!element) return;
    focusedRef.current = focusRunId;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusRunId, runs.length]);

  const perform = async (action: () => Promise<void>) => {
    setActionError('');
    try {
      await action();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '리밸런싱 요청을 처리하지 못했습니다.');
    }
  };

  const approve = (run: PortfolioRebalanceRun) => {
    if (!window.confirm('이 계획을 승인할까요? 승인만으로 원장이나 브로커 주문은 변경되지 않습니다.')) return;
    void perform(() => onApprove(run.id));
  };

  const reject = (run: PortfolioRebalanceRun) => {
    const reason = window.prompt('감사 로그에 남길 거절 사유를 입력해 주세요.', '현재 투자 판단과 맞지 않음');
    if (!reason?.trim()) return;
    void perform(() => onReject(run.id, reason.trim()));
  };

  return (
    <section className="pf-panel pf-rebalance-workflow" aria-labelledby="pf-rebalance-workflow-title">
      <div className="pf-panel-head">
        <div>
          <h2 id="pf-rebalance-workflow-title">승인형 리밸런싱 기록</h2>
          <p>생성 당시 가격·편차·주문안을 고정하고, 승인과 실제 체결을 감사 가능한 원장으로 연결합니다.</p>
        </div>
        <div className="pf-rebalance-actions">
          {openRun && <span className={`pf-rebalance-status ${openRun.status}`}>{STATUS_LABELS[openRun.status]}</span>}
          <button
            type="button"
            className="ui-btn primary"
            disabled={demo || !hasPolicy || busy || Boolean(openRun) || blockedByContribution}
            title={demo ? '로그인 후 사용할 수 있습니다.' : !hasPolicy ? '먼저 목표배분을 설정해 주세요.' : openRun || blockedByContribution ? '진행 중인 투자 계획을 먼저 처리해 주세요.' : undefined}
            onClick={() => void perform(onGenerate)}
          >
            {busy ? '처리 중…' : openRun ? '진행 중 계획 있음' : blockedByContribution ? '적립 계획 진행 중' : '현재 계획 저장'}
          </button>
        </div>
      </div>

      {demo && (
        <div className="pf-workflow-demo" role="note">
          <strong>데모에서는 조회만 가능합니다.</strong>
          <span>로그인하면 계획 생성·승인·거절·실제 체결 기록을 사용할 수 있습니다. 브로커 자동 주문은 지원하지 않습니다.</span>
        </div>
      )}

      {!demo && !hasPolicy && (
        <div className="pf-workflow-empty">
          <strong>목표배분을 먼저 저장해 주세요.</strong>
          <p>허용 편차와 목표 비중이 있어야 서버가 현재 가격을 재검증하고 영속 계획을 생성할 수 있습니다.</p>
        </div>
      )}

      {!demo && hasPolicy && runs.length === 0 && (
        <div className="pf-workflow-empty">
          <strong>저장된 리밸런싱 계획이 없습니다.</strong>
          <p>현재 계획을 저장하거나 일일 자동 편차 감시가 임계치 초과를 발견하면 여기에 검토 대기 계획이 생깁니다.</p>
        </div>
      )}

      {runs.length > 0 && (
        <div className="pf-workflow-runs">
          {runs.map((run, index) => {
            const reversed = run.audit.some((entry) => entry.event === 'execution_reversed');
            return (
              <article
                key={run.id}
                id={`pf-rebalance-run-${run.id}`}
                className={`pf-workflow-run ${focusRunId === run.id ? 'focused' : ''}`}
              >
                <header>
                  <div className="pf-workflow-run-title">
                    <span className={`pf-workflow-status ${run.status}`}>{STATUS_LABELS[run.status]}</span>
                    <div>
                      <strong>{run.source === 'scheduled' ? '자동 편차 감시' : '수동 생성'} · {new Date(run.createdAt).toLocaleString('ko-KR')}</strong>
                      <small>계획 {run.id.slice(0, 8)} · 평가 기준 {new Date(run.valuationAsOf).toLocaleString('ko-KR')}</small>
                    </div>
                  </div>
                  <div className="pf-workflow-actions">
                    {run.status === 'pending' && (
                      <button type="button" className="ui-btn primary" disabled={busy} onClick={() => approve(run)}>승인</button>
                    )}
                    {(run.status === 'pending' || run.status === 'approved') && (
                      <button type="button" className="ui-btn" disabled={busy} onClick={() => reject(run)}>거절</button>
                    )}
                    {run.status === 'approved' && (
                      <button type="button" className="ui-btn primary" disabled={busy} onClick={() => setExecutionRunId(run.id)}>실제 체결 입력</button>
                    )}
                  </div>
                </header>

                <dl className="pf-workflow-kpis">
                  <div><dt>최대 편차</dt><dd className="num">{run.maxDriftPct.toFixed(2)}%</dd><small>임계치 {run.driftThresholdPct.toFixed(2)}%</small></div>
                  <div><dt>계획 당시 총자산</dt><dd className="num">{usd(run.totalValue)}</dd><small>현금 {usd(run.cashBalance)}</small></div>
                  <div><dt>계획 후 예상 현금</dt><dd className={`num ${run.estimatedCashAfter < 0 ? 'neg' : ''}`}>{usd(run.estimatedCashAfter)}</dd><small>최소 주문 {usd(run.minTradeValue)}</small></div>
                  <div><dt>가격 유효기간</dt><dd>{new Date(run.expiresAt).toLocaleString('ko-KR')}</dd><small className={`pf-quality ${run.valuationQuality}`}>{run.valuationQuality}</small></div>
                </dl>

                <OrderCostBreakdown
                  costs={run.estimatedCosts}
                  policy={run.costModelVersion === 1 ? run.costPolicySnapshot : undefined}
                  label={run.costModelVersion === 1
                    ? '실행 당시 정책과 예상 주문 비용'
                    : 'P9 이전 계획 · 당시 비용 추정 없음'}
                />
                {run.actualCosts && (
                  <OrderCostBreakdown
                    costs={run.actualCosts}
                    label="체결 기준 비용 결과"
                    actual
                  />
                )}

                {run.terminalReason && <p className="pf-workflow-reason"><strong>처리 사유</strong> {run.terminalReason}</p>}
                {reversed && <p className="pf-workflow-reason warning"><strong>주의</strong> 이 계획에 연결된 원장 거래가 역분개되었습니다.</p>}

                <details className="pf-workflow-details" open={focusRunId === run.id || index === 0}>
                  <summary>계획·체결·감사 기록 보기</summary>
                  <div className="pf-table-wrap" role="region" tabIndex={0} aria-label={`${run.id.slice(0, 8)} 리밸런싱 계획과 실제 체결`}>
                    <table className="pf-table pf-workflow-table">
                      <thead>
                        <tr>
                          <th scope="col">자산</th>
                          <th scope="col">당시 → 목표 비중</th>
                          <th scope="col">당시 편차</th>
                          <th scope="col">제안 주문</th>
                          <th scope="col">기준 가격</th>
                          <th scope="col">예상 비용</th>
                          <th scope="col">실제 체결</th>
                          <th scope="col">비용 계획 대비</th>
                          <th scope="col">체결 후 잔여 편차</th>
                        </tr>
                      </thead>
                      <tbody>
                        {run.items.map((item) => {
                          const actual = actualNotional(item);
                          const difference = actual === undefined ? undefined : actual - item.tradeValue;
                          const costDifference = item.actualCosts === undefined
                            ? undefined
                            : item.actualCosts.total - item.estimatedCosts.total;
                          const residual = residualDrift(item, run);
                          return (
                            <tr key={item.id}>
                              <th scope="row">{item.symbol === 'CASH' ? '현금 · CASH' : item.symbol}</th>
                              <td className="num">{item.currentPct.toFixed(2)}% → {item.targetPct.toFixed(2)}%</td>
                              <td className={`num ${item.driftPct > 0 ? 'pos' : item.driftPct < 0 ? 'neg' : ''}`}>{pct(item.driftPct)}</td>
                              <td>
                                <span className={`pf-trade-action ${item.action}`}>
                                  {item.action === 'hold' ? '유지' : `${item.action === 'buy' ? '매수' : '매도'} ${usd(item.tradeValue)}`}
                                </span>
                                {item.action !== 'hold' && <small>{quantity(item.estimatedQuantity)}주</small>}
                                <small>{OPTIMIZATION_LABELS[item.optimizationDecision]}{item.requestedTradeValue !== item.tradeValue ? ` · 요청 ${usd(item.requestedTradeValue)}` : ''}</small>
                              </td>
                              <td className="num">
                                {item.referencePrice === undefined ? '—' : usd(item.referencePrice)}
                                <small>{item.provenance?.sourceLabel ?? '—'}{item.priceAsOf ? ` · ${new Date(item.priceAsOf).toLocaleString('ko-KR')}` : ''}</small>
                              </td>
                              <td className="num">
                                {usd(item.estimatedCosts.total)}
                                <small>수수료 {usd(item.estimatedCosts.commission)} · 슬리피지 {signedUsd(item.estimatedCosts.slippage)} · 세금 {usd(item.estimatedCosts.tax)}</small>
                                {item.action === 'sell' && <small>FIFO 원가 {usd(item.estimatedCostBasis)} · lot {item.taxLotSnapshot.length}개</small>}
                              </td>
                              <td className="num">
                                {actual === undefined ? '—' : usd(actual)}
                                {actual !== undefined && <small>{quantity(item.actualQuantity)}주 × {usd(item.actualPrice ?? 0)} · 수수료 {usd(item.actualFees ?? 0)}</small>}
                                {item.actualCosts && <small>체결 비용 {usd(item.actualCosts.total)} · 슬리피지 {signedUsd(item.actualCosts.slippage)} · 체결 기준 추정세금 {usd(item.actualCosts.tax)}</small>}
                                {item.transactionId && <small>원장 {item.transactionId.slice(0, 8)}</small>}
                              </td>
                              <td className="num">
                                {costDifference === undefined ? '—' : signedUsd(costDifference)}
                                {difference !== undefined && <small>주문금액 {signedUsd(difference)}</small>}
                              </td>
                              <td className={`num ${residual !== undefined && Math.abs(residual) > run.driftThresholdPct ? 'neg' : ''}`}>
                                {residual === undefined ? '—' : pct(residual)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="pf-workflow-audit">
                    <h3>감사 로그</h3>
                    <ol>
                      {run.audit.map((entry) => (
                        <li key={entry.id}>
                          <span aria-hidden="true" />
                          <div>
                            <strong>{EVENT_LABELS[entry.event]}</strong>
                            <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString('ko-KR')}</time>
                            {entry.reason && <p>{entry.reason}</p>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      )}

      {actionError && <p className="pf-form-error pf-workflow-error" role="alert">{actionError}</p>}

      <p className="pf-workflow-disclaimer">
        계획 승인 전에는 거래 원장에 아무 영향이 없습니다. 승인 후에도 실제 체결 입력이 있어야 원장에 반영되며, 브로커 자동 주문은 수행하지 않습니다. 모든 세금은 FIFO 비용 정책에 따른 추정치이며, 체결 기준 추정세금도 원장 납부액이나 세무 자문이 아닙니다.
      </p>

      {executionRun && (
        <RebalanceExecutionDialog
          run={executionRun}
          onClose={() => setExecutionRunId(null)}
          onSubmit={(fills) => onComplete(executionRun.id, fills)}
        />
      )}
    </section>
  );
}
