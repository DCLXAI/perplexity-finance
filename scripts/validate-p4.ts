import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildPortfolioLedger } from '../src/domain/portfolio/ledger.js';
import { computePortfolioRisk } from '../src/domain/portfolio/risk.js';
import { runPortfolioScenario } from '../src/domain/portfolio/scenario.js';
import { valuePortfolioPositions } from '../src/domain/portfolio/valuation.js';
import { loadConfig, resetConfigForTests } from '../server/config.js';
import type {
  DataProvenance,
  PortfolioHolding,
  PortfolioSummary,
  PortfolioTransaction,
  RemoteCandle,
  RemoteQuotePatch,
} from '../src/shared/api.js';

resetConfigForTests();
assert.equal(loadConfig().version, '1.10.0');

function transaction(id: string, kind: PortfolioTransaction['kind'], values: Partial<PortfolioTransaction>): PortfolioTransaction {
  const tradeAt = `2026-01-${id.slice(-2)}T15:00:00.000Z`;
  return Object.freeze({
    id,
    portfolioId: 'portfolio-validation',
    kind,
    quantity: 0,
    price: 0,
    cashAmount: 0,
    fees: 0,
    tradeAt,
    createdAt: tradeAt,
    ...values,
  });
}

const ledger = buildPortfolioLedger([
  transaction('tx-01', 'deposit', { cashAmount: 20_000 }),
  transaction('tx-02', 'buy', { symbol: 'AMD', quantity: 20, price: 100, fees: 10 }),
  transaction('tx-03', 'buy', { symbol: 'AMD', quantity: 10, price: 200 }),
  transaction('tx-04', 'sell', { symbol: 'AMD', quantity: 25, price: 250, fees: 15 }),
]);
assert.equal(ledger.cashBalance, 22_225);
assert.equal(ledger.positions[0]?.quantity, 5);
assert.equal(ledger.positions[0]?.averageCost, 200);
assert.equal(ledger.realizedPnl, 3_225);

const now = '2026-07-12T06:00:00.000Z';
const verifiedProvenance: DataProvenance = Object.freeze({
  source: 'alpaca',
  sourceLabel: 'Alpaca',
  mode: 'live',
  quality: 'verified',
  providerTimestamp: now,
  ingestedAt: now,
  feed: 'validation',
  verification: Object.freeze({
    strategy: 'cross-provider',
    providers: Object.freeze(['alpaca', 'finnhub'] as const),
    lineageId: 'p4-validation',
    freshnessSeconds: 1,
    decision: 'accepted',
  }),
});
const quote: RemoteQuotePatch = Object.freeze({
  symbol: 'AMD', price: 300, prevClose: 295, open: 296, high: 302, low: 294, volume: 1_000,
  asOfISO: now, session: 'regular', sessionStatus: 'open', provenance: verifiedProvenance,
});
const valuation = valuePortfolioPositions(
  ledger.positions,
  new Map([['AMD', quote]]),
  new Map([['AMD', { symbol: 'AMD', name: 'AMD', sector: '기술', assetKind: 'stock' as const }]]),
);
assert.equal(valuation.valuationQuality, 'verified');
assert.equal(valuation.marketValue, 1_500);
assert.equal(valuation.unrealizedPnl, 500);

function history(): readonly RemoteCandle[] {
  let close = 100;
  return Object.freeze(Array.from({ length: 90 }, (_, index) => {
    const open = close;
    close = open * (1 + Math.sin(index * 0.77) * 0.015);
    return Object.freeze({
      time: Date.UTC(2026, 0, index + 1) / 1_000,
      open,
      high: Math.max(open, close) * 1.002,
      low: Math.min(open, close) * 0.998,
      close,
      volume: 1_000,
    });
  }));
}
const risk = computePortfolioRisk(valuation.holdings, [
  Object.freeze({ symbol: 'AMD', candles: history(), provenance: verifiedProvenance }),
], valuation.marketValue);
assert.equal(risk.dataQuality, 'verified');
assert.equal(risk.status, 'available');
assert.equal(risk.observations, 89);
assert.ok((risk.historicalVar95Amount ?? 0) > 0);

const scenarioSummary = {
  cashBalance: 500,
  holdings: valuation.holdings as readonly PortfolioHolding[],
} as PortfolioSummary;
const scenario = runPortfolioScenario(scenarioSummary, [{ targetType: 'sector', target: '기술', changePct: -20 }]);
assert.equal(scenario.beforeValue, 2_000);
assert.equal(scenario.afterValue, 1_700);
assert.equal(scenario.absoluteChange, -300);

