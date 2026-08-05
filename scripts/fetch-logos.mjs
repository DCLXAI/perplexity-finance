/* ============================================================
   Refresh the bundled brand marks in public/logos/ and regenerate
   src/data/logos.ts.

   Run: node scripts/fetch-logos.mjs

   Marks are bundled rather than hot-linked. An external logo CDN would
   learn which tickers a user opens, which is not something a finance
   surface should leak, and it would break the offline demo. The cost is
   that this has to be re-run when the universe changes.

   Coverage is partial by design. A symbol that resolves nowhere simply
   gets no entry, and LogoChip falls back to its coloured initial.
   ============================================================ */
import { writeFileSync, readFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = path.join(root, 'public/logos');

/** Symbols whose bundled file is fetched under a different ticker. */
const TICKER_ALIASES = { 'BRK-B': 'BRKB' };

/** Crypto marks come from simple-icons, keyed by brand slug rather than ticker. */
const CRYPTO_SLUGS = {
  BTCUSD: 'bitcoin', ETHUSD: 'ethereum', SOLUSD: 'solana', XRPUSD: 'ripple',
  DOGEUSD: 'dogecoin', BNBUSD: 'binance', ADAUSD: 'cardano', LINKUSD: 'chainlink',
  LTCUSD: 'litecoin', DOTUSD: 'polkadot', XLMUSD: 'stellar', NEARUSD: 'near',
};

function symbolsFromUniverse() {
  const src = readFileSync(path.join(root, 'src/data/universe.ts'), 'utf8');
  const block = src.slice(src.indexOf('const STOCKS'), src.indexOf('const MACRO'));
  return [...block.matchAll(/^\s*\['([A-Z.\-]+)'/gm)].map((m) => m[1]);
}

async function download(url, dest) {
  const response = await fetch(url);
  if (!response.ok) return false;
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length === 0) return false;
  // Some sources serve SVG under a .png path; store by actual content so the
  // browser is never handed a mislabelled file.
  const isSvg = body.subarray(0, 300).toString('utf8').toLowerCase().includes('<svg');
  writeFileSync(`${dest}.${isSvg ? 'svg' : 'png'}`, body);
  return true;
}

async function main() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const missing = [];
  for (const symbol of symbolsFromUniverse()) {
    const ticker = TICKER_ALIASES[symbol] ?? symbol;
    const dest = path.join(outDir, symbol);
    const got =
      (await download(`https://raw.githubusercontent.com/nvstly/icons/main/ticker_icons/${ticker}.png`, dest)) ||
      (await download(`https://assets.parqet.com/logos/symbol/${ticker}`, dest));
    if (!got) missing.push(symbol);
  }
  for (const [symbol, slug] of Object.entries(CRYPTO_SLUGS)) {
    if (!(await download(`https://cdn.simpleicons.org/${slug}`, path.join(outDir, symbol)))) {
      missing.push(symbol);
    }
  }

  const files = readdirSync(outDir).sort();
  const entries = files.map((file) => `  '${path.parse(file).name}': '${file}',`).join('\n');
  writeFileSync(
    path.join(root, 'src/data/logos.ts'),
    `${readFileSync(path.join(root, 'scripts/logos-header.txt'), 'utf8')}
export const LOGO_FILES: Readonly<Record<string, string>> = Object.freeze({
${entries}
});

/** Public URL for a symbol's bundled mark, or undefined when none is bundled. */
export function logoUrl(symbol: string): string | undefined {
  const file = LOGO_FILES[symbol];
  return file ? \`/logos/\${file}\` : undefined;
}
`,
  );
  console.log(JSON.stringify({ bundled: files.length, missing }, null, 2));
}

await main();
