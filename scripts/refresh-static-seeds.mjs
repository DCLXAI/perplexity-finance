/* Refresh every checked-in US/KR equity row plus the complete crypto seed.
 *
 * Usage:
 *   node scripts/refresh-static-seeds.mjs
 *   node scripts/refresh-static-seeds.mjs --dry-run
 *
 * The latest common settled session is discovered at runtime. A new regional
 * anchor is accepted only when enough symbols agree on it; rows that could not
 * be refreshed keep their exact previous timestamp instead of being relabelled.
 * StockAnalysis is the primary US close source; Yahoo's daily chart is used only
 * to fill a row for the already-selected common date, never to choose the date.
 */
import { readFile, writeFile } from 'node:fs/promises';

const US_FILE = new URL('../src/data/universe.ts', import.meta.url);
const KR_FILE = new URL('../src/data/universe.kr.ts', import.meta.url);
const MAX_CONCURRENCY = 10;
const MAX_ATTEMPTS = 3;
const MIN_COVERAGE = parseCoverage(process.env.REFRESH_MIN_COVERAGE ?? '0.95');
const DRY_RUN = process.argv.includes('--dry-run');
const US_SYMBOLS_WITH_DIFFERENT_IDENTITIES = new Set(['HYNX']);

const CRYPTO_IDS = {
  BTCUSD: 'bitcoin', ETHUSD: 'ethereum', XRPUSD: 'ripple', BNBUSD: 'binancecoin',
  SOLUSD: 'solana', DOGEUSD: 'dogecoin', ADAUSD: 'cardano', TRXUSD: 'tron',
  AVAXUSD: 'avalanche-2', LINKUSD: 'chainlink', DOTUSD: 'polkadot', LTCUSD: 'litecoin',
  SHIBUSD: 'shiba-inu', UNIUSD: 'uniswap', ATOMUSD: 'cosmos', XLMUSD: 'stellar',
  NEARUSD: 'near', APTUSD: 'aptos', ARBUSD: 'arbitrum', ONDOUSD: 'ondo-finance',
};

const US_MONTHS = new Map([
  ['Jan', '01'], ['Feb', '02'], ['Mar', '03'], ['Apr', '04'],
  ['May', '05'], ['Jun', '06'], ['Jul', '07'], ['Aug', '08'],
  ['Sep', '09'], ['Oct', '10'], ['Nov', '11'], ['Dec', '12'],
]);

const number = (value) => Number(String(value).replace(/[,%$]/g, ''));
const cells = (row) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
  .map((match) => match[1].replace(/<!--([\s\S]*?)-->/g, '').replace(/<[^>]*>/g, '').trim());
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function parseCoverage(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0.8 || parsed > 1) {
    throw new Error('REFRESH_MIN_COVERAGE must be between 0.8 and 1');
  }
  return parsed;
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
          'user-agent': 'Mozilla/5.0 (compatible; synapsu-daily-market-refresh/2.0)',
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await wait(350 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

async function mapLimited(values, worker) {
  const results = new Map();
  const failures = new Map();
  let cursor = 0;
  async function consume() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      const key = values[index];
      try {
        results.set(key, await worker(key));
      } catch (error) {
        failures.set(key, error instanceof Error ? error.message : String(error));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, values.length) }, consume));
  return { results, failures };
}

function symbolsInSection(source, start, end) {
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin);
  if (begin < 0 || finish < 0) throw new Error(`seed section not found: ${start}`);
  return [...source.slice(begin, finish).matchAll(/^\s*\['([^']+)'/gm)].map((match) => match[1]);
}

function parseUsDateLabel(label) {
  const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4})$/.exec(label);
  if (!match) return undefined;
  return `${match[3]}-${US_MONTHS.get(match[1])}-${match[2].padStart(2, '0')}`;
}

