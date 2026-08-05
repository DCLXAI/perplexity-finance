import { describe, expect, it } from 'vitest';
import { buildDigestPayload, digestBody, digestSubject } from './digest.js';

const breaches = [
  { kind: 'thesis_invalidation', symbol: 'AAPL', observed_value: 190, threshold_value: 195 },
  { kind: 'risk_threshold', symbol: null, observed_value: 38, threshold_value: 35 },
] as never;

describe('buildDigestPayload', () => {
  it('summarises every breach in the run', () => {
    const payload = buildDigestPayload(breaches, 'https://finance.example.com');
    expect(payload.breachCount).toBe(2);
    expect(payload.items).toHaveLength(2);
    expect(payload.url).toBe('https://finance.example.com/#/portfolio?tab=monitors');
  });

  it('falls back to a relative url when no public origin is configured', () => {
    expect(buildDigestPayload(breaches, '').url).toBe('/#/portfolio?tab=monitors');
  });
});

describe('digest copy', () => {
  it('names the breach count in the subject', () => {
    const payload = buildDigestPayload(breaches, '');
    expect(digestSubject(payload)).toContain('2');
  });

  it('states that no order was placed and the ledger is untouched', () => {
    const body = digestBody(buildDigestPayload(breaches, ''));
    expect(body).toContain('자동 주문이 아닙니다');
    expect(body).toContain('거래 원장');
  });
});
