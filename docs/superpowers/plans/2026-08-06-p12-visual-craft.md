# P12 Visual Craft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Synapsu a spacing, type and motion scale, correct the token contrast failures, and apply both across all fifteen routes so the last screen looks like the first.

**Architecture:** Three new token axes land in `src/styles/global.css`. A validator computes contrast, theme parity, literal discipline and reduced-motion compliance as part of `npm run check`. A codemod maps the 1,481 existing literals onto the scales file-by-file, and screen-group tasks review and correct what the codemod produced.

**Tech Stack:** Plain CSS custom properties, React 19, `react-router` 8, TypeScript 5.9.3, Vitest 4, `tsx` for scripts.

## Global Constraints

- Node.js `>=22.22.0`. React 19, `react-router` 8 (never `react-router-dom` — the package does not exist in v8).
- All relative imports use `.js` specifiers even for `.ts`/`.tsx` sources; `npm run validate:esm` enforces this.
- `Object.freeze` on returned collections and objects; `readonly` interface members; named exports.
- **No new dependencies**, runtime or dev. The contrast maths is ~20 lines and the codemod is a regex pass.
- Do not modify `vercel.json`. The Vercel Hobby plan allows exactly two Cron schedules and both are in use.
- Do not change data, engine, or server behaviour. This phase touches CSS, component markup and `scripts/` only. `src/data/*`, `server/*` and `supabase/*` are off-limits except where a task names an exact file.
- Provenance stays at least as prominent as it is today: badges, fallback notices and as-of stamps must not lose contrast, size, or position relative to the price they qualify.
- User-facing copy is Korean.
- Application version moves `1.12.0` → `1.13.0` in Task 12. Until then leave every version literal alone.
- Run `npm run check` before every commit. It must exit 0.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/styles/global.css` | All tokens. The only file allowed to contain raw hex, and raw px for `font-size`/`padding`/`margin`/`gap`. |
| `scripts/validate-tokens.ts` | Contrast, theme parity, literal discipline, reduced-motion. Joins `npm run check`. |
| `scripts/codemod-tokens.mjs` | One-shot literal→token rewriter, run per file by the screen-group tasks. Deleted in Task 12. |
| `src/components/ui/ui.css` | Primitives every screen inherits. |
| `src/components/layout/layout.css` | Shell: header, tab bar, rail geometry. |
| `src/features/*/*.css` | Per-screen styles; consume tokens only. |
| `scripts/validate-p12.ts` | Phase contract assertions, following the P2–P11 pattern. |

---

### Task 1: Token scales and contrast correction

**Files:**
- Modify: `src/styles/global.css:6-73` (`:root`), `src/styles/global.css:74-118` (`[data-theme='dark']`)

**Interfaces:**
- Produces: CSS custom properties `--space-0-5` … `--space-8`, `--text-2xs` … `--text-3xl`, `--dur-fast|base|slow`, `--ease-out|spring`. Every later task consumes these by name.

**Context the implementer needs:** the current token block already carries colour, font-family, radius, shadow and layout tokens, and dark is a genuine parallel palette (semantic colours carry their own dark values). Do not restructure it. Add the three new axes and change exactly the four colour values named below.

- [ ] **Step 1: Add the spacing scale to `:root`**

Insert after the `--radius-full` line. Half-steps exist because 2, 6, 10 and 14px are among the most-used values in the codebase (51, 57, 107 and 84 occurrences); a pure 4px scale would round a third of the codebase to the wrong side.

```css
  /* Spacing — 4px base with half-steps. See docs/superpowers/specs/2026-08-06-p12-visual-craft-design.md */
  --space-0-5: 2px;
  --space-1: 4px;
  --space-1-5: 6px;
  --space-2: 8px;
  --space-2-5: 10px;
  --space-3: 12px;
  --space-3-5: 14px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
```

- [ ] **Step 2: Add the type scale to `:root`**

Insert directly after the spacing block. The codebase currently uses 30 distinct sizes including 7.5, 8.8, 9.5, 10.5, 11.5, 13.5 and 14.5px — those are noise, not a hierarchy.

```css
  /* Type scale. 9px is why the market tab's caret read as a dot; nothing sits below 10px. */
  --text-2xs: 10px;
  --text-xs: 11px;
  --text-sm: 12px;
  --text-base: 13px;
  --text-md: 15px;
  --text-lg: 17px;
  --text-xl: 20px;
  --text-2xl: 24px;
  --text-3xl: 32px;
```

- [ ] **Step 3: Add motion tokens to `:root`**

120ms and 150ms are chosen because they are already the codebase's two dominant durations (27 and 23 uses of `0.12s` and `0.15s`); this names what is already there rather than inventing a cadence.

```css
  /* Motion */
  --dur-fast: 120ms;
  --dur-base: 150ms;
  --dur-slow: 300ms;
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
  --ease-spring: cubic-bezier(0.2, 0.8, 0.2, 1);
