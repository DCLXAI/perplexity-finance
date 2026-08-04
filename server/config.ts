import { z } from 'zod';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type DeploymentStage = 'development' | 'preview' | 'production' | 'test';
export type MarketProviderMode = 'primary' | 'failover' | 'quorum';

export interface AppConfig {
  readonly version: string;
  readonly deploymentStage: DeploymentStage;
  readonly releaseChannel: string;
  readonly gitSha?: string;
  readonly publicOrigin?: string;
  readonly allowedOrigins: readonly string[];
  readonly alpacaKeyId?: string;
  readonly alpacaSecretKey?: string;
  readonly alpacaFeed: 'iex' | 'sip' | 'delayed_sip';
  readonly finnhubApiKey?: string;
  readonly finnhubMode: 'live' | 'delayed';
  readonly coinbaseEnabled: boolean;
  readonly marketProviderMode: MarketProviderMode;
  readonly alphaVantageApiKey?: string;
  readonly allowMockFallback: boolean;
  readonly supabaseUrl?: string;
  readonly supabaseAnonKey?: string;
  readonly supabaseServiceRoleKey?: string;
  readonly openAiApiKey?: string;
  readonly openAiModel: string;
  readonly resendApiKey?: string;
  readonly alertEmailFrom?: string;
  readonly vapidPublicKey?: string;
  readonly vapidPrivateKey?: string;
  readonly vapidSubject: string;
  readonly cronSecret?: string;
  readonly metricsSecret?: string;
  readonly opsSecret?: string;
  readonly upstashUrl?: string;
  readonly upstashToken?: string;
  readonly pollIntervalMs: number;
  readonly quoteCacheSeconds: number;
  readonly historyCacheSeconds: number;
  readonly contentCacheSeconds: number;
  readonly staleIfErrorSeconds: number;
  readonly lastKnownGoodSeconds: number;
  readonly historyStaleSeconds: number;
  readonly quoteMaxAgeStockSeconds: number;
  readonly quoteMaxAgeCryptoSeconds: number;
  readonly quoteMaxDeviationBps: number;
  readonly providerFailureThreshold: number;
  readonly providerCircuitOpenMs: number;
  readonly alertBatchSize: number;
  readonly monitorRuleLimit: number;
  readonly monitorBudgetMs: number;
  readonly alertEvaluationIntervalSeconds: number;
  readonly alertEvaluationLeaseSeconds: number;
  readonly alertMaxPerUser: number;
  readonly deliveryBatchSize: number;
  readonly deliveryConcurrency: number;
  readonly deliveryTimeoutMs: number;
  readonly retentionDays: number;
  readonly marketCaptureLimit: number;
  readonly opsRoles: readonly string[];
  readonly releaseMinAvailabilityPct: number;
  readonly releaseMaxP95LatencyMs: number;
  readonly requireLiveData: boolean;
  readonly requireCloud: boolean;
  readonly requireDurableAlerts: boolean;
  readonly requireAi: boolean;
  readonly logLevel: LogLevel;
}

export interface ConfigDiagnostics {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

const originSchema = z.string().url().transform((value) => new URL(value).origin);
function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}
function bool(name: string, fallback: boolean): boolean {
  const value = optional(name);
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}
function numberValue(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(optional(name));
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function stringList(name: string, fallback: readonly string[]): readonly string[] {
  const value = optional(name);
  if (!value) return Object.freeze([...fallback]);
  return Object.freeze([...new Set(value.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean))]);
}

function stage(): DeploymentStage {
  if (process.env.NODE_ENV === 'test') return 'test';
  const value = optional('VERCEL_ENV') ?? optional('APP_ENV') ?? process.env.NODE_ENV;
  if (value === 'production' || value === 'preview' || value === 'test') return value;
  return 'development';
}
function parseOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = originSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
function origins(publicOrigin: string | undefined): readonly string[] {
  const values = [
    publicOrigin,
    ...(optional('ALLOWED_ORIGINS')?.split(',').map((value) => parseOrigin(value.trim())) ?? []),
  ].filter((value): value is string => Boolean(value));
  return Object.freeze([...new Set(values)]);
}
function providerMode(): MarketProviderMode {
  const value = optional('MARKET_PROVIDER_MODE');
  return value === 'primary' || value === 'quorum' ? value : 'failover';
}

