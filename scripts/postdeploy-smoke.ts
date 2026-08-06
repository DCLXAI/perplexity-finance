import assert from 'node:assert/strict';

const base = process.env.SMOKE_BASE_URL?.replace(/\/$/, '');
if (!base) {
  console.log(JSON.stringify({ skipped: true, reason: 'SMOKE_BASE_URL is not set' }, null, 2));
  process.exit(0);
}

const expectedVersion = process.env.SMOKE_EXPECT_VERSION ?? '1.13.0';
const requireReady = process.env.SMOKE_REQUIRE_READY === '1';
const requireProvider = process.env.SMOKE_REQUIRE_PROVIDER === '1';
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
const commonHeaders = new Headers();
if (bypass) {
  // Header only, deliberately without `x-vercel-set-bypass-cookie`: that asks Vercel to
  // establish a bypass cookie, which it does by answering 307 + Set-Cookie. Every call below
  // uses `redirect: 'manual'` and asserts an exact status, so the 307 failed the run before the
  // first assertion could ever be reached. A stateless script gains nothing from the cookie —
  // it sends the header on every request anyway.
  commonHeaders.set('x-vercel-protection-bypass', bypass);
}

interface Result {
  readonly path: string;
  readonly status: number;
  readonly requestId: string | null;
}
const results: Result[] = [];

async function call(path: string, accepted: readonly number[], init?: RequestInit): Promise<Response> {
  const headers = new Headers(commonHeaders);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  const response = await fetch(`${base}${path}`, { redirect: 'manual', ...init, headers });
  assert.ok(accepted.includes(response.status), `${path}: unexpected HTTP ${response.status}`);
  assert.ok(response.headers.get('x-request-id'), `${path}: missing X-Request-Id`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  results.push({ path, status: response.status, requestId: response.headers.get('x-request-id') });
  return response;
}

const config = await call('/api/config', [200]);
const configJson = await config.json() as { version?: string; providerMode?: string };
assert.equal(configJson.version, expectedVersion);
assert.ok(['primary', 'failover', 'quorum'].includes(configJson.providerMode ?? ''));

const health = await call('/api/health', [200]);
const healthJson = await health.json() as { status?: string };
assert.ok(['up', 'degraded', 'down'].includes(healthJson.status ?? ''));

const readiness = await call('/api/ready', requireReady ? [200] : [200, 503]);
const readinessJson = await readiness.json() as { ready?: boolean };
if (requireReady) assert.equal(readinessJson.ready, true, 'deployment readiness gate did not pass');

const quotes = await call('/api/market/quotes?symbols=AMD,BTCUSD', requireProvider ? [200] : [200, 503]);
if (quotes.status === 200) {
  const quoteJson = await quotes.json() as { quotes?: unknown[]; mode?: string };
  assert.ok((quoteJson.quotes?.length ?? 0) > 0);
  assert.ok(quoteJson.mode);
  if (requireProvider) {
    assert.ok(!['fallback', 'mock'].includes(quoteJson.mode ?? ''), `provider-backed quote required, received ${quoteJson.mode}`);
  }
}

await call('/api/market/quotes?symbols=NOT_A_SYMBOL', [400]);
await call('/api/telemetry', [202], {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ event: 'smoke.completed', route: '/status', properties: { release: 'p4' } }),
});
await call('/api/metrics', [401, 503]);
await call('/api/cron/evaluate-alerts', [401, 503]);
await call('/api/cron/capture-market', [401, 503]);
await call('/api/cron/daily-maintenance', [401, 503]);
await call('/api/cron/snapshot-portfolios', [401, 503]);
await call('/api/portfolios', [401, 503]);
await call('/api/portfolio/allocation?portfolioId=00000000-0000-0000-0000-000000000000', [401, 503]);
await call('/api/portfolio/rebalances?portfolioId=00000000-0000-0000-0000-000000000000', [401, 503]);
await call('/api/portfolio/contributions?portfolioId=00000000-0000-0000-0000-000000000000', [401, 503]);
await call('/api/portfolio/goal?portfolioId=00000000-0000-0000-0000-000000000000', [401, 503]);
await call('/api/ops/summary', [401, 503]);

if (process.env.SMOKE_SKIP_WEB !== '1') {
  const response = await fetch(base, { redirect: 'manual', headers: commonHeaders });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Synapsu/);
}

console.log(JSON.stringify({
  base,
  expectedVersion,
  requireReady,
  requireProvider,
  requests: results,
  result: 'PASS',
}, null, 2));
