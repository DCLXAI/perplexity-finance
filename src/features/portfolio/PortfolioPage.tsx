import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAuth } from '@/cloud/AuthProvider';
import { apiFetch } from '@/live/apiClient';
import type {
  HistoryResponse,
  InvestmentThesis,
  PortfolioAllocationPolicy,
  PortfolioAllocationResponse,
  PortfolioContributionMutationResponse,
  PortfolioContributionRun,
  PortfolioContributionsResponse,
  PortfolioGoal,
  PortfolioGoalMutationResponse,
  PortfolioGoalProjection,
  PortfolioGoalResponse,
  PortfolioMutationResponse,
  PortfolioRecord,
  PortfolioRebalanceExecutionLink,
  PortfolioRebalanceMutationResponse,
  PortfolioRebalanceRun,
  PortfolioRebalancesResponse,
  PortfolioSnapshot,
  PortfolioSnapshotsResponse,
  PortfolioSummary,
  PortfolioSummaryResponse,
  PortfolioTransaction,
  PortfolioTransactionMutationResponse,
  PortfolioTransactionsResponse,
  PortfoliosResponse,
  ResearchResponse,
} from '@/shared/api';
import CreatePortfolioDialog from './CreatePortfolioDialog.js';
import {
  buildDemoBenchmarkHistory,
  buildDemoPortfolioSnapshots,
  buildDemoPortfolioSummary,
  DEMO_ALLOCATION_POLICY,
  DEMO_TRANSACTIONS,
} from './demo.js';
import PerformancePanel from './PerformancePanel.js';
import PortfolioSummaryView from './PortfolioSummaryView.js';
import { GoalContributionPanel } from './GoalContributionPanel.js';
import type { GoalPlanInput } from './GoalPlanDialog.js';
import RebalancePanel from './RebalancePanel.js';
import { RebalanceWorkflowPanel } from './RebalanceWorkflowPanel.js';
import ScenarioPanel from './ScenarioPanel.js';
import ThesisPanel from './ThesisPanel.js';
import TransactionDialog from './TransactionDialog.js';
import './portfolio.css';

const DEMO_THESES: readonly InvestmentThesis[] = Object.freeze([
  Object.freeze({
    id: 'demo-thesis-1',
    portfolioId: 'demo-portfolio',
    symbol: 'AMD',
    title: 'AI 가속기 경쟁력은 소프트웨어·공급망 실행력에서 결정된다',
    thesis: '단순 GPU 성능 비교보다 ROCm 채택, 패키징 공급과 대형 고객의 반복 구매가 장기 가치의 핵심 검증 변수다.',
    bullCase: '가속기 매출이 고객 다변화와 함께 빠르게 확장되고 소프트웨어 전환 비용이 낮아진다.',
    bearCase: '소프트웨어 생태계 격차가 유지되고 패키징·메모리 공급이 성장 속도를 제한한다.',
    catalysts: Object.freeze(['분기별 데이터센터 매출', 'ROCm 개발자 채택', 'HBM 공급계약']),
    invalidation: '두 개 분기 연속 가속기 매출 성장 둔화와 핵심 고객 이탈이 동시에 확인될 때 재평가한다.',
    targetPrice: 650,
    confidence: 64,
    status: 'active',
    evidence: Object.freeze([]),
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
  }),
]);

function usd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}
function transactionLabel(kind: PortfolioTransaction['kind']): string {
  const labels: Readonly<Record<PortfolioTransaction['kind'], string>> = {
    deposit: '입금', withdrawal: '출금', buy: '매수', sell: '매도', dividend: '배당', fee: '비용', reversal: '역분개',
  };
  return labels[kind];
}
function transactionAmount(transaction: PortfolioTransaction): string {
  if (transaction.kind === 'buy' || transaction.kind === 'sell') {
    return `${transaction.quantity.toLocaleString(undefined, { maximumFractionDigits: 8 })} × ${usd(transaction.price)}`;
  }
  if (transaction.kind === 'reversal') return transaction.reversalOf ? `거래 ${transaction.reversalOf.slice(0, 8)} 취소` : '거래 취소';
  return usd(transaction.cashAmount);
}

