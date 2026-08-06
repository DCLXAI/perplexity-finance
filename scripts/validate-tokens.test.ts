import { describe, expect, it } from 'vitest';
import { contrastRatio, nearestStep, findLiteralViolations } from './validate-tokens.js';
import { rewrite } from './codemod-tokens.mjs';

describe('contrastRatio', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 2);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#6e7274', '#fcfcf9')).toBeCloseTo(
      contrastRatio('#fcfcf9', '#6e7274'),
      5,
    );
  });

  it('scores the corrected tokens above their thresholds', () => {
    // Text token, AA.
    expect(contrastRatio('#6e7274', '#f7f7f2')).toBeGreaterThanOrEqual(4.5);
    // Non-text token, WCAG 1.4.11.
    expect(contrastRatio('#8b9090', '#f7f7f2')).toBeGreaterThanOrEqual(3);
    expect(contrastRatio('#606b6b', '#16201f')).toBeGreaterThanOrEqual(3);
  });

  it('scores the pre-correction values below them', () => {
    expect(contrastRatio('#84898c', '#f7f7f2')).toBeLessThan(4.5);
    expect(contrastRatio('#aab0b0', '#f7f7f2')).toBeLessThan(3);
    expect(contrastRatio('#566262', '#16201f')).toBeLessThan(3);
  });
});

describe('nearestStep', () => {
  it('maps a literal to the closest scale value', () => {
    expect(nearestStep(12.5, [10, 11, 12, 13, 15])).toBe(13);
    expect(nearestStep(9, [10, 11, 12, 13, 15])).toBe(10);
    expect(nearestStep(8.8, [10, 11, 12, 13, 15])).toBe(10);
  });

  it('breaks ties upward, so nothing shrinks silently', () => {
    expect(nearestStep(12.5, [12, 13])).toBe(13);
  });
});

describe('findLiteralViolations', () => {
  it('flags a raw font-size', () => {
    const found = findLiteralViolations('a.css', '.x { font-size: 13px; }');
    expect(found).toHaveLength(1);
    expect(found[0].property).toBe('font-size');
  });

  it('flags a raw padding but allows a 1px border', () => {
    expect(findLiteralViolations('a.css', '.x { padding: 12px; }')).toHaveLength(1);
    expect(findLiteralViolations('a.css', '.x { border: 1px solid var(--border); }')).toHaveLength(0);
  });

  it('allows px inside a media query condition', () => {
    expect(findLiteralViolations('a.css', '@media (max-width: 768px) { .x { color: red } }')).toHaveLength(0);
  });

  it('allows a var() reference', () => {
    expect(findLiteralViolations('a.css', '.x { padding: var(--space-3); }')).toHaveLength(0);
  });

  it('allows 0 without a unit', () => {
    expect(findLiteralViolations('a.css', '.x { margin: 0; }')).toHaveLength(0);
  });

  it('flags a raw padding-inline-start (multi-segment logical property)', () => {
    expect(
      findLiteralViolations('a.css', '.x { padding-inline-start: 12px; }'),
    ).toHaveLength(1);
  });

  it('flags a raw margin-block-end (multi-segment logical property)', () => {
    expect(
      findLiteralViolations('a.css', '.x { margin-block-end: 12px; }'),
    ).toHaveLength(1);
  });

  it('flags a raw inset', () => {
    expect(findLiteralViolations('a.css', '.x { inset: 12px; }')).toHaveLength(1);
  });

  it('does not flag margin-trim, a real property that merely starts with a guarded word', () => {
    expect(findLiteralViolations('a.css', '.x { margin-trim: none; }')).toHaveLength(0);
  });
});

describe('codemod rewrite', () => {
  it('wraps a single negative value in calc(), not a bare -var()', () => {
    const { out } = rewrite('.x { margin-left: -5px; }', 'a.css');
    expect(out).toBe('.x { margin-left: calc(var(--space-1-5) * -1); }');
    expect(out).not.toContain('-var(');
  });

  it('handles a shorthand with two negative values independently', () => {
    const { out } = rewrite('.x { margin: -2px -6px; }', 'a.css');
    expect(out).toBe('.x { margin: calc(var(--space-0-5) * -1) calc(var(--space-1-5) * -1); }');
    expect(out).not.toContain('-var(');
  });

  it('handles a shorthand mixing negative, zero and positive values', () => {
    const { out } = rewrite('.x { margin: -6px 0 14px; }', 'a.css');
    expect(out).toBe('.x { margin: calc(var(--space-1-5) * -1) 0 var(--space-3-5); }');
    expect(out).not.toContain('-var(');
  });

  it('leaves a positive value as a plain var(), no calc wrapper', () => {
    const { out } = rewrite('.x { padding: 12px; }', 'a.css');
    expect(out).toBe('.x { padding: var(--space-3); }');
  });
});
