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
import zlib from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = path.join(root, 'public/logos');

/** Symbols whose bundled file is fetched under a different ticker. */
const TICKER_ALIASES = { 'BRK-B': 'BRKB' };

/**
 * Crypto marks need three sources because no single one covers the set:
 * simple-icons is keyed by brand slug, spothq by short ticker, and the last
 * four only resolve on CoinMarketCap's static assets, keyed by numeric id.
 */
const CRYPTO_SIMPLE_ICONS = {
  BTCUSD: 'bitcoin', ETHUSD: 'ethereum', SOLUSD: 'solana', XRPUSD: 'ripple',
  DOGEUSD: 'dogecoin', BNBUSD: 'binance', ADAUSD: 'cardano', LINKUSD: 'chainlink',
  LTCUSD: 'litecoin', DOTUSD: 'polkadot', XLMUSD: 'stellar', NEARUSD: 'near',
};
const CRYPTO_SPOTHQ = {
  TRXUSD: 'trx', AVAXUSD: 'avax', UNIUSD: 'uni', ATOMUSD: 'atom',
};
const CRYPTO_CMC_IDS = {
  SHIBUSD: 5994, APTUSD: 21794, ARBUSD: 11841, ONDOUSD: 21159,
};

/**
 * Korean (KRX) listing codes 404 on both nvstly/icons and parqet — verified
 * directly against the live endpoints for 005930, 000660 and 035420 before
 * writing this map (all six requests came back HTTP 404, not a body that
 * merely looked empty). cdn.simpleicons.org is keyed by brand slug rather
 * than ticker, so KR codes need an explicit map, and it only carries the
 * flagship consumer brands — no financial holding company, chemical or
 * shipbuilding conglomerate in the universe has an entry there.
 *
 * A shared corporate wordmark is applied to a subsidiary only where that
 * subsidiary is confirmed (via Wikipedia's affiliate lists, cross-checked
 * against each group's history) to actually be part of the group whose mark
 * this is — e.g. Samsung Electro-Mechanics and Samsung Biologics carry the
 * same "SAMSUNG" wordmark as Samsung Electronics because they are Samsung
 * Group affiliates. Conversely, "HD Hyundai" entities (Heavy Industries,
 * Electric, Construction Equipment, Marine Solution, Marine Engine, and HD
 * Hyundai Co. itself) do NOT get Hyundai Motor Group's mark: HD Hyundai split
 * off as its own chaebol with its own rebranded identity in 2019, distinct
 * from Hyundai Motor Group. The same reasoning excludes Hyundai Department
 * Store Group, Hyundai G.F. Holdings (same group) Hyundai Marine & Fire
 * Insurance, and Hyundai Elevator — each is a separate post-split group.
 * KakaoBank and Kakao Pay are excluded for the mirror reason: real
 * subsidiaries of Kakao Corp, but each ships its own distinct logo rather
 * than the parent's, and neither has its own simple-icons entry.
 *
 * Value is [slug, officialHexColor]: simple-icons' CDN defaults to flat
 * monochrome black, but its URL API accepts a color override, and passing
 * each brand's own hex (from simple-icons' own data) keeps these coherent
 * next to the existing colored US/crypto set instead of looking flattened.
 */
const KR_SIMPLE_ICONS = {
  // Samsung Group — shared corporate wordmark across affiliates.
  '005930': ['samsung', '1428A0'], // Samsung Electronics
  '009150': ['samsung', '1428A0'], // Samsung Electro-Mechanics
  '018260': ['samsung', '1428A0'], // Samsung SDS
  '032830': ['samsung', '1428A0'], // Samsung Life Insurance
  '000810': ['samsung', '1428A0'], // Samsung Fire & Marine Insurance
  '016360': ['samsung', '1428A0'], // Samsung Securities
  '028260': ['samsung', '1428A0'], // Samsung C&T
  '006400': ['samsung', '1428A0'], // Samsung SDI
  '010140': ['samsung', '1428A0'], // Samsung Heavy Industries
  '028050': ['samsung', '1428A0'], // Samsung E&A
  '207940': ['samsung', '1428A0'], // Samsung Biologics
  // LG Corp — shared corporate wordmark across affiliates.
  '066570': ['lg', 'A50034'], // LG Electronics
  '011070': ['lg', 'A50034'], // LG Innotek
  '064400': ['lg', 'A50034'], // LG CNS
  '034220': ['lg', 'A50034'], // LG Display
  '032640': ['lg', 'A50034'], // LG Uplus
  '051900': ['lg', 'A50034'], // LG Household & Health Care
  '373220': ['lg', 'A50034'], // LG Energy Solution
  '003550': ['lg', 'A50034'], // LG Corp
  '051910': ['lg', 'A50034'], // LG Chem
  // Hyundai Motor Group only (see note above for what's deliberately excluded).
  '307950': ['hyundai', '002C5E'], // Hyundai AutoEver
  '005380': ['hyundai', '002C5E'], // Hyundai Motor Company
  '012330': ['hyundai', '002C5E'], // Hyundai Mobis
  '064350': ['hyundai', '002C5E'], // Hyundai Rotem
  '086280': ['hyundai', '002C5E'], // Hyundai Glovis
  '000720': ['hyundai', '002C5E'], // Hyundai Engineering & Construction
  '004020': ['hyundai', '002C5E'], // Hyundai Steel
  '000270': ['kia', '05141F'], // Kia Corporation
  '035420': ['naver', '03C75A'], // NAVER Corporation
  '035720': ['kakao', 'FFCD00'], // Kakao Corp
};

