const CENTS_PER_UNIT = 100;
const PERCENT_SCALE = 1_000_000;
const MAX_HORIZON_MONTHS = 1_200;

export interface InvestmentGoalProjectionInput {
  readonly currentValue: number;
  readonly goalValue: number;
  readonly monthlyContribution: number;
  readonly annualReturnPct: number;
  readonly horizonMonths: number;
}

export interface InvestmentGoalProjection {
  readonly status: 'on-track' | 'shortfall' | 'invalid';
  readonly currentValue: number;
  readonly goalValue: number;
  readonly monthlyContribution: number;
  readonly annualReturnPct: number;
  readonly horizonMonths: number;
  readonly projectedValue: number;
  readonly contributedPrincipal: number;
  readonly projectedGrowth: number;
  readonly shortfall: number;
  readonly surplus: number;
  readonly projectedGoalPct: number;
  readonly requiredMonthlyContribution?: number;
  readonly additionalMonthlyContribution?: number;
  readonly contributionTiming: 'end-of-month';
  readonly compounding: 'monthly-effective-rate';
  readonly brokerExecution: false;
  readonly warnings: readonly string[];
}

export interface ContributionPlanTarget {
  readonly symbol: string;
  readonly currentValue: number;
  readonly targetPct: number;
}

export interface ContributionPlanInput {
  readonly contributionAmount: number;
  readonly minOrderValue: number;
  /** Full portfolio value, including holdings that intentionally have a 0% target. */
  readonly totalValueBefore?: number;
  readonly targets: readonly ContributionPlanTarget[];
}

export type ContributionPlanDisposition =
  | 'buy'
  | 'cash-reserve'
  | 'below-minimum'
  | 'cash-exhausted'
  | 'not-underweight';

export interface ContributionPlanItem {
  readonly priority: number;
  readonly symbol: string;
  readonly currentValue: number;
  readonly currentPct: number;
  readonly targetPct: number;
  readonly targetValueAfterContribution: number;
  readonly underweightValue: number;
  readonly cashReserveValue: number;
  readonly orderValue: number;
  readonly projectedValue: number;
  readonly projectedPct: number;
  readonly remainingUnderweightValue: number;
  readonly disposition: ContributionPlanDisposition;
}

export interface ContributionPlan {
  readonly status: 'available' | 'partial' | 'invalid';
  readonly contributionAmount: number;
  readonly minOrderValue: number;
  readonly totalValueBefore: number;
  readonly totalValueAfter: number;
  readonly allocatedAmount: number;
  readonly cashTargetAmount: number;
  readonly cashRemainder: number;
  readonly items: readonly ContributionPlanItem[];
  readonly executionMode: 'advisory-only';
  readonly brokerExecution: false;
  readonly warnings: readonly string[];
}

interface NormalizedTarget {
  readonly symbol: string;
  readonly currentCents: number;
  readonly targetPct: number;
  readonly targetUnits: number;
}

interface AllocationDraft extends NormalizedTarget {
  readonly currentPct: number;
  readonly targetAfterCents: number;
  readonly underweightCents: number;
  readonly underweightPct: number;
  orderCents: number;
  cashReserveCents: number;
  disposition: ContributionPlanDisposition;
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round((value + Math.sign(value) * Number.EPSILON * Math.max(1, Math.abs(value))) * scale) / scale;
}

function toCents(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const cents = Math.round((value + Number.EPSILON * Math.max(1, value)) * CENTS_PER_UNIT);
  return Number.isSafeInteger(cents) ? cents : null;
}

function fromCents(cents: number): number {
  return cents / CENTS_PER_UNIT;
}

function uniqueWarnings(warnings: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(warnings)]);
}

function projectedCents(
  initialCents: number,
  monthlyContributionCents: number,
  monthlyRate: number,
  months: number,
): number | null {
  let balance = initialCents;
  for (let month = 0; month < months; month += 1) {
    const grown = Math.round(balance * (1 + monthlyRate));
    if (!Number.isSafeInteger(grown) || grown < 0 || grown > Number.MAX_SAFE_INTEGER - monthlyContributionCents) {
      return null;
    }
    balance = grown + monthlyContributionCents;
  }
  return balance;
}

