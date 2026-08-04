/* Shared browser/server contracts. Keep Node-only imports out. */
export type DataMode = 'live' | 'delayed' | 'snapshot' | 'mock' | 'fallback' | 'mixed' | 'stale';
export type DataQuality = 'provider' | 'verified' | 'estimated' | 'synthetic' | 'degraded';
export type ProviderName =
  | 'alpaca'
  | 'finnhub'
  | 'coinbase'
  | 'alpha-vantage'
  | 'polymarket'
  | 'kalshi'
  | 'openai'
  | 'resend'
  | 'web-push'
  | 'supabase'
  | 'upstash'
  | 'local-simulation';

export type VerificationStrategy =
  | 'single-provider'
  | 'cross-provider'
  | 'failover'
  | 'last-known-good'
  | 'synthetic';

export interface DataVerification {
  readonly strategy: VerificationStrategy;
  readonly providers: readonly ProviderName[];
  readonly lineageId: string;
  readonly freshnessSeconds: number;
  readonly deviationBps?: number;
  readonly decision: 'accepted' | 'degraded' | 'stale' | 'rejected';
}

export interface DataProvenance {
  readonly source: ProviderName;
  readonly sourceLabel: string;
  readonly mode: DataMode;
  readonly quality: DataQuality;
  readonly providerTimestamp: string;
  readonly ingestedAt: string;
  readonly feed: string;
  readonly requestId?: string;
  readonly latencyMs?: number;
  readonly delayedSeconds?: number;
  readonly note?: string;
  readonly verification?: DataVerification;
}

export interface RemoteQuotePatch {
  readonly symbol: string;
  readonly price: number;
  readonly prevClose: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly volume: number;
  readonly marketCap?: number;
  readonly asOfISO: string;
  readonly session: 'regular' | 'continuous' | 'after-hours';
  readonly sessionStatus: 'open' | 'closed';
  readonly provenance: DataProvenance;
}

export interface RemoteCandle {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
}

export type CircuitState = 'closed' | 'open' | 'half-open' | 'disabled';
export type OperationalEvidenceSource = 'runtime' | 'persistent-ledger';

export interface ProviderStatus {
  readonly provider: ProviderName;
  readonly configured: boolean;
  readonly status: 'up' | 'degraded' | 'down' | 'disabled';
  readonly mode: DataMode;
  readonly message: string;
  readonly checkedAt: string;
  readonly lastSuccessAt?: string;
  readonly lastFailureAt?: string;
  readonly latencyMs?: number;
  readonly p95LatencyMs?: number;
  readonly attempts?: number;
  readonly successRate?: number;
  readonly circuitState?: CircuitState;
  readonly consecutiveFailures?: number;
  readonly nextRetryAt?: string;
  readonly evidenceSource?: OperationalEvidenceSource;
  readonly sampledAt?: string;
}

export interface MarketQuotesResponse {
  readonly requestId: string;
  readonly generatedAt: string;
  readonly mode: DataMode;
  readonly quotes: readonly RemoteQuotePatch[];
  readonly providers: readonly ProviderStatus[];
  readonly warnings: readonly string[];
  readonly incidentIds?: readonly string[];
}

export interface HistoryResponse {
  readonly requestId: string;
  readonly symbol: string;
  readonly range: string;
  readonly candles: readonly RemoteCandle[];
  readonly provenance: DataProvenance;
  readonly warning?: string;
}

export interface LivePredictionOutcome {
  readonly label: string;
  readonly probability: number;
  readonly priceDeltaPct?: number;
}
export interface LivePredictionMarket {
  readonly id: string;
  readonly question: string;
  readonly outcomes: readonly LivePredictionOutcome[];
  readonly volumeUsd: number;
  readonly closesAt?: string;
  readonly url?: string;
  readonly provider: 'polymarket' | 'kalshi';
  readonly providerTimestamp: string;
}
export interface PredictionsResponse {
  readonly requestId: string;
  readonly generatedAt: string;
  readonly markets: readonly LivePredictionMarket[];
  readonly providers: readonly ProviderStatus[];
  readonly fallback: boolean;
}
export interface LiveEarningsEntry {
  readonly symbol: string;
  readonly name: string;
  readonly reportDate: string;
  readonly fiscalDateEnding?: string;
  readonly estimate?: number;
  readonly currency?: string;
  readonly providerTimestamp: string;
}
export interface EarningsResponse {
  readonly requestId: string;
  readonly generatedAt: string;
  readonly entries: readonly LiveEarningsEntry[];
  readonly provider: ProviderStatus;
  readonly fallback: boolean;
}
export interface LiveNewsItem {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly source: string;
  readonly url: string;
  readonly publishedAt: string;
  readonly symbols: readonly string[];
  readonly sentiment?: string;
}
export interface NewsResponse {
  readonly requestId: string;
  readonly generatedAt: string;
  readonly items: readonly LiveNewsItem[];
  readonly provider: ProviderStatus;
  readonly fallback: boolean;
}

