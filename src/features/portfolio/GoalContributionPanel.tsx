import { useEffect, useRef, useState } from 'react';
import type {
  PortfolioContributionRun,
  PortfolioGoal,
  PortfolioGoalProjection,
  PortfolioRebalanceExecutionLink,
  PortfolioRebalanceItem,
  PortfolioRebalanceStatus,
  PortfolioSummary,
} from '../../shared/api.js';
import { ContributionExecutionDialog } from './ContributionExecutionDialog.js';
import { GoalPlanDialog, type GoalPlanInput } from './GoalPlanDialog.js';
import { OrderCostBreakdown } from './OrderCostBreakdown.js';
import { signedUsd } from './order-cost-ui.js';
import './goal-contribution.css';

export type GoalAction = 'pause' | 'resume' | 'archive' | 'complete';

export interface GoalContributionPanelProps {
  readonly summary: PortfolioSummary;
  readonly goal: PortfolioGoal | null;
  readonly projection: PortfolioGoalProjection | null;
  readonly contributionRuns: readonly PortfolioContributionRun[];
  readonly hasPolicy: boolean;
  readonly blockedByRebalance?: boolean;
  readonly demo?: boolean;
  readonly busy?: boolean;
  readonly focusRunId?: string;
  readonly onSaveGoal: (input: GoalPlanInput) => Promise<void>;
  readonly onGoalAction: (action: GoalAction) => Promise<void>;
  readonly onGenerate: () => Promise<void>;
  readonly onApprove: (runId: string) => Promise<void>;
  readonly onReject: (runId: string, reason: string) => Promise<void>;
  readonly onComplete: (
    runId: string,
    depositAt: string,
    fills: readonly PortfolioRebalanceExecutionLink[],
  ) => Promise<void>;
}

const RUN_STATUS_LABELS: Readonly<Record<PortfolioRebalanceStatus, string>> = Object.freeze({
  pending: '검토 대기',
  approved: '승인됨',
  completed: '반영 완료',
  rejected: '거절',
  expired: '만료',
});

const PROJECTION_LABELS: Readonly<Record<PortfolioGoalProjection['status'], string>> = Object.freeze({
  funded: '목표 달성',
  'on-track': '계획 범위',
  behind: '적립 보완 필요',
  overdue: '목표일 경과',
  'insufficient-data': '근거 부족',
});

function usd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('ko-KR');
}

function dateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('ko-KR');
}

function actualContributionCost(run: PortfolioContributionRun): number | undefined {
  if (run.status !== 'completed') return undefined;
  return run.items.reduce((sum, item) => (
    item.action === 'buy' && item.actualQuantity !== undefined && item.actualPrice !== undefined
      ? sum + item.actualQuantity * item.actualPrice + (item.actualFees ?? 0)
      : sum
  ), 0);
}

function actualContributionNotional(run: PortfolioContributionRun): number | undefined {
  if (run.status !== 'completed') return undefined;
  return run.items.reduce((sum, item) => (
    item.action === 'buy' && item.actualQuantity !== undefined && item.actualPrice !== undefined
      ? sum + item.actualQuantity * item.actualPrice
      : sum
  ), 0);
}

function residualContributionDrift(
  item: PortfolioRebalanceItem,
  run: PortfolioContributionRun,
): number | undefined {
  if (run.status !== 'completed') return undefined;
  const totalFees = run.items.reduce((sum, entry) => sum + (entry.actualFees ?? 0), 0);
  const postContributionTotal = run.totalValue + run.contributionAmount - totalFees;
  if (postContributionTotal <= 0) return undefined;
  if (item.symbol === 'CASH') {
    const spent = run.items.reduce((sum, entry) => (
      entry.action === 'buy' && entry.actualQuantity !== undefined && entry.actualPrice !== undefined
        ? sum + entry.actualQuantity * entry.actualPrice + (entry.actualFees ?? 0)
        : sum
    ), 0);
    return (run.cashBalance + run.contributionAmount - spent) / postContributionTotal * 100 - item.targetPct;
  }
  const actualNotional = item.actualQuantity !== undefined && item.actualPrice !== undefined
    ? item.actualQuantity * item.actualPrice
    : 0;
  return (item.currentValue + actualNotional) / postContributionTotal * 100 - item.targetPct;
}

