/* ============================================================
   Rule-based local demo assistant — synthesizes Korean answers
   from deterministic mock quotes and static editorial examples.
   No external AI model or market-data API is called.
   ============================================================ */
import { engine, priceInUsd } from '../../data/engine.js';
import { EARNINGS, EARNINGS_WEEK, GENERAL_NEWS, MARKET_SUMMARY } from '../../data/content.js';
import {
  fmtAssetVolume,
  fmtDateKo,
  fmtMarketCap,
  fmtPct,
  fmtPrice,
  fmtQuoteChange,
  fmtQuoteValue,
  fmtUsdCompact,
  weekdayKo,
} from '../../data/format.js';
import { SECTORS, SECTORS_BY_REGION, SNAPSHOT } from '../../data/universe.js';
import type { MarketRegion } from '../../data/region.js';
import type { Quote, SectorId } from '../../data/types.js';

const KIND_KO: Record<Quote['kind'], string> = {
  stock: '주식',
  index: '지수',
  future: '선물',
  crypto: '암호화폐',
  etf: 'ETF',
};

/**
 * Resolve a sector within the quote's OWN region's table. `SECTORS_BY_REGION` gives US and KR
 * their own `changePct`/`indexValue` per sector id, unlike the US-only `SECTOR_BY_ID` this
 * replaced at this file's two call sites (see the review that flagged a KR quote's changePct
 * being judged against the US sector average under an identical Korean label).
 */
function sectorFor(region: MarketRegion, id: SectorId) {
  return SECTORS_BY_REGION[region].find((sector) => sector.id === id);
}

/* ---------- symbol / company detection ---------- */