let cachedConfig: AppConfig | null = null;
export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;
  const deploymentStage = stage();
  const rawFeed = optional('ALPACA_DATA_FEED');
  const alpacaFeed = rawFeed === 'sip' || rawFeed === 'delayed_sip' ? rawFeed : 'iex';
  const rawFinnhubMode = optional('FINNHUB_MODE');
  const finnhubMode = rawFinnhubMode === 'live' ? 'live' : 'delayed';
  const rawLevel = optional('LOG_LEVEL');
  const logLevel: LogLevel = rawLevel === 'debug' || rawLevel === 'warn' || rawLevel === 'error' ? rawLevel : 'info';
  const publicOrigin = parseOrigin(optional('PUBLIC_ORIGIN'));

  cachedConfig = Object.freeze({
    version: '1.10.0',
    deploymentStage,
    releaseChannel: optional('RELEASE_CHANNEL') ?? deploymentStage,
    gitSha: optional('VERCEL_GIT_COMMIT_SHA') ?? optional('GIT_SHA'),
    publicOrigin,
    allowedOrigins: origins(publicOrigin),
    alpacaKeyId: optional('ALPACA_API_KEY_ID'),
    alpacaSecretKey: optional('ALPACA_API_SECRET_KEY'),
    alpacaFeed,
    finnhubApiKey: optional('FINNHUB_API_KEY'),
    finnhubMode,
    coinbaseEnabled: bool('COINBASE_ENABLED', false),
    marketProviderMode: providerMode(),
    alphaVantageApiKey: optional('ALPHA_VANTAGE_API_KEY'),
    allowMockFallback: bool('ALLOW_MOCK_FALLBACK', deploymentStage !== 'production'),
    supabaseUrl: optional('SUPABASE_URL'),
    supabaseAnonKey: optional('SUPABASE_ANON_KEY'),
    supabaseServiceRoleKey: optional('SUPABASE_SERVICE_ROLE_KEY'),
    openAiApiKey: optional('OPENAI_API_KEY'),
    openAiModel: optional('OPENAI_MODEL') ?? 'gpt-5-mini',
    resendApiKey: optional('RESEND_API_KEY'),
    alertEmailFrom: optional('ALERT_EMAIL_FROM'),
    vapidPublicKey: optional('VAPID_PUBLIC_KEY'),
    vapidPrivateKey: optional('VAPID_PRIVATE_KEY'),
    vapidSubject: optional('VAPID_SUBJECT') ?? 'mailto:ops@example.com',
    cronSecret: optional('CRON_SECRET'),
    metricsSecret: optional('METRICS_SECRET'),
    opsSecret: optional('OPS_SECRET'),
    upstashUrl: optional('UPSTASH_REDIS_REST_URL'),
    upstashToken: optional('UPSTASH_REDIS_REST_TOKEN'),
    pollIntervalMs: numberValue('MARKET_POLL_MS', 20_000, 5_000, 300_000),
    quoteCacheSeconds: numberValue('QUOTE_CACHE_SECONDS', 12, 1, 300),
    historyCacheSeconds: numberValue('HISTORY_CACHE_SECONDS', 300, 10, 3_600),
    contentCacheSeconds: numberValue('CONTENT_CACHE_SECONDS', 120, 10, 3_600),
    staleIfErrorSeconds: numberValue('STALE_IF_ERROR_SECONDS', 900, 30, 86_400),
    lastKnownGoodSeconds: numberValue('LAST_KNOWN_GOOD_SECONDS', 86_400, 300, 604_800),
    historyStaleSeconds: numberValue('HISTORY_STALE_SECONDS', 86_400, 300, 604_800),
    quoteMaxAgeStockSeconds: numberValue('QUOTE_MAX_AGE_STOCK_SECONDS', 120, 15, 3_600),
    quoteMaxAgeCryptoSeconds: numberValue('QUOTE_MAX_AGE_CRYPTO_SECONDS', 90, 15, 3_600),
    quoteMaxDeviationBps: numberValue('QUOTE_MAX_DEVIATION_BPS', 75, 5, 2_000),
    providerFailureThreshold: numberValue('PROVIDER_FAILURE_THRESHOLD', 3, 1, 20),
    providerCircuitOpenMs: numberValue('PROVIDER_CIRCUIT_OPEN_MS', 30_000, 1_000, 900_000),
    alertBatchSize: numberValue('ALERT_BATCH_SIZE', 250, 1, 500),
    monitorRuleLimit: numberValue('MONITOR_RULE_LIMIT', 200, 1, 600),
    monitorBudgetMs: numberValue('MONITOR_BUDGET_MS', 25_000, 1_000, 55_000),
    alertEvaluationIntervalSeconds: numberValue('ALERT_EVALUATION_INTERVAL_SECONDS', 60, 15, 3_600),
    alertEvaluationLeaseSeconds: numberValue('ALERT_EVALUATION_LEASE_SECONDS', 90, 30, 900),
    alertMaxPerUser: numberValue('ALERT_MAX_PER_USER', 100, 1, 500),
    deliveryBatchSize: numberValue('DELIVERY_BATCH_SIZE', 50, 1, 250),
    deliveryConcurrency: numberValue('DELIVERY_CONCURRENCY', 5, 1, 20),
    deliveryTimeoutMs: numberValue('DELIVERY_TIMEOUT_MS', 12_000, 1_000, 60_000),
    retentionDays: numberValue('RETENTION_DAYS', 90, 7, 730),
    marketCaptureLimit: numberValue('MARKET_CAPTURE_LIMIT', 120, 1, 500),
    opsRoles: stringList('OPS_ROLES', ['ops', 'admin']),
    releaseMinAvailabilityPct: numberValue('RELEASE_MIN_AVAILABILITY_PCT', 99, 0, 100),
    releaseMaxP95LatencyMs: numberValue('RELEASE_MAX_P95_LATENCY_MS', 2500, 1, 60000),
    requireLiveData: bool('REQUIRE_LIVE_DATA', false),
    requireCloud: bool('REQUIRE_CLOUD', false),
    requireDurableAlerts: bool('REQUIRE_DURABLE_ALERTS', false),
    requireAi: bool('REQUIRE_AI', false),
    logLevel,
  });
  return cachedConfig;
}