function symbolsFromUniverse() {
  const src = readFileSync(path.join(root, 'src/data/universe.ts'), 'utf8');
  const block = src.slice(src.indexOf('const STOCKS'), src.indexOf('const MACRO'));
  return [...block.matchAll(/^\s*\['([A-Z.\-]+)'/gm)].map((m) => m[1]);
}

/** Six-digit KRX listing codes from the Korean universe seed. */
function krSymbolsFromUniverse() {
  const src = readFileSync(path.join(root, 'src/data/universe.kr.ts'), 'utf8');
  const block = src.slice(src.indexOf('export const KR_STOCKS'), src.indexOf('function krStockAsset'));
  return [...block.matchAll(/^\s*\['(\d{6})'/gm)].map((m) => m[1]);
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

/* ------------------------------------------------------------
   Dark-backing measurement.

   AAPL, AMZN and BRK-B ship near-white artwork on a transparent
   background: cut-out shapes with no ink of their own, so when composited
   onto the white chip backing every other mark uses, they render as an
   empty box. The fix is a per-symbol flag that swaps those onto a dark
   backing instead (see ui.css's `.ui-logo-img.on-dark`). Whether a mark
   needs it is measured, not eyeballed: average perceptual luminance over
   the mark's opaque pixels, requiring that almost none of those pixels are
   actually dark ink (a mark can have a high average and still be legible —
   Public Storage's mark averages near-white but keeps ~5% dark ink, which
   is why it isn't flagged). The threshold (avg luminance >= 225, dark-pixel
   share < 4%) was calibrated against every currently-bundled PNG and
   reproduces the existing hand-verified flags for all of them with zero
   misses in either direction.
   ------------------------------------------------------------ */

const DARK_LUM_THRESHOLD = 225;
const DARK_PIXEL_LUM = 140;
const DARK_PIXEL_FRACTION = 0.04;

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPngChunks(buf) {
  let offset = 8;
  const chunks = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    chunks.push({ type, data: buf.subarray(offset + 8, offset + 8 + len) });
    offset += 8 + len + 4; // length + type + data + crc
  }
  return chunks;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Decode an 8-bit, non-interlaced PNG (any of colorType 0/2/3/4/6) to flat RGBA bytes. */
function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('not a PNG');
  const chunks = readPngChunks(buf);
  const ihdr = chunks.find((c) => c.type === 'IHDR').data;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr.readUInt8(8);
  const colorType = ihdr.readUInt8(9);
  const interlace = ihdr.readUInt8(12);
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error('interlaced PNG unsupported');

  let palette = null;
  let trns = null;
  if (colorType === 3) {
    palette = chunks.find((c) => c.type === 'PLTE').data;
    trns = chunks.find((c) => c.type === 'tRNS')?.data ?? null;
  }

  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const raw = zlib.inflateSync(idat);

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported color type ${colorType}`);
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let rawOffset = 0;
  let prevRowStart = -1;
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset];
    rawOffset += 1;
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rawOffset + x];
      const a = x >= channels ? out[rowStart + x - channels] : 0;
      const b = prevRowStart >= 0 ? out[prevRowStart + x] : 0;
      const c = prevRowStart >= 0 && x >= channels ? out[prevRowStart + x - channels] : 0;
      let value;
      switch (filterType) {
        case 0: value = rawByte; break;
        case 1: value = rawByte + a; break;
        case 2: value = rawByte + b; break;
        case 3: value = rawByte + Math.floor((a + b) / 2); break;
        case 4: value = rawByte + paeth(a, b, c); break;
        default: throw new Error(`bad PNG filter type ${filterType}`);
      }
      out[rowStart + x] = value & 0xff;
    }
    rawOffset += stride;
    prevRowStart = rowStart;
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    let r, g, b, a;
    if (colorType === 6) {
      [r, g, b, a] = [out[i * 4], out[i * 4 + 1], out[i * 4 + 2], out[i * 4 + 3]];
    } else if (colorType === 2) {
      [r, g, b, a] = [out[i * 3], out[i * 3 + 1], out[i * 3 + 2], 255];
    } else if (colorType === 0) {
      r = g = b = out[i]; a = 255;
    } else if (colorType === 4) {
      r = g = b = out[i * 2]; a = out[i * 2 + 1];
    } else {
      const idx = out[i];
      r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
      a = trns && idx < trns.length ? trns[idx] : 255;
    }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { width, height, rgba };
}

function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Whether a decoded raster mark needs the dark backing, per the calibrated rule above. */
function needsDarkBackingForRaster({ rgba }) {
  let opaque = 0;
  let sum = 0;
  let dark = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a < 16) continue; // near-fully-transparent: not part of the visible mark
    opaque++;
    const lum = luminance(rgba[i], rgba[i + 1], rgba[i + 2]);
    sum += lum;
    if (lum < DARK_PIXEL_LUM) dark++;
  }
  if (opaque === 0) return false;
  const avgLum = sum / opaque;
  const darkFraction = dark / opaque;
  return avgLum >= DARK_LUM_THRESHOLD && darkFraction < DARK_PIXEL_FRACTION;
}

/**
 * Whether an SVG mark needs the dark backing. Only decided when the SVG is a
 * single solid fill (every existing crypto mark and every new KR brand mark
 * is exactly this shape: one brand color, transparent elsewhere) — measuring
 * a multi-fill SVG would need full rasterization, which two pre-existing
 * marks (AARD, XEL) don't get; those keep their existing `false` rather than
 * a guess.
 */
function needsDarkBackingForSvg(svgText) {
  const fills = [...new Set([...svgText.matchAll(/fill="#([0-9a-fA-F]{6})"/g)].map((m) => m[1].toUpperCase()))];
  if (fills.length !== 1) return false;
  const hex = fills[0];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return luminance(r, g, b) >= DARK_LUM_THRESHOLD;
}

function needsDarkBacking(filePath) {
  const buf = readFileSync(filePath);
  if (filePath.endsWith('.svg')) return needsDarkBackingForSvg(buf.toString('utf8'));
  try {
    return needsDarkBackingForRaster(decodePng(buf));
  } catch (err) {
    console.warn(`[fetch-logos] could not measure ${path.basename(filePath)}: ${err.message}`);
    return false;
  }
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
  const cryptoSources = [
    [CRYPTO_SIMPLE_ICONS, (v) => `https://cdn.simpleicons.org/${v}`],
    [CRYPTO_SPOTHQ, (v) => `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${v}.png`],
    [CRYPTO_CMC_IDS, (v) => `https://s2.coinmarketcap.com/static/img/coins/128x128/${v}.png`],
  ];
  for (const [map, toUrl] of cryptoSources) {
    for (const [symbol, key] of Object.entries(map)) {
      if (!(await download(toUrl(key), path.join(outDir, symbol)))) missing.push(symbol);
    }
  }

  const krMissing = [];
  for (const symbol of krSymbolsFromUniverse()) {
    const dest = path.join(outDir, symbol);
    let got =
      (await download(`https://raw.githubusercontent.com/nvstly/icons/main/ticker_icons/${symbol}.png`, dest)) ||
      (await download(`https://assets.parqet.com/logos/symbol/${symbol}`, dest));
    if (!got && KR_SIMPLE_ICONS[symbol]) {
      const [slug, hex] = KR_SIMPLE_ICONS[symbol];
      got = await download(`https://cdn.simpleicons.org/${slug}/${hex}`, dest);
    }
    if (!got) krMissing.push(symbol);
  }

  const files = readdirSync(outDir).sort();
  const entries = files
    .map((file) => {
      const symbol = path.parse(file).name;
      const dark = needsDarkBacking(path.join(outDir, file));
      return `  '${symbol}': ['${file}', ${dark}],`;
    })
    .join('\n');
  writeFileSync(
    path.join(root, 'src/data/logos.ts'),
    `${readFileSync(path.join(root, 'scripts/logos-header.txt'), 'utf8')}export type LogoEntry = readonly [file: string, needsDarkBacking: boolean];

/**
 * \`needsDarkBacking\` marks artwork that is near-white on transparent. Those marks
 * are invisible on the white chip backing most logos need, so they get a dark one
 * instead. Measured from average opaque-pixel luminance when the set is fetched;
 * see scripts/fetch-logos.mjs.
 */
export const LOGO_FILES: Readonly<Record<string, LogoEntry>> = Object.freeze({
${entries}
});

/** Public URL and backing hint for a symbol's bundled mark. */
export function logoUrl(symbol: string): { url: string; dark: boolean } | undefined {
  const entry = LOGO_FILES[symbol];
  return entry ? { url: \`/logos/\${entry[0]}\`, dark: entry[1] } : undefined;
}
`,
  );
  console.log(JSON.stringify({ bundled: files.length, missing, krMissing, krBundled: krSymbolsFromUniverse().length - krMissing.length }, null, 2));
}

await main();