```

- [ ] **Step 4: Add the single reduced-motion block**

Add at the end of the file. This is the one place the preference is honoured, so no individual rule has to remember.

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-fast: 0ms;
    --dur-base: 0ms;
    --dur-slow: 0ms;
  }

  *,
  *::before,
  *::after {
    animation-duration: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 5: Correct the four failing colour values**

These are computed, not chosen. Text tokens are held to WCAG AA 4.5:1; `--ink-faint` carries carets, chevrons and separator dots rather than text, so it is held to the 3:1 non-text threshold of WCAG 1.4.11. Holding it to 4.5:1 collapses it into `--ink-muted` — both resolve to ~`#6e7274` — and destroys the hierarchy.

In `:root`:

```css
  --ink-muted: #6e7274;   /* was #84898c — 3.29:1 on --bg-inset, below AA for 11-13px text */
  --ink-faint: #8b9090;   /* was #aab0b0 — 2.05:1, below the 3:1 non-text threshold */
  --warn: #95680f;        /* was #b47d12 — 3.32:1 on --bg-inset */
```

In `[data-theme='dark']`:

```css
  --ink-faint: #606b6b;   /* was #566262 — 2.63:1 */
```

Change nothing else. Every other pair already clears its threshold.

- [ ] **Step 6: Verify the ladder still reads**

Run:

```bash
npx tsx -e "
const lum=h=>{const [r,g,b]=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(c=>c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4);return 0.2126*r+0.7152*g+0.0722*b};
const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05)};
const L=[['strong','#091717'],['ink','#13343b'],['secondary','#4d5f62'],['muted','#6e7274'],['faint','#8b9090']];
for(let i=0;i<L.length-1;i++)console.log(L[i][0],'->',L[i+1][0],ratio(L[i][1],L[i+1][1]).toFixed(2));
"
```

Expected: every adjacent step ≥ 1.30, so the five ink levels remain visually distinct
(`1.38`, `1.98`, `1.38`, `1.50`).

- [ ] **Step 7: Verify nothing regressed and commit**

Run: `npm run check`
Expected: exit 0.

```bash
git add src/styles/global.css
git commit -m "feat(p12): add spacing, type and motion scales; correct contrast failures"
```

---

### Task 2: Token validator and codemod

**Files:**
- Create: `scripts/validate-tokens.ts`, `scripts/codemod-tokens.mjs`
- Modify: `package.json` (add `validate:tokens` to the `check` chain)
- Test: `scripts/validate-tokens.test.ts`

**Interfaces:**
- Consumes: the token names from Task 1.
- Produces: `npm run validate:tokens`, and `node scripts/codemod-tokens.mjs <file...>` which rewrites literals in place and prints a per-file count. Tasks 3–10 run the codemod on their own files.

- [ ] **Step 1: Write the failing test**

Create `scripts/validate-tokens.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scripts/validate-tokens.test.ts`
Expected: FAIL — `Failed to resolve import "./validate-tokens.js"`.

- [ ] **Step 3: Write the validator**

Create `scripts/validate-tokens.ts`:

