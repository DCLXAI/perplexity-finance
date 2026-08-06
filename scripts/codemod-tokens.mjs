/* One-shot literal → token rewriter. Run per file, then review the diff by eye.
   Deleted in Task 12; it exists only for the 1,481-site migration. */
import { readFileSync, writeFileSync } from 'node:fs';

const SPACE = [
  [2, '--space-0-5'], [4, '--space-1'], [6, '--space-1-5'], [8, '--space-2'],
  [10, '--space-2-5'], [12, '--space-3'], [14, '--space-3-5'], [16, '--space-4'],
  [20, '--space-5'], [24, '--space-6'], [32, '--space-8'],
  [40, '--space-10'], [48, '--space-12'], [64, '--space-16'],
];
const TEXT = [
  [10, '--text-2xs'], [11, '--text-xs'], [12, '--text-sm'], [13, '--text-base'],
  [15, '--text-md'], [17, '--text-lg'], [20, '--text-xl'], [24, '--text-2xl'], [32, '--text-3xl'],
];

// `reduce` over an ascending table means anything past the last entry keeps losing
// distance ties to it — the table has no ceiling to stop at. That's fine for the
// token itself, but the caller also needs the chosen entry's magnitude to notice
// when "nearest" was actually a violent snap, so this returns the whole row.
const nearestEntry = (value, table) =>
  table.reduce((best, row) =>
    Math.abs(row[0] - value) <= Math.abs(best[0] - value) ? row : best, table[0]);

// Beyond a scale's ceiling `nearestEntry` still returns an answer — it just keeps
// losing the distance tie to the last entry — so a 96px value silently becomes
// 32px with nothing left in the output to say so. `findLiteralViolations` sees
// zero raw px afterward and calls it migrated. This is the only thing that
// notices, so it has to be loud rather than merely correct.
const SNAP_THRESHOLD = 0.2;
// Relative drift alone is noisy at the scale's fine (2px-granularity) low end —
// 1px snapping to 2px is "100%" but is not a real problem. Requiring the absolute
// delta to also clear 3px keeps the channel to genuine crushes, so four
// implementers reading it don't learn to skim past routine rounding.
const SNAP_MIN_DELTA = 3;

function snapWarning(file, original, result, num, targetMag, token) {
  const delta = Math.abs(targetMag - num);
  const drift = delta / num;
  if (delta >= SNAP_MIN_DELTA && drift > SNAP_THRESHOLD) {
    console.error(
      `  snap: ${file}: "${original}" -> "${result}" moves ${num}px onto var(${token}) (${targetMag}px), a ${Math.round(drift * 100)}% change`,
    );
  }
}

export function rewrite(css, file) {
  let count = 0;
  let out = css.replace(/(font-size:\s*)([0-9.]+)px/g, (whole, head, value) => {
    count += 1;
    const num = Number(value);
    const [targetMag, token] = nearestEntry(num, TEXT);
    const next = `${head}var(${token})`;
    snapWarning(file, whole.trim(), next.trim(), num, targetMag, token);
    return next;
  });
  out = out.replace(
    /((?:padding|margin|gap|row-gap|column-gap)(?:-[a-z]+)?:\s*)([^;}]+)/g,
    (whole, head, value) => {
      if (!/-?\d+(?:\.\d+)?px/.test(value)) return whole;
      // Track which source value first produced each rendered replacement, so two
      // distinct px values landing on the same step within one declaration doesn't
      // pass silently. Keyed on the rendered text (not just the token) because a
      // negative and a positive value that share a magnitude render differently
      // (`calc(var(--x) * -1)` vs `var(--x)`) and are not actually a collapse.
      const producedBy = new Map();
      let collapsed = false;
      const snaps = [];
      // A leading `-` must stay outside the token, not prefix the var() call —
      // `-var(--space-1-5)` is invalid CSS and the declaration gets dropped at
      // parse time. `calc(var(--token) * -1)` is the valid form.
      const next = value.replace(/(-?)([0-9.]+)px/g, (__, sign, n) => {
        count += 1;
        const num = Number(n);
        const [targetMag, token] = nearestEntry(num, SPACE);
        const signedValue = sign === '-' ? -num : num;
        const replacement = sign === '-' ? `calc(var(${token}) * -1)` : `var(${token})`;
        const prior = producedBy.get(replacement);
        if (prior !== undefined && prior !== signedValue) collapsed = true;
        else producedBy.set(replacement, signedValue);
        snaps.push({ num, targetMag, token });
        return replacement;
      });
      if (collapsed) {
        console.error(
          `  collapse: ${file}: "${whole.trim()}" -> "${head}${next}" merges distinct source values onto the same token`,
        );
      }
      for (const s of snaps) {
        snapWarning(file, whole.trim(), `${head}${next}`.trim(), s.num, s.targetMag, s.token);
      }
      return `${head}${next}`;
    },
  );
  return { out, count };
}

for (const file of process.argv.slice(2)) {
  const { out, count } = rewrite(readFileSync(file, 'utf8'), file);
  writeFileSync(file, out);
  console.log(`${file}: ${count} literal(s) replaced`);
}