function dateInTimeZone(timestamp, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function commonSession(values, expected, market) {
  const counts = new Map();
  for (const value of values.values()) {
    counts.set(value.sessionDate, (counts.get(value.sessionDate) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((left, right) =>
    right[1] - left[1] || right[0].localeCompare(left[0]));
  const [sessionDate, count] = ranked[0] ?? [];
  const coverage = count ? count / expected : 0;
  if (!sessionDate || coverage < MIN_COVERAGE) {
    throw new Error(
      `${market} settled-session coverage ${(coverage * 100).toFixed(1)}% is below ` +
      `${(MIN_COVERAGE * 100).toFixed(1)}% (${count ?? 0}/${expected})`,
    );
  }
  return { sessionDate, count, coverage };
}

function readConst(source, name) {
  const match = new RegExp(`export const ${name} = '([^']+)';`).exec(source);
  if (!match) throw new Error(`constant not found: ${name}`);
  return match[1];
}

function replaceConst(source, name, value) {
  const pattern = new RegExp(`export const ${name} = '[^']+';`);
  if (!pattern.test(source)) throw new Error(`constant not found: ${name}`);
  return source.replace(pattern, `export const ${name} = '${value}';`);
}

function replaceSnapshotField(source, name, value) {
  const pattern = new RegExp(`(\\b${name}:\\s*)'[^']*'`);
  if (!pattern.test(source)) throw new Error(`SNAPSHOT field not found: ${name}`);
  return source.replace(pattern, `$1'${value}'`);
}

function assertNotRegressing(market, previousISO, nextISO) {
  const previous = Date.parse(previousISO);
  const next = Date.parse(nextISO);
  if (!Number.isFinite(previous) || !Number.isFinite(next)) throw new Error(`${market} has an invalid anchor`);
  if (next < previous) throw new Error(`${market} provider session ${nextISO} is older than ${previousISO}`);
  return next > previous;
}

function rewriteEquityRows(
  source,
  sectionStart,
  sectionEnd,
  quotes,
  currentTag,
  previousCurrent,
  midTag,
  previousMid,
  advancing,
) {
  const begin = source.indexOf(sectionStart);
  const end = source.indexOf(sectionEnd, begin);
  if (begin < 0 || end < 0) throw new Error(`seed section not found: ${sectionStart}`);
  const body = source.slice(begin, end).split(/(?<=\n)/).map((line) => {
    const eol = line.endsWith('\r\n') ? '\r\n' : line.endsWith('\n') ? '\n' : '';
    const rawLine = eol ? line.slice(0, -eol.length) : line;
    const symbol = rawLine.match(/^\s*\['([^']+)'/)?.[1];
    if (!symbol) return line;
    const quote = quotes.get(symbol);
    if (!quote) {
      if (!advancing) return line;
      return rawLine
        .replace(new RegExp(`\\b${currentTag}\\b`), `'${previousCurrent}'`)
        .replace(new RegExp(`\\b${midTag}\\b`), `'${previousMid}'`) + eol;
    }
    const pattern = /^(\s*\[.*?,\s)(-?[\d.eE]+)(,\s)(-?[\d.eE]+)(,\s)(-?[\d.eE]+)(?:,\s((?:US|KR)_(?:ASOF|MID_ASOF)_ISO|'[^']+'))?(\],.*)$/;
    const match = rawLine.match(pattern);
    if (!match) throw new Error(`row format changed for ${symbol}`);
    return `${match[1]}${match[2]}${match[3]}${quote.price}${match[5]}${quote.changePct}, ${currentTag}${match[8]}${eol}`;
  }).join('');
  return source.slice(0, begin) + body + source.slice(end);
}

function freezeSectionAnchors(source, sectionStart, sectionEnd, replacements, advancing) {
  if (!advancing) return source;
  const begin = source.indexOf(sectionStart);
  const end = source.indexOf(sectionEnd, begin);
  if (begin < 0 || end < 0) throw new Error(`seed section not found: ${sectionStart}`);
  let body = source.slice(begin, end);
  for (const [tag, timestamp] of replacements) {
    body = body.replace(new RegExp(`\\b${tag}\\b`, 'g'), `'${timestamp}'`);
  }
  return source.slice(0, begin) + body + source.slice(end);
}

function easternOffset(sessionDate) {
  const probe = new Date(`${sessionDate}T16:00:00Z`);
  const part = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'longOffset',
  }).formatToParts(probe).find((value) => value.type === 'timeZoneName')?.value;
  const match = /GMT([+-]\d{2}:\d{2})/.exec(part ?? '');
  if (!match) throw new Error(`cannot resolve New York offset for ${sessionDate}`);
  return match[1];
}

function usCloseISO(sessionDate) {
  return `${sessionDate}T16:00:00${easternOffset(sessionDate)}`;
}

function usCloseLabels(sessionDate, iso) {
  const [year, month, day] = sessionDate.split('-').map(Number);
  const zone = iso.endsWith('-04:00') ? 'EDT' : 'EST';
  const monthLabel = [...US_MONTHS.entries()].find(([, value]) => Number(value) === month)?.[0];
  if (!monthLabel) throw new Error(`invalid US session month: ${sessionDate}`);
  return {
    en: `${monthLabel} ${day}, ${year}, 4:00 PM ${zone}`,
    ko: `${year}년 ${month}월 ${day}일 16:00 ${zone}`,
  };
}

function kstLabel(iso) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return `${parts.year}년 ${Number(parts.month)}월 ${Number(parts.day)}일 ${parts.hour}:${parts.minute} KST`;
}

function todayInKst() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function fetchUsQuote(symbol) {
  const slugs = [...new Set([symbol.toLowerCase().replace('-', '.'), symbol.toLowerCase()])];
  for (const slug of slugs) {
    try {
      const html = await fetchText(`https://stockanalysis.com/stocks/${encodeURIComponent(slug)}/history/`);
      for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
        const values = cells(row[1]);
        const sessionDate = parseUsDateLabel(values[0]);
        const price = number(values[4]);
        const changePct = number(values[6]);
        if (sessionDate && Number.isFinite(price) && price > 0 && Number.isFinite(changePct)) {
          return { sessionDate, price, changePct };
        }
      }
    } catch { /* try the alternate slug */ }
  }
  throw new Error('no settled history row');
}

async function fetchYahooUsQuote(symbol, targetSession) {
  const mapped = symbol.replace('-', '.');
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(mapped)}?range=10d&interval=1d&events=history`;
  const payload = JSON.parse(await fetchText(url));
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) throw new Error('invalid Yahoo chart payload');
  const rows = timestamps.flatMap((timestamp, index) => {
    const price = Number(closes[index]);
    if (!Number.isFinite(timestamp) || !Number.isFinite(price) || price <= 0) return [];
    return [{ sessionDate: dateInTimeZone(timestamp * 1000, 'America/New_York'), price }];
  });
  const index = rows.findIndex((row) => row.sessionDate === targetSession);
  if (index <= 0) throw new Error(`no complete ${targetSession} Yahoo daily row`);
  const current = rows[index];
  const previous = rows[index - 1];
  const changePct = Math.round((((current.price / previous.price) - 1) * 100) * 10_000) / 10_000;
  return { sessionDate: targetSession, price: current.price, changePct };
}

async function refreshUs(source) {
  const symbols = symbolsInSection(source, 'const STOCKS: StockRow[] = [', '/** [symbol, name, nameKo, price, changePct')
    .filter((symbol) => !US_SYMBOLS_WITH_DIFFERENT_IDENTITIES.has(symbol));
  const fetched = await mapLimited(symbols, fetchUsQuote);
  const session = commonSession(fetched.results, symbols.length, 'US');
  const quotes = new Map([...fetched.results].filter(([, quote]) => quote.sessionDate === session.sessionDate));
  const fallbackSymbols = symbols.filter((symbol) => !quotes.has(symbol));
  const fallback = await mapLimited(
    fallbackSymbols,
    (symbol) => fetchYahooUsQuote(symbol, session.sessionDate),
  );
  for (const [symbol, quote] of fallback.results) quotes.set(symbol, quote);
  const skipped = [
    ...fallbackSymbols.filter((symbol) => !fallback.results.has(symbol)),
  ];
  const nextAnchor = usCloseISO(session.sessionDate);
  const previousCurrent = readConst(source, 'US_ASOF_ISO');
  const previousMid = readConst(source, 'US_MID_ASOF_ISO');
  const advancing = assertNotRegressing('US', previousCurrent, nextAnchor);

  let updated = rewriteEquityRows(
    source,
    'const STOCKS: StockRow[] = [',
    '/** [symbol, name, nameKo, price, changePct',
    quotes,
    'US_ASOF_ISO',
    previousCurrent,
    'US_MID_ASOF_ISO',
    previousMid,
    advancing,
  );
  updated = freezeSectionAnchors(
    updated,
    'const MACRO: MacroRow[] = [',
    '/** [symbol, name, nameKo, price, changePct, marketCap($B)] */',
    [['US_ASOF_ISO', previousCurrent], ['US_MID_ASOF_ISO', previousMid]],
    advancing,
  );
  if (advancing) {
    updated = replaceConst(updated, 'US_MID_ASOF_ISO', previousCurrent);
    updated = replaceConst(updated, 'US_ASOF_ISO', nextAnchor);
  }
  const labels = usCloseLabels(session.sessionDate, nextAnchor);
  updated = replaceSnapshotField(updated, 'closeLabel', labels.en);
  updated = replaceSnapshotField(updated, 'closeLabelKo', labels.ko);

  console.error(
    `US: ${quotes.size}/${symbols.length} equities at ${session.sessionDate}` +
    `${advancing ? ' (new session)' : ''}; skipped ${skipped.length}` +
    `${skipped.length ? ` (${skipped.join(', ')})` : ''}; Yahoo fills ${fallback.results.size}.`,
  );
  return { source: updated, sessionDate: session.sessionDate, anchor: nextAnchor, count: quotes.size, skipped };
}

async function fetchKrQuote(symbol) {
  const data = JSON.parse(await fetchText(`https://m.stock.naver.com/api/stock/${symbol}/basic`));
  const sessionDate = String(data.localTradedAt ?? '').slice(0, 10);
  const price = number(data.closePrice);
  const changePct = number(data.fluctuationsRatio);
  if (data.marketStatus !== 'CLOSE' || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    throw new Error(`latest session is not settled (${data.localTradedAt ?? 'unknown'})`);
  }
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(changePct)) {
    throw new Error('invalid quote payload');
  }
  return { sessionDate, price, changePct };
}

