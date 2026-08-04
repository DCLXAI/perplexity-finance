import { describe, expect, it } from 'vitest';
import {
  buildPortfolioLedger,
  buildPortfolioOpenFifoLots,
  PortfolioLedgerError,
} from './ledger.js';
import type { PortfolioTransaction } from '@/shared/api';

function transaction(
  id: string,
  kind: PortfolioTransaction['kind'],
  values: Partial<PortfolioTransaction> = {},
): PortfolioTransaction {
  const tradeAt = `2026-01-${String(Number(id.replace(/\D/g, '') || 1)).padStart(2, '0')}T15:00:00.000Z`;
  return Object.freeze({
    id,
    portfolioId: 'portfolio-1',
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

const BASE = Object.freeze([
  transaction('t01', 'deposit', { cashAmount: 10_000 }),
  transaction('t02', 'buy', { symbol: 'AMD', quantity: 10, price: 100, fees: 10 }),
  transaction('t03', 'buy', { symbol: 'AMD', quantity: 10, price: 200 }),
  transaction('t04', 'sell', { symbol: 'AMD', quantity: 15, price: 300, fees: 15 }),
]);

describe('buildPortfolioLedger', () => {
  it('reconstructs cash, FIFO lots and realized P&L', () => {
    const ledger = buildPortfolioLedger(BASE);
    expect(ledger.cashBalance).toBe(11_475);
    expect(ledger.netContributions).toBe(10_000);
    expect(ledger.realizedPnl).toBe(2_475);
    expect(ledger.feesPaid).toBe(25);
    expect(ledger.positions).toEqual([
      expect.objectContaining({
        symbol: 'AMD',
        quantity: 5,
        costBasis: 1_000,
        averageCost: 200,
        realizedPnl: 2_475,
      }),
    ]);
  });

  it('cancels the original row through an immutable reversal row', () => {
    const ledger = buildPortfolioLedger([
      ...BASE,
      transaction('t05', 'reversal', { reversalOf: 't04' }),
    ]);
    expect(ledger.activeTransactionCount).toBe(3);
    expect(ledger.cashBalance).toBe(6_990);
    expect(ledger.realizedPnl).toBe(0);
    expect(ledger.positions[0]).toEqual(expect.objectContaining({ quantity: 20, costBasis: 3_010 }));
  });

  it('exports the remaining FIFO lots with buy fees included in unit cost', () => {
    expect(buildPortfolioOpenFifoLots(BASE)).toEqual([
      {
        transactionId: 't03',
        symbol: 'AMD',
        acquiredAt: '2026-01-03T15:00:00.000Z',
        quantity: 5,
        unitCost: 200,
      },
    ]);

    expect(buildPortfolioOpenFifoLots([
      ...BASE,
      transaction('t05', 'reversal', { reversalOf: 't04' }),
    ])).toEqual([
      {
        transactionId: 't02',
        symbol: 'AMD',
        acquiredAt: '2026-01-02T15:00:00.000Z',
        quantity: 10,
        unitCost: 101,
      },
      {
        transactionId: 't03',
        symbol: 'AMD',
        acquiredAt: '2026-01-03T15:00:00.000Z',
        quantity: 10,
        unitCost: 200,
      },
    ]);
  });

  it('returns immutable lots in canonical transaction order for shuffled input', () => {
    const first = transaction('a-buy', 'buy', {
      symbol: 'AAA', quantity: 1, price: 10,
      tradeAt: '2026-01-02T15:00:00.000Z', createdAt: '2026-01-02T15:00:01.000Z',
    });
    const second = transaction('b-buy', 'buy', {
      symbol: 'AAA', quantity: 1, price: 20,
      tradeAt: '2026-01-02T15:00:00.000Z', createdAt: '2026-01-02T15:00:02.000Z',
    });
    const lots = buildPortfolioOpenFifoLots([
      second,
      transaction('deposit', 'deposit', { cashAmount: 100, tradeAt: '2026-01-01T15:00:00.000Z' }),
      first,
    ]);
    expect(lots.map((lot) => lot.transactionId)).toEqual(['a-buy', 'b-buy']);
    expect(Object.isFrozen(lots)).toBe(true);
    expect(Object.isFrozen(lots[0])).toBe(true);
  });

  it('fails instead of silently creating a short position', () => {
    expect(() => buildPortfolioLedger([
      transaction('t01', 'deposit', { cashAmount: 1_000 }),
      transaction('t02', 'buy', { symbol: 'AMD', quantity: 1, price: 100 }),
      transaction('t03', 'sell', { symbol: 'AMD', quantity: 2, price: 110 }),
    ])).toThrowError(PortfolioLedgerError);
  });
});
