import { describe, expect, it } from 'vitest';
import { buildDigestPayload, digestBody, digestSubject } from './digest.js';
import type { MonitorDigestBreachInput } from './digest.js';

const breaches: readonly MonitorDigestBreachInput[] = [
  {
    kind: 'thesis_invalidation',
    portfolio_id: 'pf-1',
    spec: { condition: 'price_below', symbol: 'AAPL', value: 195 },
    observed_value: 190,
    threshold_value: 195,
  },
  {
    kind: 'risk_threshold',
    portfolio_id: 'pf-1',
    spec: { metric: 'annualizedVolatilityPct', comparison: 'above', value: 35 },
    observed_value: 38,
    threshold_value: 35,
  },
];

describe('buildDigestPayload', () => {
  it('summarises every breach in the run', () => {
    const payload = buildDigestPayload(breaches, 'https://finance.example.com');
    expect(payload.breachCount).toBe(2);
    expect(payload.items).toHaveLength(2);
  });

  it('links to the portfolio that raised the first breach', () => {
    // `tab` is read by nothing in src/; `portfolioId` is what PortfolioPage actually consumes,
    // so a digest link must carry it or it lands on whichever portfolio is default-selected.
    expect(buildDigestPayload(breaches, 'https://finance.example.com').url)
      .toBe('https://finance.example.com/#/portfolio?portfolioId=pf-1');
  });

  it('falls back to a relative url when no public origin is configured', () => {
    expect(buildDigestPayload(breaches, '').url).toBe('/#/portfolio?portfolioId=pf-1');
  });

  it('distinguishes two thesis rules on the same symbol', () => {
    // Before the condition and both numbers reached the label, these two produced byte-identical
    // lines — for the rule kind that most directly prompts a sell decision.
    const [priceItem, drawdownItem] = buildDigestPayload([
      {
        kind: 'thesis_invalidation',
        portfolio_id: 'pf-1',
        spec: { condition: 'price_below', symbol: 'AAPL', value: 150 },
        observed_value: 140,
        threshold_value: 150,
      },
      {
        kind: 'thesis_invalidation',
        portfolio_id: 'pf-1',
        spec: { condition: 'drawdown_from_entry_pct', symbol: 'AAPL', value: 20 },
        observed_value: 26.5,
        threshold_value: 20,
      },
    ], '').items;
    expect(priceItem.label).not.toBe(drawdownItem.label);
    expect(priceItem.label).toContain('AAPL');
    expect(priceItem.label).toContain('기준가 하회');
    expect(priceItem.label).toContain('140');
    expect(priceItem.label).toContain('150');
    expect(drawdownItem.label).toContain('평균단가 대비 하락률');
    expect(drawdownItem.label).toContain('26.5%');
    expect(drawdownItem.label).toContain('20%');
  });

  it('renders numeric(28,8) strings from the breach rows without trailing zero noise', () => {
    const [item] = buildDigestPayload([{
      kind: 'thesis_invalidation',
      portfolio_id: 'pf-1',
      spec: { condition: 'price_below', symbol: 'AAPL', value: 195 },
      observed_value: '190.00000000',
      threshold_value: '195.00000000',
    }], '').items;
    expect(item.label).toContain('190');
    expect(item.label).not.toContain('190.00000000');
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