```ts
/* ============================================================
   Token discipline gate.

   Craft is where review turns into opinion, so the parts that can be
   computed are computed: contrast, theme parity, literal discipline,
   and that the reduced-motion escape hatch exists.
   ============================================================ */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const GLOBAL_CSS = 'src/styles/global.css';

/** Relative luminance per WCAG 2.1. */
function luminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function nearestStep(value: number, steps: readonly number[]): number {
  let best = steps[0];
  let bestGap = Infinity;
  for (const step of steps) {
    const gap = Math.abs(step - value);
    // `<=` breaks ties upward: a literal never silently shrinks.
    if (gap <= bestGap) {
      bestGap = gap;
      best = step;
    }
  }
  return best;
}

export interface LiteralViolation {
  readonly file: string;
  readonly property: string;
  readonly value: string;
}

const GUARDED = ['font-size', 'padding', 'margin', 'gap', 'row-gap', 'column-gap'];

/**
 * Border widths, chart pixel heights and media-query breakpoints stay exempt: forcing them
 * onto a spacing scale would be a lie about what they are.
 */
export function findLiteralViolations(file: string, css: string): LiteralViolation[] {
  const withoutMedia = css.replace(/@media[^{]+\{/g, '{');
  const out: LiteralViolation[] = [];
  for (const property of GUARDED) {
    const pattern = new RegExp(`(?:^|[;{\\s])${property}(?:-[a-z]+)?\\s*:\\s*([^;}]+)`, 'g');
    for (const match of withoutMedia.matchAll(pattern)) {
      const value = match[1].trim();
      if (/\d+(?:\.\d+)?px/.test(value)) out.push({ file, property, value });
    }
  }
  return out;
}

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...cssFiles(path));
    else if (entry.endsWith('.css')) out.push(path);
  }
  return out;
}

function tokensIn(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    map.set(match[1], match[2].trim());
  }
  return map;
}

/** Text tokens are held to AA. `--ink-faint` carries carets and separator dots, not text. */
const TEXT_INKS = ['--ink', '--ink-strong', '--ink-secondary', '--ink-muted', '--warn'];
const NON_TEXT_INKS = ['--ink-faint'];
const SURFACES = ['--bg', '--bg-raised', '--bg-inset'];

function main(): void {
  const failures: string[] = [];
  const global = readFileSync(GLOBAL_CSS, 'utf8');

  const rootBlock = global.slice(global.indexOf(':root {'), global.indexOf('[data-theme='));
  const darkStart = global.indexOf("[data-theme='dark'] {");
  const darkBlock = global.slice(darkStart, global.indexOf('}', global.indexOf('color-scheme: dark')));
  const light = tokensIn(rootBlock);
  const dark = tokensIn(darkBlock);

  // 1. Theme parity — a token added to light and forgotten in dark inherits silently.
  for (const name of light.keys()) {
    if (name.startsWith('--font') || name.startsWith('--radius')) continue;
    if (name.startsWith('--space') || name.startsWith('--text') || name.startsWith('--dur')) continue;
    if (name.startsWith('--ease') || name === '--rail-w') continue;
    if (name === '--header-h' || name === '--tabbar-h') continue;
    if (!dark.has(name)) failures.push(`theme parity: ${name} exists in :root but not in [data-theme='dark']`);
  }

  // 2. Contrast.
  for (const [themeName, tokens] of [['light', light], ['dark', dark]] as const) {
    const resolve = (n: string) => (tokens.get(n) ?? light.get(n) ?? '').trim();
    for (const surface of SURFACES) {
      const bg = resolve(surface);
      if (!/^#[0-9a-f]{6}$/i.test(bg)) continue;
      for (const [inks, threshold] of [[TEXT_INKS, 4.5], [NON_TEXT_INKS, 3]] as const) {
        for (const ink of inks) {
          const fg = resolve(ink);
          if (!/^#[0-9a-f]{6}$/i.test(fg)) continue;
          const ratio = contrastRatio(fg, bg);
          if (ratio < threshold) {
            failures.push(
              `contrast: ${themeName} ${ink} on ${surface} is ${ratio.toFixed(2)}, needs ${threshold}`,
            );
          }
        }
      }
    }
  }

  // 3. Literal discipline.
  let violations = 0;
  for (const file of cssFiles('src')) {
    if (file.replace(/\\/g, '/') === GLOBAL_CSS) continue;
    const found = findLiteralViolations(file, readFileSync(file, 'utf8'));
    violations += found.length;
    for (const v of found.slice(0, 3)) {
      failures.push(`literal: ${v.file} has raw px in ${v.property}: ${v.value}`);
    }
  }

  // 4. The reduced-motion escape hatch exists and zeroes the duration tokens.
  if (!/@media \(prefers-reduced-motion: reduce\)/.test(global)) {
    failures.push('motion: global.css has no prefers-reduced-motion block');
  } else if (!/--dur-fast:\s*0ms/.test(global)) {
    failures.push('motion: prefers-reduced-motion does not zero --dur-fast');
  }

  const report = {
    themeParity: failures.some((f) => f.startsWith('theme parity')) ? 'FAIL' : 'PASS',
    contrast: failures.some((f) => f.startsWith('contrast')) ? 'FAIL' : 'PASS',
    literals: violations,
    reducedMotion: failures.some((f) => f.startsWith('motion')) ? 'FAIL' : 'PASS',
    result: failures.length === 0 ? 'PASS' : 'FAIL',
  };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) {
    for (const f of failures.slice(0, 40)) console.error(`  ${f}`);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('validate-tokens.ts')) main();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/validate-tokens.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Write the codemod**

Create `scripts/codemod-tokens.mjs`. It is deliberately a separate, throwaway script rather than part of the validator: it mutates files, and mixing a mutator into a gate invites someone to "fix" a failing gate by running the mutator without looking.

```js
/* One-shot literal → token rewriter. Run per file, then review the diff by eye.
   Deleted in Task 12; it exists only for the 1,481-site migration. */
import { readFileSync, writeFileSync } from 'node:fs';

const SPACE = [
  [2, '--space-0-5'], [4, '--space-1'], [6, '--space-1-5'], [8, '--space-2'],
  [10, '--space-2-5'], [12, '--space-3'], [14, '--space-3-5'], [16, '--space-4'],
  [20, '--space-5'], [24, '--space-6'], [32, '--space-8'],
];
const TEXT = [
  [10, '--text-2xs'], [11, '--text-xs'], [12, '--text-sm'], [13, '--text-base'],
  [15, '--text-md'], [17, '--text-lg'], [20, '--text-xl'], [24, '--text-2xl'], [32, '--text-3xl'],
];

const nearest = (value, table) =>
  table.reduce((best, row) =>
    Math.abs(row[0] - value) <= Math.abs(best[0] - value) ? row : best, table[0])[1];

