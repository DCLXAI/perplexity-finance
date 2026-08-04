import { describe, expect, it } from 'vitest';
import { redactForLog, requestIdFromHeader } from './logger.js';

describe('structured logger safety', () => {
  it('redacts nested credentials and limits untrusted request IDs', () => {
    const output = redactForLog({
      authorization: 'Bearer secret-token',
      nested: { email: 'person@example.com', safe: 'ok', endpoint: 'https://push.example/private' },
    });
    expect(output).toEqual({
      authorization: '[redacted]',
      nested: { email: '[redacted]', safe: 'ok', endpoint: '[redacted]' },
    });
    expect(requestIdFromHeader('good-request_123')).toBe('good-request_123');
    expect(requestIdFromHeader('bad request\nforged')).not.toContain('\n');
  });
});
