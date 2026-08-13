/* Refresh the checked-in offline seed without pretending intraday US quotes are closes.
 *
 * Usage: node scripts/refresh-static-seeds.mjs
 *
 * Sources:
 * - US settled closes: stockanalysis.com per-symbol history pages (2026-08-12)
 * - KR settled closes: Naver Finance stock basic API (2026-08-13)
 * - Crypto 24h snapshot: CoinGecko markets API (current capture)
 *
 * Rows that cannot be refreshed retain their previous value and timestamp. The script
 * deliberately demotes a previously-current row to the explicit MID anchor when a fetch
 * fails, preventing a timestamp-only refresh from mislabelling an old quote as new.
 */
import { readFile, writeFile } from 'node:fs/promises';

const US_FILE = new URL('../src/data/universe.ts', import.meta.url);
const KR_FILE = new URL('../src/data/universe.kr.ts', import.meta.url);
const US_TARGET_LABEL = 'Aug 12, 2026';
const KR_TARGET_DATE = '2026-08-13';
const MAX_CONCURRENCY = 10;
const US_SYMBOLS_WITH_DIFFERENT_IDENTITIES = new Set(['HYNX']);

const CRYPTO_IDS = {
  BTCUSD: 'bitcoin', ETHUSD: 'ethereum', XRPUSD: 'ripple', BNBUSD: 'binancecoin',
  SOLUSD: 'solana', DOGEUSD: 'dogecoin', ADAUSD: 'cardano', TRXUSD: 'tron',
  AVAXUSD: 'avalanche-2', LINKUSD: 'chainlink', DOTUSD: 'polkadot', LTCUSD: 'litecoin',
  SHIBUSD: 'shiba-inu', UNIUSD: 'uniswap', ATOMUSD: 'cosmos', XLMUSD: 'stellar',
  NEARUSD: 'near', APTUSD: 'aptos', ARBUSD: 'arbitrum', ONDOUSD: 'ondo-finance',
};

const number = (value) => Number(String(value).replace(/[,%$]/g, ''));
const cells = (row) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
  .map((match) => match[1].replace(/<!--([\s\S]*?)-->/g, '').replace(/<[^>]*>/g, '').trim());

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; synapsu-seed-refresh/1.0)' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function mapLimited(values, worker) {
  const results = new Map();
  let cursor = 0;
  async function consume() {
    while (cursor < values.length) {
      const index = cursor++;
      const key = values[index];
      try { results.set(key, await worker(key)); }
      catch (error) { console.error(`skip ${key}: ${error instanceof Error ? error.message : error}`); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, values.length) }, consume));
  return results;
}

function symbolsInSection(source, start, end) {
  const body = source.slice(source.indexOf(start), source.indexOf(end));
  return [...body.matchAll(/^\s*\['([^']+)'/gm)].map((match) => match[1]);
}

function rewriteEquityRows(source, sectionStart, sectionEnd, quotes, currentTag, midTag) {
  const begin = source.indexOf(sectionStart);
  const end = source.indexOf(sectionEnd, begin);
  const before = source.slice(0, begin);
  const body = source.slice(begin, end).split(/(?<=\n)/).map((line) => {
    const eol = line.endsWith('\r\n') ? '\r\n' : line.endsWith('\n') ? '\n' : '';
    const rawLine = eol ? line.slice(0, -eol.length) : line;
    const symbol = rawLine.match(/^\s*\['([^']+)'/)?.[1];
    if (!symbol) return line;
    const quote = quotes.get(symbol);
    if (!quote) return rawLine.includes(currentTag) ? rawLine.replace(currentTag, midTag) + eol : line;
    const pattern = /^(\s*\[.*?,\s)(-?[\d.]+)(,\s)(-?[\d.]+)(,\s)(-?[\d.]+)(?:,\s(?:US|KR)_(?:ASOF|MID_ASOF)_ISO)?(\],.*)$/;
    const match = rawLine.match(pattern);
    if (!match) throw new Error(`row format changed for ${symbol}`);
    return `${match[1]}${match[2]}${match[3]}${quote.price}${match[5]}${quote.changePct}, ${currentTag}${match[7]}${eol}`;
  }).join('');
  return before + body + source.slice(end);
}

async function refreshUs(source) {
  const symbols = symbolsInSection(source, 'const STOCKS: StockRow[] = [', '/** [symbol, name, nameKo, price, changePct')
    .filter((symbol) => !US_SYMBOLS_WITH_DIFFERENT_IDENTITIES.has(symbol));
  const quotes = await mapLimited(symbols, async (symbol) => {
    const slugs = [...new Set([symbol.toLowerCase().replace('-', '.'), symbol.toLowerCase()])];
    for (const slug of slugs) {
      try {
        const html = await fetchText(`https://stockanalysis.com/stocks/${encodeURIComponent(slug)}/history/`);
        for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
          const values = cells(row[1]);
          if (values[0] === US_TARGET_LABEL && values.length >= 7) {
            const price = number(values[4]);
            const changePct = number(values[6]);
            if (Number.isFinite(price) && Number.isFinite(changePct)) return { price, changePct };
          }
        }
      } catch { /* try the alternate slug */ }
    }
    throw new Error(`no ${US_TARGET_LABEL} settled row`);
  });
  console.error(`US: refreshed ${quotes.size}/${symbols.length} stock rows.`);
  return rewriteEquityRows(source, 'const STOCKS: StockRow[] = [', '/** [symbol, name, nameKo, price, changePct', quotes, 'US_ASOF_ISO', 'US_MID_ASOF_ISO');
}

