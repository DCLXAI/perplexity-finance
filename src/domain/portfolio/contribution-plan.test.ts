import { describe, expect, it } from 'vitest';
import { computeContributionPlan, projectInvestmentGoal } from './contribution-plan.js';

describe('projectInvestmentGoal', () => {
  it('projects end-of-month contributions and derives the exact required monthly amount', () => {
    const projection = projectInvestmentGoal({
      currentValue: 1_000,
      goalValue: 2_200,
      monthlyContribution: 100,
      annualReturnPct: 0,
      horizonMonths: 12,
    });

    expect(projection).toMatchObject({
      status: 'on-track',
      projectedValue: 2_200,
      contributedPrincipal: 2_200,
      projectedGrowth: 0,
      shortfall: 0,
      requiredMonthlyContribution: 100,
      additionalMonthlyContribution: 0,
      contributionTiming: 'end-of-month',
      brokerExecution: false,
    });
  });

  it('reports a shortfall and the additional recurring contribution without fractional cents', () => {
    const projection = projectInvestmentGoal({
      currentValue: 0,
      goalValue: 1_200,
      monthlyContribution: 50,
      annualReturnPct: 0,
      horizonMonths: 12,
    });

    expect(projection).toMatchObject({
      status: 'shortfall',
      projectedValue: 600,
      shortfall: 600,
      requiredMonthlyContribution: 100,
      additionalMonthlyContribution: 50,
    });
    expect(Number.isInteger((projection.requiredMonthlyContribution ?? 0) * 100)).toBe(true);
  });

  it('is deterministic under monthly compounding and rejects unsafe assumptions', () => {
    const input = {
      currentValue: 12_345.67,
      goalValue: 30_000,
      monthlyContribution: 321.09,
      annualReturnPct: 7,
      horizonMonths: 36,
    } as const;
    expect(projectInvestmentGoal(input)).toEqual(projectInvestmentGoal(input));
    expect(projectInvestmentGoal({ ...input, horizonMonths: 1.5 }).status).toBe('invalid');
    expect(projectInvestmentGoal({ ...input, annualReturnPct: -100 }).status).toBe('invalid');
  });
});

