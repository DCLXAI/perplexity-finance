/* ============================================================
   Shared UI primitives — import from '@/components/ui'
   ============================================================ */
import {
  memo,
  useEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { clsx, fmtPct, fmtQuoteValue } from '@/data/format';
import type { Quote } from '@/data/types';
import './ui.css';

/* ---------- Card ---------- */

export function Card({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={clsx('ui-card', className)} style={style}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  to,
  right,
}: {
  title: ReactNode;
  to?: string;
  right?: ReactNode;
}) {
  return (
    <div className="ui-card-header">
      <h2 className="ui-card-heading">
        {to ? (
          <Link className="ui-card-title" to={to}>
            {title} <span style={{ color: 'var(--ink-muted)', fontWeight: 400 }} aria-hidden="true">›</span>
          </Link>
        ) : (
          <span className="ui-card-title">{title}</span>
        )}
      </h2>
      {right}
    </div>
  );
}

/* ---------- Change badge ---------- */

export function ChangeBadge({
  value,
  pill = true,
  arrow = true,
  className,
}: {
  value: number;
  pill?: boolean;
  arrow?: boolean;
  className?: string;
}) {
  const dir = value > 0.0001 ? 'up' : value < -0.0001 ? 'down' : 'flat';
  const directionLabel = dir === 'up' ? '상승' : dir === 'down' ? '하락' : '';
  return (
    <span className={clsx('ui-chg', pill && 'pill', dir, className)}>
      {directionLabel && <span className="sr-only">{directionLabel} </span>}
      {arrow && dir !== 'flat' && <span className="arr" aria-hidden="true">{dir === 'up' ? '↗' : '↘'}</span>}
      {arrow ? fmtPct(Math.abs(value), { sign: false }) : fmtPct(value)}
    </span>
  );
}

/* ---------- Logo chip ---------- */

export function LogoChip({
  bg,
  text,
  size = 28,
}: {
  bg?: string;
  text?: string;
  size?: number;
}) {
  return (
    <span
      className="ui-logo"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: bg ?? 'var(--teal)',
        fontSize: size * 0.45,
        borderRadius: size * 0.28,
      }}
    >
      {text ?? '?'}
    </span>
  );
}

/* ---------- theme subscription (canvas는 CSS 변수 변화에 반응하지 못하므로
   data-theme 플립 시 다시 그리도록 공유 옵저버로 구독) ---------- */

const themeListeners = new Set<() => void>();
let themeObserver: MutationObserver | null = null;

function subscribeTheme(cb: () => void): () => void {
  themeListeners.add(cb);
  if (!themeObserver && typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => {
      for (const l of themeListeners) l();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }
  return () => {
    themeListeners.delete(cb);
  };
}

function getThemeSnapshot(): string {
  return document.documentElement.dataset.theme ?? 'light';
}

/** 현재 테마 문자열 — 테마 전환 시 리렌더 트리거용 */
export function useThemeName(): string {
  return useSyncExternalStore(subscribeTheme, getThemeSnapshot);
}

/* ---------- Canvas sparkline (fast, DPR-aware) ---------- */

export const Sparkline = memo(function Sparkline({
  data,
  width = 120,
  height = 36,
  positive,
  fill = true,
  strokeWidth = 1.5,
  baseline,
}: {
  data: readonly number[];
  width?: number;
  height?: number;
  /** color by sign; if omitted, derived from data[last] vs baseline ?? data[0] */
  positive?: boolean;
  fill?: boolean;
  strokeWidth?: number;
  /** draw a dashed reference line at this value (e.g. prevClose) */
  baseline?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useThemeName();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || data.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const base = baseline ?? data[0];
    const isUp = positive ?? data[data.length - 1] >= base;
    const styles = getComputedStyle(document.documentElement);
    const color = isUp
      ? styles.getPropertyValue('--pos').trim() || '#0d8259'
      : styles.getPropertyValue('--neg').trim() || '#b8432f';

    let min = Infinity;
    let max = -Infinity;
    for (const v of data) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (baseline !== undefined) {
      if (baseline < min) min = baseline;
      if (baseline > max) max = baseline;
    }
    const range = max - min || 1;
    const pad = 2;
    const xs = (i: number) => (i / (data.length - 1)) * (width - 2) + 1;
    const ys = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2);

    // baseline
    if (baseline !== undefined) {
      ctx.strokeStyle = styles.getPropertyValue('--border-strong').trim() || '#ccc';
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, ys(baseline));
      ctx.lineTo(width, ys(baseline));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // area fill
    if (fill) {
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, color + '33');
      grad.addColorStop(1, color + '00');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(xs(0), ys(data[0]));
      for (let i = 1; i < data.length; i++) ctx.lineTo(xs(i), ys(data[i]));
      ctx.lineTo(xs(data.length - 1), height);
      ctx.lineTo(xs(0), height);
      ctx.closePath();
      ctx.fill();
    }

    // line
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(xs(0), ys(data[0]));
    for (let i = 1; i < data.length; i++) ctx.lineTo(xs(i), ys(data[i]));
    ctx.stroke();
  }, [data, width, height, positive, fill, strokeWidth, baseline, theme]);

  return <canvas ref={ref} style={{ width, height }} aria-hidden="true" />;
});

/* ---------- Quote row (watchlist / movers style) ---------- */

export function QuoteRow({
  quote,
  right,
  sub,
  to,
}: {
  quote: Quote;
  /** override right side; default = price + change% */
  right?: ReactNode;
  /** override subtitle; default = SYMBOL · EXCHANGE */
  sub?: ReactNode;
  /** override destination; defaults to the quote detail route */
  to?: string;
}) {
  return (
    <Link
      className="ui-qrow"
      to={to ?? `/stock/${encodeURIComponent(quote.symbol)}`}
      aria-label={`${quote.nameKo ?? quote.name} 상세 보기`}
    >
      <LogoChip bg={quote.logoBg} text={quote.logoText} />
      <div className="qr-main">
        <div className="qr-name">{quote.name}</div>
        <div className="qr-sub">
          {sub ?? (
            <>
              {quote.symbol} · {quote.exchange}
            </>
          )}
        </div>
      </div>
      <div className="qr-right">
        {right ?? (
          <>
            <div className="qr-price">{fmtQuoteValue(quote, quote.price)}</div>
            <ChangeBadge value={quote.changePct} pill={false} arrow={false} className={quote.changePct >= 0 ? 'up' : 'down'} />
          </>
        )}
      </div>
    </Link>
  );
}

/* ---------- Segmented underline tabs ---------- */

export function SegTabs({
  items,
  value,
  onChange,
  className,
}: {
  items: { key: string; label: ReactNode }[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={clsx('ui-seg', className)}>
      {items.map((it) => (
        <button
          type="button"
          key={it.key}
          className={clsx(value === it.key && 'active')}
          aria-pressed={value === it.key}
          onClick={() => onChange(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Chip filter tabs ---------- */

export function ChipTabs({
  items,
  value,
  onChange,
  className,
}: {
  items: { key: string; label: ReactNode }[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={clsx('ui-chips', className)}>
      {items.map((it) => (
        <button
          type="button"
          key={it.key}
          className={clsx(value === it.key && 'active')}
          aria-pressed={value === it.key}
          onClick={() => onChange(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
