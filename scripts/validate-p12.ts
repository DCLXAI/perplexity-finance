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
