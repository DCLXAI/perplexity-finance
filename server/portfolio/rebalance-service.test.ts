import { describe, expect, it } from 'vitest';
import { rebalanceRequestHash } from './rebalance-service.js';

describe('rebalance request hashing', () => {
  it('is stable across object key ordering', () => {
    expect(rebalanceRequestHash({ action: 'complete', fills: [{ price: 20, quantity: 5 }] }))
      .toBe(rebalanceRequestHash({ fills: [{ quantity: 5, price: 20 }], action: 'complete' }));
  });

  it('changes when an actual fill changes', () => {
    expect(rebalanceRequestHash({ itemId: 'one', quantity: 5, price: 20 }))
      .not.toBe(rebalanceRequestHash({ itemId: 'one', quantity: 5, price: 21 }));
  });
});