async function refreshKr(source) {
  const symbols = symbolsInSection(source, 'export const KR_STOCKS: KrStockRow[] = [', 'function krStockAsset');
  const fetched = await mapLimited(symbols, fetchKrQuote);
  const session = commonSession(fetched.results, symbols.length, 'KR');
  const quotes = new Map([...fetched.results].filter(([, quote]) => quote.sessionDate === session.sessionDate));
  const skipped = [
    ...fetched.failures.keys(),
    ...[...fetched.results].filter(([, quote]) => quote.sessionDate !== session.sessionDate).map(([symbol]) => symbol),
  ].sort();
  const nextAnchor = `${session.sessionDate}T15:30:00+09:00`;
  const previousCurrent = readConst(source, 'KR_ASOF_ISO');
  const previousMid = readConst(source, 'KR_MID_ASOF_ISO');
  const advancing = assertNotRegressing('KR', previousCurrent, nextAnchor);

  let updated = rewriteEquityRows(
    source,
    'export const KR_STOCKS: KrStockRow[] = [',
    'function krStockAsset',
    quotes,
    'KR_ASOF_ISO',
    previousCurrent,
    'KR_MID_ASOF_ISO',
    previousMid,
    advancing,
  );
  updated = freezeSectionAnchors(
    updated,
    'export const KR_INDICES: KrIndexRow[] = [',
    'function krIndexAsset',
    [['KR_ASOF_ISO', previousCurrent], ['KR_MID_ASOF_ISO', previousMid]],
    advancing,
  );
  if (advancing) {
    updated = replaceConst(updated, 'KR_MID_ASOF_ISO', previousCurrent);
    updated = replaceConst(updated, 'KR_ASOF_ISO', nextAnchor);
  }

  console.error(
    `KR: ${quotes.size}/${symbols.length} equities at ${session.sessionDate}` +
    `${advancing ? ' (new session)' : ''}; skipped ${skipped.length}` +
    `${skipped.length ? ` (${skipped.join(', ')})` : ''}.`,
  );
  return { source: updated, sessionDate: session.sessionDate, anchor: nextAnchor, count: quotes.size, skipped };
}