const migration = readFileSync(new URL('../supabase/migrations/202607120004_p4_portfolio_intelligence.sql', import.meta.url), 'utf8').toLowerCase();
for (const contract of [
  'portfolio_transactions_shape_check',
  'append_portfolio_transaction',
  'reverse_latest_portfolio_transaction',
  'pg_advisory_xact_lock',
  'portfolio_snapshots',
  'last_snapshot_attempt_at',
  'portfolios_snapshot_fairness_idx',
  'trade time precedes latest active transaction',
  'old.name is distinct from new.name',
  'investment_theses',
  'revoke insert, update, delete on public.portfolio_transactions from service_role',
]) assert.ok(migration.includes(contract), `missing P4 migration contract: ${contract}`);

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
  crons: Array<{ path: string; schedule: string }>;
  functions: Record<string, { maxDuration: number; memory: number }>;
};
const apiFunctionEntries = readdirSync(new URL('../api/', import.meta.url), { recursive: true })
  .map((entry) => entry.toString())
  .map((entry) => entry.replaceAll('\\', '/'))
  .filter((entry) => entry.endsWith('.ts'))
  .sort();
assert.deepEqual(apiFunctionEntries, [
  '[path].ts',
  'ai/[path].ts',
  'cron/[path].ts',
  'market/[path].ts',
  'ops/[path].ts',
  'portfolio/[path].ts',
], 'Hobby deployment must stay below the 12-function limit while preserving nested routes');
assert.ok(apiFunctionEntries.length <= 12, 'Hobby deployment may define at most 12 functions');
for (const entry of apiFunctionEntries) {
  const source = readFileSync(new URL(`../api/${entry}`, import.meta.url), 'utf8');
  assert.ok(
    source.includes('export default { fetch: dispatchApiRequest }'),
    `${entry} must use Vercel's Web Fetch handler contract`,
  );
}
assert.deepEqual(Object.keys(vercel.functions), ['api/**/*.ts'], 'Vercel function settings must target all API entries safely');
const routeRegistry = readFileSync(new URL('../routes/registry.ts', import.meta.url), 'utf8');
const registeredPaths = [...routeRegistry.matchAll(/\['(\/api\/[^']+)',/g)].map((match) => match[1]);
assert.equal(new Set(registeredPaths).size, 30, 'all 30 existing API contracts must remain registered');
assert.equal(vercel.crons.length, 2, 'Hobby deployments allow at most two cron jobs');
assert.ok(vercel.crons.some((entry) => entry.path === '/api/cron/evaluate-alerts' && entry.schedule === '5 0 * * *'));
assert.ok(vercel.crons.some((entry) => entry.path === '/api/cron/daily-maintenance' && entry.schedule === '20 0 * * *'));
const dailyMaintenance = readFileSync(new URL('../routes/cron/daily-maintenance.ts', import.meta.url), 'utf8');
assert.ok(dailyMaintenance.includes("from './capture-market.js'"), 'daily maintenance must retain market capture');
assert.ok(dailyMaintenance.includes("from './snapshot-portfolios.js'"), 'daily maintenance must retain portfolio snapshots');

const snapshotCron = readFileSync(new URL('../routes/cron/snapshot-portfolios.ts', import.meta.url), 'utf8');
assert.ok(snapshotCron.includes("summary.risk.status === 'available'"), 'strict snapshots must require available verified risk');
const portfolioStore = readFileSync(new URL('../server/portfolio/store.ts', import.meta.url), 'utf8');
assert.ok(portfolioStore.includes("order('captured_at', { ascending: false })"), 'snapshot reads must select the latest rows');
assert.ok(portfolioStore.includes('ignoreDuplicates: true'), 'snapshot retries must preserve the first bucket observation');
assert.ok(portfolioStore.includes('PORTFOLIO_LEDGER_PAGE_SIZE'), 'ledger reads must paginate beyond the PostgREST row cap');
assert.ok(portfolioStore.includes('.range(offset, end)'), 'ledger pagination must use stable ranges');

for (const relative of [
  '../routes/portfolios.ts',
  '../routes/portfolio/transactions.ts',
  '../routes/portfolio/summary.ts',
  '../routes/portfolio/snapshots.ts',
  '../routes/portfolio/scenario.ts',
  '../routes/research.ts',
  '../src/features/portfolio/PortfolioPage.tsx',
]) assert.ok(readFileSync(new URL(relative, import.meta.url), 'utf8').length > 100, `missing P4 surface: ${relative}`);

console.log(JSON.stringify({
  version: '1.10.0',
  fifoLedger: 'PASS',
  immutableReversalContract: 'PASS',
  verifiedValuation: 'PASS',
  historicalRisk: 'PASS',
  stressScenario: 'PASS',
  periodicSnapshots: 'PASS',
  researchLedger: 'PASS',
  result: 'PASS',
}, null, 2));
