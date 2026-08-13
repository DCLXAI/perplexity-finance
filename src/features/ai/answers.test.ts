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
    expect(text).toContain('모의 시가총액: US$4.56T');
    expect(text).toMatch(/거래 규모는 약 US\$19\.36B입니다\./);
    expect(text).not.toContain('₩');
  });
});

/**
 * Final whole-branch review CRITICAL: `symbolAnswer()` judged every quote's changePct against
 * `SECTOR_BY_ID`, which `universe.ts` builds from `US_SECTORS` alone — never region-scoped even
 * though P11 introduced `SECTORS_BY_REGION`. A Korean stock was compared to the *US* tech
 * sector's average under the identical Korean label "기술", producing a directionally inverted
 * claim: Samsung Electronics (KOSPI tech, +2.50%) actually trails KR tech's +4.46% average by
 * 1.96%p, but the buggy code read US tech's +0.23% and declared a false +2.27%p outperformance.
 *
 * This guards the fix by breaking it the same way review found it: if `sectorFor()` ever regresses
 * back to reading the US table for a KR quote, `기술 섹터 예시 평균` would again render `(+0.23%)`
 * and "아웃퍼폼" instead of `(+4.46%)`/"언더퍼폼" for 005930 — this assertion would then fail.
 */
describe('generateAnswer sector comparison is region-scoped', () => {
  it("compares a Korean quote's changePct to the KR sector table, not the US one", () => {
    const text = generateAnswer('005930');
    expect(text).toContain('기술 섹터 예시 평균(+4.46%)');
    expect(text).toContain('아웃퍼폼');
    expect(text).not.toContain('기술 섹터 예시 평균(+0.23%)');
    expect(text).not.toContain('언더퍼폼');
  });

  it("still compares a US quote's changePct to the US sector table (no regression from the KR fix)", () => {
    const text = generateAnswer('AAPL');
    expect(text).toContain('기술 섹터 예시 평균(+0.23%)');
    expect(text).toContain('언더퍼폼');
  });
});

/**
 * Final whole-branch review CRITICAL (second symptom, same root cause): `sectorAnswer()` has no
 * symbol to read a region off of, and this rule-based fallback bot has no request-time region
 * context at any of its call sites (see `marketBrief()`'s pinned-to-US precedent). It always
 * printed the US sector table under bare Korean sector names and no market qualifier, so under a
 * `?region=kr` conversation a reader would reasonably take "기술"/"의료" here as the KR figures
 * shown one column away on the sector rail — which are different numbers entirely (KR tech
 * +4.46%, KR healthcare +1.52% vs. the US +0.23%/-0.82% this function actually prints).
 * The chosen fix is copy-only: qualify the header so the table's market is never ambiguous.
 */
describe('generateAnswer sector-overview answer states its market', () => {
  it('labels the US sector table explicitly, regardless of Korean wording in the question', () => {
    const us = generateAnswer('섹터 동향 알려줘');
    const kr = generateAnswer('한국 섹터 동향 알려줘');
    expect(us).toContain('모의 섹터 동향 (미국 시장 기준)');
    expect(kr).toContain('모의 섹터 동향 (미국 시장 기준)');
    // The literal figures are still the US table (기초 소재 +1.25% / 의료 -0.82%), never the KR
    // ones (산업재 +4.93% / 에너지 -2.04%) — the header qualifier is what makes those honest now.
    expect(kr).toContain('최강 섹터: **기초 소재** +1.25%');
    expect(kr).toContain('최약 섹터: **의료** -0.82%');
  });
});