async function refreshCrypto(source) {
  const ids = Object.values(CRYPTO_IDS).join(',');
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`;
  const rows = JSON.parse(await fetchText(url));
  if (!Array.isArray(rows)) throw new Error('CoinGecko returned a non-array payload');
  const byId = new Map(rows.map((row) => [row.id, row]));
  const timestamps = [];
  let count = 0;
  const begin = source.indexOf('const CRYPTO: CryptoRow[] = [');
  const end = source.indexOf('/* ---------- Brand colors', begin);
  if (begin < 0 || end < 0) throw new Error('crypto seed section not found');
  const body = source.slice(begin, end).split(/(?<=\n)/).map((line) => {
    const eol = line.endsWith('\r\n') ? '\r\n' : line.endsWith('\n') ? '\n' : '';
    const rawLine = eol ? line.slice(0, -eol.length) : line;
    const symbol = rawLine.match(/^\s*\['([^']+)'/)?.[1];
    const row = symbol ? byId.get(CRYPTO_IDS[symbol]) : undefined;
    if (!symbol || !row) return line;
    const price = Number(row.current_price);
    const changePct = Number(row.price_change_percentage_24h);
    const marketCap = Number(row.market_cap);
    const timestamp = Date.parse(row.last_updated);
    if (![price, changePct, marketCap, timestamp].every(Number.isFinite) || price <= 0 || marketCap <= 0) {
      throw new Error(`invalid crypto payload for ${symbol}`);
    }
    const pattern = /^(\s*\[.*?,\s)(-?[\d.eE]+)(,\s)(-?[\d.eE]+)(,\s)(-?[\d.eE]+)(\],.*)$/;
    const match = rawLine.match(pattern);
    if (!match) throw new Error(`crypto row format changed for ${symbol}`);
    count += 1;
    timestamps.push(timestamp);
    const capB = Math.round((marketCap / 1e9) * 100) / 100;
    return `${match[1]}${price}${match[3]}${changePct}${match[5]}${capB}${match[7]}${eol}`;
  }).join('');
  if (count !== Object.keys(CRYPTO_IDS).length) {
    throw new Error(`crypto refresh incomplete: ${count}/${Object.keys(CRYPTO_IDS).length}`);
  }
  const oldestTimestamp = new Date(Math.min(...timestamps)).toISOString();
  let updated = source.slice(0, begin) + body + source.slice(end);
  updated = replaceSnapshotField(updated, 'cryptoAsOfISO', oldestTimestamp);
  updated = replaceSnapshotField(updated, 'cryptoAsOfLabelKo', kstLabel(oldestTimestamp));
  console.error(`Crypto: ${count}/${Object.keys(CRYPTO_IDS).length} assets at ${oldestTimestamp}.`);
  return { source: updated, anchor: oldestTimestamp, count };
}

async function main() {
  const [usOriginal, krOriginal] = await Promise.all([
    readFile(US_FILE, 'utf8'),
    readFile(KR_FILE, 'utf8'),
  ]);
  const [usResult, krResult] = await Promise.all([refreshUs(usOriginal), refreshKr(krOriginal)]);
  const cryptoResult = await refreshCrypto(usResult.source);
  let usUpdated = replaceSnapshotField(cryptoResult.source, 'krAsOfLabelKo', kstLabel(krResult.anchor));
  usUpdated = replaceSnapshotField(usUpdated, 'todayISO', todayInKst());

  const changed = usUpdated !== usOriginal || krResult.source !== krOriginal;
  if (!DRY_RUN) {
    await Promise.all([
      writeFile(US_FILE, usUpdated, 'utf8'),
      writeFile(KR_FILE, krResult.source, 'utf8'),
    ]);
  }
  console.log(JSON.stringify({
    dryRun: DRY_RUN,
    changed,
    coverageThreshold: MIN_COVERAGE,
    us: { sessionDate: usResult.sessionDate, anchor: usResult.anchor, equities: usResult.count, skipped: usResult.skipped },
    kr: { sessionDate: krResult.sessionDate, anchor: krResult.anchor, equities: krResult.count, skipped: krResult.skipped },
    crypto: { anchor: cryptoResult.anchor, assets: cryptoResult.count },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
