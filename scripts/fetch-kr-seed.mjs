/* ============================================================
   Candidate-row fetcher for the KRX universe seed (src/data/universe.kr.ts).

   Run: node scripts/fetch-kr-seed.mjs [count]

   This is a CANDIDATE gatherer, not an auto-generator. It fetches
   stockanalysis.com's KRX ranked list (a single page already serves ~500
   rows server-rendered, no pagination needed) and prints the top `count`
   (default 165) rows as JSON: code, name, market cap (trillion KRW), price
   (KRW), and day change percent.

   What this script does NOT do, on purpose: decide which rows are trustworthy
   enough to commit. Per the corroboration rule that produced universe.kr.ts,
   every row printed here still needs an independent second source (the
   per-symbol stockanalysis.com/quote/krx/<code>/ page, or an outlet such as
   companiesmarketcap.com/investing.com) checked by hand before it's typed
   into the seed. If the two disagree, the row gets left out rather than
   averaged or guessed — a missing row is honest, a wrong one is not. See
   `.superpowers/sdd/2026-08-05-p11-korean-market/task-5-report.md` for the
   corroboration this script's output actually went through, including the
   candidates that were dropped and why.

   No pagination/API tricks and no HTML-parsing dependency: the page is
   already fully server-rendered, so a couple of regexes over the raw table
   markup are enough. This will need re-tuning if the site's markup changes.
   ============================================================ */

const LIST_URL = 'https://stockanalysis.com/list/korea-stock-exchange/';
const COUNT = Number(process.argv[2]) || 165;

function cellText(td) {
  return td
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<a[^>]*>/g, '')
    .replace(/<\/a>/g, '')
    .trim();
}

function parseNumber(text) {
  return Number(text.replace(/[,%TB]/g, ''));
}

function parseRows(html) {
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
  const rows = [];
  let match;
  while ((match = rowRe.exec(html))) {
    const cells = [...match[1].matchAll(tdRe)].map((cell) => cellText(cell[1]));
    // Expect: [rank, 6-digit code, name, marketCap"T", price, change"%", ...]
    if (cells.length >= 6 && /^\d{6}$/.test(cells[1])) {
      rows.push({
        rank: Number(cells[0]),
        code: cells[1],
        name: cells[2],
        marketCapTrillionKrw: parseNumber(cells[3]),
        priceKrw: parseNumber(cells[4]),
        dayChangePct: parseNumber(cells[5]),
      });
    }
  }
  return rows;
}

async function main() {
  const response = await fetch(LIST_URL, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; perplexity-finance-seed-fetch/1.0)' },
  });
  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  const rows = parseRows(html).slice(0, COUNT);
  console.log(JSON.stringify(rows, null, 2));
  console.error(`\n${rows.length} candidate rows printed (requested ${COUNT}).`);
  console.error('Each row still needs manual corroboration against a second source before');
  console.error('it goes into src/data/universe.kr.ts — see the file header there.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