function rewrite(css) {
  let count = 0;
  let out = css.replace(/(font-size:\s*)([0-9.]+)px/g, (_, head, value) => {
    count += 1;
    return `${head}var(${nearest(Number(value), TEXT)})`;
  });
  out = out.replace(
    /((?:padding|margin|gap|row-gap|column-gap)(?:-[a-z]+)?:\s*)([^;}]+)/g,
    (whole, head, value) => {
      if (!/\d+(?:\.\d+)?px/.test(value)) return whole;
      const next = value.replace(/([0-9.]+)px/g, (__, n) => {
        count += 1;
        return `var(${nearest(Number(n), SPACE)})`;
      });
      return `${head}${next}`;
    },
  );
  return { out, count };
}

for (const file of process.argv.slice(2)) {
  const { out, count } = rewrite(readFileSync(file, 'utf8'));
  writeFileSync(file, out);
  console.log(`${file}: ${count} literal(s) replaced`);
}
```

- [ ] **Step 6: Wire the validator into `npm run check`**

In `package.json`, add the script and insert it into the `check` chain immediately before `validate:esm`:

```json
"validate:tokens": "tsx scripts/validate-tokens.ts",
```

- [ ] **Step 7: Run the gate and record the starting violation count**

Run: `npm run validate:tokens`
Expected: FAIL, with `literals` reporting roughly 1,481 and `contrast`/`themeParity`/`reducedMotion` all `PASS` (Task 1 fixed those). Record the exact number in the task report — Tasks 3–10 drive it to zero and Task 12 asserts it is zero.

- [ ] **Step 8: Commit**

`npm run check` will fail at this point because the gate is red by design. Commit the validator with the gate **not yet** in the `check` chain, then let Task 3 onward drive the count down:

Remove `validate:tokens` from the `check` chain for now (keep the standalone script), run `npm run check` to confirm exit 0, then:

```bash
git add scripts/validate-tokens.ts scripts/validate-tokens.test.ts scripts/codemod-tokens.mjs package.json
git commit -m "feat(p12): add token discipline validator and literal codemod"
```

---

### Task 3: UI primitives

**Files:**
- Modify: `src/components/ui/ui.css`

**Interfaces:**
- Consumes: the scales from Task 1, `scripts/codemod-tokens.mjs` from Task 2.
- Produces: token-clean primitives (`Card`, `CardHeader`, `ChipTabs`, `SegTabs`, `QuoteRow`, `ChangeBadge`, `LogoChip`) that all fifteen screens inherit.

- [ ] **Step 1: Record the before state**

Run: `npx tsx -e "import('./scripts/validate-tokens.js')" 2>/dev/null; npm run validate:tokens 2>&1 | grep literals`
Note the count.

- [ ] **Step 2: Run the codemod on this file**

```bash
node scripts/codemod-tokens.mjs src/components/ui/ui.css
```

- [ ] **Step 3: Review every replacement by eye**

`git diff src/components/ui/ui.css`. The codemod maps to the nearest step and breaks ties upward, so most changes are 0–1px. Look specifically for:
- a `font-size` that moved by 2px or more — that is a real visual change and needs a decision, not an automatic accept
- `padding: 8px 9px` style pairs where the two values collapsed to the same token, flattening an intentional asymmetry
- anything inside a `@media` block that should not have moved

Fix by hand where the codemod chose wrong. Do not accept the diff wholesale.

- [ ] **Step 4: Replace hardcoded durations with motion tokens**

Every `transition: <prop> 0.12s` becomes `transition: <prop> var(--dur-fast) var(--ease-out)`, and `0.15s` becomes `var(--dur-base) var(--ease-out)`. Other values map to the nearest of `--dur-fast` / `--dur-base` / `--dur-slow`.

- [ ] **Step 5: Verify in the browser, both themes**

Start the dev server with the preview tools (`preview_start` with `{name: "dev"}` from `.claude/launch.json`), open `/#/`, and capture a screenshot in light and in dark at 1280 width. Primitives appear on every screen, so a regression here is a regression everywhere. Compare against the pre-change screenshots and report any component whose height changed by more than 2px.

- [ ] **Step 6: Verify and commit**

Run: `npm run check` (exit 0) and `npm run validate:tokens` (the `literals` count must have dropped by the number the codemod reported), then:

```bash
git add src/components/ui/ui.css
git commit -m "refactor(p12): move UI primitives onto the token scales"
```

---

### Task 4: Shell and the AskBar overlap defect

**Files:**
- Modify: `src/components/layout/layout.css`, `src/components/layout/region-switcher.css`, `src/features/ai/ai.css`, `src/features/rail/rail.css`

**Interfaces:**
- Consumes: the scales from Task 1.
- Produces: a shell whose floating AskBar no longer covers body text.

**The defect:** on `/#/` the AskBar floats over the market-summary list and covers a row. It is visible in production today. The fix is for `main` to reserve space equal to the AskBar's height rather than for the AskBar to move.

- [ ] **Step 1: Write the failing overlap check**

Create `scripts/check-overlap.mjs` — a browser-side snippet the task pastes into `javascript_tool`, kept in the repo so later tasks reuse it verbatim:

