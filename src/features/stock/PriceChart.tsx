/* ============================================================
   Interactive price chart — lightweight-charts wrapper with a
   range/type toolbar, provider-backed history, live quote updates, theme observation
   (data-theme) and container-resize handling.
   ============================================================ */
import { memo, useEffect, useId, useRef, useState } from 'react';
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type AreaSeriesPartialOptions,
  type CandlestickSeriesPartialOptions,
  type ChartOptions,
  type DeepPartial,
  type UTCTimestamp,
} from 'lightweight-charts';
import { Card, ChipTabs, SegTabs } from '@/components/ui';
import { engine } from '@/data/engine';
import { fmtQuoteValue } from '@/data/format';
import type { CandlePoint, HistoryRange } from '@/data/types';
import { apiFetch } from '@/live/apiClient';
import type { DataProvenance, HistoryResponse } from '@/shared/api';

const RANGES: HistoryRange[] = ['1D', '5D', '7D', '1M', '6M', 'YTD', '1Y', '5Y'];

type ChartType = 'line' | 'candle';

const TYPE_TABS = [
  { key: 'line', label: '라인' },
  { key: 'candle', label: '캔들' },
];

const INTRADAY_TIME = new Intl.DateTimeFormat('ko-KR', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const DAILY_TIME = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

interface ChartPalette {
  ink: string;
  border: string;
  teal: string;
  pos: string;
  neg: string;
}

function readPalette(): ChartPalette {
  const styles = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    ink: v('--ink-muted', '#84898c'),
    border: v('--border', '#e8e8e3'),
    teal: v('--teal', '#20808d'),
    pos: v('--pos', '#0d8259'),
    neg: v('--neg', '#b8432f'),
  };
}

/** '#rrggbb' + alpha(0..1) → '#rrggbbaa'; non-hex values pass through untouched */
function withAlpha(color: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return (
    color +
    Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0')
  );
}

function themedChartOptions(p: ChartPalette, width: number, intraday: boolean): DeepPartial<ChartOptions> {
  return {
    width,
    height: 380,
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: p.ink,
      fontSize: 11,
    },
    grid: {
      vertLines: { color: withAlpha(p.border, 0.45) },
      horzLines: { color: withAlpha(p.border, 0.45) },
    },
    rightPriceScale: { borderColor: p.border },
    timeScale: { borderColor: p.border, timeVisible: intraday, secondsVisible: false },
    crosshair: { mode: CrosshairMode.Normal },
  };
}

function areaOptions(p: ChartPalette): AreaSeriesPartialOptions {
  return {
    lineColor: p.teal,
    lineWidth: 2,
    topColor: withAlpha(p.teal, 0.25),
    bottomColor: withAlpha(p.teal, 0),
  };
}

function candleOptions(p: ChartPalette): CandlestickSeriesPartialOptions {
  return {
    upColor: p.pos,
    downColor: p.neg,
    wickUpColor: p.pos,
    wickDownColor: p.neg,
    borderVisible: false,
  };
}

function accessibleHistorySummary(
  symbol: string,
  range: HistoryRange,
  history: readonly CandlePoint[],
): string {
  if (history.length === 0) return `${symbol} ${range} 구간 가격 데이터가 없습니다.`;
  const quote = engine.getQuote(symbol);
  const first = history[0];
  const last = history[history.length - 1];
  let lowest = first.close;
  let highest = first.close;
  for (const point of history) {
    lowest = Math.min(lowest, point.close);
    highest = Math.max(highest, point.close);
  }
  const formatValue = (value: number) => quote
    ? fmtQuoteValue(quote, value)
    : value.toLocaleString('en-US', { maximumFractionDigits: 4 });
  const formatter = range === '1D' || range === '5D' || range === '7D' ? INTRADAY_TIME : DAILY_TIME;
  const changePct = first.close === 0 ? 0 : ((last.close - first.close) / Math.abs(first.close)) * 100;
  const direction = changePct > 0.0001 ? '상승' : changePct < -0.0001 ? '하락' : '변동 없음';
  return `${symbol} ${range} 구간 ${history.length}개 시점. ${formatter.format(new Date(first.time * 1000))} ${formatValue(first.close)}에서 ${formatter.format(new Date(last.time * 1000))} ${formatValue(last.close)}로 ${Math.abs(changePct).toFixed(2)}% ${direction}. 종가 최저 ${formatValue(lowest)}, 최고 ${formatValue(highest)}.`;
}

