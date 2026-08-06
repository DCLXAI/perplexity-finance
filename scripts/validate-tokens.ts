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
