import { afterEach, describe, expect, it } from 'vitest';
import handler from '../../routes/ops/actions.js';
import { resetCacheForTests } from '../cache.js';
import { resetConfigForTests } from '../config.js';
import { resetProviderRegistryForTests } from '../observability/provider-registry.js';
import { resetCircuitsForTests } from '../resilience/circuit-breaker.js';

const ORIGINAL = { ...process.env };
function request(requestId: string, key: string): Request {
  return new Request('http://localhost/api/ops/actions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': requestId,
      'x-ops-secret': 'test-ops-secret-value',
      'idempotency-key': key,
    },
    body: JSON.stringify({ action: 'probe-providers' }),
  });
}

afterEach(() => {
  process.env = { ...ORIGINAL };
  resetConfigForTests();
  resetCacheForTests();
  resetProviderRegistryForTests();
  resetCircuitsForTests();
});

describe('operations action idempotency', () => {
  it('leases concurrent work and replays the completed response', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.ALPACA_API_KEY_ID;
    delete process.env.ALPACA_API_SECRET_KEY;
    delete process.env.FINNHUB_API_KEY;
    process.env.COINBASE_ENABLED = 'false';
    process.env.ALLOW_MOCK_FALLBACK = 'true';
    process.env.OPS_SECRET = 'test-ops-secret-value';
    resetConfigForTests();

    const key = `ops-test-${crypto.randomUUID()}`;
    const [left, right] = await Promise.all([
      handler(request('request-left', key)),
      handler(request('request-right', key)),
    ]);
    expect([left.status, right.status].sort()).toEqual([200, 409]);

    const completed = left.status === 200 ? left : right;
    const original = await completed.json() as { requestId: string };
    const replay = await handler(request('request-replay', key));
    expect(replay.status).toBe(200);
    expect((await replay.json() as { requestId: string }).requestId).toBe(original.requestId);
  });
});
