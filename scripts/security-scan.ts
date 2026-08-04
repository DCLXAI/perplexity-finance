import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ignored = new Set(['node_modules', '.git', '.vercel', 'coverage', 'dist']);
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.html', '.sql']);
const files: string[] = [];
function walk(directory: string): void {
  for (const name of readdirSync(directory)) {
    if (ignored.has(name)) continue;
    const path = resolve(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if ([...extensions].some((extension) => name.endsWith(extension))) files.push(path);
  }
}
walk(root);

const violations: string[] = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const name = relative(root, file);
  const unsafeHtmlMarker = 'dangerously' + 'SetInnerHTML';
  if (name !== 'scripts/security-scan.ts' && text.includes(unsafeHtmlMarker)) violations.push(`${name}: unsafe HTML escape hatch`);
  if (name !== 'scripts/security-scan.ts' && /target=["']_blank["'](?![^>]*rel=["'][^"']*noopener)/g.test(text)) violations.push(`${name}: target=_blank without noopener`);
  if (name !== 'scripts/security-scan.ts' && /gpt-5\.6-luna/i.test(text)) violations.push(`${name}: fictional default model`);
  if (/VITE_[A-Z0-9_]*(SECRET|PRIVATE|SERVICE_ROLE|API_KEY_ID|API_SECRET)/.test(text)) violations.push(`${name}: browser-exposed secret variable`);
}
const sensitiveEnvFiles = ['.env', '.env.local', '.env.production.local'];
const gitProbe = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8' });
if (gitProbe.status === 0 && gitProbe.stdout.trim() === 'true') {
  const tracked = spawnSync('git', ['ls-files', '--', ...sensitiveEnvFiles], { cwd: root, encoding: 'utf8' });
  if (tracked.status !== 0) {
    violations.push('unable to inspect tracked environment files');
  } else {
    for (const file of tracked.stdout.split(/\r?\n/).filter(Boolean)) {
      violations.push(`${file}: secret env file is tracked by git`);
    }
  }
} else {
  const gitignore = readFileSync(resolve(root, '.gitignore'), 'utf8');
  if (!gitignore.split(/\r?\n/).some((line) => line.trim() === '.env*')) {
    violations.push('.gitignore: missing .env* protection');
  }
}
const envExample = readFileSync(resolve(root, '.env.example'), 'utf8');
for (const line of envExample.split(/\r?\n/)) {
  if (!line || line.startsWith('#')) continue;
  const [key, ...rest] = line.split('=');
  const value = rest.join('=').trim();
  if (/(SECRET|TOKEN|PRIVATE_KEY|SERVICE_ROLE_KEY|API_KEY_ID|API_SECRET_KEY|OPENAI_API_KEY|RESEND_API_KEY)/.test(key ?? '') && value) {
    violations.push(`.env.example: ${key} must be empty`);
  }
}
if (existsSync(resolve(root, 'dist'))) {
  const bundle = readdirSync(resolve(root, 'dist', 'assets'), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => readFileSync(resolve(root, 'dist', 'assets', entry.name), 'utf8'))
    .join('\n');
  for (const marker of ['SUPABASE_SERVICE_ROLE_KEY', 'ALPACA_API_SECRET_KEY', 'OPENAI_API_KEY', 'CRON_SECRET', 'OPS_SECRET']) {
    if (bundle.includes(marker)) violations.push(`dist: server secret marker ${marker}`);
  }
}
assert.deepEqual(violations, []);
console.log(JSON.stringify({ scannedFiles: files.length, unsafeHtml: 0, browserSecrets: 0, unsafeExternalLinks: 0, result: 'PASS' }, null, 2));
