import { describe, expect, it } from 'vitest';
import { readJson, secureSecretEqual, withFunction } from './function.js';

describe('API boundary hardening', () => {
  it('requires JSON for structured request bodies', async () => {
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    });
    await expect(readJson(request)).rejects.toMatchObject({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
  });

  it('compares secrets without direct string equality and returns hardened 405 responses', async () => {
    expect(secureSecretEqual('alpha', 'alpha')).toBe(true);
    expect(secureSecretEqual('alpha', 'beta')).toBe(false);
    const handler = withFunction('test', ['GET'], async () => new Response('ok'));
    const response = await handler(new Request('http://localhost/api/test', { method: 'POST' }));
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
  });
});
