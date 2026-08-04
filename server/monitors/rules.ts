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

const symbolSchema = z
  .string()
  .min(1)
  .max(20)
  .refine((value) => value === value.toUpperCase(), { message: 'symbol must be uppercase' });

const percentSchema = z.number().finite().min(0).max(1_000);

const thesisInvalidationSchema = z.discriminatedUnion('condition', [
  z.object({ condition: z.literal('price_below'), symbol: symbolSchema, value: z.number().finite().positive() }),
  z.object({ condition: z.literal('price_above'), symbol: symbolSchema, value: z.number().finite().positive() }),
  z.object({ condition: z.literal('drawdown_from_entry_pct'), symbol: symbolSchema, value: percentSchema }),
  z.object({ condition: z.literal('weight_above_pct'), symbol: symbolSchema, value: percentSchema }),
  z.object({
    condition: z.literal('no_verified_price_days'),
    symbol: symbolSchema,
    value: z.number().int().min(1).max(365),
  }),
]);

const riskThresholdSchema = z.object({
  metric: z.enum(RISK_METRIC_KEYS),
  comparison: z.enum(['above', 'below']),
  value: z.number().finite().min(-1_000).max(1_000),
});

const stressScenarioSchema = z.object({
  shocks: z
    .array(z.object({
      targetType: z.enum(['all', 'symbol', 'sector', 'asset-kind']),
      target: z.string().min(1).max(40),
      changePct: z.number().finite().min(-100).max(1_000),
    }))
    .min(1)
    .max(20),
  maxProjectedLossPct: percentSchema,
});

export type ThesisInvalidationSpec = z.infer<typeof thesisInvalidationSchema>;
export type RiskThresholdSpec = z.infer<typeof riskThresholdSchema>;
export type StressScenarioSpec = z.infer<typeof stressScenarioSchema>;
export type MonitorRuleSpec = ThesisInvalidationSpec | RiskThresholdSpec | StressScenarioSpec;

export const monitorRuleSpecSchema = {
  thesis_invalidation: thesisInvalidationSchema,
  risk_threshold: riskThresholdSchema.strict(),
  stress_scenario: stressScenarioSchema.strict(),
} as const;

/**
 * Parses a stored or user-supplied spec against its kind. Throws on mismatch, so a
 * malformed row can never reach the evaluator and be silently treated as "not breached".
 */
export function parseMonitorRuleSpec(kind: MonitorRuleKind, value: unknown): MonitorRuleSpec {
  const schema = monitorRuleSpecSchema[kind];
  // discriminatedUnion doesn't have .strict() in Zod 4.4.3, but objects do
  const strictSchema = typeof (schema as any).strict === 'function' ? (schema as any).strict() : schema;
  return strictSchema.parse(value);
}

export function defaultIntervalHours(kind: MonitorRuleKind): number {
  return kind === 'stress_scenario' ? 168 : 24;
}
