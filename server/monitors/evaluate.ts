import { runPortfolioScenario } from '../../src/domain/portfolio/scenario.js';
import type {
  PortfolioHolding,
  PortfolioRiskMetrics,
  PortfolioSummary,
  PortfolioValuationQuality,
} from '../../src/shared/api.js';
import {
  parseMonitorRuleSpec,
  type MonitorRuleKind,
  type MonitorRuleSpec,
  type RiskThresholdSpec,
  type StressScenarioSpec,
  type ThesisInvalidationSpec,
} from './rules.js';

export type MonitorLatchState = 'armed' | 'latched';
export type MonitorOutcome = 'breached' | 'clear' | 'deferred';

export interface MonitorObservation {
  readonly portfolioId: string;
  readonly asOfISO: string;
  readonly valuationQuality: PortfolioValuationQuality;
  readonly holdings: readonly PortfolioHolding[];
  readonly risk: PortfolioRiskMetrics;
  readonly summary: PortfolioSummary;
  /** Symbol -> ISO timestamp of the last verified price, when it is currently unverified. */
  readonly unverifiedSinceISO?: Readonly<Record<string, string>>;
}

export interface MonitorRuleInput {
  readonly id: string;
  readonly kind: MonitorRuleKind;
  readonly spec: MonitorRuleSpec;
  readonly state: MonitorLatchState;
  readonly ruleVersion: number;
}

export interface EvaluationOutcome {
  readonly outcome: MonitorOutcome;
  readonly observedValue?: number;
  readonly threshold?: number;
  readonly reason?: string;
}

function deferred(reason: string): EvaluationOutcome {
  return Object.freeze({ outcome: 'deferred' as const, reason });
}

function decide(breached: boolean, observedValue: number, threshold: number): EvaluationOutcome {
  if (!Number.isFinite(observedValue)) {
    return deferred('관측값을 계산할 수 없어 판정하지 않습니다.');
  }
  return Object.freeze({
    outcome: breached ? ('breached' as const) : ('clear' as const),
    observedValue,
    threshold,
  });
}

function evaluateThesis(
  spec: ThesisInvalidationSpec,
  observation: MonitorObservation,
): EvaluationOutcome {
  const held = observation.holdings.find((candidate) => candidate.symbol === spec.symbol);
  if (!held) return deferred(`${spec.symbol}을 보유하고 있지 않아 판정을 건너뜁니다.`);

  // no_verified_price_days is the one condition that is *about* missing verification, so it
  // reads the unverified clock instead of requiring a verified holding.
  if (spec.condition === 'no_verified_price_days') {
    if (held.valuationQuality === 'verified') return decide(false, 0, spec.value);
    const since = observation.unverifiedSinceISO?.[spec.symbol];
    // Unverified with no provider timestamp: we cannot say how long it has been stale.
    // Returning `clear` here would silence the one rule that exists to catch this.
    if (!since) return deferred(`${spec.symbol}의 마지막 검증 시각을 알 수 없습니다.`);
    const days = (Date.parse(observation.asOfISO) - Date.parse(since)) / 86_400_000;
    if (!Number.isFinite(days)) return deferred('마지막 검증 시각을 읽을 수 없습니다.');
    return decide(days > spec.value, Math.max(0, days), spec.value);
  }

  if (held.valuationQuality !== 'verified') {
    return deferred(`${spec.symbol}의 시세가 verified가 아니라 판정하지 않습니다.`);
  }
  const price = held.price;
  if (price === undefined || !Number.isFinite(price) || price <= 0) {
    return deferred(`${spec.symbol}의 사용 가능한 시세가 없습니다.`);
  }

  switch (spec.condition) {
    case 'price_below':
      return decide(price < spec.value, price, spec.value);
    case 'price_above':
      return decide(price > spec.value, price, spec.value);
    case 'drawdown_from_entry_pct': {
      if (held.averageCost <= 0) return deferred(`${spec.symbol}의 평균단가가 없습니다.`);
      const drawdown = Math.max(0, ((held.averageCost - price) / held.averageCost) * 100);
      return decide(drawdown > spec.value, drawdown, spec.value);
    }
    case 'weight_above_pct':
      return decide(held.allocationPct > spec.value, held.allocationPct, spec.value);
  }
}

function evaluateRisk(spec: RiskThresholdSpec, observation: MonitorObservation): EvaluationOutcome {
  const { risk } = observation;
  if (risk.dataQuality !== 'verified') {
    return deferred('리스크 이력 품질이 verified가 아니라 판정하지 않습니다.');
  }
  if (risk.status !== 'available') {
    return deferred(`리스크 지표 상태가 ${risk.status}입니다.`);
  }
  const observed = risk[spec.metric];
  if (observed === undefined || !Number.isFinite(observed)) {
    return deferred(`${spec.metric} 지표가 계산되지 않았습니다.`);
  }
  const breached = spec.comparison === 'above' ? observed > spec.value : observed < spec.value;
  return decide(breached, observed, spec.value);
}

function evaluateStress(spec: StressScenarioSpec, observation: MonitorObservation): EvaluationOutcome {
  if (observation.valuationQuality !== 'verified') {
    return deferred('포트폴리오 평가 품질이 verified가 아니라 판정하지 않습니다.');
  }
  const result = runPortfolioScenario(observation.summary, spec.shocks);
  // changePct is signed; a loss is negative. Compare magnitude of the loss only.
  const lossPct = Math.max(0, -result.changePct);
  return decide(lossPct > spec.maxProjectedLossPct, lossPct, spec.maxProjectedLossPct);
}

/**
 * Evaluates one rule against one shared observation. Returns `deferred` — never a verdict —
 * whenever the inputs are not verified, so a provider wobble cannot produce an alert.
 */
export function evaluateRule(
  rule: MonitorRuleInput,
  observation: MonitorObservation,
): EvaluationOutcome {
  let spec: MonitorRuleSpec;
  try {
    spec = parseMonitorRuleSpec(rule.kind, rule.spec);
  } catch {
    return deferred('규칙 정의가 현재 스키마와 맞지 않습니다.');
  }

  // Each evaluator owns the gate that matches its own scope. There is deliberately no
  // portfolio-wide gate here: `valuationQuality` is 'mixed' whenever holdings span more than
  // one quality class, so a single unrelated stale position would otherwise blind every
  // thesis rule in the portfolio — and would make no_verified_price_days, which exists to
  // fire precisely when something is unverified, permanently unable to fire.
  switch (rule.kind) {
    case 'thesis_invalidation':
      return evaluateThesis(spec as ThesisInvalidationSpec, observation);
    case 'risk_threshold':
      return evaluateRisk(spec as RiskThresholdSpec, observation);
    case 'stress_scenario':
      return evaluateStress(spec as StressScenarioSpec, observation);
  }
}

export function nextState(current: MonitorLatchState, outcome: MonitorOutcome): MonitorLatchState {
  if (outcome === 'deferred') return current;
  return outcome === 'breached' ? 'latched' : 'armed';
}

/** Fires only on the armed -> latched transition. */
export function shouldNotify(current: MonitorLatchState, outcome: MonitorOutcome): boolean {
  return current === 'armed' && outcome === 'breached';
}