function findQuote(raw: string): Quote | undefined {
  let best: Quote | undefined;
  let bestScore = 0;
  const consider = (q: Quote, score: number) => {
    const s = score + (q.marketCap ?? 0) / 1e13;
    if (s > bestScore) {
      bestScore = s;
      best = q;
    }
  };

  for (const q of engine.getAll()) {
    const ko = q.nameKo ?? '';
    if (ko.length >= 2 && raw.includes(ko)) consider(q, 78 + Math.min(ko.length, 8));
  }

  const tokens = raw.split(/[\s,.?!:;'"()[\]]+/).filter((t) => t.length >= 2);
  for (const t of tokens) {
    const tl = t.toLowerCase();
    for (const hit of engine.search(t, 3)) {
      const symRaw = hit.symbol.toLowerCase();
      const sym = symRaw.replace(/\^/g, '').replace(/=f$/, '');
      const name = hit.name.toLowerCase();
      if (sym === tl || symRaw === tl) consider(hit, 100);
      else if ((hit.nameKo ?? '').toLowerCase() === tl) consider(hit, 95);
      else if (tl.length >= 4 && name.startsWith(tl)) consider(hit, 75);
      else if (tl.length >= 3 && sym.startsWith(tl)) consider(hit, 62);
    }
  }
  return bestScore >= 60 ? best : undefined;
}

/* ---------- answer templates ---------- */

function symbolAnswer(q: Quote): string {
  const sym = q.kind === 'crypto' ? q.symbol.replace(/USD$/, '') : q.symbol;
  const dirWord = q.changePct >= 0.0001 ? '상승' : q.changePct <= -0.0001 ? '하락' : '보합';

  const lines: string[] = [];
  lines.push(
    `**${q.nameKo ?? q.name} (${sym})** — 모의 현재값 **${fmtQuoteValue(q, q.price)}**, 기준값 대비 **${fmtPct(q.changePct)}** (${fmtQuoteChange(q, q.change)}) ${dirWord}입니다.`,
  );
  lines.push('');
  lines.push(
    `· 범위: ${fmtQuoteValue(q, q.dayLow)} ~ ${fmtQuoteValue(q, q.dayHigh)} · 시가 ${fmtQuoteValue(q, q.open)}`,
  );
  if (q.marketCap) {
    const tail = q.sectorId
      ? ` · ${sectorFor(q.region, q.sectorId)?.nameKo} 섹터`
      : q.kind === 'crypto'
        ? ' · 암호화폐'
        : '';
    lines.push(`· 모의 시가총액: ${fmtMarketCap(q)}${tail}`);
  }
  lines.push(`· 모의 거래량: ${fmtAssetVolume(q, q.volume)} (${q.exchange})`);

  lines.push('');
  lines.push('**모의 데이터 인사이트**');
  // A quote is judged against its OWN region's sector table — `SECTOR_BY_ID` was US-only
  // (see universe.ts), so a KR quote's changePct was silently compared to the US sector's
  // figure under an identical Korean sector label, which reads as a same-market comparison
  // but isn't one. `sectorFor(q.region, ...)` resolves within `SECTORS_BY_REGION` instead.
  const sec = q.sectorId ? sectorFor(q.region, q.sectorId) : undefined;
  if (sec) {
    const diff = q.changePct - sec.changePct;
    lines.push(
      `· ${sec.nameKo} 섹터 예시 평균(${fmtPct(sec.changePct)}) 대비 **${Math.abs(diff).toFixed(2)}%p ${diff >= 0 ? '아웃퍼폼' : '언더퍼폼'}**입니다.`,
    );
  } else {
    lines.push(`· ${KIND_KO[q.kind]} 자산의 모의 변동률은 ${fmtPct(q.changePct)}입니다.`);
  }
  const span = q.dayHigh - q.dayLow;
  const posInRange = span > 0 ? (q.price - q.dayLow) / span : 0.5;
  const rangeWord = posInRange > 0.66 ? '상단' : posInRange < 0.33 ? '하단' : '중간';
  // `q.price` is native-unit (KRW for KR rows) — volume × price must be normalized to one
  // currency before it can be labeled `US$`, or a KR row's won-denominated total is
  // mislabeled and overstated by ~`KRW_PER_USD`x (same hazard `engine.movers`'s active-sort
  // documents and guards against via this same `priceInUsd` helper).
  lines.push(
    `· 현재 모의 값은 범위의 **${rangeWord}** 부근이며, 단순 가격×수량 기준 거래 규모는 약 ${fmtUsdCompact(q.volume * priceInUsd(q.price, q.unit))}입니다.`,
  );

  const news = GENERAL_NEWS.filter((n) => n.symbols.includes(q.symbol)).slice(0, 2);
  if (news.length > 0) {
    lines.push('');
    lines.push('**관련 예시 헤드라인**');
    for (const n of news) lines.push(`· ${n.title} — ${n.source} · ${n.timeAgo}`);
  }
  return lines.join('\n');
}

// This rule-based fallback bot has no region context at its call sites (the client fetch body
// and the server route carry only message text — see `marketBrief()`'s note on the same
// constraint), and `sectorAnswer()` has no symbol to read a region off of the way `symbolAnswer`
// does via `quote.region`. Plumbing region through the AI request contract for this one
// no-symbol query shape was judged out of proportion to a demo rule-engine's fallback path, so
// the smaller fix is here: always show the US table (as before), but say so explicitly, so
// `기술`/`의료` here are never mistaken for the KR sector rail's same-named, different-valued
// figures shown one column away on a `?region=kr` page.
function sectorAnswer(): string {
  const sorted = [...SECTORS].sort((a, b) => b.changePct - a.changePct);
  const best = sorted[0];
  const second = sorted[1];
  const worst = sorted[sorted.length - 1];
  const up = sorted.filter((s) => s.changePct > 0).length;
  return [
    `**모의 섹터 동향 (미국 시장 기준)** (${SNAPSHOT.closeLabelKo} 스냅숏) — ${SECTORS.length}개 섹터 중 **${up}개가 상승**했습니다.`,
    '',
    `· 최강 섹터: **${best.nameKo}** ${fmtPct(best.changePct)} (지수 ${fmtPrice(best.indexValue)} pt)`,
    `· 상위권: ${sorted
      .slice(1, 4)
      .map((s) => `${s.nameKo} ${fmtPct(s.changePct)}`)
      .join(' · ')}`,
    `· 최약 섹터: **${worst.nameKo}** ${fmtPct(worst.changePct)} (지수 ${fmtPrice(worst.indexValue)} pt)`,
    '',
    `${best.nameKo}·${second.nameKo} 중심의 모의 순환매가 나타나고, ${worst.nameKo} 섹터는 상대적으로 부진합니다. 예시 시장 심리는 **${SNAPSHOT.sentimentLabel}** 구간입니다.`,
  ].join('\n');
}

function cryptoAnswer(): string {
  const lines: string[] = [
    `**암호화폐 모의 시장 현황** (${SNAPSHOT.cryptoAsOfLabelKo} 기준)입니다.`,
    '',
  ];
  const rows: [string, string][] = [
    ['BTCUSD', '비트코인 (BTC)'],
    ['ETHUSD', '이더리움 (ETH)'],
    ['SOLUSD', '솔라나 (SOL)'],
  ];
  for (const [sym, label] of rows) {
    const q = engine.getQuote(sym);
    if (q) {
      lines.push(
        `· **${label}**: ${fmtQuoteValue(q, q.price)} (${fmtPct(q.changePct)}) · 모의 시총 ${fmtUsdCompact(q.marketCap ?? 0)}`,
      );
    }
  }
  const ms = MARKET_SUMMARY.find((m) => m.id === 'ms-btc');
  if (ms) {
    lines.push('');
    lines.push('**예시 브리핑**');
    lines.push(ms.body);
  }
  return lines.join('\n');
}

function earningsAnswer(): string {
  const upcoming = EARNINGS.filter((e) => e.dateISO >= SNAPSHOT.todayISO && e.epsEst !== undefined)
    .sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0))
    .slice(0, 3);
  const firstDay = EARNINGS_WEEK.at(0)?.label ?? '';
  const lastDay = EARNINGS_WEEK.at(-1)?.label ?? '';
  const lines: string[] = [`**이번 주 주요 실적 일정** (${firstDay} ~ ${lastDay})`, ''];
  for (const e of upcoming) {
    lines.push(
      `· **${e.company} (${e.symbol})** — ${fmtDateKo(e.dateISO)}(${weekdayKo(e.dateISO)}) ${e.timeLabel} · EPS 예시 $${(e.epsEst ?? 0).toFixed(2)} · 매출 예시 ${e.revenueEst ?? '—'}`,
    );
  }
  lines.push('');
  lines.push(
    '이 일정과 추정치는 제품 데모용 정적 예시입니다. 전체 항목은 실적 탭에서 확인할 수 있습니다.',
  );
  return lines.join('\n');
}

