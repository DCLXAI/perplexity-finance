// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The runtime disables itself when `import.meta.env.MODE === 'test'`, so these load it with the
 * mode stubbed to 'development' — otherwise every assertion below would pass against a module
 * that never polls at all, which is exactly the shape of vacuous test this branch keeps out.
 */
async function loadRuntime() {
  vi.resetModules();
  vi.stubEnv('MODE', 'development');
  return import('./marketRuntime.js');
}

function response(status: number, code: string) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { code, message: code } }),
    headers: new Headers(),
  };
}

/** `registerLiveSymbols` fires a poll of its own; let it settle so call counts are not racy. */
async function settle() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

/**
 * Regression guard: production served `503 MARKET_DATA_UNAVAILABLE` for every quote batch
 * because no provider is configured, and the client kept polling anyway — 81 failed requests in
 * 319 seconds on a single tab, flooding the console, while the header badge already read
 * 로컬 폴백. A configuration condition is not a transient failure; retrying cannot fix it.
 */
describe('marketRuntime polling suspension', () => {
  it('stops polling once the server reports no provider is configured', async () => {
    const runtime = await loadRuntime();
    fetchMock.mockResolvedValue(response(503, 'MARKET_DATA_UNAVAILABLE'));

    runtime.registerLiveSymbols(['AAPL']);
    await settle();
    const afterSuspension = fetchMock.mock.calls.length;
    expect(afterSuspension).toBeGreaterThan(0);

    // Anything that would normally drive another request must now be a no-op.
    runtime.registerLiveSymbols(['MSFT']);
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('online'));
    await settle();

    expect(fetchMock.mock.calls.length).toBe(afterSuspension);
    expect(runtime.marketRuntimeSnapshot().mode).toBe('fallback');
    expect(runtime.marketRuntimeSnapshot().warnings.join(' ')).toContain('폴링을 중단');
  });

  it('keeps retrying an ordinary failure, which retrying can still fix', async () => {
    const runtime = await loadRuntime();
    fetchMock.mockResolvedValue(response(500, 'INTERNAL'));

    runtime.registerLiveSymbols(['AAPL']);
    await settle();
    const afterFirst = fetchMock.mock.calls.length;

    runtime.registerLiveSymbols(['MSFT']);
    await settle();

    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterFirst);
    expect(runtime.marketRuntimeSnapshot().warnings.join(' ')).not.toContain('폴링을 중단');
  });

  it('resumes when the user explicitly asks for a refresh', async () => {
    const runtime = await loadRuntime();
    fetchMock.mockResolvedValue(response(503, 'MARKET_DATA_UNAVAILABLE'));

    runtime.registerLiveSymbols(['AAPL']);
    await settle();
    const suspendedAt = fetchMock.mock.calls.length;

    // `refreshMarketData` is what the 시스템 상태 다시 점검 button calls.
    await runtime.refreshMarketData();
    await settle();

    expect(fetchMock.mock.calls.length).toBeGreaterThan(suspendedAt);
  });
});