describe('computeContributionPlan', () => {
  it('directs new cash to the most underweight asset without proposing sales', () => {
    const plan = computeContributionPlan({
      contributionAmount: 200,
      minOrderValue: 10,
      targets: [
        { symbol: 'AAA', currentValue: 800, targetPct: 50 },
        { symbol: 'BBB', currentValue: 200, targetPct: 50 },
      ],
    });

    expect(plan).toMatchObject({
      status: 'available',
      contributionAmount: 200,
      allocatedAmount: 200,
      cashRemainder: 0,
      executionMode: 'advisory-only',
      brokerExecution: false,
    });
    expect(plan.items.find((item) => item.symbol === 'BBB')).toMatchObject({
      priority: 1,
      disposition: 'buy',
      orderValue: 200,
      projectedValue: 400,
    });
    expect(plan.items.find((item) => item.symbol === 'AAA')).toMatchObject({
      disposition: 'not-underweight',
      orderValue: 0,
    });
    expect(plan.items.every((item) => item.orderValue >= 0)).toBe(true);
  });

  it('keeps sub-minimum target amounts as an exact cash remainder', () => {
    const plan = computeContributionPlan({
      contributionAmount: 100,
      minOrderValue: 20,
      targets: [
        { symbol: 'AAA', currentValue: 0, targetPct: 60 },
        { symbol: 'BBB', currentValue: 0, targetPct: 25 },
        { symbol: 'CCC', currentValue: 0, targetPct: 15 },
      ],
    });

    expect(plan.status).toBe('partial');
    expect(plan.allocatedAmount).toBe(85);
    expect(plan.cashRemainder).toBe(15);
    expect(plan.items.map(({ symbol, orderValue, disposition }) => ({ symbol, orderValue, disposition }))).toEqual([
      { symbol: 'AAA', orderValue: 60, disposition: 'buy' },
      { symbol: 'BBB', orderValue: 25, disposition: 'buy' },
      { symbol: 'CCC', orderValue: 0, disposition: 'below-minimum' },
    ]);
    expect(plan.allocatedAmount + plan.cashRemainder).toBe(plan.contributionAmount);
  });

  it('reserves the CASH target before suggesting non-cash buys', () => {
    const plan = computeContributionPlan({
      contributionAmount: 200,
      minOrderValue: 10,
      targets: [
        { symbol: 'AAA', currentValue: 700, targetPct: 80 },
        { symbol: 'cash', currentValue: 100, targetPct: 20 },
      ],
    });

    expect(plan).toMatchObject({
      status: 'available',
      contributionAmount: 200,
      allocatedAmount: 100,
      cashTargetAmount: 100,
      cashRemainder: 100,
    });
    expect(plan.items[0]).toMatchObject({
      symbol: 'CASH',
      disposition: 'cash-reserve',
      cashReserveValue: 100,
      orderValue: 0,
      projectedValue: 200,
      remainingUnderweightValue: 0,
    });
    expect(plan.items.find((item) => item.symbol === 'AAA')).toMatchObject({
      disposition: 'buy',
      cashReserveValue: 0,
      orderValue: 100,
    });
    expect(plan.items.filter((item) => item.symbol !== 'CASH').reduce((sum, item) => sum + item.orderValue, 0))
      .toBe(plan.allocatedAmount);
    expect(plan.allocatedAmount + plan.cashRemainder).toBe(plan.contributionAmount);
  });

  it('is partial when cash remains beyond the intentional CASH target', () => {
    const plan = computeContributionPlan({
      contributionAmount: 200,
      minOrderValue: 150,
      targets: [
        { symbol: 'AAA', currentValue: 700, targetPct: 80 },
        { symbol: 'CASH', currentValue: 100, targetPct: 20 },
      ],
    });

    expect(plan).toMatchObject({
      status: 'partial',
      allocatedAmount: 0,
      cashTargetAmount: 100,
      cashRemainder: 200,
    });
    expect(plan.items.find((item) => item.symbol === 'CASH')).toMatchObject({
      disposition: 'cash-reserve',
      orderValue: 0,
    });
    expect(plan.items.find((item) => item.symbol === 'AAA')).toMatchObject({
      disposition: 'below-minimum',
      orderValue: 0,
    });
  });

  it('uses deterministic largest-remainder cents without losing contribution money', () => {
    const plan = computeContributionPlan({
      contributionAmount: 0.03,
      minOrderValue: 0,
      targets: [
        { symbol: 'BBB', currentValue: 0, targetPct: 50 },
        { symbol: 'AAA', currentValue: 0, targetPct: 50 },
      ],
    });

    expect(plan.items.map(({ symbol, orderValue }) => ({ symbol, orderValue }))).toEqual([
      { symbol: 'AAA', orderValue: 0.02 },
      { symbol: 'BBB', orderValue: 0.01 },
    ]);
    expect(plan.allocatedAmount).toBe(0.03);
    expect(plan.cashRemainder).toBe(0);
    expect(plan.items.reduce((sum, item) => sum + item.orderValue, 0)).toBe(0.03);
  });

  it('rejects duplicate or unbalanced targets without emitting orders', () => {
    const plan = computeContributionPlan({
      contributionAmount: 100,
      minOrderValue: 10,
      targets: [
        { symbol: 'aaa', currentValue: 0, targetPct: 60 },
        { symbol: 'AAA', currentValue: 0, targetPct: 20 },
      ],
    });

    expect(plan.status).toBe('invalid');
    expect(plan.items).toEqual([]);
    expect(plan.allocatedAmount).toBe(0);
    expect(plan.cashRemainder).toBe(100);
    expect(plan.brokerExecution).toBe(false);
  });

  it('includes off-target holdings in post-contribution target values without buying them', () => {
    const plan = computeContributionPlan({
      contributionAmount: 100,
      minOrderValue: 10,
      totalValueBefore: 1_000,
      targets: [
        { symbol: 'AAA', currentValue: 200, targetPct: 50 },
        { symbol: 'BBB', currentValue: 200, targetPct: 50 },
      ],
    });

    expect(plan.totalValueBefore).toBe(1_000);
    expect(plan.items.map(({ symbol, targetValueAfterContribution, orderValue }) => ({
      symbol,
      targetValueAfterContribution,
      orderValue,
    }))).toEqual([
      { symbol: 'AAA', targetValueAfterContribution: 550, orderValue: 100 },
      { symbol: 'BBB', targetValueAfterContribution: 550, orderValue: 0 },
    ]);
    expect(plan.allocatedAmount).toBe(100);
  });
});