```js
/* Returns every floating element whose box intersects body text.
   Paste into the browser console (or javascript_tool) on any route. */
(() => {
  const floats = [...document.querySelectorAll('body *')].filter((el) => {
    const p = getComputedStyle(el).position;
    return (p === 'fixed' || p === 'sticky') && el.offsetHeight > 24;
  });
  const textNodes = [...document.querySelectorAll('main p, main h1, main h2, main h3, main li, main td')];
  const hits = [];
  for (const f of floats) {
    const a = f.getBoundingClientRect();
    if (a.height === 0) continue;
    for (const t of textNodes) {
      const b = t.getBoundingClientRect();
      if (b.height === 0) continue;
      const overlap = !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      if (overlap) hits.push({ float: f.className || f.tagName, covers: (t.textContent || '').trim().slice(0, 40) });
    }
  }
  return JSON.stringify({ overlaps: hits.length, sample: hits.slice(0, 5) }, null, 1);
})();
```

- [ ] **Step 2: Run it against production and confirm it reports the defect**

Open `https://www.synapsu.ai/#/` with the preview tools and run the snippet.
Expected: `overlaps` greater than 0, with the AskBar named as the float and a market-summary row as what it covers. Paste the actual output into the task report. If it reports 0, the defect has been fixed by something else — say so and stop rather than inventing a fix.

- [ ] **Step 3: Reserve space for the AskBar**

In `src/styles/global.css` add an AskBar height token beside `--header-h`:

```css
  --askbar-h: 92px;
```

Add it to the `[data-theme='dark']` block as well so Task 2's theme-parity check passes, with the same value.

In `src/components/layout/layout.css`, give `.app-main` bottom padding on the routes that mount the AskBar:

```css
.app-main {
  padding-bottom: calc(var(--askbar-h) + var(--space-4));
}
```

- [ ] **Step 4: Run the codemod on the four files and review**

```bash
node scripts/codemod-tokens.mjs src/components/layout/layout.css src/components/layout/region-switcher.css src/features/ai/ai.css src/features/rail/rail.css
```

Review the diff as in Task 3 Step 3. `region-switcher.css` was hand-written recently with raw values (`font-size: 15px`, `padding: 12px 6px 14px 12px`) — those are expected to move.

- [ ] **Step 5: Re-run the overlap check locally in both themes**

With the dev server running, open `/#/`, `/#/?region=kr`, `/#/crypto` and `/#/portfolio` and run the Step 1 snippet in light and dark.
Expected: `overlaps: 0` on all eight combinations. Paste the actual outputs.

- [ ] **Step 6: Verify and commit**

Run: `npm run check` (exit 0), then:

```bash
git add src/styles/global.css src/components/layout/layout.css src/components/layout/region-switcher.css src/features/ai/ai.css src/features/rail/rail.css scripts/check-overlap.mjs
git commit -m "fix(p12): stop the AskBar covering body text, move the shell onto tokens"
```

---

### Task 5: Market home and heatmap

**Files:**
- Modify: `src/features/market/market.css`, `src/features/heatmap/heatmap.css`

- [ ] **Step 1: Run the codemod**

```bash
node scripts/codemod-tokens.mjs src/features/market/market.css src/features/heatmap/heatmap.css
```

- [ ] **Step 2: Review the diff by eye**

Same review as Task 3 Step 3. `market.css` carries 78 literals. Pay attention to `.mkt-idx-price` and `.mkt-idx-chg`: the reference's index cards get their character from a large numeral against a small label, so if the codemod flattened that contrast, raise the price to `--text-xl` by hand and say so in the report.

- [ ] **Step 3: Replace hardcoded durations with motion tokens**

As in Task 3 Step 4.

- [ ] **Step 4: Verify in the browser, both themes, three viewports**

Open `/#/` and `/#/?region=kr` at 375, 768 and 1280 width, in light and dark — twelve captures. Confirm the heatmap's colour ramp still reads at every size and that no index card wraps its price onto two lines. Report what you saw, and run the Task 4 overlap snippet on both routes.

- [ ] **Step 5: Verify and commit**

Run: `npm run check` (exit 0), then:

```bash
git add src/features/market/market.css src/features/heatmap/heatmap.css
git commit -m "refactor(p12): move market home and heatmap onto the token scales"
```

---

### Task 6: Stock detail and chart

**Files:**
- Modify: `src/features/stock/stock.css`

- [ ] **Step 1: Run the codemod**

```bash
node scripts/codemod-tokens.mjs src/features/stock/stock.css
```

- [ ] **Step 2: Review the diff by eye**

Same review as Task 3 Step 3. The price header (`₩246,000` / `US$309.38`) is the largest numeral in the app; confirm it did not shrink.

- [ ] **Step 3: Replace hardcoded durations with motion tokens**

- [ ] **Step 4: Verify in the browser, both themes**