function PriceChartInner({ symbol }: { symbol: string }) {
  const holderRef = useRef<HTMLDivElement>(null);
  const chartTitleId = useId();
  const chartSummaryId = useId();
  const [range, setRange] = useState<HistoryRange>('1D');
  const [typeOverride, setTypeOverride] = useState<ChartType | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [historyState, setHistoryState] = useState<{
    phase: 'loading' | 'ready' | 'fallback' | 'error';
    provenance?: DataProvenance;
    warning?: string;
  }>({ phase: 'loading' });
  // Intraday ranges default to line, longer ranges default to candles — still user-switchable
  const chartType: ChartType = typeOverride ?? (range === '1D' || range === '5D' || range === '7D' ? 'line' : 'candle');
  const accessibleHistory = engine.getHistory(symbol, range);
  const chartSummary = accessibleHistorySummary(symbol, range, accessibleHistory);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setHistoryState((current) => ({ ...current, phase: 'loading' }));
    void apiFetch<HistoryResponse>(
      `/api/market/history?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`,
      { signal: controller.signal },
    ).then((response) => {
      if (!active) return;
      if (response.candles.length > 0) {
        engine.replaceExternalHistory(symbol, range, response.candles, response.provenance);
        setHistoryVersion((current) => current + 1);
        setHistoryState({
          phase: response.provenance.mode === 'fallback' || response.provenance.mode === 'mock' ? 'fallback' : 'ready',
          provenance: response.provenance,
          ...(response.warning ? { warning: response.warning } : {}),
        });
      } else {
        setHistoryState({
          phase: 'fallback',
          provenance: response.provenance,
          warning: response.warning ?? '공급자 히스토리가 없어 거래 캘린더 기반 로컬 시계열을 유지합니다.',
        });
      }
    }).catch((error: unknown) => {
      if (!active || (error instanceof DOMException && error.name === 'AbortError')) return;
      setHistoryState({
        phase: 'error',
        warning: error instanceof Error ? error.message : String(error),
      });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [symbol, range]);

  useEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const history = engine.getHistory(symbol, range);
    if (history.length === 0) return;

    let palette = readPalette();
    const intraday = range === '1D' || range === '5D' || range === '7D';
    const chart = createChart(el, themedChartOptions(palette, el.clientWidth, intraday));

    const area = chartType === 'line' ? chart.addSeries(AreaSeries, areaOptions(palette)) : null;
    const candles =
      chartType === 'candle' ? chart.addSeries(CandlestickSeries, candleOptions(palette)) : null;
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: '',
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    // Mutable local mirror of the final immutable engine bar; quote updates replace its fields explicitly.
    const lastBar = { ...history[history.length - 1] };
    const lastTime = lastBar.time as UTCTimestamp;

    const volumePoint = (bar: { time: number; open: number; close: number; volume: number }, p: ChartPalette) => ({
      time: bar.time as UTCTimestamp,
      value: bar.volume,
      color: withAlpha(bar.close >= bar.open ? p.pos : p.neg, 0.45),
    });

    if (area) {
      area.setData(history.map((c) => ({ time: c.time as UTCTimestamp, value: c.close })));
    }
    if (candles) {
      candles.setData(
        history.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      );
    }
    volume.setData(history.map((c) => volumePoint(c, palette)));
    chart.timeScale().fitContent();

    // Live ticks (1D only): update the last bar in place.
    let unsubscribe: (() => void) | undefined;
    if (range === '1D') {
      let dayVolume = engine.getQuote(symbol)?.volume ?? 0;
      unsubscribe = engine.subscribe(symbol, (q) => {
        lastBar.close = q.price;
        if (q.price > lastBar.high) lastBar.high = q.price;
        if (q.price < lastBar.low) lastBar.low = q.price;
        lastBar.volume += Math.max(0, q.volume - dayVolume);
        dayVolume = q.volume;
        if (area) area.update({ time: lastTime, value: lastBar.close });
        if (candles) {
          candles.update({
            time: lastTime,
            open: lastBar.open,
            high: lastBar.high,
            low: lastBar.low,
            close: lastBar.close,
          });
        }
        volume.update(volumePoint(lastBar, palette));
      });
    }

    // Container width → chart width.
    const resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) chart.applyOptions({ width: Math.floor(width) });
    });
    resizeObserver.observe(el);

    // Light/dark switch → re-apply themed options + series colors in place.
    const themeObserver = new MutationObserver(() => {
      palette = readPalette();
      chart.applyOptions(themedChartOptions(palette, el.clientWidth, intraday));
      if (area) area.applyOptions(areaOptions(palette));
      if (candles) candles.applyOptions(candleOptions(palette));
      volume.setData([
        ...history.slice(0, -1).map((c) => volumePoint(c, palette)),
        volumePoint(lastBar, palette),
      ]);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      if (unsubscribe) unsubscribe();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      chart.remove();
    };
  }, [symbol, range, chartType, historyVersion]);

  return (
    <Card className="st-chart-card fade-in-up st-d1">
      <h2 id={chartTitleId} className="sr-only">{symbol} {range} 가격 차트</h2>
      <p id={chartSummaryId} className="sr-only" role="status" aria-atomic="true">{chartSummary}</p>
      <div className="st-toolbar">
        <SegTabs
          items={RANGES.map((r) => ({ key: r, label: r }))}
          value={range}
          onChange={(key) => {
            setRange(key as HistoryRange);
            setTypeOverride(null);
          }}
        />
        <ChipTabs items={TYPE_TABS} value={chartType} onChange={(key) => setTypeOverride(key as ChartType)} />
      </div>
      <div className={`st-history-status ${historyState.phase}`} role="status">
        <span className="st-history-dot" aria-hidden="true" />
        <strong>{historyState.phase === 'loading' ? '히스토리 연결 중' : historyState.provenance?.sourceLabel ?? '로컬 히스토리'}</strong>
        <span>{historyState.provenance ? `${historyState.provenance.mode} · ${new Date(historyState.provenance.providerTimestamp).toLocaleString('ko-KR')}` : '거래 캘린더 기반 폴백'}</span>
        {historyState.warning && <span className="st-history-warning">{historyState.warning}</span>}
      </div>
      <div
        className="st-chart-wrap"
        role="img"
        aria-labelledby={chartTitleId}
        aria-describedby={chartSummaryId}
      >
        <div ref={holderRef} className="st-chart" aria-hidden="true" />
      </div>
    </Card>
  );
}

const PriceChart = memo(PriceChartInner);
export default PriceChart;