function marketBrief(): string {
  const lines: string[] = [
    `**모의 시장 브리핑** (${SNAPSHOT.closeLabelKo} 스냅숏) — 예시 시장 심리는 **${SNAPSHOT.sentimentLabel}**(${SNAPSHOT.sentimentScore}/100)입니다.`,
    '',
  ];
  for (const sym of ['ES=F', 'NQ=F', 'YM=F', '^VIX']) {
    const q = engine.getQuote(sym);
    if (!q) continue;
    const note = sym === '^VIX' ? (q.changePct < 0 ? ' — 모의 변동성 완화' : ' — 모의 변동성 확대') : '';
    lines.push(`· **${q.nameKo ?? q.name}** ${fmtQuoteValue(q, q.price)} (${fmtPct(q.changePct)})${note}`);
  }

  // `movers()` is a listing (same rule as MoversCard), so it needs a region — this rule-based
  // fallback bot has no request-time region context (the client fetch/localFallbackAnswer path
  // carries only message text), so it defaults to 'US' rather than leaving the region
  // unspecified. Leaving it unspecified silently mixed US and KR stocks into one ranked list,
  // which was the actual bug (not merely "shows US movers under KR"). See task-10-report.md
  // for why full region plumbing through the AI request contract was judged out of scope here.
  lines.push('');
  lines.push('**상승 상위**');
  for (const q of engine.movers('up', 3, 0, 'US')) {
    lines.push(`· ${q.nameKo ?? q.name} (${q.symbol}) **${fmtPct(q.changePct)}** · ${fmtQuoteValue(q, q.price)}`);
  }
  lines.push('');
  lines.push('**하락 상위**');
  for (const q of engine.movers('down', 3, 0, 'US')) {
    lines.push(`· ${q.nameKo ?? q.name} (${q.symbol}) **${fmtPct(q.changePct)}** · ${fmtQuoteValue(q, q.price)}`);
  }

  lines.push('');
  lines.push('**예시 이슈**');
  for (const m of MARKET_SUMMARY.slice(0, 2)) {
    lines.push(`· ${m.title} (${m.sources}개 예시 자료)`);
  }
  return lines.join('\n');
}

/* ---------- router ---------- */

export function generateAnswer(raw: string): string {
  const q = raw.toLowerCase();
  const hit = findQuote(raw);
  if (hit) return symbolAnswer(hit);
  if (q.includes('섹터') || q.includes('sector')) return sectorAnswer();
  if (/암호화폐|크립토|코인|비트코인|bitcoin|btc|crypto|이더리움|ethereum/.test(q)) return cryptoAnswer();
  if (/실적|어닝|earnings/.test(q)) return earningsAnswer();
  return marketBrief();
}
