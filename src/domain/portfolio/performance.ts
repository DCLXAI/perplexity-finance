import type {
  DataProvenance,
  PortfolioSnapshot,
  PortfolioTransaction,
  RemoteCandle,
} from '@/shared/api';
import { activePortfolioTransactions } from './ledger.js';

const DAY_MS = 86_400_000;
const YEAR_DAYS = 365;
const EPSILON = 1e-9;

export interface PortfolioPerformancePoint {
  readonly capturedAt: string;
  readonly totalValue: number;
  readonly cumulativeTwrPct: number;
  readonly benchmarkPct?: number;
}

export interface PortfolioPerformanceResult {
  readonly status: 'available' | 'partial' | 'insufficient-data';
  readonly observations: number;
  readonly startAt?: string;
  readonly endAt?: string;
  readonly timeWeightedReturnPct?: number;
  readonly annualizedTwrPct?: number;
  readonly moneyWeightedReturnPct?: number;
  readonly benchmarkSymbol: string;
  readonly benchmarkReturnPct?: number;
  readonly excessReturnPct?: number;
  readonly benchmarkProvenance?: DataProvenance;
  readonly flowAdjustedIntervals: number;
  readonly points: readonly PortfolioPerformancePoint[];
  readonly warnings: readonly string[];
}

export interface PortfolioPerformanceInput {
  readonly snapshots: readonly PortfolioSnapshot[];
  readonly transactions: readonly PortfolioTransaction[];
  readonly benchmarkSymbol: string;
  readonly benchmarkCandles: readonly RemoteCandle[];
  readonly benchmarkProvenance?: DataProvenance;
}

interface DatedCashFlow {
  readonly time: number;
  readonly amount: number;
}

function round(value: number, digits = 6): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function timestamp(value: string): number | null {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function orderedSnapshots(snapshots: readonly PortfolioSnapshot[]): readonly PortfolioSnapshot[] {
  const byTime = new Map<number, PortfolioSnapshot>();
  for (const snapshot of snapshots) {
    const time = timestamp(snapshot.capturedAt);
    if (
      time === null
      || !Number.isFinite(snapshot.totalValue)
      || snapshot.totalValue < 0
      || !Number.isFinite(snapshot.netContributions)
    ) continue;
    byTime.set(time, snapshot);
  }
  return Object.freeze([...byTime.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, snapshot]) => snapshot));
}

function npv(rate: number, cashFlows: readonly DatedCashFlow[], firstTime: number): number {
  if (rate <= -1) return Number.POSITIVE_INFINITY;
  return cashFlows.reduce((sum, cashFlow) => {
    const years = (cashFlow.time - firstTime) / DAY_MS / YEAR_DAYS;
    return sum + cashFlow.amount / ((1 + rate) ** years);
  }, 0);
}