function requiredContributionCents(
  initialCents: number,
  goalCents: number,
  monthlyRate: number,
  months: number,
  startingUpperBound: number,
): number | null {
  const withoutContributions = projectedCents(initialCents, 0, monthlyRate, months);
  if (withoutContributions === null) return null;
  if (withoutContributions >= goalCents) return 0;

  let upper = Math.max(1, startingUpperBound);
  let upperProjection = projectedCents(initialCents, upper, monthlyRate, months);
  while (upperProjection !== null && upperProjection < goalCents) {
    if (upper > Math.floor(Number.MAX_SAFE_INTEGER / 2)) return null;
    upper *= 2;
    upperProjection = projectedCents(initialCents, upper, monthlyRate, months);
  }
  if (upperProjection === null) return null;

  let lower = 0;
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2);
    const projection = projectedCents(initialCents, middle, monthlyRate, months);
    if (projection !== null && projection >= goalCents) upper = middle;
    else lower = middle + 1;
  }
  return lower;
}

function invalidGoalProjection(
  input: InvestmentGoalProjectionInput,
  warnings: readonly string[],
): InvestmentGoalProjection {
  const currentCents = toCents(input.currentValue) ?? 0;
  const goalCents = toCents(input.goalValue) ?? 0;
  const monthlyCents = toCents(input.monthlyContribution) ?? 0;
  return Object.freeze({
    status: 'invalid',
    currentValue: fromCents(currentCents),
    goalValue: fromCents(goalCents),
    monthlyContribution: fromCents(monthlyCents),
    annualReturnPct: Number.isFinite(input.annualReturnPct) ? input.annualReturnPct : 0,
    horizonMonths: Number.isInteger(input.horizonMonths) ? input.horizonMonths : 0,
    projectedValue: fromCents(currentCents),
    contributedPrincipal: fromCents(currentCents),
    projectedGrowth: 0,
    shortfall: Math.max(0, fromCents(goalCents - currentCents)),
    surplus: Math.max(0, fromCents(currentCents - goalCents)),
    projectedGoalPct: goalCents > 0 ? round(currentCents / goalCents * 100) : 0,
    contributionTiming: 'end-of-month',
    compounding: 'monthly-effective-rate',
    brokerExecution: false,
    warnings: uniqueWarnings(warnings),
  });
}

/**
 * Projects a goal using an effective monthly rate and end-of-month deposits.
 * Every monthly balance and the required contribution search are rounded to cents.
 */
export function projectInvestmentGoal(input: InvestmentGoalProjectionInput): InvestmentGoalProjection {
  const warnings: string[] = [];
  const currentCents = toCents(input.currentValue);
  const goalCents = toCents(input.goalValue);
  const monthlyCents = toCents(input.monthlyContribution);
  if (currentCents === null) warnings.push('Current value must be a non-negative safe monetary amount.');
  if (goalCents === null || goalCents <= 0) warnings.push('Goal value must be a positive safe monetary amount.');
  if (monthlyCents === null) warnings.push('Monthly contribution must be a non-negative safe monetary amount.');
  if (!Number.isInteger(input.horizonMonths) || input.horizonMonths < 1 || input.horizonMonths > MAX_HORIZON_MONTHS) {
    warnings.push(`Horizon must be an integer from 1 to ${MAX_HORIZON_MONTHS} months.`);
  }
  if (!Number.isFinite(input.annualReturnPct) || input.annualReturnPct <= -100 || input.annualReturnPct > 1_000) {
    warnings.push('Annual return must be greater than -100% and no more than 1000%.');
  }
  if (warnings.length || currentCents === null || goalCents === null || monthlyCents === null) {
    return invalidGoalProjection(input, warnings);
  }

  const monthlyRate = (1 + input.annualReturnPct / 100) ** (1 / 12) - 1;
  const projected = projectedCents(currentCents, monthlyCents, monthlyRate, input.horizonMonths);
  const required = requiredContributionCents(
    currentCents,
    goalCents,
    monthlyRate,
    input.horizonMonths,
    monthlyCents,
  );
  if (projected === null || required === null) {
    return invalidGoalProjection(input, ['Projection exceeds the supported safe monetary range.']);
  }

  const contributedPrincipalCents = currentCents + monthlyCents * input.horizonMonths;
  if (!Number.isSafeInteger(contributedPrincipalCents)) {
    return invalidGoalProjection(input, ['Contributed principal exceeds the supported safe monetary range.']);
  }
  const projectedGrowthCents = projected - contributedPrincipalCents;
  const shortfallCents = Math.max(0, goalCents - projected);
  const surplusCents = Math.max(0, projected - goalCents);

  return Object.freeze({
    status: projected >= goalCents ? 'on-track' : 'shortfall',
    currentValue: fromCents(currentCents),
    goalValue: fromCents(goalCents),
    monthlyContribution: fromCents(monthlyCents),
    annualReturnPct: round(input.annualReturnPct),
    horizonMonths: input.horizonMonths,
    projectedValue: fromCents(projected),
    contributedPrincipal: fromCents(contributedPrincipalCents),
    projectedGrowth: fromCents(projectedGrowthCents),
    shortfall: fromCents(shortfallCents),
    surplus: fromCents(surplusCents),
    projectedGoalPct: round(projected / goalCents * 100),
    requiredMonthlyContribution: fromCents(required),
    additionalMonthlyContribution: fromCents(Math.max(0, required - monthlyCents)),
    contributionTiming: 'end-of-month',
    compounding: 'monthly-effective-rate',
    brokerExecution: false,
    warnings: Object.freeze([]),
  });
}