function partial(values: readonly (string | undefined)[]): boolean {
  const configured = values.filter(Boolean).length;
  return configured > 0 && configured < values.length;
}
export function configDiagnostics(config = loadConfig()): ConfigDiagnostics {
  const errors: string[] = [];
  const warnings: string[] = [];
  const alpaca = Boolean(config.alpacaKeyId && config.alpacaSecretKey);
  const secondary = Boolean(config.finnhubApiKey || config.coinbaseEnabled);
  const cloud = Boolean(config.supabaseUrl && config.supabaseAnonKey && config.supabaseServiceRoleKey);
  const durable = cloud && Boolean(config.cronSecret);
  const ai = Boolean(config.openAiApiKey && config.openAiModel);
  if (partial([config.alpacaKeyId, config.alpacaSecretKey])) errors.push('Alpaca 자격증명은 key ID와 secret을 함께 설정해야 합니다.');
  if (partial([config.supabaseUrl, config.supabaseAnonKey, config.supabaseServiceRoleKey])) errors.push('Supabase 서버 설정은 URL, anon key, service role key가 모두 필요합니다.');
  if (partial([config.upstashUrl, config.upstashToken])) errors.push('Upstash 설정은 URL과 token을 함께 설정해야 합니다.');
  if (partial([config.resendApiKey, config.alertEmailFrom])) errors.push('이메일 전달은 Resend key와 발신 주소를 함께 설정해야 합니다.');
  if (partial([config.vapidPublicKey, config.vapidPrivateKey])) errors.push('Web Push는 VAPID public/private key를 함께 설정해야 합니다.');
  if (config.requireLiveData && !alpaca && !secondary) errors.push('REQUIRE_LIVE_DATA가 켜졌지만 사용 가능한 시장 데이터 공급자가 없습니다.');
  if (config.requireCloud && !cloud) errors.push('REQUIRE_CLOUD가 켜졌지만 Supabase가 설정되지 않았습니다.');
  if (config.requireDurableAlerts && !durable) errors.push('REQUIRE_DURABLE_ALERTS가 켜졌지만 Cloud/Cron이 준비되지 않았습니다.');
  if (config.requireAi && !ai) errors.push('REQUIRE_AI가 켜졌지만 OpenAI가 설정되지 않았습니다.');
  if (config.deploymentStage === 'production' && !config.publicOrigin) errors.push('production에서는 PUBLIC_ORIGIN이 필요합니다.');
  if (config.deploymentStage === 'production' && config.publicOrigin?.startsWith('http://')) errors.push('production PUBLIC_ORIGIN은 HTTPS여야 합니다.');
  const machineSecrets = [
    ['CRON_SECRET', config.cronSecret],
    ['METRICS_SECRET', config.metricsSecret],
    ['OPS_SECRET', config.opsSecret],
  ] as const;
  for (let left = 0; left < machineSecrets.length; left += 1) {
    for (let right = left + 1; right < machineSecrets.length; right += 1) {
      const [leftName, leftValue] = machineSecrets[left];
      const [rightName, rightValue] = machineSecrets[right];
      if (leftValue && rightValue && leftValue === rightValue) {
        warnings.push(`${leftName}와 ${rightName}를 서로 다른 값으로 설정하세요.`);
      }
    }
  }
  if (config.deploymentStage === 'production' && config.allowMockFallback) warnings.push('production에서 ALLOW_MOCK_FALLBACK=true입니다. UI provenance 표시를 반드시 유지하세요.');
  if (config.marketProviderMode === 'quorum' && !alpaca) warnings.push('MARKET_PROVIDER_MODE=quorum이지만 Alpaca가 없어 교차 검증 범위가 제한됩니다.');
  if (!config.metricsSecret) warnings.push('METRICS_SECRET 미설정으로 운영 메트릭 endpoint가 비활성화됩니다.');
  if (!config.upstashUrl) warnings.push('Upstash 미설정으로 cache/rate limit이 인스턴스 로컬 모드입니다.');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), warnings: Object.freeze(warnings) });
}
export function resetConfigForTests(): void {
  cachedConfig = null;
}
