import { describe, expect, it } from 'vitest';
import { localFallbackAnswer } from './service.js';

describe('financial AI fallback', () => {
  it('returns an explicitly labelled local response with provenance', () => {
    const result = localFallbackAnswer([{ role: 'user', text: 'AMD를 알려줘' }], 'test-ai');
    expect(result.mode).toBe('local-fallback');
    expect(result.model).toBe('local-rule-engine');
    expect(result.requestId).toBe('test-ai');
    expect(result.sources[0]?.source).toBe('local-simulation');
    expect(result.text).toContain('AMD');
  });
});