export interface WatchlistResponse {
  readonly requestId: string;
  readonly symbols: readonly string[];
  readonly updatedAt: string;
  readonly version: number;
}

export type AlertCondition = 'above' | 'below';
export type DeliveryChannel = 'email' | 'push';
export type DeliveryStatus = 'pending' | 'processing' | 'retry' | 'sent' | 'failed' | 'disabled';
export interface AlertDeliverySummary {
  readonly channel: DeliveryChannel;
  readonly status: DeliveryStatus;
  readonly attempts: number;
  readonly sentAt?: string;
  readonly lastError?: string;
}
export interface ServerPriceAlert {
  readonly id: string;
  readonly symbol: string;
  readonly condition: AlertCondition;
  readonly target: number;
  readonly baseline: number;
  readonly lastObservedPrice?: number;
  readonly createdAt: string;
  readonly triggeredAt?: string;
  readonly triggeredPrice?: number;
  readonly triggeredProvenance?: DataProvenance;
  readonly seen: boolean;
  readonly state: 'armed' | 'triggered' | 'disabled';
  readonly emailEnabled: boolean;
  readonly pushEnabled: boolean;
  readonly deliveries: readonly AlertDeliverySummary[];
}
export interface AlertsResponse {
  readonly requestId: string;
  readonly alerts: readonly ServerPriceAlert[];
  readonly generatedAt: string;
}
export interface PushSubscriptionPayload {
  readonly endpoint: string;
  readonly expirationTime: number | null;
  readonly keys: Readonly<{ p256dh: string; auth: string }>;
}

export interface RuntimeCapabilities {
  readonly alpaca: boolean;
  readonly secondaryEquity: boolean;
  readonly secondaryCrypto: boolean;
  readonly cloudAccount: boolean;
  readonly durableAlerts: boolean;
  readonly emailDelivery: boolean;
  readonly pushDelivery: boolean;
  readonly aiTools: boolean;
  readonly distributedCache: boolean;
  readonly persistentMarketLedger: boolean;
  readonly opsControlPlane: boolean;
  readonly releaseGates: boolean;
  readonly portfolioLedger: boolean;
  readonly portfolioRisk: boolean;
  readonly researchWorkspace: boolean;
}

export interface PublicRuntimeConfig {
  readonly requestId: string;
  readonly generatedAt: string;
  readonly version: string;
  readonly releaseChannel: string;
  readonly deploymentStage: 'development' | 'preview' | 'production' | 'test';
  readonly gitSha?: string;
  readonly capabilities: RuntimeCapabilities;
  readonly vapidPublicKey?: string;
  readonly pollIntervalMs: number;
  readonly providerMode: 'primary' | 'failover' | 'quorum';
}

export interface AiSource {
  readonly title: string;
  readonly detail: string;
  readonly asOfISO: string;
  readonly source: ProviderName | 'application';
  readonly url?: string;
}
export interface AiAnswerResponse {
  readonly requestId: string;
  readonly text: string;
  readonly model: string;
  readonly mode: 'openai' | 'local-fallback';
  readonly responseId?: string;
  readonly toolsUsed: readonly string[];
  readonly sources: readonly AiSource[];
  readonly usage?: Readonly<{ inputTokens: number; outputTokens: number; totalTokens: number }>;
  readonly generatedAt: string;
  readonly evidenceHash?: string;
}

export interface HealthResponse {
  readonly requestId: string;
  readonly status: 'up' | 'degraded' | 'down';
  readonly version: string;
  readonly releaseChannel: string;
  readonly deploymentStage: PublicRuntimeConfig['deploymentStage'];
  readonly gitSha?: string;
  readonly generatedAt: string;
  readonly region?: string;
  readonly capabilities: RuntimeCapabilities;
  readonly providers: readonly ProviderStatus[];
  readonly configWarnings: readonly string[];
}

