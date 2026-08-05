/* ============================================================
   미국 주식 표본 히트맵 — 단일 canvas 스쿼리파이드 트리맵
   섹터(시총 가중) → 종목 트리맵, 7단계 등락 램프, 툴팁 + 클릭 내비게이션
   ============================================================ */
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { Link, useNavigate } from 'react-router';
import { useAllQuotes } from '@/data/store';
import { SECTOR_BY_ID } from '@/data/universe';
import { fmtCompact, fmtPct, fmtQuoteValue } from '@/data/format';
import { ChangeBadge, LogoChip } from '@/components/ui';
import type { Quote, SectorId } from '@/data/types';
import './heatmap.css';

/* ---------------- treemap geometry ---------------- */

interface Laid<T> {
  x: number;
  y: number;
  w: number;
  h: number;
  item: T;
}

function worstAspect(sum: number, min: number, max: number, side: number): number {
  const s2 = sum * sum;
  const l2 = side * side;
  return Math.max((l2 * max) / s2, s2 / (l2 * min));
}

/** Bruls et al. squarified treemap. `entries` must be sorted by weight desc. */
function squarify<T>(
  entries: { weight: number; item: T }[],
  x: number,
  y: number,
  w: number,
  h: number,
): Laid<T>[] {
  const out: Laid<T>[] = [];
  if (w <= 1 || h <= 1 || entries.length === 0) return out;
  const total = entries.reduce((acc, e) => acc + e.weight, 0);
  if (total <= 0) return out;
  const scale = (w * h) / total;
  const areas = entries.map((e) => Math.max(e.weight * scale, 0.01));

  let rx = x;
  let ry = y;
  let rw = w;
  let rh = h;
  let i = 0;

  while (i < areas.length) {
    if (rw <= 0.5 || rh <= 0.5) break;
    const side = Math.min(rw, rh);
    let rowArea = areas[i];
    let rowMin = rowArea;
    let rowMax = rowArea;
    let count = 1;
    let worst = worstAspect(rowArea, rowMin, rowMax, side);
    while (i + count < areas.length) {
      const a = areas[i + count];
      const nArea = rowArea + a;
      const nMin = Math.min(rowMin, a);
      const nMax = Math.max(rowMax, a);
      const nWorst = worstAspect(nArea, nMin, nMax, side);
      if (nWorst > worst) break;
      rowArea = nArea;
      rowMin = nMin;
      rowMax = nMax;
      worst = nWorst;
      count += 1;
    }

    if (rw >= rh) {
      // vertical strip on the left, items stacked top→bottom
      const stripW = rowArea / rh;
      let cy = ry;
      for (let k = i; k < i + count; k++) {
        const ch = areas[k] / stripW;
        out.push({ x: rx, y: cy, w: stripW, h: ch, item: entries[k].item });
        cy += ch;
      }
      rx += stripW;
      rw -= stripW;
    } else {
      // horizontal strip on top, items left→right
      const stripH = rowArea / rw;
      let cx = rx;
      for (let k = i; k < i + count; k++) {
        const cw = areas[k] / stripH;
        out.push({ x: cx, y: ry, w: cw, h: stripH, item: entries[k].item });
        cx += cw;
      }
      ry += stripH;
      rh -= stripH;
    }
    i += count;
  }
  return out;
}

/* ---------------- color ramp ---------------- */

const RAMP_VARS = [
  '--hm-neg-3',
  '--hm-neg-2',
  '--hm-neg-1',
  '--hm-flat',
  '--hm-pos-1',
  '--hm-pos-2',
  '--hm-pos-3',
] as const;

function rampIndex(changePct: number): number {
  const v = Math.max(-3, Math.min(3, changePct));
  if (v <= -2) return 0;
  if (v <= -1) return 1;
  if (v < -0.12) return 2;
  if (v <= 0.12) return 3;
  if (v < 1) return 4;
  if (v < 2) return 5;
  return 6;
}

/* ---------------- component ---------------- */

interface SectorGroup {
  id: SectorId;
  nameKo: string;
  cap: number;
  changePct: number; // cap-weighted
  stocks: Quote[];
}

interface TileHit {
  x: number;
  y: number;
  w: number;
  h: number;
  q: Quote;
}

const MIN_CAP = 10e9;
const HEADER_H = 18;
const GAP = 1;
const TIP_W = 216;
const TIP_H = 116;

function clampTip(cx: number, cy: number): { x: number; y: number } {
  let x = cx + 14;
  let y = cy + 16;
  if (x + TIP_W > window.innerWidth - 10) x = cx - TIP_W - 14;
  if (y + TIP_H > window.innerHeight - 10) y = cy - TIP_H - 16;
  return { x: Math.max(4, x), y: Math.max(4, y) };
}