async function refreshKr(source) {
  const symbols = symbolsInSection(source, 'export const KR_STOCKS: KrStockRow[] = [', 'function krStockAsset');
  const quotes = await mapLimited(symbols, async (symbol) => {
    const data = JSON.parse(await fetchText(`https://m.stock.naver.com/api/stock/${symbol}/basic`));
    if (data.marketStatus !== 'CLOSE' || !String(data.localTradedAt).startsWith(KR_TARGET_DATE)) {
      throw new Error(`latest settled date is ${data.localTradedAt ?? 'unknown'}`);
    }
    const price = number(data.closePrice);
    // Naver already returns a signed ratio (for example "-6.63" with FALLING).
    const changePct = number(data.fluctuationsRatio);
    if (!Number.isFinite(price) || !Number.isFinite(changePct)) throw new Error('invalid quote payload');
    return { price, changePct };
  });
  console.error(`KR: refreshed ${quotes.size}/${symbols.length} stock rows.`);
  return rewriteEquityRows(source, 'export const KR_STOCKS: KrStockRow[] = [', 'function krStockAsset', quotes, 'KR_ASOF_ISO', 'KR_MID_ASOF_ISO');
}

async function refreshCrypto(source) {
  const ids = Object.values(CRYPTO_IDS).join(',');
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`;
  const rows = JSON.parse(await fetchText(url));
  const byId = new Map(rows.map((row) => [row.id, row]));
  let count = 0;
  const begin = source.indexOf('const CRYPTO: CryptoRow[] = [');
  const end = source.indexOf('/* ---------- Brand colors', begin);
  const body = source.slice(begin, end).split(/(?<=\n)/).map((line) => {
    const eol = line.endsWith('\r\n') ? '\r\n' : line.endsWith('\n') ? '\n' : '';
    const rawLine = eol ? line.slice(0, -eol.length) : line;
    const symbol = rawLine.match(/^\s*\['([^']+)'/)?.[1];
    const row = symbol ? byId.get(CRYPTO_IDS[symbol]) : undefined;
    if (!symbol || !row) return line;
    const pattern = /^(\s*\[.*?,\s)(-?[\d.eE]+)(,\s)(-?[\d.eE]+)(,\s)(-?[\d.eE]+)(\],.*)$/;
    const match = rawLine.match(pattern);
    if (!match) throw new Error(`crypto row format changed for ${symbol}`);
    count += 1;
    const capB = Math.round((row.market_cap / 1e9) * 100) / 100;
    return `${match[1]}${row.current_price}${match[3]}${row.price_change_percentage_24h}${match[5]}${capB}${match[7]}${eol}`;
  }).join('');
  if (count !== Object.keys(CRYPTO_IDS).length) throw new Error(`crypto refresh incomplete: ${count}`);
  console.error(`Crypto: refreshed ${count} rows; provider timestamp ${rows[0]?.last_updated}.`);
  return source.slice(0, begin) + body + source.slice(end);
}

const [usOriginal, krOriginal] = await Promise.all([
  readFile(US_FILE, 'utf8'),
  readFile(KR_FILE, 'utf8'),
]);
const [usStocks, krUpdated] = await Promise.all([refreshUs(usOriginal), refreshKr(krOriginal)]);
const usUpdated = await refreshCrypto(usStocks);
await Promise.all([
  writeFile(US_FILE, usUpdated, 'utf8'),
  writeFile(KR_FILE, krUpdated, 'utf8'),
]);
