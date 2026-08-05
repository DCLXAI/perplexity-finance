import { z } from 'zod';

export type MonitorRuleKind = 'thesis_invalidation' | 'risk_threshold' | 'stress_scenario';

/** Keys of PortfolioRiskMetrics that carry a comparable number. */
export type RiskMetricKey =
  | 'annualizedVolatilityPct'
  | 'historicalVar95Pct'
  | 'historicalCvar95Pct'
  | 'maxDrawdownPct'
  | 'concentrationHhi'
  | 'topHoldingPct';

const RISK_METRIC_KEYS = [
  'annualizedVolatilityPct',
  'historicalVar95Pct',
  'historicalCvar95Pct',
  'maxDrawdownPct',
  'concentrationHhi',
  'topHoldingPct',
] as const;

/**
 * The route's top-level `symbol` field carries the same character class, but
 * `resolveRuleSymbol` derives the persisted `monitor_rules.symbol` column FROM `spec.symbol`,
 * so the route regex never actually constrains the stored value. Without this check a spec
 * symbol such as `"AAPL BAR"` is accepted, can never match a holding, and the rule defers
 * forever.
 */
const symbolSchema = z
  .string()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9.:-]+$/)
  .refine((value) => value === value.toUpperCase(), { message: 'symbol must be uppercase' });

const percentSchema = z.number().finite().min(0).max(1_000);
/**
 * A threshold of 0 breaches on any movement at all, so the rule latches permanently on its
 * first evaluation and can never notify again. Thresholds must be strictly positive.
 */
const positivePercentSchema = z.number().finite().positive().max(1_000);

const thesisInvalidationSchema = z.discriminatedUnion('condition', [
  z.object({ condition: z.literal('price_below'), symbol: symbolSchema, value: z.number().finite().positive() }).strict(),
  z.object({ condition: z.literal('price_above'), symbol: symbolSchema, value: z.number().finite().positive() }).strict(),
  z.object({ condition: z.literal('drawdown_from_entry_pct'), symbol: symbolSchema, value: percentSchema }).strict(),
  z.object({ condition: z.literal('weight_above_pct'), symbol: symbolSchema, value: percentSchema }).strict(),
  z.object({
    condition: z.literal('no_verified_price_days'),
    symbol: symbolSchema,
    value: z.number().int().min(1).max(365),
  }).strict(),
]);

const riskThresholdSchema = z.object({
  metric: z.enum(RISK_METRIC_KEYS),
  comparison: z.enum(['above', 'below']),
  value: z.number().finite().min(-1_000).max(1_000),
}).strict();

const stressScenarioSchema = z.object({
  shocks: z
    .array(z.object({
      targetType: z.enum(['all', 'symbol', 'sector', 'asset-kind']),
      target: z.string().min(1).max(40),
      changePct: z.number().finite().min(-100).max(1_000),
    }).strict())
    .min(1)
    .max(20),
  maxProjectedLossPct: positivePercentSchema,
}).strict();

export type ThesisInvalidationSpec = z.infer<typeof thesisInvalidationSchema>;
export type RiskThresholdSpec = z.infer<typeof riskThresholdSchema>;
export type StressScenarioSpec = z.infer<typeof stressScenarioSchema>;
export type MonitorRuleSpec = ThesisInvalidationSpec | RiskThresholdSpec | StressScenarioSpec;

export const monitorRuleSpecSchema = {
  thesis_invalidation: thesisInvalidationSchema,
  risk_threshold: riskThresholdSchema,
  stress_scenario: stressScenarioSchema,
} as const;

/**
 * Parses a stored or user-supplied spec against its kind. Throws on mismatch, so a
 * malformed row can never reach the evaluator and be silently treated as "not breached".
 */
export function parseMonitorRuleSpec(kind: MonitorRuleKind, value: unknown): MonitorRuleSpec {
  return monitorRuleSpecSchema[kind].parse(value) as MonitorRuleSpec;
}

export function defaultIntervalHours(kind: MonitorRuleKind): number {
  return kind === 'stress_scenario' ? 168 : 24;
}