export default function Heatmap({ height = 420 }: { height?: number }) {
  const quotes = useAllQuotes(1500);
  const navigate = useNavigate();
  const descriptionId = useId();

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rectsRef = useRef<TileHit[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });

  const [width, setWidth] = useState(0);
  const [themeTick, setThemeTick] = useState(0);
  const [hoverSym, setHoverSym] = useState<string | null>(null);

  /* --- sector groups (cap ≥ $10B stocks, sectors by total cap desc) --- */
  const groups = useMemo<SectorGroup[]>(() => {
    const map = new Map<SectorId, { cap: number; wsum: number; stocks: Quote[] }>();
    for (const q of quotes) {
      if (q.kind !== 'stock' || !q.sectorId) continue;
      const cap = q.marketCap ?? 0;
      if (cap < MIN_CAP) continue;
      let g = map.get(q.sectorId);
      if (!g) {
        g = { cap: 0, wsum: 0, stocks: [] };
        map.set(q.sectorId, g);
      }
      g.cap += cap;
      g.wsum += cap * q.changePct;
      g.stocks.push(q);
    }
    const out: SectorGroup[] = [];
    map.forEach((g, id) => {
      g.stocks.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
      out.push({
        id,
        nameKo: SECTOR_BY_ID[id].nameKo,
        cap: g.cap,
        changePct: g.cap > 0 ? g.wsum / g.cap : 0,
        stocks: g.stocks,
      });
    });
    out.sort((a, b) => b.cap - a.cap);
    return out;
  }, [quotes]);

  const hoverQuote = useMemo<Quote | null>(() => {
    if (!hoverSym) return null;
    for (const q of quotes) if (q.symbol === hoverSym) return q;
    return null;
  }, [hoverSym, quotes]);

  const accessibleRows = useMemo(
    () => groups.flatMap((group) => group.stocks.map((quote) => ({ quote, sector: group.nameKo }))),
    [groups],
  );

  /* --- container width via ResizeObserver --- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width);
        setWidth((prev) => (prev === w ? prev : w));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* --- redraw on theme flip (data-theme attribute) --- */
  useEffect(() => {
    const mo = new MutationObserver(() => setThemeTick((t) => t + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  /* --- paint (runs on data tick, resize, theme change) --- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width < 40 || height < 40 || groups.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const styles = getComputedStyle(document.documentElement);
    const ramp = RAMP_VARS.map((v) => styles.getPropertyValue(v).trim() || '#888');
    const ink = styles.getPropertyValue('--ink-strong').trim() || '#091717';
    const inkMuted = styles.getPropertyValue('--ink-muted').trim() || '#84898c';
    const font = (styles.getPropertyValue('--font-sans').trim() || 'sans-serif').replace(/\s+/g, ' ');

    const tiles: TileHit[] = [];
    const sectorRects = squarify(
      groups.map((g) => ({ weight: g.cap, item: g })),
      0,
      0,
      width,
      height,
    );

    for (const sr of sectorRects) {
      const g = sr.item;
      const headerH = sr.h >= 42 && sr.w >= 52 ? HEADER_H : 0;

      // sector label strip: "기술 +0.23% 변동"
      if (headerH > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(sr.x + 2, sr.y, Math.max(sr.w - 4, 0), headerH);
        ctx.clip();
        ctx.fillStyle = inkMuted;
        ctx.font = `600 10px ${font}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${g.nameKo} ${fmtPct(g.changePct)} 변동`, sr.x + 5, sr.y + headerH / 2 + 1);
        ctx.restore();
      }

      const stockRects = squarify(
        g.stocks.map((q) => ({ weight: q.marketCap ?? 0, item: q })),
        sr.x,
        sr.y + headerH,
        sr.w,
        sr.h - headerH,
      );

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (const tr of stockRects) {
        const q = tr.item;
        // integer-snapped tile with a 1px gap (background shows through)
        const px = Math.round(tr.x);
        const py = Math.round(tr.y);
        const pw = Math.max(Math.round(tr.x + tr.w) - px - GAP, 1);
        const ph = Math.max(Math.round(tr.y + tr.h) - py - GAP, 1);

        ctx.fillStyle = ramp[rampIndex(q.changePct)];
        ctx.fillRect(px, py, pw, ph);
        tiles.push({ x: tr.x, y: tr.y, w: tr.w, h: tr.h, q });

        // tile labels — scale to fit, skip on tiny tiles
        const sym = q.symbol;
        const fs = Math.min(13, ph * 0.34, (pw - 6) / (sym.length * 0.66));
        if (fs >= 8) {
          const cx = px + pw / 2;
          const cy = py + ph / 2;
          ctx.fillStyle = ink;
          const showPct = fs >= 9.5 && ph >= 30 && pw >= 44;
          ctx.font = `700 ${fs.toFixed(1)}px ${font}`;
          if (showPct) {
            ctx.fillText(sym, cx, cy - fs * 0.42);
            ctx.font = `500 ${Math.max(8, fs * 0.72).toFixed(1)}px ${font}`;
            ctx.globalAlpha = 0.78;
            ctx.fillText(fmtPct(q.changePct), cx, cy + fs * 0.58);
            ctx.globalAlpha = 1;
          } else {
            ctx.fillText(sym, cx, cy);
          }
        }
      }
    }

    rectsRef.current = tiles;
  }, [groups, width, height, themeTick]);

  /* --- interactivity --- */

  const hitTest = useCallback((x: number, y: number): TileHit | null => {
    for (const t of rectsRef.current) {
      if (x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h) return t;
    }
    return null;
  }, []);

  const onMove = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const bounds = e.currentTarget.getBoundingClientRect();
      const hit = hitTest(e.clientX - bounds.left, e.clientY - bounds.top);
      mouseRef.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.style.cursor = hit ? 'pointer' : 'default';
      if (tooltipRef.current) {
        const p = clampTip(e.clientX, e.clientY);
        tooltipRef.current.style.left = `${p.x}px`;
        tooltipRef.current.style.top = `${p.y}px`;
      }
      setHoverSym(hit ? hit.q.symbol : null);
    },
    [hitTest],
  );

  const onLeave = useCallback(() => setHoverSym(null), []);

  const onClick = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const bounds = e.currentTarget.getBoundingClientRect();
      const hit = hitTest(e.clientX - bounds.left, e.clientY - bounds.top);
      if (hit) navigate(`/stock/${encodeURIComponent(hit.q.symbol)}`);
    },
    [hitTest, navigate],
  );

  const tipInit = hoverQuote ? clampTip(mouseRef.current.x, mouseRef.current.y) : null;

  return (
    <div className="hm-root">
      <div ref={containerRef} className="hm-canvas-wrap" style={{ height }}>
        <canvas
          ref={canvasRef}
          className="hm-canvas"
          style={{ width: '100%', height }}
          role="img"
          aria-label="미국 주식 표본 섹터별 히트맵"
          aria-describedby={descriptionId}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          onClick={onClick}
        />
      </div>

      <div className="hm-legend">
        <div className="hm-scale">
          <span className="hm-scale-label num">-3%</span>
          {RAMP_VARS.map((v) => (
            <span key={v} className="hm-swatch" style={{ background: `var(${v})` }} />
          ))}
          <span className="hm-scale-label num">+3%</span>
        </div>
        <span className="hm-wordmark" aria-hidden="true">
          perplexity
        </span>
      </div>

      <p id={descriptionId} className="sr-only">
        사각형 크기는 모의 시가총액, 색상은 등락률을 뜻합니다. 아래 표에서 모든 종목을 키보드로 탐색할 수 있습니다.
      </p>
      <details className="hm-data-table">
        <summary>히트맵 데이터를 표로 보기</summary>
        <div className="hm-data-scroll" role="region" aria-label="히트맵 대체 데이터 표" tabIndex={0}>
          <table className="ui-table">
            <caption className="sr-only">미국 주식 표본 히트맵의 텍스트 대체 데이터</caption>
            <thead>
              <tr>
                <th scope="col">종목</th>
                <th scope="col">섹터</th>
                <th scope="col">모의 가격</th>
                <th scope="col">등락률</th>
                <th scope="col">모의 시가총액</th>
              </tr>
            </thead>
            <tbody>
              {accessibleRows.map(({ quote, sector }) => (
                <tr key={quote.symbol}>
                  <td>
                    <Link className="hm-data-link" to={`/stock/${encodeURIComponent(quote.symbol)}`}>
                      {quote.nameKo ?? quote.name} <span className="num">({quote.symbol})</span>
                    </Link>
                  </td>
                  <td>{sector}</td>
                  <td className="num">{fmtQuoteValue(quote, quote.price)}</td>
                  <td className={quote.changePct >= 0 ? 'num pos' : 'num neg'}>{fmtPct(quote.changePct)}</td>
                  <td className="num">US${fmtCompact(quote.marketCap ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {hoverQuote && tipInit && (
        <div
          ref={tooltipRef}
          className="ui-tooltip hm-tip"
          style={{ left: tipInit.x, top: tipInit.y }}
        >
          <div className="hm-tip-head">
            <LogoChip symbol={hoverQuote.symbol} bg={hoverQuote.logoBg} text={hoverQuote.logoText} size={24} />
            <div className="hm-tip-names">
              <div className="hm-tip-name">{hoverQuote.nameKo ?? hoverQuote.name}</div>
              <div className="hm-tip-sym">
                {hoverQuote.symbol} · {hoverQuote.exchange}
              </div>
            </div>
          </div>
          <div className="hm-tip-row">
            <span className="hm-tip-price num">{fmtQuoteValue(hoverQuote, hoverQuote.price)}</span>
            <ChangeBadge value={hoverQuote.changePct} />
          </div>
          <div className="hm-tip-cap">
            <span>시가총액</span>
            <span className="num">{fmtCompact(hoverQuote.marketCap ?? 0)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
