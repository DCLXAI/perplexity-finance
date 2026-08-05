import { describe, expect, it } from 'vitest';
import apiRouter from '../../api/[path].js';
import cronRouter from '../../api/cron/[path].js';
import { apiRoutes } from '../../routes/registry.js';

describe('consolidated API router', () => {
  it('registers every existing route behind Hobby-compatible grouped functions', () => {
    expect(apiRoutes.size).toBe(32);
    expect(apiRoutes.has('/api/cron/evaluate-alerts')).toBe(true);
    expect(apiRoutes.has('/api/cron/daily-maintenance')).toBe(true);
    expect(apiRoutes.has('/api/portfolio/rebalances')).toBe(true);
    expect(apiRoutes.has('/api/portfolio/goal')).toBe(true);
    expect(apiRoutes.has('/api/portfolio/contributions')).toBe(true);
    expect(apiRoutes.has('/api/portfolio/monitor-rules')).toBe(true);
    expect(apiRoutes.has('/api/portfolio/monitor-status')).toBe(true);
  });

  it('dispatches an existing route with its public URL unchanged', async () => {
    const response = await apiRouter.fetch(new Request('http://localhost/api/config'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ version: '1.11.0' });
  });

  it('normalizes Vercel relative request URLs before dispatch', async () => {
    const request = {
      url: '/api/config?path=config',
      method: 'GET',
      headers: new Headers({
        host: 'perplexity-finance-rho.vercel.app',
        'x-forwarded-proto': 'https',
      }),
      body: null,
    } as Request;
    const response = await apiRouter.fetch(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ version: '1.11.0' });
  });

  it('keeps nested cron URLs on their grouped Vercel entry', async () => {
    const response = await cronRouter.fetch(new Request('http://localhost/api/cron/evaluate-alerts'));
    expect([401, 503]).toContain(response.status);
    const body = await response.json() as { error: { code: string } };
    expect(['INVALID_CRON_SECRET', 'CRON_NOT_CONFIGURED']).toContain(body.error.code);
  });

  it('returns a stable JSON 404 for an unknown API path', async () => {
    const response = await apiRouter.fetch(new Request('http://localhost/api/not-registered'));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'NOT_FOUND', message: 'API route not found' },
    });
  });
});