export function GoalContributionPanel({
  summary,
  goal,
  projection,
  contributionRuns,
  hasPolicy,
  blockedByRebalance = false,
  demo = false,
  busy = false,
  focusRunId,
  onSaveGoal,
  onGoalAction,
  onGenerate,
  onApprove,
  onReject,
  onComplete,
}: GoalContributionPanelProps) {
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [executionRunId, setExecutionRunId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const focusedRef = useRef<string | null>(null);
  const openRun = contributionRuns.find((run) => run.status === 'pending' || run.status === 'approved');
  const executionRun = executionRunId
    ? contributionRuns.find((run) => run.id === executionRunId && run.status === 'approved') ?? null
    : null;
  const goalActive = goal?.status === 'active';
  const progress = Math.max(0, Math.min(100, projection?.progressPct ?? 0));

  useEffect(() => {
    if (!focusRunId || focusedRef.current === focusRunId) return;
    const element = document.getElementById(`gc-contribution-run-${focusRunId}`);
    if (!element) return;
    focusedRef.current = focusRunId;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [contributionRuns.length, focusRunId]);

  useEffect(() => {
    if (executionRunId && !executionRun) setExecutionRunId(null);
  }, [executionRun, executionRunId]);

  const perform = async (action: () => Promise<void>) => {
    setActionError('');
    try {
      await action();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '요청을 처리하지 못했습니다.');
    }
  };

  const approve = (run: PortfolioContributionRun) => {
    if (!window.confirm('이 적립 계획을 승인할까요? 승인만으로 입금이나 주문이 실행되지는 않습니다.')) return;
    void perform(() => onApprove(run.id));
  };

  const reject = (run: PortfolioContributionRun) => {
    const reason = window.prompt('감사 기록에 남길 거절 사유를 입력해 주세요.', '현재 투자 계획과 맞지 않음');
    if (!reason?.trim()) return;
    void perform(() => onReject(run.id, reason.trim()));
  };

  const archiveGoal = () => {
    const warning = openRun
      ? '이 투자 목표를 보관하면 진행 중인 적립 계획이 만료됩니다. 기존 기록은 유지됩니다. 계속할까요?'
      : '이 투자 목표를 보관할까요? 기존 적립 기록은 유지됩니다.';
    if (!window.confirm(warning)) return;
    void perform(() => onGoalAction('archive'));
  };

  const editGoal = () => {
    if (openRun && !window.confirm('목표를 수정하면 진행 중인 적립 계획이 만료됩니다. 계속할까요?')) return;
    setGoalDialogOpen(true);
  };

  const pauseGoal = () => {
    if (openRun && !window.confirm('목표를 일시정지하면 진행 중인 적립 계획이 만료됩니다. 계속할까요?')) return;
    void perform(() => onGoalAction('pause'));
  };

  const completeGoal = () => {
    const warning = openRun
      ? '목표 달성을 확정하면 진행 중인 적립 계획이 만료됩니다. 계속할까요?'
      : '검증된 현재 가치를 기준으로 이 목표를 완료 처리할까요?';
    if (!window.confirm(warning)) return;
    void perform(() => onGoalAction('complete'));
  };

  return (
    <section className="gc-panel" aria-labelledby="gc-panel-title">
      <header className="gc-panel-head">
        <div>
          <span className="gc-eyebrow">P8 GOAL CONTRIBUTIONS</span>
          <h2 id="gc-panel-title">목표 투자와 정기 적립</h2>
          <p>목표 경로를 점검하고 새 적립금을 저비중 자산의 매수 제안으로 배분합니다.</p>
        </div>
        <div className="gc-head-actions">
          {goal && <span className={`gc-goal-status ${goal.status}`}>{goal.status === 'active' ? '진행 중' : goal.status === 'paused' ? '일시정지' : goal.status === 'completed' ? '달성' : '보관됨'}</span>}
          <button
            type="button"
            className="ui-btn primary"
            disabled={demo || busy || !goalActive || !hasPolicy || Boolean(openRun) || blockedByRebalance}
            title={blockedByRebalance ? '진행 중인 리밸런싱 계획을 먼저 처리해 주세요.' : undefined}
            onClick={() => void perform(onGenerate)}
          >
            {openRun ? '진행 중 계획 있음' : blockedByRebalance ? '리밸런싱 계획 진행 중' : '이번 달 적립 계획'}
          </button>
        </div>
      </header>

      {demo && (
        <div className="gc-callout" role="note">
          <strong>데모에서는 조회만 가능합니다.</strong>
          <span>로그인한 포트폴리오에서 목표 저장, 승인과 실제 적립 반영을 사용할 수 있습니다.</span>
        </div>
      )}

      {!goal ? (
        <div className="gc-empty">
          <div>
            <strong>투자 목표를 먼저 만들어 주세요.</strong>
            <p>목표 금액과 날짜, 월 적립금을 기준으로 달성 가능성과 필요한 적립액을 계산합니다.</p>
          </div>
          <button type="button" className="ui-btn primary" disabled={demo || busy} onClick={() => setGoalDialogOpen(true)}>목표 만들기</button>
        </div>
      ) : (
        <article className="gc-goal-card">
          <div className="gc-goal-title">
            <div>
              <small>목표일 {date(goal.targetDate)}</small>
              <h3>{goal.name}</h3>
              <span>목표 {usd(goal.targetAmount)} · 월 {usd(goal.contributionAmount)} · 매월 {goal.contributionDay}일</span>
            </div>
            <div className="gc-goal-actions" aria-label="투자 목표 관리">
              {(goal.status === 'active' || goal.status === 'paused') && (
                <button type="button" className="ui-btn" disabled={demo || busy} onClick={editGoal}>목표 수정</button>
              )}
              {goal.status === 'active' && <button type="button" className="ui-btn" disabled={demo || busy} onClick={pauseGoal}>일시정지</button>}
              {goal.status === 'paused' && <button type="button" className="ui-btn primary" disabled={demo || busy} onClick={() => void perform(() => onGoalAction('resume'))}>다시 시작</button>}
              {(goal.status === 'active' || goal.status === 'paused') && projection?.status === 'funded' && (
                <button type="button" className="ui-btn primary" disabled={demo || busy} onClick={completeGoal}>목표 달성 확정</button>
              )}
              {goal.status !== 'archived' && <button type="button" className="ui-btn" disabled={demo || busy} onClick={archiveGoal}>보관</button>}
            </div>
          </div>

          {projection ? (
            <div className="gc-projection">
              <div className="gc-progress-copy">
                <strong>{PROJECTION_LABELS[projection.status]}</strong>
                <span>현재 {usd(projection.currentValue)} / 목표 {usd(projection.targetAmount)}</span>
                <b>{projection.progressPct.toFixed(1)}%</b>
              </div>
              <progress aria-label={`${goal.name} 달성 진행률`} max="100" value={progress}>{progress}%</progress>
              <dl className="gc-kpis">
                <div><dt>예상 목표일 금액</dt><dd>{usd(projection.projectedAmount)}</dd></div>
                <div><dt>필요 월 적립금</dt><dd>{usd(projection.requiredContributionAmount)}</dd></div>
                <div><dt>예상 부족액</dt><dd className={projection.projectedShortfall > 0 ? 'gc-negative' : ''}>{usd(projection.projectedShortfall)}</dd></div>
                <div><dt>남은 적립 횟수</dt><dd>{projection.contributionPeriodsRemaining.toLocaleString()}회</dd></div>
              </dl>
            </div>
          ) : (
            <div className="gc-callout" role="note">검증된 평가액이 준비되면 목표 예상 경로를 표시합니다.</div>
          )}

          <div className="gc-next-due">
            <span>다음 월 적립 예정</span>
            <strong><time dateTime={goal.nextContributionDate}>{date(goal.nextContributionDate)}</time></strong>
            <small>현재 포트폴리오 {usd(summary.totalValue)} · 평가 품질 {summary.valuationQuality}</small>
          </div>
        </article>
      )}

      {!hasPolicy && goal && (
        <div className="gc-callout" role="note">
          <strong>목표배분 정책이 필요합니다.</strong>
          <span>자산별 목표 비중과 최소 주문금액을 저장해야 매수 전용 적립 계획을 만들 수 있습니다.</span>
        </div>
      )}

      {blockedByRebalance && (
        <div className="gc-callout" role="note">
          <strong>리밸런싱 계획이 먼저 진행 중입니다.</strong>
          <span>감사 가능한 원장 반영을 위해 한 번에 하나의 투자 계획만 승인·완료할 수 있습니다.</span>
        </div>
      )}

      <section className="gc-history" aria-labelledby="gc-history-title">
        <div className="gc-section-head">
          <div>
            <h3 id="gc-history-title">적립 계획 기록</h3>
            <p>각 계획은 승인 전 원장에 영향을 주지 않으며 매수 제안만 포함합니다.</p>
          </div>
          <span>{contributionRuns.length}건</span>
        </div>

        {contributionRuns.length === 0 ? (
          <div className="gc-empty compact">저장된 적립 계획이 없습니다.</div>
        ) : (
          <div className="gc-run-list">
            {contributionRuns.map((run) => {
              const buys = run.items.filter((item) => item.action === 'buy');
              const plannedBuyAmount = buys.reduce((sum, item) => sum + item.tradeValue, 0);
              const actualCost = actualContributionCost(run);
              const actualNotional = actualContributionNotional(run);
              return (
                <article
                  key={run.id}
                  id={`gc-contribution-run-${run.id}`}
                  className={`gc-run ${focusRunId === run.id ? 'focused' : ''}`}
                >
                  <header className="gc-run-head">
                    <div>
                      <span className={`gc-run-status ${run.status}`}>{RUN_STATUS_LABELS[run.status]}</span>
                      <strong>{run.scheduledFor ? `${date(run.scheduledFor)} 적립` : `${date(run.createdAt)} 적립`}</strong>
                      <small>{run.goalSnapshot.name} · 목표 {usd(run.goalSnapshot.targetAmount)} / {date(run.goalSnapshot.targetDate)} · 계획 {run.id.slice(0, 8)} · 평가 기준 {dateTime(run.valuationAsOf)}</small>
                    </div>
                    <div className="gc-run-actions">
                      {run.status === 'pending' && <button type="button" className="ui-btn primary" disabled={busy || demo} onClick={() => approve(run)}>승인</button>}
                      {(run.status === 'pending' || run.status === 'approved') && <button type="button" className="ui-btn" disabled={busy || demo} onClick={() => reject(run)}>거절</button>}
                      {run.status === 'approved' && <button type="button" className="ui-btn primary" disabled={busy || demo} onClick={() => setExecutionRunId(run.id)}>실제 적립 입력</button>}
                    </div>
                  </header>

                  <dl className="gc-run-summary">
                    <div><dt>적립금</dt><dd>{usd(run.contributionAmount)}</dd></div>
                    <div><dt>매수 제안</dt><dd>{usd(plannedBuyAmount)}</dd></div>
                    <div><dt>비용 반영 후 현금 유지</dt><dd>{usd(Math.max(0, run.estimatedCashAfter - run.cashBalance))}</dd></div>
                    <div><dt>만료</dt><dd>{dateTime(run.expiresAt)}</dd></div>
                  </dl>

                  <OrderCostBreakdown
                    costs={run.estimatedCosts}
                    policy={run.costModelVersion === 1 ? run.costPolicySnapshot : undefined}
                    label={run.costModelVersion === 1
                      ? '실행 당시 정책과 예상 적립 비용'
                      : 'P9 이전 계획 · 당시 비용 추정 없음'}
                    className="gc-order-cost-breakdown"
                  />
                  {run.actualCosts && (
                    <OrderCostBreakdown
                      costs={run.actualCosts}
                      label="체결 기준 적립 비용 결과"
                      actual
                      className="gc-order-cost-breakdown"
                    />
                  )}

                  {actualCost !== undefined && (
                    <p className="gc-run-reason">
                      <strong>실제 결과</strong>{' '}
                      매수·수수료 {usd(actualCost)} · 주문금액 계획 대비 {actualNotional === undefined ? '—' : signedUsd(actualNotional - plannedBuyAmount)} · 비용 계획 대비 {run.actualCosts ? signedUsd(run.actualCosts.total - run.estimatedCosts.total) : '—'} · 현금 잔여 {usd(run.contributionAmount - actualCost)}
                    </p>
                  )}

                  {run.terminalReason && <p className="gc-run-reason"><strong>처리 사유</strong> {run.terminalReason}</p>}
                  <details open={run.status === 'pending' || run.status === 'approved'}>
                    <summary>매수 전용 배분 보기</summary>
                    {buys.length === 0 ? (
                      <div className="gc-empty-note">목표 현금으로 유지되는 계획이며 매수 제안은 없습니다.</div>
                    ) : (
                      <div className="gc-table-wrap" role="region" tabIndex={0} aria-label={`${run.id.slice(0, 8)} 적립 매수 제안`}>
                        <table className="gc-table">
                          <thead><tr><th scope="col">자산</th><th scope="col">목표 비중</th><th scope="col">제안 금액</th><th scope="col">예상 수량</th><th scope="col">예상 비용</th><th scope="col">실제 체결·비용</th><th scope="col">잔여 편차</th></tr></thead>
                          <tbody>
                            {buys.map((item) => {
                              const residualDrift = residualContributionDrift(item, run);
                              return <tr key={item.id}>
                                <th scope="row">{item.symbol}</th>
                                <td>{item.targetPct.toFixed(2)}%</td>
                                <td>{usd(item.tradeValue)}</td>
                                <td>{item.estimatedQuantity?.toLocaleString(undefined, { maximumFractionDigits: 8 }) ?? '—'}</td>
                                <td>
                                  {usd(item.estimatedCosts.total)}
                                  <small>수수료 {usd(item.estimatedCosts.commission)} · 슬리피지 {signedUsd(item.estimatedCosts.slippage)} · 세금 {usd(item.estimatedCosts.tax)}</small>
                                </td>
                                <td>
                                  {item.actualQuantity === undefined || item.actualPrice === undefined ? '—' : `${item.actualQuantity.toLocaleString(undefined, { maximumFractionDigits: 8 })}주 × ${usd(item.actualPrice)}`}
                                  {item.actualCosts && <small>비용 {usd(item.actualCosts.total)} · 슬리피지 {signedUsd(item.actualCosts.slippage)} · 체결 기준 추정세금 {usd(item.actualCosts.tax)}</small>}
                                </td>
                                <td>{residualDrift === undefined ? '—' : `${residualDrift > 0 ? '+' : ''}${residualDrift.toFixed(2)}%`}</td>
                              </tr>;
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {run.depositTransactionId && <p className="gc-ledger-link">입금 원장 {run.depositTransactionId.slice(0, 8)}</p>}
                  </details>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {actionError && <p className="gc-error" role="alert">{actionError}</p>}
      <footer className="gc-disclosure">
        <strong>자동 이체·자동 주문 없음</strong>
        <span>이 기능은 은행 계좌에서 돈을 이체하거나 브로커 주문을 실행하지 않습니다. 예상 수익률·목표 도달액·주문 비용은 계산 가정이며 실제 성과를 보장하지 않습니다. 체결 기준 추정세금은 원장 납부액이나 세무 자문이 아닙니다.</span>
      </footer>

      {goalDialogOpen && (
        <GoalPlanDialog
          goal={goal}
          busy={busy}
          onClose={() => setGoalDialogOpen(false)}
          onSubmit={onSaveGoal}
        />
      )}
      {executionRun && (
        <ContributionExecutionDialog
          run={executionRun}
          onClose={() => setExecutionRunId(null)}
          onSubmit={(depositAt, fills) => onComplete(executionRun.id, depositAt, fills)}
        />
      )}
    </section>
  );
}