Open `/#/stock/AAPL` and `/#/stock/005930` at 375 and 1280, light and dark. `PriceChart` sets its own colours from CSS variables at mount (`readPalette()` in `src/features/stock/PriceChart.tsx`), so confirm the chart line, volume bars and axis labels all still resolve after a theme toggle **without a reload** — that is the failure mode this task can introduce.

- [ ] **Step 5: Verify and commit**

Run: `npm run check` (exit 0), then:

```bash
git add src/features/stock/stock.css
git commit -m "refactor(p12): move stock detail onto the token scales"
```

---

### Task 7: Screener and crypto

**Files:**
- Modify: `src/features/screener/screener.css`, `src/features/crypto/crypto.css`

- [ ] **Step 1: Run the codemod**

```bash
node scripts/codemod-tokens.mjs src/features/screener/screener.css src/features/crypto/crypto.css
```

- [ ] **Step 2: Review the diff by eye**

Same review as Task 3 Step 3. The screener is a dense table; row height is the thing to watch. If the codemod grew `td` padding, the visible row count drops and the screen gets worse, not better — pull it back to `--space-2` by hand and say so.

- [ ] **Step 3: Replace hardcoded durations with motion tokens**

- [ ] **Step 4: Verify in the browser, both themes**

Open `/#/screener`, `/#/screener?region=kr` and `/#/crypto` at 375 and 1280, light and dark. Report the number of screener rows visible above the fold at 1280 before and after — it must not have decreased.

- [ ] **Step 5: Verify and commit**

Run: `npm run check` (exit 0), then:

```bash
git add src/features/screener/screener.css src/features/crypto/crypto.css
git commit -m "refactor(p12): move screener and crypto onto the token scales"
```

---

### Task 8: Watchlist and earnings

**Files:**
- Modify: `src/features/watchlist/watchlist.css`, `src/features/earnings/earnings.css`

- [ ] **Step 1: Run the codemod**

```bash
node scripts/codemod-tokens.mjs src/features/watchlist/watchlist.css src/features/earnings/earnings.css
```

- [ ] **Step 2: Review the diff by eye**

Same review as Task 3 Step 3.

- [ ] **Step 3: Replace hardcoded durations with motion tokens**

- [ ] **Step 4: Verify in the browser, both themes**

Open `/#/watchlist`, `/#/earnings` and `/#/earnings?region=kr` at 375 and 1280, light and dark. The watchlist is deliberately cross-region and renders `₩` and `US$` rows in one table — confirm both currencies still align in the same column after the type change.

- [ ] **Step 5: Verify and commit**

Run: `npm run check` (exit 0), then:

```bash
git add src/features/watchlist/watchlist.css src/features/earnings/earnings.css
git commit -m "refactor(p12): move watchlist and earnings onto the token scales"
```

---

### Task 9: Predictions, politicians, apps, status, ops, search, alerts, cloud, data-status

**Files:**
- Modify: `src/features/predictions/predictions.css`, `src/features/politicians/politicians.css`, `src/features/apps/apps.css`, `src/features/status/status.css`, `src/features/ops/ops.css`, `src/features/search/search.css`, `src/features/alerts/alerts.css`, `src/cloud/cloud.css`, `src/live/data-status.css`

**Why these are one task:** none of them is a primary surface, they share no layout with each other, and a reviewer would accept or reject them together. Splitting them would produce nine reviews of the same mechanical diff.

- [ ] **Step 1: Run the codemod on all nine**

```bash
node scripts/codemod-tokens.mjs \
  src/features/predictions/predictions.css src/features/politicians/politicians.css \
  src/features/apps/apps.css src/features/status/status.css src/features/ops/ops.css \
  src/features/search/search.css src/features/alerts/alerts.css \
  src/cloud/cloud.css src/live/data-status.css
```

- [ ] **Step 2: Review the diff by eye**

Same review as Task 3 Step 3. `alerts.css` and `search.css` back overlay surfaces (the toast host and the Ctrl-K palette) — confirm neither grew past its container.

- [ ] **Step 3: Replace hardcoded durations with motion tokens**

- [ ] **Step 4: Verify in the browser, both themes**

Open `/#/predictions`, `/#/politicians`, `/#/apps`, `/#/status` at 1280 in light and dark, and open the Ctrl-K search palette on one of them. Report what you saw.

- [ ] **Step 5: Verify and commit**

Run: `npm run check` (exit 0), then:

```bash
git add src/features/predictions/predictions.css src/features/politicians/politicians.css src/features/apps/apps.css src/features/status/status.css src/features/ops/ops.css src/features/search/search.css src/features/alerts/alerts.css src/cloud/cloud.css src/live/data-status.css
git commit -m "refactor(p12): move secondary screens onto the token scales"
```

---

### Task 10: Portfolio

**Files:**
- Modify: `src/features/portfolio/portfolio.css`, `src/features/portfolio/goal-contribution.css`

**Why this is its own task:** these two files hold 574 of the 1,481 literals — 39% of the phase — and P4 through P9 accumulated in them. A reviewer can meaningfully reject this while approving everything else.

