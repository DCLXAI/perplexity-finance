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

const GUARDED = ['font-size', 'padding', 'margin', 'gap', 'row-gap', 'column-gap', 'inset'];

/**
 * Border widths, chart pixel heights and media-query breakpoints stay exempt: forcing them
 * onto a spacing scale would be a lie about what they are.
 */
export function findLiteralViolations(file: string, css: string): LiteralViolation[] {
  const withoutMedia = css.replace(/@media[^{]+\{/g, '{');
  const out: LiteralViolation[] = [];
  for (const property of GUARDED) {
    const pattern = new RegExp(`(?:^|[;{\\s])${property}(?:-[a-z]+)*\\s*:\\s*([^;}]+)`, 'g');
    for (const match of withoutMedia.matchAll(pattern)) {
      const value = match[1].trim();
      if (/\d+(?:\.\d+)?px/.test(value)) out.push({ file, property, value });
    }
  }
  return out;
}

/** '#fff' → '#ffffff'; a 6-digit value passes through untouched. */
function expandHex(value: string): string {
  const short = value.trim().match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : value.trim();
}

/**
 * The shape a token-to-token gate structurally cannot see: a feature file pairing a literal
 * colour with a `background: var(--token)` in the same rule — `.al-badge`'s `color: #fff` next
 * to `background: var(--neg)` was live in production at 3.16:1 and neither SEMANTIC_PAIRS above
 * (token-to-token, resolved from global.css) nor the literal-px sweep below (guards spacing
 * properties, not colour) had any way to notice.
 *
 * What this catches: a rule block, anywhere outside global.css, that declares both
 * `background`/`background-color: var(--single-token)` and a literal hex `color` — 3 or 6 digit
 * — in the same selector. Cascade within the block is respected (last declaration of each
 * property wins); the pair is checked against both themes at the AA text threshold (4.5:1).
 *
 * What this does NOT catch, by design — this is a textual per-block scan, not a cascade
 * resolver: a background applied via `color-mix()`, a gradient, or a second literal (only a
 * single `var(--x)` background is resolved); a background or colour set from JS — an inline
 * `style` prop, a `bg ?? 'var(--x)'` default — since that never appears in the CSS text at all;
 * or a pairing split across two rules, e.g. a `:hover` selector that sets only `color` while the
 * fill comes from the base rule. Those need a human, not this gate.
 */
function findCallsiteContrastViolations(
  file: string,
  css: string,
  light: Map<string, string>,
  dark: Map<string, string>,
): string[] {
  const failures: string[] = [];
  const withoutMedia = css.replace(/@media[^{]+\{/g, '');
  for (const match of withoutMedia.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim().replace(/\s+/g, ' ');
    const body = match[2];
    const bgDecls = [...body.matchAll(/background(?:-color)?\s*:\s*([^;]+);/g)];
    const colorDecls = [...body.matchAll(/(?:^|[;\s])color\s*:\s*([^;]+);/g)];
    if (bgDecls.length === 0 || colorDecls.length === 0) continue;
    // Last declaration of each property wins — the same rule the cascade would apply.
    const bgRaw = bgDecls[bgDecls.length - 1][1].trim();
    const colorRaw = colorDecls[colorDecls.length - 1][1].trim();
    const bgTokenMatch = bgRaw.match(/^var\((--[a-z0-9-]+)\)$/i);
    if (!bgTokenMatch) continue;
    if (!/^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/i.test(colorRaw)) continue;
    const literal = expandHex(colorRaw).toLowerCase();
    for (const [themeName, tokens] of [['light', light], ['dark', dark]] as const) {
      const resolve = (n: string) => (tokens.get(n) ?? light.get(n) ?? '').trim();
      const bgValue = resolve(bgTokenMatch[1]);
      if (!/^#[0-9a-f]{6}$/i.test(bgValue)) continue;
      const ratio = contrastRatio(literal, bgValue);
      if (ratio < 4.5) {
        failures.push(
          `callsite-contrast: ${file} ${selector} — ${colorRaw} on ${bgTokenMatch[1]} is ` +
            `${ratio.toFixed(2)} in ${themeName}, needs 4.5`,
        );
      }
    }
  }
  return failures;
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
/**
 * `--ink-faint` carries carets and separator dots, not text. `--teal` is the literal brand
 * hex — logo mark, focus rings, chart strokes — never text (see `--teal-text` for that role),
 * so it's held to the same 3:1 non-text floor against the neutral surfaces below.
 */
const NON_TEXT_INKS = ['--ink-faint', '--teal'];
const SURFACES = ['--bg', '--bg-raised', '--bg-inset', '--bg-subtle', '--bg-hover'];

/**
 * Semantic ink-on-its-own-chip pairs: --warn/--pos/--neg text rendered on their tinted
 * badge backgrounds, and brand teal's text role on its soft chips. These are a distinct
 * class from TEXT_INKS × SURFACES above — a semantic ink is never actually painted on a
 * neutral --bg/--bg-raised/--bg-inset surface, only on its matching *-bg/-soft chip — so
 * the general surface sweep above cannot see this pairing at all.
 *
 * `--teal` itself is excluded here on purpose: it's the literal brand hex, held to 3:1 as
 * a non-text indicator above, and is never the token painted on --teal-soft/--teal-softer
 * — `--teal-text` is the split-off role that carries that AA-text obligation instead.
 */
const SEMANTIC_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['--warn', '--warn-bg'],
  ['--pos', '--pos-bg'],
  ['--neg', '--neg-bg'],
  ['--teal-text', '--teal-soft'],
  ['--teal-text', '--teal-softer'],
];

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
    // Geometry is theme-independent; requiring it in the dark block would duplicate it for nothing.
    if (name === '--header-h' || name === '--tabbar-h' || name === '--askbar-h') continue;
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
    for (const [ink, bg] of SEMANTIC_PAIRS) {
      const fg = resolve(ink);
      const bgValue = resolve(bg);
      if (!/^#[0-9a-f]{6}$/i.test(fg) || !/^#[0-9a-f]{6}$/i.test(bgValue)) continue;
      const ratio = contrastRatio(fg, bgValue);
      if (ratio < 4.5) {
        failures.push(`contrast: ${themeName} ${ink} on ${bg} is ${ratio.toFixed(2)}, needs 4.5`);
      }
    }
  }

  // 3. Literal discipline + call-site contrast — one pass over the same files. Literal
  // discipline guards spacing properties; call-site contrast guards a literal colour
  // declared beside a `background: var(--token)` in the same rule (see the doc comment
  // on findCallsiteContrastViolations for exactly what shape that does and doesn't catch).
  let violations = 0;
  for (const file of cssFiles('src')) {
    if (file.replace(/\\/g, '/') === GLOBAL_CSS) continue;
    const css = readFileSync(file, 'utf8');
    const found = findLiteralViolations(file, css);
    violations += found.length;
    for (const v of found.slice(0, 3)) {
      failures.push(`literal: ${v.file} has raw px in ${v.property}: ${v.value}`);
    }
    failures.push(...findCallsiteContrastViolations(file, css, light, dark));
  }

  // 4. The reduced-motion escape hatch exists and zeroes every duration token — the
  // escape hatch's stated job is that every duration resolves to zero, not just the
  // fastest one.
  const reducedMotionIdx = global.indexOf('@media (prefers-reduced-motion: reduce)');
  if (reducedMotionIdx === -1) {
    failures.push('motion: global.css has no prefers-reduced-motion block');
  } else {
    const reducedMotionBlock = global.slice(reducedMotionIdx);
    for (const token of ['--dur-fast', '--dur-base', '--dur-slow']) {
      if (!new RegExp(`${token}:\\s*0ms`).test(reducedMotionBlock)) {
        failures.push(`motion: prefers-reduced-motion does not zero ${token}`);
      }
    }
  }

  const report = {
    themeParity: failures.some((f) => f.startsWith('theme parity')) ? 'FAIL' : 'PASS',
    contrast: failures.some((f) => f.startsWith('contrast')) ? 'FAIL' : 'PASS',
    literals: violations,
    callsiteContrast: failures.some((f) => f.startsWith('callsite-contrast')) ? 'FAIL' : 'PASS',
    // PASS means only this: no literal `color` beside a same-rule `background: var(--token)`
    // fell below 4.5:1. It cannot see a JS-set background (e.g. a `bg ?? 'var(--x)'` prop), a
    // color-mix()/gradient background, or a pairing split across a base rule and its :hover.
    callsiteContrastScope:
      'static CSS var()-background + literal-color pairs only — misses JS-set backgrounds, ' +
      'color-mix()/gradient backgrounds, and base/:hover-split pairs',
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