function apportionTargetCents(totalCents: number, targets: readonly NormalizedTarget[]): ReadonlyMap<string, number> {
  const denominator = targets.reduce((sum, target) => sum + BigInt(target.targetUnits), 0n);
  const shares = targets.map((target) => {
    const numerator = BigInt(totalCents) * BigInt(target.targetUnits);
    return {
      symbol: target.symbol,
      cents: Number(numerator / denominator),
      remainder: numerator % denominator,
    };
  });
  let undistributed = totalCents - shares.reduce((sum, share) => sum + share.cents, 0);
  const remainderOrder = [...shares].sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    return left.symbol.localeCompare(right.symbol);
  });
  for (let index = 0; index < remainderOrder.length && undistributed > 0; index += 1) {
    remainderOrder[index]!.cents += 1;
    undistributed -= 1;
  }
  return new Map(shares.map((share) => [share.symbol, share.cents]));
}

function invalidContributionPlan(input: ContributionPlanInput, warnings: readonly string[]): ContributionPlan {
  const contributionCents = toCents(input.contributionAmount) ?? 0;
  const minOrderCents = toCents(input.minOrderValue) ?? 0;
  const totalBeforeCents = toCents(input.totalValueBefore ?? 0) ?? 0;
  return Object.freeze({
    status: 'invalid',
    contributionAmount: fromCents(contributionCents),
    minOrderValue: fromCents(minOrderCents),
    totalValueBefore: fromCents(totalBeforeCents),
    totalValueAfter: fromCents(totalBeforeCents + contributionCents),
    allocatedAmount: 0,
    cashTargetAmount: 0,
    cashRemainder: fromCents(contributionCents),
    items: Object.freeze([]),
    executionMode: 'advisory-only',
    brokerExecution: false,
    warnings: uniqueWarnings(warnings),
  });
}

/**
 * Directs a recurring deposit to the most underweight targets without selling.
 * Suggested orders never exceed the deposit, and sub-minimum amounts stay in cash.
 */