type RebalanceMutationInput =
  | Readonly<{ action: 'generate'; portfolioId: string }>
  | Readonly<{ action: 'approve'; runId: string }>
  | Readonly<{ action: 'reject'; runId: string; reason: string }>
  | Readonly<{ action: 'complete'; runId: string; fills: readonly PortfolioRebalanceExecutionLink[] }>;

type ContributionMutationInput =
  | Readonly<{ action: 'generate'; portfolioId: string; goalId: string }>
  | Readonly<{ action: 'approve'; runId: string }>
  | Readonly<{ action: 'reject'; runId: string; reason: string }>
  | Readonly<{
    action: 'complete';
    runId: string;
    depositAt: string;
    fills: readonly PortfolioRebalanceExecutionLink[];
  }>;

export default function PortfolioPage() {
  const { configured, loading: authLoading, user, accessToken } = useAuth();
  const [searchParams] = useSearchParams();
  const linkedPortfolioId = searchParams.get('portfolioId');
  const linkedRunId = searchParams.get('runId');
  const linkedContributionRunId = searchParams.get('contributionRunId');
  const demoSummary = useMemo(buildDemoPortfolioSummary, []);
  const demoSnapshots = useMemo(() => buildDemoPortfolioSnapshots(demoSummary), [demoSummary]);
  const [portfolios, setPortfolios] = useState<readonly PortfolioRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [transactions, setTransactions] = useState<readonly PortfolioTransaction[]>([]);
  const [snapshots, setSnapshots] = useState<readonly PortfolioSnapshot[]>([]);
  const [benchmarkSymbol, setBenchmarkSymbol] = useState('SPY');
  const [benchmark, setBenchmark] = useState<HistoryResponse | null>(null);
  const [allocationPolicy, setAllocationPolicy] = useState<PortfolioAllocationPolicy | null>(null);
  const [demoAllocationPolicy, setDemoAllocationPolicy] = useState<PortfolioAllocationPolicy | null>(null);
  const [rebalanceRuns, setRebalanceRuns] = useState<readonly PortfolioRebalanceRun[]>([]);
  const [goal, setGoal] = useState<PortfolioGoal | null>(null);
  const [goalProjection, setGoalProjection] = useState<PortfolioGoalProjection | null>(null);
  const [contributionRuns, setContributionRuns] = useState<readonly PortfolioContributionRun[]>([]);
  const [theses, setTheses] = useState<readonly InvestmentThesis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [rebalanceBusy, setRebalanceBusy] = useState(false);
  const [goalBusy, setGoalBusy] = useState(false);
  const portfolioListControllerRef = useRef<AbortController | null>(null);
  const selectedControllerRef = useRef<AbortController | null>(null);
  const selectedDataIdRef = useRef<string | null>(null);
  const handledLinkRef = useRef<string | null>(null);

  const resetSelectedState = useCallback(() => {
    setSummary(null);
    setTransactions([]);
    setSnapshots([]);
    setBenchmark(null);
    setAllocationPolicy(null);
    setRebalanceRuns([]);
    setGoal(null);
    setGoalProjection(null);
    setContributionRuns([]);
    setTheses([]);
    setLoading(false);
  }, []);

  const refreshPortfolios = useCallback(async () => {
    portfolioListControllerRef.current?.abort();
    portfolioListControllerRef.current = null;
    if (!accessToken) return;
    const controller = new AbortController();
    portfolioListControllerRef.current = controller;
    try {
      const response = await apiFetch<PortfoliosResponse>('/api/portfolios', { signal: controller.signal }, accessToken);
      if (portfolioListControllerRef.current !== controller) return;
      setPortfolios(response.portfolios);
      setSelectedId((current) => response.portfolios.some((entry) => entry.id === current)
        ? current
        : response.portfolios.find((entry) => entry.id === linkedPortfolioId)?.id ?? response.portfolios[0]?.id ?? null);
    } catch (cause) {
      if (controller.signal.aborted || portfolioListControllerRef.current !== controller) return;
      throw cause;
    } finally {
      if (portfolioListControllerRef.current === controller) portfolioListControllerRef.current = null;
    }
  }, [accessToken, linkedPortfolioId]);

  const refreshSelected = useCallback(async () => {
    selectedControllerRef.current?.abort();
    selectedControllerRef.current = null;
    if (!accessToken || !selectedId) {
      selectedDataIdRef.current = null;
      resetSelectedState();
      return;
    }
    if (selectedDataIdRef.current !== selectedId) {
      selectedDataIdRef.current = selectedId;
      resetSelectedState();
    }
    const controller = new AbortController();
    selectedControllerRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const [
        summaryResponse,
        transactionResponse,
        snapshotResponse,
        researchResponse,
        benchmarkResponse,
        allocationResponse,
        rebalanceResponse,
        goalResponse,
        contributionResponse,
      ] = await Promise.all([
        apiFetch<PortfolioSummaryResponse>(`/api/portfolio/summary?portfolioId=${encodeURIComponent(selectedId)}`, { signal: controller.signal }, accessToken),
        apiFetch<PortfolioTransactionsResponse>(`/api/portfolio/transactions?portfolioId=${encodeURIComponent(selectedId)}`, { signal: controller.signal }, accessToken),
        apiFetch<PortfolioSnapshotsResponse>(`/api/portfolio/snapshots?portfolioId=${encodeURIComponent(selectedId)}&limit=365`, { signal: controller.signal }, accessToken),
        apiFetch<ResearchResponse>(`/api/research?portfolioId=${encodeURIComponent(selectedId)}`, { signal: controller.signal }, accessToken),
        apiFetch<HistoryResponse>(`/api/market/history?symbol=${encodeURIComponent(benchmarkSymbol)}&range=1Y`, { signal: controller.signal }, accessToken)
          .catch(() => null),
        apiFetch<PortfolioAllocationResponse>(`/api/portfolio/allocation?portfolioId=${encodeURIComponent(selectedId)}`, { signal: controller.signal }, accessToken)
          .catch(() => null),
        apiFetch<PortfolioRebalancesResponse>(`/api/portfolio/rebalances?portfolioId=${encodeURIComponent(selectedId)}&limit=20`, { signal: controller.signal }, accessToken),
        apiFetch<PortfolioGoalResponse>(`/api/portfolio/goal?portfolioId=${encodeURIComponent(selectedId)}`, { signal: controller.signal }, accessToken)
          .catch(() => null),
        apiFetch<PortfolioContributionsResponse>(`/api/portfolio/contributions?portfolioId=${encodeURIComponent(selectedId)}&limit=20`, { signal: controller.signal }, accessToken)
          .catch(() => null),
      ]);
      if (selectedControllerRef.current !== controller) return;
      setSummary(summaryResponse.summary);
      setTransactions(transactionResponse.transactions);
      setSnapshots(snapshotResponse.snapshots);
      setTheses(researchResponse.theses);
      setBenchmark(benchmarkResponse);
      setAllocationPolicy(allocationResponse?.policy ?? null);
      setRebalanceRuns(rebalanceResponse.runs);
      setGoal(goalResponse?.goal ?? null);
      setGoalProjection(goalResponse?.projection ?? null);
      setContributionRuns(contributionResponse?.runs ?? []);
      if (!goalResponse || !contributionResponse) {
        setError('목표·정기 적립 정보 일부를 불러오지 못했습니다. 기존 포트폴리오 정보는 정상 표시됩니다.');
      }
    } catch (cause) {
      if (controller.signal.aborted || selectedControllerRef.current !== controller) return;
      setError(cause instanceof Error ? cause.message : '포트폴리오를 불러오지 못했습니다.');
    } finally {
      if (selectedControllerRef.current === controller) {
        selectedControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [accessToken, benchmarkSymbol, resetSelectedState, selectedId]);

  const selectPortfolio = useCallback((portfolioId: string | null) => {
    selectedControllerRef.current?.abort();
    selectedControllerRef.current = null;
    selectedDataIdRef.current = null;
    resetSelectedState();
    setError('');
    setSelectedId(portfolioId);
  }, [resetSelectedState]);

  const mutateRebalance = useCallback(async (input: RebalanceMutationInput): Promise<PortfolioRebalanceRun> => {
    if (!accessToken) throw new Error('로그인 후 리밸런싱 워크플로를 사용할 수 있습니다.');
    setRebalanceBusy(true);
    setError('');
    try {
      const response = await apiFetch<PortfolioRebalanceMutationResponse>('/api/portfolio/rebalances', {
        method: 'POST',
        headers: {
          'Idempotency-Key': globalThis.crypto?.randomUUID?.() ?? `rebalance-${Date.now()}-${Math.random()}`,
        },
        body: JSON.stringify(input),
      }, accessToken);
      setRebalanceRuns((current) => [response.run, ...current.filter((run) => run.id !== response.run.id)]);
      await refreshSelected();
      return response.run;
    } catch (cause) {
      const fallback = input.action === 'generate'
        ? '리밸런싱 계획을 저장하지 못했습니다.'
        : input.action === 'approve'
          ? '리밸런싱 계획을 승인하지 못했습니다.'
          : input.action === 'reject'
            ? '리밸런싱 계획을 거절하지 못했습니다.'
            : '실제 체결을 원장에 반영하지 못했습니다.';
      // A rejected mutation may still have committed an audited expiry when
      // server-side safety checks require a new approval.
      await refreshSelected().catch(() => undefined);
      setError(cause instanceof Error ? cause.message : fallback);
      throw cause;
    } finally {
      setRebalanceBusy(false);
    }
  }, [accessToken, refreshSelected]);

  const saveGoal = useCallback(async (input: GoalPlanInput): Promise<void> => {
    if (!accessToken || !selectedId) throw new Error('로그인한 포트폴리오에서 목표를 저장할 수 있습니다.');
    setGoalBusy(true);
    setError('');
    try {
      const response = await apiFetch<PortfolioGoalMutationResponse>('/api/portfolio/goal', {
        method: 'PUT',
        body: JSON.stringify({
          portfolioId: selectedId,
          ...input,
          ...(goal ? { expectedUpdatedAt: goal.updatedAt } : {}),
        }),
      }, accessToken);
      setGoal(response.goal);
      await refreshSelected();
    } catch (cause) {
      await refreshSelected().catch(() => undefined);
      setError(cause instanceof Error ? cause.message : '투자 목표를 저장하지 못했습니다.');
      throw cause;
    } finally {
      setGoalBusy(false);
    }
  }, [accessToken, goal, refreshSelected, selectedId]);

  const mutateGoalStatus = useCallback(async (action: 'pause' | 'resume' | 'archive' | 'complete'): Promise<void> => {
    if (!accessToken || !goal) throw new Error('변경할 투자 목표가 없습니다.');
    setGoalBusy(true);
    setError('');
    try {
      const response = await apiFetch<PortfolioGoalMutationResponse>('/api/portfolio/goal', {
        method: 'PATCH',
        body: JSON.stringify({ goalId: goal.id, action, expectedUpdatedAt: goal.updatedAt }),
      }, accessToken);
      setGoal(action === 'archive' ? null : response.goal);
      await refreshSelected();
    } catch (cause) {
      await refreshSelected().catch(() => undefined);
      setError(cause instanceof Error ? cause.message : '투자 목표 상태를 변경하지 못했습니다.');
      throw cause;
    } finally {
      setGoalBusy(false);
    }
  }, [accessToken, goal, refreshSelected]);

  const mutateContribution = useCallback(async (
    input: ContributionMutationInput,
  ): Promise<PortfolioContributionRun> => {
    if (!accessToken) throw new Error('로그인한 포트폴리오에서 정기 납입 계획을 사용할 수 있습니다.');
    setGoalBusy(true);
    setError('');
    try {
      const response = await apiFetch<PortfolioContributionMutationResponse>('/api/portfolio/contributions', {
        method: 'POST',
        headers: {
          'Idempotency-Key': globalThis.crypto?.randomUUID?.() ?? `contribution-${Date.now()}-${Math.random()}`,
        },
        body: JSON.stringify(input),
      }, accessToken);
      setContributionRuns((current) => [response.run, ...current.filter((run) => run.id !== response.run.id)]);
      await refreshSelected();
      return response.run;
    } catch (cause) {
      await refreshSelected().catch(() => undefined);
      setError(cause instanceof Error ? cause.message : '정기 납입 계획을 처리하지 못했습니다.');
      throw cause;
    } finally {
      setGoalBusy(false);
    }
  }, [accessToken, refreshSelected]);

  useEffect(() => {
    if (!accessToken) {
      portfolioListControllerRef.current?.abort();
      portfolioListControllerRef.current = null;
      setPortfolios([]);
      setSelectedId(null);
      selectedDataIdRef.current = null;
      resetSelectedState();
      return undefined;
    }
    void refreshPortfolios().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : '포트폴리오 목록을 불러오지 못했습니다.');
    });
    return () => {
      portfolioListControllerRef.current?.abort();
      portfolioListControllerRef.current = null;
    };
  }, [accessToken, refreshPortfolios, resetSelectedState]);

  useEffect(() => {
    const linkKey = linkedPortfolioId
      ? `${linkedPortfolioId}:${linkedRunId ?? ''}:${linkedContributionRunId ?? ''}`
      : null;
    if (!linkKey) {
      handledLinkRef.current = null;
      return;
    }
    if (handledLinkRef.current === linkKey || !portfolios.some((entry) => entry.id === linkedPortfolioId)) return;
    handledLinkRef.current = linkKey;
    if (selectedId !== linkedPortfolioId) selectPortfolio(linkedPortfolioId);
  }, [linkedContributionRunId, linkedPortfolioId, linkedRunId, portfolios, selectPortfolio, selectedId]);

  useEffect(() => {
    void refreshSelected();
    if (!accessToken || !selectedId) return undefined;
    const timer = window.setInterval(() => void refreshSelected(), 60_000);
    return () => {
      window.clearInterval(timer);
      selectedControllerRef.current?.abort();
      selectedControllerRef.current = null;
    };
  }, [accessToken, refreshSelected, selectedId]);

  const reversedIds = useMemo(
    () => new Set(transactions.flatMap((entry) => entry.kind === 'reversal' && entry.reversalOf ? [entry.reversalOf] : [])),
    [transactions],
  );
  const latestReversible = [...transactions]
    .filter((entry) => entry.kind !== 'reversal' && !reversedIds.has(entry.id))
    .at(-1);

  const reverseLatest = async () => {
    if (!accessToken || !selectedId || !latestReversible) return;
    if (!window.confirm(`${transactionLabel(latestReversible.kind)} 거래를 역분개할까요? 원본은 감사 이력을 위해 남습니다.`)) return;
    setBusyAction(true);
    setError('');
    try {
      await apiFetch<PortfolioTransactionMutationResponse>('/api/portfolio/transactions', {
        method: 'POST',
        headers: { 'Idempotency-Key': globalThis.crypto.randomUUID() },
        body: JSON.stringify({ action: 'reverse', portfolioId: selectedId, transactionId: latestReversible.id }),
      }, accessToken);
      await refreshSelected();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '거래를 역분개하지 못했습니다.');
    } finally {
      setBusyAction(false);
    }
  };

  const archiveSelected = async () => {
    if (!accessToken || !selectedId) return;
    if (!window.confirm('이 포트폴리오를 보관할까요? 원장과 스냅숏은 삭제되지 않습니다.')) return;
    setBusyAction(true);
    setError('');
    try {
      await apiFetch<PortfolioMutationResponse>('/api/portfolios', {
        method: 'PATCH',
        body: JSON.stringify({ id: selectedId, status: 'archived' }),
      }, accessToken);
      await refreshPortfolios();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '포트폴리오를 보관하지 못했습니다.');
    } finally {
      setBusyAction(false);
    }
  };

  const demo = !user || !accessToken;
  const selectedSummary = summary?.portfolio.id === selectedId ? summary : null;
  const activeSummary = demo ? demoSummary : selectedSummary;
  const activeTransactions = demo ? DEMO_TRANSACTIONS : transactions;
  const activeSnapshots = demo ? demoSnapshots : snapshots;
  const demoBenchmark = useMemo(() => buildDemoBenchmarkHistory(benchmarkSymbol), [benchmarkSymbol]);
  const activeBenchmark = demo ? demoBenchmark : benchmark?.symbol === benchmarkSymbol ? benchmark : null;
  const activeAllocationPolicy = demo
    ? demoAllocationPolicy ?? DEMO_ALLOCATION_POLICY
    : selectedSummary ? allocationPolicy : null;
  const activeGoal = demo || !selectedSummary ? null : goal;
  const activeGoalProjection = demo || !selectedSummary ? null : goalProjection;
  const activeContributionRuns = demo || !selectedSummary ? [] : contributionRuns;
  const activeRebalanceRuns = demo || !selectedSummary ? [] : rebalanceRuns;
  const openContributionRun = activeContributionRuns.find((run) => run.status === 'pending' || run.status === 'approved');
  const openRebalanceRun = activeRebalanceRuns.find((run) => run.status === 'pending' || run.status === 'approved');
  const workflowBusy = goalBusy || rebalanceBusy;
  const activeTheses = demo ? DEMO_THESES : theses;

  return (
    <section className="page portfolio-page fade-in-up" aria-labelledby="portfolio-title">
      <header className="pf-hero">
        <div>
          <span className="pf-kicker">PORTFOLIO INTELLIGENCE · P9</span>
          <h1 id="portfolio-title">포트폴리오와 투자 논지</h1>
          <p>거래 원장, 검증 시세, 목표배분과 세금·수수료·슬리피지를 고려한 승인형 주문 계획을 하나의 감사 가능한 투자 결정 기록으로 연결합니다.</p>
        </div>
        <div className="pf-hero-actions">
          <span className={`pf-mode ${demo ? 'demo' : 'cloud'}`}>{demo ? 'DEMO · 합성 시세' : 'CLOUD LEDGER'}</span>
          {!demo && (
            <>
              <button type="button" className="ui-btn" onClick={() => setCreateOpen(true)}>새 포트폴리오</button>
              <button type="button" className="ui-btn primary" disabled={!selectedId} onClick={() => setTransactionOpen(true)}>거래 추가</button>
            </>
          )}
        </div>
      </header>

      {demo && (
        <div className="pf-demo-note" role="note">
          <strong>{authLoading ? '로그인 상태 확인 중' : configured ? '로그인하면 영속 원장으로 전환됩니다.' : 'Supabase 미설정 · 데모 모드'}</strong>
          <span>아래 수치는 P1 결정론적 로컬 시세와 예시 거래로 계산되며 실제 계좌나 투자 성과가 아닙니다.</span>
        </div>
      )}

      {!demo && (
        <div className="pf-toolbar">
          <label>
            <span className="sr-only">포트폴리오 선택</span>
            <select value={selectedId ?? ''} onChange={(event) => selectPortfolio(event.target.value || null)}>
              {portfolios.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label>
          <button type="button" className="ui-btn ghost" disabled={!latestReversible || busyAction} onClick={() => void reverseLatest()}>
            최근 거래 역분개
          </button>
          <button type="button" className="ui-btn ghost" disabled={!selectedId || busyAction} onClick={() => void archiveSelected()}>
            포트폴리오 보관
          </button>
          <button type="button" className="ui-btn ghost" disabled={loading} onClick={() => void refreshSelected()}>
            {loading ? '갱신 중…' : '새로고침'}
          </button>
        </div>
      )}

      {error && <p className="pf-feedback error" role="alert">{error}</p>}

      {!demo && !loading && portfolios.length === 0 && (
        <section className="pf-empty-state">
          <span aria-hidden="true">◎</span>
          <h2>첫 포트폴리오를 만드세요</h2>
          <p>입금부터 기록해야 현금·손익·리스크가 같은 원장에서 재현됩니다.</p>
          <button type="button" className="ui-btn primary" onClick={() => setCreateOpen(true)}>포트폴리오 생성</button>
        </section>
      )}

      {activeSummary && (
        <>
          <PortfolioSummaryView summary={activeSummary} />
          <PerformancePanel
            summary={activeSummary}
            transactions={activeTransactions}
            snapshots={activeSnapshots}
            benchmarkSymbol={benchmarkSymbol}
            benchmark={activeBenchmark}
            demo={demo}
            onBenchmarkChange={setBenchmarkSymbol}
          />
          <RebalancePanel
            summary={activeSummary}
            policy={activeAllocationPolicy}
            accessToken={accessToken}
            demo={demo}
            onPolicySaved={(policy) => {
              if (demo) setDemoAllocationPolicy(policy);
              else setAllocationPolicy(policy);
            }}
          />
          <GoalContributionPanel
            summary={activeSummary}
            goal={activeGoal}
            projection={activeGoalProjection}
            contributionRuns={activeContributionRuns}
            hasPolicy={Boolean(activeAllocationPolicy)}
            blockedByRebalance={Boolean(openRebalanceRun)}
            demo={demo}
            busy={workflowBusy}
            focusRunId={demo ? undefined : linkedContributionRunId ?? undefined}
            onSaveGoal={saveGoal}
            onGoalAction={mutateGoalStatus}
            onGenerate={async () => {
              if (!selectedId || !activeGoal) throw new Error('먼저 활성 투자 목표를 저장하세요.');
              await mutateContribution({ action: 'generate', portfolioId: selectedId, goalId: activeGoal.id });
            }}
            onApprove={async (runId) => {
              await mutateContribution({ action: 'approve', runId });
            }}
            onReject={async (runId, reason) => {
              await mutateContribution({ action: 'reject', runId, reason });
            }}
            onComplete={async (runId, depositAt, fills) => {
              await mutateContribution({ action: 'complete', runId, depositAt, fills });
            }}
          />
          <RebalanceWorkflowPanel
            runs={activeRebalanceRuns}
            demo={demo}
            hasPolicy={Boolean(activeAllocationPolicy)}
            blockedByContribution={Boolean(openContributionRun)}
            busy={workflowBusy}
            focusRunId={demo ? undefined : linkedRunId ?? undefined}
            onGenerate={async () => {
              if (!selectedId) throw new Error('포트폴리오를 선택해 주세요.');
              await mutateRebalance({ action: 'generate', portfolioId: selectedId });
            }}
            onApprove={async (runId) => {
              await mutateRebalance({ action: 'approve', runId });
            }}
            onReject={async (runId, reason) => {
              await mutateRebalance({ action: 'reject', runId, reason });
            }}
            onComplete={async (runId, fills) => {
              await mutateRebalance({ action: 'complete', runId, fills });
            }}
          />
          <div className="pf-lower-grid">
            <ScenarioPanel key={activeSummary.portfolio.id} summary={activeSummary} accessToken={accessToken} demo={demo} />
            <section className="pf-panel pf-ledger" aria-labelledby="pf-ledger-title">
              <div className="pf-panel-head">
                <div><h2 id="pf-ledger-title">거래 원장</h2><p>최근 거래부터 표시하며 역분개도 별도 행으로 남깁니다.</p></div>
                <span>{activeTransactions.length}개</span>
              </div>
              <div className="pf-ledger-list">
                {[...activeTransactions].reverse().slice(0, 12).map((entry) => (
                  <article key={entry.id} className={entry.kind === 'reversal' ? 'reversal' : reversedIds.has(entry.id) ? 'reversed' : ''}>
                    <div><strong>{transactionLabel(entry.kind)}</strong><span>{entry.symbol ?? '현금'}</span></div>
                    <div className="num"><strong>{transactionAmount(entry)}</strong><span>{new Date(entry.tradeAt).toLocaleString('ko-KR')}</span></div>
                  </article>
                ))}
                {!activeTransactions.length && <p className="pf-empty">거래가 없습니다.</p>}
              </div>
            </section>
          </div>
          <ThesisPanel
            portfolioId={activeSummary.portfolio.id}
            accessToken={accessToken}
            theses={activeTheses}
            demo={demo}
            onRefresh={refreshSelected}
          />
        </>
      )}

      {loading && !activeSummary && <div className="pf-loading" role="status">포트폴리오 원장과 시세를 계산하고 있습니다.</div>}

      {createOpen && accessToken && (
        <CreatePortfolioDialog
          accessToken={accessToken}
          onClose={() => setCreateOpen(false)}
          onCreated={async (created) => {
            await refreshPortfolios();
            selectPortfolio(created.id);
          }}
        />
      )}
      {transactionOpen && accessToken && selectedId && (
        <TransactionDialog
          portfolioId={selectedId}
          accessToken={accessToken}
          onClose={() => setTransactionOpen(false)}
          onSaved={refreshSelected}
        />
      )}
    </section>
  );
}
