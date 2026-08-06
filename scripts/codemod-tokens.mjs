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

export function rewrite(css, file) {
  let count = 0;
  let out = css.replace(/(font-size:\s*)([0-9.]+)px/g, (_, head, value) => {
    count += 1;
    return `${head}var(${nearest(Number(value), TEXT)})`;
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
      // A leading `-` must stay outside the token, not prefix the var() call —
      // `-var(--space-1-5)` is invalid CSS and the declaration gets dropped at
      // parse time. `calc(var(--token) * -1)` is the valid form.
      const next = value.replace(/(-?)([0-9.]+)px/g, (__, sign, n) => {
        count += 1;
        const num = Number(n);
        const token = nearest(num, SPACE);
        const signedValue = sign === '-' ? -num : num;
        const replacement = sign === '-' ? `calc(var(${token}) * -1)` : `var(${token})`;
        const prior = producedBy.get(replacement);
        if (prior !== undefined && prior !== signedValue) collapsed = true;
        else producedBy.set(replacement, signedValue);
        return replacement;
      });
      if (collapsed) {
        console.error(
          `  collapse: ${file}: "${whole.trim()}" -> "${head}${next}" merges distinct source values onto the same token`,
        );
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