export function computeContributionPlan(input: ContributionPlanInput): ContributionPlan {
  const warnings: string[] = [];
  const contributionCents = toCents(input.contributionAmount);
  const minOrderCents = toCents(input.minOrderValue);
  const suppliedTotalCents = input.totalValueBefore === undefined ? undefined : toCents(input.totalValueBefore);
  if (contributionCents === null || contributionCents <= 0) {
    warnings.push('Contribution amount must be a positive safe monetary amount.');
  }
  if (minOrderCents === null) warnings.push('Minimum order value must be a non-negative safe monetary amount.');
  if (input.totalValueBefore !== undefined && suppliedTotalCents === null) {
    warnings.push('Total portfolio value must be a non-negative safe monetary amount.');
  }
  if (!input.targets.length) warnings.push('At least one allocation target is required.');

  const symbols = new Set<string>();
  const targets: NormalizedTarget[] = [];
  let targetPctTotal = 0;
  for (const target of input.targets) {
    const symbol = target.symbol.trim().toUpperCase();
    const currentCents = toCents(target.currentValue);
    const targetUnits = Number.isFinite(target.targetPct)
      ? Math.round(target.targetPct * PERCENT_SCALE)
      : 0;
    if (!symbol || symbol.length > 20 || !/^[A-Z0-9.:-]+$/.test(symbol)) {
      warnings.push('Every target must have a valid symbol.');
    } else if (symbols.has(symbol)) {
      warnings.push(`${symbol} is duplicated.`);
    }
    symbols.add(symbol);
    if (currentCents === null) warnings.push(`${symbol || 'Unknown target'} has an invalid current value.`);
    if (!Number.isFinite(target.targetPct) || target.targetPct <= 0 || target.targetPct > 100 || targetUnits <= 0) {
      warnings.push(`${symbol || 'Unknown target'} must have a target percentage above 0% and at most 100%.`);
    } else {
      targetPctTotal += target.targetPct;
    }
    if (symbol && currentCents !== null && targetUnits > 0) {
      targets.push({ symbol, currentCents, targetPct: round(target.targetPct), targetUnits });
    }
  }
  if (Math.abs(targetPctTotal - 100) > 0.01) warnings.push('Target percentages must total 100%.');
  if (warnings.length || contributionCents === null || minOrderCents === null) {
    return invalidContributionPlan(input, warnings);
  }

  const representedCents = targets.reduce((sum, target) => sum + target.currentCents, 0);
  const totalBeforeCents = suppliedTotalCents ?? representedCents;
  if (totalBeforeCents < representedCents) {
    return invalidContributionPlan(input, ['Total portfolio value cannot be below the represented target values.']);
  }
  if (!Number.isSafeInteger(totalBeforeCents) || totalBeforeCents > Number.MAX_SAFE_INTEGER - contributionCents) {
    return invalidContributionPlan(input, ['Portfolio value exceeds the supported safe monetary range.']);
  }
  const totalAfterCents = totalBeforeCents + contributionCents;
  const targetCents = apportionTargetCents(totalAfterCents, targets);
  const drafts: AllocationDraft[] = targets.map((target): AllocationDraft => {
    const currentPct = totalBeforeCents > 0 ? target.currentCents / totalBeforeCents * 100 : 0;
    const targetAfterCents = targetCents.get(target.symbol) ?? 0;
    const underweightCents = Math.max(0, targetAfterCents - target.currentCents);
    return {
      ...target,
      currentPct,
      targetAfterCents,
      underweightCents,
      underweightPct: target.targetPct - currentPct,
      orderCents: 0,
      cashReserveCents: 0,
      disposition: underweightCents > 0 ? 'cash-exhausted' : 'not-underweight',
    };
  }).sort((left, right) => (
    Number(right.symbol === 'CASH') - Number(left.symbol === 'CASH')
    || right.underweightPct - left.underweightPct
    || right.underweightCents - left.underweightCents
    || left.symbol.localeCompare(right.symbol)
  ));

  const cashDraft = drafts.find((draft) => draft.symbol === 'CASH');
  const cashTargetCents = cashDraft ? Math.min(cashDraft.underweightCents, contributionCents) : 0;
  if (cashDraft) {
    cashDraft.cashReserveCents = cashTargetCents;
    cashDraft.disposition = 'cash-reserve';
  }

  let remainingInvestableCents = contributionCents - cashTargetCents;
  for (const draft of drafts) {
    if (draft.symbol === 'CASH') continue;
    if (draft.underweightCents <= 0) continue;
    const candidate = Math.min(draft.underweightCents, remainingInvestableCents);
    if (candidate <= 0) {
      draft.disposition = 'cash-exhausted';
    } else if (candidate < minOrderCents) {
      draft.disposition = 'below-minimum';
    } else {
      draft.orderCents = candidate;
      draft.disposition = 'buy';
      remainingInvestableCents -= candidate;
    }
  }

  const items: readonly ContributionPlanItem[] = Object.freeze(drafts.map((draft, index) => {
    const projectedCents = draft.currentCents + draft.orderCents + draft.cashReserveCents;
    return Object.freeze({
      priority: index + 1,
      symbol: draft.symbol,
      currentValue: fromCents(draft.currentCents),
      currentPct: round(draft.currentPct),
      targetPct: draft.targetPct,
      targetValueAfterContribution: fromCents(draft.targetAfterCents),
      underweightValue: fromCents(draft.underweightCents),
      cashReserveValue: fromCents(draft.cashReserveCents),
      orderValue: fromCents(draft.orderCents),
      projectedValue: fromCents(projectedCents),
      projectedPct: totalAfterCents > 0 ? round(projectedCents / totalAfterCents * 100) : 0,
      remainingUnderweightValue: fromCents(Math.max(
        0,
        draft.underweightCents - draft.orderCents - draft.cashReserveCents,
      )),
      disposition: draft.disposition,
    });
  }));
  const allocatedCents = contributionCents - cashTargetCents - remainingInvestableCents;
  const cashRemainderCents = contributionCents - allocatedCents;
  if (items.some((item) => item.disposition === 'below-minimum')) {
    warnings.push('One or more target amounts were left in cash because they were below the minimum order value.');
  }
  if (remainingInvestableCents > 0) warnings.push('Some contribution cash remains unallocated beyond the cash target.');

  return Object.freeze({
    status: remainingInvestableCents > 0 ? 'partial' : 'available',
    contributionAmount: fromCents(contributionCents),
    minOrderValue: fromCents(minOrderCents),
    totalValueBefore: fromCents(totalBeforeCents),
    totalValueAfter: fromCents(totalAfterCents),
    allocatedAmount: fromCents(allocatedCents),
    cashTargetAmount: fromCents(cashTargetCents),
    cashRemainder: fromCents(cashRemainderCents),
    items,
    executionMode: 'advisory-only',
    brokerExecution: false,
    warnings: uniqueWarnings(warnings),
  });
}