**Constraint reminder:** the plan forbids touching `src/features/portfolio/*.tsx`, `server/portfolio/*` and the portfolio migrations. This task changes CSS only.

- [ ] **Step 1: Run the codemod**

```bash
node scripts/codemod-tokens.mjs src/features/portfolio/portfolio.css src/features/portfolio/goal-contribution.css
```

- [ ] **Step 2: Review the diff by eye — carefully**

Same review as Task 3 Step 3, but this diff is large enough that skimming it is not review. Go section by section. The portfolio holds tables, a target-allocation dialog, and dense numeric panels; a 2px change in a table cell multiplies down a long column.

- [ ] **Step 3: Replace hardcoded durations with motion tokens**

- [ ] **Step 4: Verify in the browser, both themes**

Open `/#/portfolio` at 375, 768 and 1280 in light and dark. Open the target-allocation dialog and confirm it still fits its viewport at 375. Report what you saw.

- [ ] **Step 5: Verify and commit**

Run: `npm run check` (exit 0), then:

```bash
git add src/features/portfolio/portfolio.css src/features/portfolio/goal-contribution.css
git commit -m "refactor(p12): move portfolio onto the token scales"
```

---

### Task 11: Motion and skeletons

**Files:**
- Modify: `src/components/ui/ui.css`, `src/components/ui/index.tsx`
- Test: `src/components/ui/Skeleton.test.tsx`

**Interfaces:**
- Produces: a `Skeleton` component exported from `@/components/ui`, with props `{ readonly width?: string; readonly height?: string; readonly rounded?: boolean }`.

**Why motion comes last:** animating a layout still in flux means animating it twice. Tasks 3–10 settle the layout; this task adds movement to a settled thing.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/Skeleton.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Skeleton } from './index.js';

afterEach(() => {
  cleanup();
});