export function calculatePortfolioXirr(
  transactions: readonly PortfolioTransaction[],
  endingValue: number,
  endingAt: string,
): number | undefined {
  const endingTime = timestamp(endingAt);
  if (endingTime === null || !Number.isFinite(endingValue) || endingValue < 0) return undefined;

  const cashFlows: DatedCashFlow[] = activePortfolioTransactions(transactions).flatMap((transaction) => {
    if (transaction.kind !== 'deposit' && transaction.kind !== 'withdrawal') return [];
    const time = timestamp(transaction.tradeAt);
    if (time === null || time > endingTime || !Number.isFinite(transaction.cashAmount) || transaction.cashAmount <= 0) return [];
    return [{
      time,
      amount: transaction.kind === 'deposit' ? -transaction.cashAmount : transaction.cashAmount,
    }];
  });
  cashFlows.push({ time: endingTime, amount: endingValue });
  cashFlows.sort((left, right) => left.time - right.time);

  if (!cashFlows.some((flow) => flow.amount < 0) || !cashFlows.some((flow) => flow.amount > 0)) return undefined;
  const firstTime = cashFlows[0]?.time;
  if (firstTime === undefined || endingTime - firstTime < DAY_MS) return undefined;

  let lower = -0.9999;
  let upper = 1;
  let lowerValue = npv(lower, cashFlows, firstTime);
  let upperValue = npv(upper, cashFlows, firstTime);
  while (Math.sign(lowerValue) === Math.sign(upperValue) && upper < 1_000_000) {
    upper = upper * 2 + 1;
    upperValue = npv(upper, cashFlows, firstTime);
  }
  if (!Number.isFinite(lowerValue) || !Number.isFinite(upperValue) || Math.sign(lowerValue) === Math.sign(upperValue)) {
    return undefined;
  }

  for (let iteration = 0; iteration < 200; iteration += 1) {
    const middle = (lower + upper) / 2;
    const middleValue = npv(middle, cashFlows, firstTime);
    if (!Number.isFinite(middleValue)) return undefined;
    if (Math.abs(middleValue) < 1e-7) return round(middle * 100);
    if (Math.sign(middleValue) === Math.sign(lowerValue)) {
      lower = middle;
      lowerValue = middleValue;
    } else {
      upper = middle;
      upperValue = middleValue;
    }
  }
  return round(((lower + upper) / 2) * 100);
}

function benchmarkReturns(
  snapshots: readonly PortfolioSnapshot[],
  candles: readonly RemoteCandle[],
): ReadonlyMap<string, number> {
  const orderedCandles = candles
    .filter((candle) => Number.isFinite(candle.time) && Number.isFinite(candle.close) && candle.close > 0)
    .sort((left, right) => left.time - right.time);
  const returns = new Map<string, number>();
  let cursor = 0;
  let latestClose: number | undefined;
  let baseClose: number | undefined;
  for (const snapshot of snapshots) {
    const time = timestamp(snapshot.capturedAt);
    if (time === null) continue;
    while (cursor < orderedCandles.length && orderedCandles[cursor].time * 1_000 <= time) {
      latestClose = orderedCandles[cursor].close;
      cursor += 1;
    }
    if (latestClose === undefined) continue;
    baseClose ??= latestClose;
    returns.set(snapshot.capturedAt, round(((latestClose / baseClose) - 1) * 100));
  }
  return returns;
}

