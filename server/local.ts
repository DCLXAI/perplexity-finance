import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Vercel injects environment variables in production. The local entrypoint
// loads optional files before importing any route module so server/config.ts
// observes the same values during development.
for (const filename of ['.env.local', '.env']) {
  const path = resolve(process.cwd(), filename);
  if (existsSync(path)) process.loadEnvFile(path);
}

await import('./local-server.js');