describe('Skeleton', () => {
  it('is announced as busy so a screen reader does not read placeholder geometry', () => {
    render(<Skeleton />);
    const node = screen.getByRole('status');
    expect(node.getAttribute('aria-busy')).toBe('true');
    expect(node.textContent).toBe('');
  });

  it('takes its geometry from props', () => {
    render(<Skeleton width="120px" height="20px" />);
    const node = screen.getByRole('status');
    expect(node.style.width).toBe('120px');
    expect(node.style.height).toBe('20px');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/ui/Skeleton.test.tsx`
Expected: FAIL — `Skeleton` is not exported.

- [ ] **Step 3: Implement `Skeleton`**

Add to `src/components/ui/index.tsx`:

```tsx
export function Skeleton({
  width = '100%',
  height = 'var(--text-base)',
  rounded = false,
}: {
  readonly width?: string;
  readonly height?: string;
  readonly rounded?: boolean;
}): JSX.Element {
  return (
    <span
      role="status"
      aria-busy="true"
      aria-label="불러오는 중"
      className={`ui-skeleton${rounded ? ' rounded' : ''}`}
      style={{ width, height }}
    />
  );
}
```

Add to `src/components/ui/ui.css`:

```css
.ui-skeleton {
  display: inline-block;
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--bg-inset) 25%, var(--bg-hover) 37%, var(--bg-inset) 63%);
  background-size: 400% 100%;
  animation: ui-skeleton-sweep 1.4s ease-in-out infinite;
}

.ui-skeleton.rounded {
  border-radius: var(--radius-full);
}

@keyframes ui-skeleton-sweep {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}
```

The global `prefers-reduced-motion` block from Task 1 already pins `animation-duration` to `0ms`, so the sweep stops without a second rule here.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/ui/Skeleton.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Prove the reduced-motion path is real**

In the browser with the dev server running, use `resize_window` to set `prefers-reduced-motion` if the tool supports it, or run in `javascript_tool`:

```js
JSON.stringify({
  matches: matchMedia('(prefers-reduced-motion: reduce)').matches,
  duration: getComputedStyle(document.querySelector('.ui-skeleton')).animationDuration,
})
```

Report the actual value. Under the preference it must read `0s`.

- [ ] **Step 6: Apply hover and focus motion to the primitives**

In `ui.css`, give `.ui-card`, `.ui-btn` and `.qr-row` a hover transition using `var(--dur-fast) var(--ease-out)`, and give every focusable primitive a visible `:focus-visible` ring using `--teal`. Do not add motion to anything that moves layout — only colour, border, shadow and transform.

- [ ] **Step 7: Verify and commit**

Run: `npm run check` (exit 0), then:

```bash
git add src/components/ui/index.tsx src/components/ui/ui.css src/components/ui/Skeleton.test.tsx
git commit -m "feat(p12): add skeleton primitive and settle hover/focus motion"
```

---

### Task 12: validate-p12, version 1.13.0, documentation

**Files:**
- Create: `scripts/validate-p12.ts`, `docs/P12_CHANGELOG.md`
- Modify: `package.json`, `server/config.ts`, `DEPLOYMENT.md`, `README.md`
- Delete: `scripts/codemod-tokens.mjs`

- [ ] **Step 1: Delete the codemod**

It existed for a one-time migration and every screen has now been migrated. Leaving a file-mutating script beside a gate invites someone to "fix" the gate by running it.

```bash
git rm scripts/codemod-tokens.mjs
```

- [ ] **Step 2: Put `validate:tokens` back into the `check` chain**

Task 2 Step 8 removed it because the gate was red by design. Tasks 3–10 have driven the literal count to zero, so it goes back in `package.json` immediately before `validate:esm`.

- [ ] **Step 3: Confirm the gate is now green**

Run: `npm run validate:tokens`
Expected: `"literals": 0` and `"result": "PASS"`. If it is not zero, the remaining files are named in the output — finish them before continuing rather than relaxing the rule.

- [ ] **Step 4: Write `scripts/validate-p12.ts`**

Follow the shape of `scripts/validate-p11.ts`. Assert:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const global = readFileSync('src/styles/global.css', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: Record<string, string> };

assert.equal(pkg.version, '1.13.0', 'package version must be 1.13.0');
assert.ok(pkg.scripts.check.includes('validate:tokens'), 'validate:tokens must run in the check chain');

for (const token of ['--space-1', '--space-8', '--text-2xs', '--text-3xl', '--dur-fast', '--ease-out']) {
  assert.ok(global.includes(`${token}:`), `global.css must declare ${token}`);
}

assert.ok(
  /@media \(prefers-reduced-motion: reduce\)/.test(global),
  'global.css must carry the reduced-motion block',
);
assert.ok(!global.includes('--ink-faint: #aab0b0'), 'the pre-correction light --ink-faint must be gone');
assert.ok(!global.includes('--ink-muted: #84898c'), 'the pre-correction light --ink-muted must be gone');

console.log(JSON.stringify({ version: pkg.version, tokens: 'PASS', result: 'PASS' }, null, 2));
```

Add `"validate:p12": "tsx scripts/validate-p12.ts"` and put it in the `check` chain beside `validate:p11`.

- [ ] **Step 5: Move the version to 1.13.0**

Update `package.json`, `server/config.ts`, and every validate script that asserts the version (`grep -rn "1\.12\.0" scripts server package.json`). Update `SMOKE_EXPECT_VERSION` references in `DEPLOYMENT.md`.

- [ ] **Step 6: Write `docs/P12_CHANGELOG.md`**

Record: the three new token axes with their values; the four corrected colours with their before/after ratios and which threshold each was held to and why; the literal count before and after; and the AskBar overlap fix with the overlap-check output that demonstrated it.

- [ ] **Step 7: Update `README.md`**

Add a short section under the existing architecture notes naming `validate:tokens` as the gate that keeps the scales honest, and stating the rule: `global.css` is the only file allowed raw hex, and raw px for `font-size`/`padding`/`margin`/`gap`.

- [ ] **Step 8: Verify and commit**

Run: `npm run check`
Expected: exit 0, with `validate:tokens` and `validate:p12` both `PASS`.

```bash
git add -A scripts package.json server/config.ts docs/P12_CHANGELOG.md README.md DEPLOYMENT.md
git commit -m "chore(p12): validate-p12, version 1.13.0, documentation"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
| --- | --- |
| Spacing scale | 1 |
| Type scale | 1 |
| Motion tokens + single reduced-motion point | 1, 11 |
| Colour contrast correction | 1 |
| Contrast gate | 2 |
| Theme parity gate | 2 |
| Literal discipline gate | 2, and 3–10 drive it to zero |
| Reduced-motion gate | 2 |
| AskBar overlap defect | 4 |
| All fifteen routes | 3–10 |
| Skeletons | 11 |
| Version 1.13.0 and docs | 12 |
| Provenance stays prominent | Global Constraints; reviewed per task |

**Correction against the spec:** the spec says the validator bans "raw hex and raw px". Measurement showed only **one** raw hex outside `global.css` (`#1b1c1e`, a single occurrence), so colour discipline was already good — the real problem is size and spacing, at 1,481 sites. The hex rule stays in the gate because it is nearly free to keep, but the plan does not spend a task on it. The spec should be read with that correction.

**Correction against the spec, second:** the spec says every ink × surface pair must clear WCAG AA. Computing it showed that holding `--ink-faint` to 4.5:1 collapses it into `--ink-muted` (both land on ~`#6e7274`) and destroys the five-level ink hierarchy. `--ink-faint` carries carets, chevrons and separator dots — non-text UI, governed by WCAG 1.4.11 at 3:1. Task 1 and Task 2 both encode the role-based split.

**Placeholder scan:** none. Every step carries the exact command, code, or review criterion.

**Type consistency:** `contrastRatio`, `nearestStep`, `findLiteralViolations` and `LiteralViolation` are defined in Task 2 and referenced only there and in Task 12. `Skeleton`'s prop names in Task 11's test match its implementation. Token names introduced in Task 1 are used verbatim in Tasks 3–12.