export interface ReadinessCheck {
  readonly name: string;
  readonly required: boolean;
  readonly status: 'pass' | 'warn' | 'fail';
  readonly message: string;
  readonly latencyMs?: number;
  readonly lastFailureAt?: string;
  readonly failures?: number;
  readonly circuitState?: 'closed' | 'open' | 'half-open' | 'disabled';
  readonly nextRetryAt?: string;
}
export interface ReadinessResponse {
  readonly requestId: string;
  readonly ready: boolean;
  readonly status: 'ready' | 'degraded' | 'not-ready';
  readonly version: string;
  readonly releaseChannel: string;
  readonly generatedAt: string;
  readonly checks: readonly ReadinessCheck[];
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export type IncidentSeverity = 'info' | 'warning' | 'critical';
export type IncidentKind =
  | 'provider-failure'
  | 'provider-circuit-open'
  | 'stale-data'
  | 'cross-provider-deviation'
  | 'invalid-quote'
  | 'provider-missing-symbol'
  | 'ledger-write-failure';
export interface DataQualityIncident {
  readonly id: string;
  readonly kind: IncidentKind;
  readonly severity: IncidentSeverity;
  readonly symbol?: string;
  readonly providers: readonly ProviderName[];
  readonly message: string;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
  readonly createdAt: string;
  readonly resolvedAt?: string;
}

export interface SloSummary {
  readonly windowMinutes: number;
  readonly availabilityTarget: number;
  readonly freshnessTargetSeconds: number;
  readonly attempts: number;
  readonly successes: number;
  readonly availability: number;
  readonly p95LatencyMs: number;
  readonly freshnessPassRate: number;
  readonly errorBudgetRemaining: number;
  readonly status: 'healthy' | 'at-risk' | 'breached' | 'no-data';
  readonly evidenceSource?: OperationalEvidenceSource;
  readonly sampledAt?: string;
}
export interface OpsBacklogSummary {
  readonly armedAlerts: number;
  readonly pendingDeliveries: number;
  readonly retryDeliveries: number;
  readonly failedDeliveries: number;
  readonly unresolvedIncidents: number;
  readonly observations24h: number;
}
export interface OpsSummaryResponse {
  readonly requestId: string;
  readonly generatedAt: string;
  readonly version: string;
  readonly providers: readonly ProviderStatus[];
  readonly marketSlo: SloSummary;
  readonly backlog: OpsBacklogSummary;
  readonly incidents: readonly DataQualityIncident[];
  readonly releaseGate: Readonly<{
    status: 'pass' | 'warn' | 'fail';
    reasons: readonly string[];
  }>;
}
export type OpsAction = 'probe-providers' | 'reset-circuit' | 'retry-failed-deliveries' | 'prune-operational-data' | 'run-release-gate';
export interface OpsActionResponse {
  readonly requestId: string;
  readonly action: OpsAction;
  readonly accepted: boolean;
  readonly result: Readonly<Record<string, unknown>>;
  readonly generatedAt: string;
}


export interface MarketObservation {
  readonly symbol: string;
  readonly price: number;
  readonly asOfISO: string;
  readonly source: ProviderName;
  readonly mode: DataMode;
  readonly quality: DataQuality;
  readonly lineageId?: string;
  readonly provenance: DataProvenance;
}
export interface CaptureMarketResponse {
  readonly requestId: string;
  readonly requestedSymbols: number;
  readonly acceptedObservations: number;
  readonly rejectedObservations: number;
  readonly persistedIncidents: number;
  readonly generatedAt: string;
}

export interface CronEvaluationResponse {
  readonly requestId: string;
  readonly checkedAlerts: number;
  readonly triggeredAlerts: number;
  readonly deferredAlerts: number;
  readonly attemptedDeliveries: number;
  readonly sentDeliveries: number;
  readonly failedDeliveries: number;
  readonly generatedAt: string;
}

export type PortfolioStatus = 'active' | 'archived';
export interface PortfolioRecord {
  readonly id: string;
  readonly name: string;
  readonly baseCurrency: 'USD';
  readonly status: PortfolioStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type PortfolioTransactionKind =
  | 'deposit'
  | 'withdrawal'
  | 'buy'
  | 'sell'
  | 'dividend'
  | 'fee'
  | 'reversal';

export interface PortfolioTransaction {
  readonly id: string;
  readonly portfolioId: string;
  readonly kind: PortfolioTransactionKind;
  readonly symbol?: string;
  readonly quantity: number;
  readonly price: number;
  readonly cashAmount: number;
  readonly fees: number;
  readonly tradeAt: string;
  readonly note?: string;
  readonly reversalOf?: string;
  readonly createdAt: string;
}

export interface PortfolioLedgerPosition {
  readonly symbol: string;
  readonly quantity: number;
  readonly costBasis: number;
  readonly averageCost: number;
  readonly realizedPnl: number;
  readonly income: number;
  readonly feesPaid: number;
}

export type PortfolioValuationQuality = 'verified' | 'mixed' | 'estimated' | 'unpriced';
export interface PortfolioHolding extends PortfolioLedgerPosition {
  readonly name: string;
  readonly sector?: string;
  readonly assetKind: 'stock' | 'etf' | 'crypto' | 'index' | 'future';
  readonly price?: number;
  readonly marketValue?: number;
  readonly unrealizedPnl?: number;
  readonly totalPnl?: number;
  readonly allocationPct: number;
  readonly valuationQuality: PortfolioValuationQuality;
  readonly provenance?: DataProvenance;
}

export interface PortfolioRiskMetrics {
  readonly status: 'available' | 'partial' | 'insufficient-data';
  readonly dataQuality: 'verified' | 'mixed' | 'synthetic';
  readonly observations: number;
  readonly annualizedVolatilityPct?: number;
  readonly historicalVar95Pct?: number;
  readonly historicalVar95Amount?: number;
  readonly historicalCvar95Pct?: number;
  readonly historicalCvar95Amount?: number;
  readonly maxDrawdownPct?: number;
  readonly concentrationHhi: number;
  readonly effectiveHoldings: number;
  readonly topHoldingPct: number;
  readonly pricedCoveragePct: number;
  readonly warnings: readonly string[];
}

export interface PortfolioSummary {
  readonly portfolio: PortfolioRecord;
  readonly generatedAt: string;
  readonly asOfISO: string;
  readonly transactionCount: number;
  readonly cashBalance: number;
  readonly netContributions: number;
  readonly investedValue: number;
  readonly marketValue: number;
  readonly totalValue: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly income: number;
  readonly feesPaid: number;
  readonly totalReturn: number;
  readonly totalReturnPct?: number;
  readonly valuationQuality: PortfolioValuationQuality;
  readonly holdings: readonly PortfolioHolding[];
  readonly risk: PortfolioRiskMetrics;
  readonly warnings: readonly string[];
}

export interface PortfoliosResponse {
  readonly requestId: string;
  readonly portfolios: readonly PortfolioRecord[];
  readonly generatedAt: string;
}
export interface PortfolioMutationResponse {
  readonly requestId: string;
  readonly portfolio: PortfolioRecord;
}
export interface PortfolioTransactionMutationResponse {
  readonly requestId: string;
  readonly transaction: PortfolioTransaction;
}
export interface PortfolioTransactionsResponse {
  readonly requestId: string;
  readonly portfolio: PortfolioRecord;
  readonly transactions: readonly PortfolioTransaction[];
  readonly generatedAt: string;
}
export interface PortfolioSummaryResponse {
  readonly requestId: string;
  readonly summary: PortfolioSummary;
}

export interface PortfolioAllocationTarget {
  readonly symbol: string;
  readonly targetPct: number;
}
export interface PortfolioOrderCostPolicy {
  readonly commissionFixedUsd: number;
  readonly commissionBps: number;
  readonly buySlippageBps: number;
  readonly sellSlippageBps: number;
  readonly sellTransactionTaxBps: number;
  readonly capitalGainsTaxPct: number;
  readonly maxCostPct: number;
  readonly taxLotMethod: 'fifo';
}
export interface PortfolioOrderCostBreakdown {
  readonly commission: number;
  readonly slippage: number;
  readonly transactionTax: number;
  readonly capitalGainsTax: number;
  readonly tax: number;
  readonly taxableGain: number;
  readonly total: number;
  /** Signed, cent-normalized cash effect used by the cost model; buys are negative. */
  readonly netCashEffect: number;
}
export type PortfolioOrderOptimizationDecision =
  | 'execute'
  | 'not-required'
  | 'below-minimum'
  | 'cost-inefficient'
  | 'cash-limited'
  | 'invalid-tax-lots';
export interface PortfolioTaxLotSlice {
  readonly transactionId: string;
  readonly acquiredAt: string;
  readonly quantity: number;
  readonly unitCost: number;
  readonly costBasis: number;
}
export interface PortfolioAllocationPolicy {
  readonly portfolioId: string;
  readonly driftThresholdPct: number;
  readonly minTradeValue: number;
  readonly emailEnabled: boolean;
  readonly pushEnabled: boolean;
  readonly costPolicy: PortfolioOrderCostPolicy;
  readonly targets: readonly PortfolioAllocationTarget[];
  readonly updatedAt: string;
}
export interface PortfolioAllocationResponse {
  readonly requestId: string;
  readonly policy: PortfolioAllocationPolicy | null;
}

export type PortfolioRebalanceStatus = 'pending' | 'approved' | 'completed' | 'rejected' | 'expired';
export type PortfolioRebalanceAction = 'buy' | 'sell' | 'hold';
export interface PortfolioRebalanceItem {
  readonly id: string;
  readonly runId: string;
  readonly symbol: string;
  readonly currentValue: number;
  readonly currentPct: number;
  readonly targetValue: number;
  readonly targetPct: number;
  readonly driftPct: number;
  readonly action: PortfolioRebalanceAction;
  readonly requestedTradeValue: number;
  readonly tradeValue: number;
  readonly optimizationDecision: PortfolioOrderOptimizationDecision;
  readonly estimatedCosts: PortfolioOrderCostBreakdown;
  readonly estimatedCostBasis: number;
  readonly taxLotSnapshot: readonly PortfolioTaxLotSlice[];
  readonly referencePrice?: number;
  readonly priceAsOf?: string;
  readonly provenance?: DataProvenance;
  readonly estimatedQuantity?: number;
  readonly transactionId?: string;
  readonly actualQuantity?: number;
  readonly actualPrice?: number;
  readonly actualFees?: number;
  readonly actualCosts?: PortfolioOrderCostBreakdown;
}
export interface PortfolioRebalanceAuditEntry {
  readonly id: string;
  readonly runId: string;
  readonly event: 'created' | 'approved' | 'completed' | 'rejected' | 'expired' | 'execution_reversed';
  readonly fromStatus?: PortfolioRebalanceStatus;
  readonly toStatus: PortfolioRebalanceStatus;
  readonly reason?: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}
export interface PortfolioRebalanceRun {
  readonly id: string;
  readonly portfolioId: string;
  readonly planKind: 'rebalance' | 'contribution';
  readonly status: PortfolioRebalanceStatus;
  readonly source: 'manual' | 'scheduled';
  readonly planHash: string;
  readonly policyUpdatedAt: string;
  readonly portfolioUpdatedAt: string;
  readonly valuationAsOf: string;
  readonly valuationQuality: PortfolioValuationQuality;
  readonly totalValue: number;
  readonly cashBalance: number;
  readonly driftThresholdPct: number;
  readonly minTradeValue: number;
  readonly maxDriftPct: number;
  readonly estimatedCashAfter: number;
  readonly costModelVersion: 0 | 1;
  readonly costPolicySnapshot: PortfolioOrderCostPolicy;
  readonly estimatedCosts: PortfolioOrderCostBreakdown;
  readonly actualCosts?: PortfolioOrderCostBreakdown;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly approvedAt?: string;
  readonly completedAt?: string;
  readonly rejectedAt?: string;
  readonly expiredAt?: string;
  readonly terminalReason?: string;
  readonly goalSnapshot?: PortfolioGoalPlanSnapshot;
  readonly goalId?: string;
  readonly goalUpdatedAt?: string;
  readonly scheduledFor?: string;
  readonly contributionAmount?: number;
  readonly cashRemainder?: number;
  readonly depositTransactionId?: string;
  readonly items: readonly PortfolioRebalanceItem[];
  readonly audit: readonly PortfolioRebalanceAuditEntry[];
}
export interface PortfolioRebalancesResponse {
  readonly requestId: string;
  readonly runs: readonly PortfolioRebalanceRun[];
  readonly generatedAt: string;
}
export interface PortfolioRebalanceMutationResponse {
  readonly requestId: string;
  readonly run: PortfolioRebalanceRun;
  readonly created?: boolean;
}
export interface PortfolioRebalanceExecutionLink {
  readonly itemId: string;
  readonly quantity: number;
  readonly price: number;
  readonly fees: number;
  readonly tradeAt: string;
}

export type PortfolioGoalStatus = 'active' | 'paused' | 'completed' | 'archived';
export interface PortfolioGoalPlanSnapshot {
  readonly id: string;
  readonly name: string;
  readonly targetAmount: number;
  readonly targetDate: string;
  readonly expectedAnnualReturnPct: number;
  readonly contributionAmount: number;
  readonly contributionDay: number;
  readonly updatedAt: string;
}
export interface PortfolioGoal {
  readonly id: string;
  readonly portfolioId: string;
  readonly name: string;
  readonly targetAmount: number;
  readonly targetDate: string;
  readonly expectedAnnualReturnPct: number;
  readonly contributionAmount: number;
  readonly contributionDay: number;
  readonly nextContributionDate: string;
  readonly status: PortfolioGoalStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface PortfolioGoalProjection {
  readonly status: 'funded' | 'on-track' | 'behind' | 'overdue' | 'insufficient-data';
  readonly currentValue: number;
  readonly targetAmount: number;
  readonly progressPct: number;
  readonly contributionPeriodsRemaining: number;
  readonly projectedAmount: number;
  readonly requiredContributionAmount: number;
  readonly projectedShortfall: number;
  readonly asOfISO: string;
  readonly valuationQuality: PortfolioValuationQuality;
}
export interface PortfolioGoalResponse {
  readonly requestId: string;
  readonly goal: PortfolioGoal | null;
  readonly projection: PortfolioGoalProjection | null;
  readonly generatedAt: string;
}
export interface PortfolioGoalMutationResponse {
  readonly requestId: string;
  readonly goal: PortfolioGoal;
}

export type PortfolioContributionRun = PortfolioRebalanceRun & Readonly<{
  planKind: 'contribution';
  goalSnapshot: PortfolioGoalPlanSnapshot;
  goalId: string;
  goalUpdatedAt: string;
  contributionAmount: number;
  cashRemainder: number;
}>;
export interface PortfolioContributionsResponse {
  readonly requestId: string;
  readonly runs: readonly PortfolioContributionRun[];
  readonly generatedAt: string;
}
export interface PortfolioContributionMutationResponse {
  readonly requestId: string;
  readonly run: PortfolioContributionRun;
  readonly created?: boolean;
}

export interface PortfolioSnapshot {
  readonly id: string;
  readonly portfolioId: string;
  readonly capturedAt: string;
  readonly asOfISO: string;
  readonly totalValue: number;
  readonly cashBalance: number;
  readonly marketValue: number;
  readonly netContributions: number;
  readonly totalReturn: number;
  readonly valuationQuality: PortfolioValuationQuality;
}
export interface PortfolioSnapshotsResponse {
  readonly requestId: string;
  readonly portfolio: PortfolioRecord;
  readonly snapshots: readonly PortfolioSnapshot[];
  readonly generatedAt: string;
}

export type ScenarioTargetType = 'all' | 'symbol' | 'sector' | 'asset-kind';
export interface PortfolioScenarioShock {
  readonly targetType: ScenarioTargetType;
  readonly target: string;
  readonly changePct: number;
}
export interface PortfolioScenarioImpact {
  readonly symbol: string;
  readonly beforeValue: number;
  readonly afterValue: number;
  readonly change: number;
  readonly appliedShockPct: number;
}
export interface PortfolioScenarioResponse {
  readonly requestId: string;
  readonly portfolioId: string;
  readonly generatedAt: string;
  readonly beforeValue: number;
  readonly afterValue: number;
  readonly absoluteChange: number;
  readonly changePct: number;
  readonly impacts: readonly PortfolioScenarioImpact[];
  readonly shocks: readonly PortfolioScenarioShock[];
  readonly warnings: readonly string[];
}

export type InvestmentThesisStatus = 'watching' | 'active' | 'invalidated' | 'realized' | 'archived';
export interface InvestmentThesis {
  readonly id: string;
  readonly portfolioId?: string;
  readonly symbol: string;
  readonly title: string;
  readonly thesis: string;
  readonly bullCase: string;
  readonly bearCase: string;
  readonly catalysts: readonly string[];
  readonly invalidation: string;
  readonly targetPrice?: number;
  readonly confidence: number;
  readonly status: InvestmentThesisStatus;
  readonly evidence: readonly AiSource[];
  readonly evidenceHash?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface ResearchMutationResponse {
  readonly requestId: string;
  readonly thesis: InvestmentThesis;
}
export interface ResearchResponse {
  readonly requestId: string;
  readonly theses: readonly InvestmentThesis[];
  readonly generatedAt: string;
}

export interface PortfolioSnapshotCronResponse {
  readonly requestId: string;
  readonly inspectedPortfolios: number;
  readonly capturedSnapshots: number;
  readonly skippedPortfolios: number;
  readonly generatedAt: string;
}

export interface ApiErrorPayload {
  readonly error: Readonly<{ code: string; message: string; requestId: string }>;
}
