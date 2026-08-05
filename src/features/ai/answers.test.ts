import { beforeEach, describe, expect, it } from 'vitest';
import { engine } from '@/data/engine';
import { generateAnswer } from './answers.js';

beforeEach(() => {
  // No jsdom `document` in this (default node) environment, so the engine's mock-tick interval
  // never auto-starts — this is defensive, matching the `engine.stop()` convention used
  // elsewhere, not strictly required here.
  engine.stop();
});

/**
 * Regression guard for review round 2's Important 1 and 2: `symbolAnswer()` mislabeled two
 * KR-quote figures as US dollars.
 *
 * - Market cap: `AssetMeta.marketCap` is always stored in USD (see `universe.kr.ts`), so it must
 *   convert back to won for display — the same rule already enforced on `StockPage.tsx` and
 *   `WatchlistPage.tsx`.
 * - Trading size: `q.price` is native-unit (KRW for KR rows), so `volume * price` is already a
 *   won quantity for a KR row — labeling it `US$` overstates it by ~`KRW_PER_USD`x (1,392.5x)
 *   and misrepresents the currency, exactly as `engine.movers`'s active-sort comment warns
 *   against for this same `price` field.
 */
describe('generateAnswer region-aware currency formatting', () => {
  it("labels a Korean quote's market cap and trading size in won, not dollars", () => {
    const text = generateAnswer('005930');
    expect(text).toContain('모의 시가총액: ₩1,568.32조');
    expect(text).not.toMatch(/모의 시가총액: US\$/);
    expect(text).toMatch(/거래 규모는 약 US\$12\.\d\dB입니다\./);
    expect(text).not.toMatch(/거래 규모는 약 US\$16\.84T/);
  });

  it("still labels a US quote's market cap and trading size in dollars (no regression from the KR fix)", () => {
    const text = generateAnswer('AAPL');
    expect(text).toContain('모의 시가총액: US$4.52T');
    expect(text).toMatch(/거래 규모는 약 US\$19\.19B입니다\./);
    expect(text).not.toContain('₩');
  });
});