export function computePortfolioPerformance(input: PortfolioPerformanceInput): PortfolioPerformanceResult {
  const snapshots = orderedSnapshots(input.snapshots);
  const warnings: string[] = [];
  if (snapshots.length < 2) {
    return Object.freeze({
      status: 'insufficient-data',
      observations: snapshots.length,
      benchmarkSymbol: input.benchmarkSymbol,
      benchmarkProvenance: input.benchmarkProvenance,
      flowAdjustedIntervals: 0,
      points: Object.freeze([]),
      warnings: Object.freeze(['수익률을 계산하려면 서로 다른 시점의 스냅숏이 두 개 이상 필요합니다.']),
    });
  }

  const benchmarkBySnapshot = benchmarkReturns(snapshots, input.benchmarkCandles);
  let linkedGrowth = 1;
  let validIntervals = 0;
  let flowAdjustedIntervals = 0;
  const points: PortfolioPerformancePoint[] = [{
    capturedAt: snapshots[0].capturedAt,
    totalValue: snapshots[0].totalValue,
    cumulativeTwrPct: 0,
    ...(benchmarkBySnapshot.has(snapshots[0].capturedAt)
      ? { benchmarkPct: benchmarkBySnapshot.get(snapshots[0].capturedAt) }
      : {}),
  }];

  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = snapshots[index - 1];
    const current = snapshots[index];
    const externalFlow = current.netContributions - previous.netContributions;
    if (Math.abs(externalFlow) > 0.005) flowAdjustedIntervals += 1;
    if (previous.totalValue <= EPSILON) {
      warnings.push('0 이하의 시작 평가액이 있는 구간은 연결 수익률에서 제외했습니다.');
    } else {
      const periodReturn = (current.totalValue - externalFlow) / previous.totalValue - 1;
      if (!Number.isFinite(periodReturn) || periodReturn < -1 - EPSILON) {
        warnings.push('평가액과 순입금 변화가 일치하지 않는 구간은 연결 수익률에서 제외했습니다.');
      } else {
        linkedGrowth *= Math.max(0, 1 + periodReturn);
        validIntervals += 1;
      }
    }
    points.push({
      capturedAt: current.capturedAt,
      totalValue: current.totalValue,
      cumulativeTwrPct: round((linkedGrowth - 1) * 100),
      ...(benchmarkBySnapshot.has(current.capturedAt)
        ? { benchmarkPct: benchmarkBySnapshot.get(current.capturedAt) }
        : {}),
    });
  }

  if (flowAdjustedIntervals > 0) {
    warnings.push('현금흐름은 인접 스냅숏의 순입금 변화로 보정했으며, 정확한 입출금 시점의 평가액이 없으면 근사치입니다.');
  }
  const benchmarkPoints = points.filter((point) => point.benchmarkPct !== undefined);
  if (benchmarkPoints.length < 2) warnings.push(`${input.benchmarkSymbol} 벤치마크 비교에 필요한 히스토리가 부족합니다.`);
  if (input.benchmarkProvenance && ['fallback', 'mock', 'stale'].includes(input.benchmarkProvenance.mode)) {
    warnings.push(`${input.benchmarkSymbol} 벤치마크가 ${input.benchmarkProvenance.mode} 데이터이므로 검증 비교로 사용할 수 없습니다.`);
  }

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const timeWeightedReturnPct = validIntervals > 0 ? round((linkedGrowth - 1) * 100) : undefined;
  const elapsedYears = ((timestamp(last.capturedAt) ?? 0) - (timestamp(first.capturedAt) ?? 0)) / DAY_MS / YEAR_DAYS;
  const annualizedTwrPct = timeWeightedReturnPct !== undefined && elapsedYears > 0 && linkedGrowth >= 0
    ? round(((linkedGrowth ** (1 / elapsedYears)) - 1) * 100)
    : undefined;
  const moneyWeightedReturnPct = calculatePortfolioXirr(input.transactions, last.totalValue, last.capturedAt);
  if (moneyWeightedReturnPct === undefined) warnings.push('유효한 입출금 현금흐름이 부족해 XIRR을 계산하지 못했습니다.');
  const benchmarkReturnPct = benchmarkPoints.length >= 2 ? benchmarkPoints.at(-1)?.benchmarkPct : undefined;
  const excessReturnPct = timeWeightedReturnPct !== undefined && benchmarkReturnPct !== undefined
    ? round(timeWeightedReturnPct - benchmarkReturnPct)
    : undefined;
  const status = validIntervals === 0
    ? 'insufficient-data'
    : benchmarkReturnPct === undefined || moneyWeightedReturnPct === undefined
      ? 'partial'
      : 'available';

  return Object.freeze({
    status,
    observations: snapshots.length,
    startAt: first.capturedAt,
    endAt: last.capturedAt,
    ...(timeWeightedReturnPct === undefined ? {} : { timeWeightedReturnPct }),
    ...(annualizedTwrPct === undefined ? {} : { annualizedTwrPct }),
    ...(moneyWeightedReturnPct === undefined ? {} : { moneyWeightedReturnPct }),
    benchmarkSymbol: input.benchmarkSymbol,
    ...(benchmarkReturnPct === undefined ? {} : { benchmarkReturnPct }),
    ...(excessReturnPct === undefined ? {} : { excessReturnPct }),
    benchmarkProvenance: input.benchmarkProvenance,
    flowAdjustedIntervals,
    points: Object.freeze(points.map((point) => Object.freeze(point))),
    warnings: Object.freeze([...new Set(warnings)]),
  });
}
