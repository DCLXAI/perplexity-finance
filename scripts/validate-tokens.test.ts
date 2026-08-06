import { describe, expect, it } from 'vitest';
import { contrastRatio, nearestStep, findLiteralViolations } from './validate-tokens.js';

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

  // Round-3 correction (final-review pass): `--bg-subtle`/`--bg-hover` joined the
  // guarded SURFACES list, which exposed the round-1 `--ink-muted`/`--ink-faint`/
  // `--warn` values as failing against those two (darker-in-light,
  // lighter-in-dark) surfaces specifically. `--bg-hover` is the binding surface
  // in both themes — it is the darkest of the light surfaces and the lightest of
  // the dark surfaces, so it produces the least contrast against a mid-tone ink.
  it('scores the round-3 corrected tokens above their thresholds on --bg-hover', () => {
    expect(contrastRatio('#6a6d6f', '#f0efe9')).toBeGreaterThanOrEqual(4.5); // light --ink-muted
    expect(contrastRatio('#858a8a', '#f0efe9')).toBeGreaterThanOrEqual(3); // light --ink-faint
    expect(contrastRatio('#88670f', '#f0efe9')).toBeGreaterThanOrEqual(4.5); // light --warn
    expect(contrastRatio('#839090', '#1d2928')).toBeGreaterThanOrEqual(4.5); // dark --ink-muted
    expect(contrastRatio('#677373', '#1d2928')).toBeGreaterThanOrEqual(3); // dark --ink-faint
  });

  it('scores the round-1 --ink-muted/--ink-faint/--warn values below AA on --bg-hover', () => {
    // These were "PASS" under the pre-review SURFACES list (--bg/--bg-raised/--bg-inset
    // only) — the gap I2 closed.
    expect(contrastRatio('#6e7274', '#f0efe9')).toBeLessThan(4.5);
    expect(contrastRatio('#8b9090', '#f0efe9')).toBeLessThan(3);
    expect(contrastRatio('#8a680f', '#f0efe9')).toBeLessThan(4.5);
    expect(contrastRatio('#7d8b8b', '#1d2928')).toBeLessThan(4.5);
    expect(contrastRatio('#606b6b', '#1d2928')).toBeLessThan(3);
  });

  // Semantic-on-semantic-background pairs (I1): --warn/--pos/--neg text rendered on
  // their own tinted chip, and brand teal on its soft chip. TEXT_INKS × SURFACES
  // alone never sees this pairing — a semantic ink is never painted on a neutral
  // --bg/--bg-raised/--bg-inset/--bg-subtle/--bg-hover surface in shipped CSS, only
  // on its own *-bg/-soft chip.
  it('scores the shipped semantic pairs above 4.5:1 in both themes', () => {
    expect(contrastRatio('#88670f', '#f7efdb')).toBeGreaterThanOrEqual(4.5); // light --warn/--warn-bg
    expect(contrastRatio('#0d7259', '#e2f2ea')).toBeGreaterThanOrEqual(4.5); // light --pos/--pos-bg
    expect(contrastRatio('#b8432f', '#f8e8e3')).toBeGreaterThanOrEqual(4.5); // light --neg/--neg-bg
    expect(contrastRatio('#20708d', '#e4eeef')).toBeGreaterThanOrEqual(4.5); // light --teal/--teal-soft
    expect(contrastRatio('#d9a83c', '#33290f')).toBeGreaterThanOrEqual(4.5); // dark --warn/--warn-bg
    expect(contrastRatio('#3bbf8b', '#12312a')).toBeGreaterThanOrEqual(4.5); // dark --pos/--pos-bg
    expect(contrastRatio('#e0705c', '#3a1f19')).toBeGreaterThanOrEqual(4.5); // dark --neg/--neg-bg
    expect(contrastRatio('#35a4b2', '#143336')).toBeGreaterThanOrEqual(4.5); // dark --teal/--teal-soft
  });

  it('would have caught the I1 regression the reviewer demonstrated', () => {
    // Reviewer proof: setting --warn-bg to #c9a445 drops light --warn/--warn-bg to 2.18:1.
    expect(contrastRatio('#88670f', '#c9a445')).toBeLessThan(4.5);
  });

  it('scores the corrected primary-button pairing above 4.5:1 in dark (I5)', () => {
    // #fff on dark --teal (#35a4b2) was 2.96:1 — below AA. .ui-btn.primary now
    // uses --teal-btn, which is identical to --teal in light and darker in dark.
    expect(contrastRatio('#ffffff', '#35a4b2')).toBeLessThan(4.5); // pre-fix pairing, pinned as a regression guard
    expect(contrastRatio('#ffffff', '#2a818c')).toBeGreaterThanOrEqual(4.5); // --teal-btn dark
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
