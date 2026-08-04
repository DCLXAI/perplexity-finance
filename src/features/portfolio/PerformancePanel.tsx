import { useMemo } from 'react';
import { computePortfolioPerformance } from '@/domain/portfolio/performance';
import type {
  HistoryResponse,
  PortfolioSnapshot,
  PortfolioSummary,
  PortfolioTransaction,
} from '@/shared/api';

const BENCHMARKS = Object.freeze([
  Object.freeze({ symbol: 'SPY', label: 'S&P 500 · SPY' }),
  Object.freeze({ symbol: 'QQQ', label: 'Nasdaq 100 · QQQ' }),
  Object.freeze({ symbol: 'BTCUSD', label: 'Bitcoin · BTC' }),
]);

interface PerformancePanelProps {
  readonly summary: PortfolioSummary;
  readonly transactions: readonly PortfolioTransaction[];
  readonly snapshots: readonly PortfolioSnapshot[];
  readonly benchmarkSymbol: string;
  readonly benchmark: HistoryResponse | null;
  readonly demo?: boolean;
  readonly onBenchmarkChange: (symbol: string) => void;
}

function usd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function date(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(new Date(value));
}

function percent(value: number | undefined): string {
  return value === undefined ? '계산 불가' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function tone(value: number | undefined): string {
  if (value === undefined || value === 0) return '';
  return value > 0 ? 'pos' : 'neg';
}

function pathFor(
  values: readonly (number | undefined)[],
  minimum: number,
  maximum: number,
): string {
  const spread = Math.max(1, maximum - minimum);
  let started = false;
  return values.flatMap((value, index) => {
    if (value === undefined) return [];
    const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
    const y = 90 - ((value - minimum) / spread) * 75;
    const command = started ? 'L' : 'M';
    started = true;
    return [`${command}${x.toFixed(2)},${y.toFixed(2)}`];
  }).join(' ');
}

export default function PerformancePanel({
  summary,
  transactions,
  snapshots,
  benchmarkSymbol,
  benchmark,
  demo = false,
  onBenchmarkChange,
}: PerformancePanelProps) {
  const performance = useMemo(() => computePortfolioPerformance({
    snapshots,
    transactions,
    benchmarkSymbol,
    benchmarkCandles: benchmark?.candles ?? [],
    ...(benchmark ? { benchmarkProvenance: benchmark.provenance } : {}),
  }), [benchmark, benchmarkSymbol, snapshots, transactions]);

  const chart = useMemo(() => {
    const portfolioValues = performance.points.map((point) => point.cumulativeTwrPct);
    const benchmarkValues = performance.points.map((point) => point.benchmarkPct);
    const available = [...portfolioValues, ...benchmarkValues.filter((value) => value !== undefined)];
    const minimum = Math.min(0, ...available);
    const maximum = Math.max(0, ...available);
    const spread = Math.max(1, maximum - minimum);
    const zeroY = 90 - ((0 - minimum) / spread) * 75;
    return Object.freeze({
      portfolioPath: pathFor(portfolioValues, minimum, maximum),
      benchmarkPath: pathFor(benchmarkValues, minimum, maximum),
      zeroY,
    });
  }, [performance.points]);

  const first = performance.points[0];
  const last = performance.points.at(-1);
  const pricePnl = summary.totalReturn - summary.income + summary.feesPaid;
  const warnings = [...performance.warnings, ...(benchmark?.warning ? [benchmark.warning] : [])];

  return (
    <section className="pf-panel pf-performance" aria-labelledby="pf-performance-title">
      <div className="pf-panel-head pf-performance-head">
        <div>
          <h2 id="pf-performance-title">실제 성과와 벤치마크</h2>
          <p>입출금을 분리한 TWR, 투자자 관점 XIRR, 벤치마크 초과수익을 같은 기간으로 비교합니다.</p>
        </div>
        <div className="pf-performance-toolbar">
          <label htmlFor="pf-benchmark">벤치마크</label>
          <select
            id="pf-benchmark"
            value={benchmarkSymbol}
            onChange={(event) => onBenchmarkChange(event.target.value)}
          >
            {BENCHMARKS.map((entry) => <option key={entry.symbol} value={entry.symbol}>{entry.label}</option>)}
          </select>
          <span className={`pf-quality ${demo ? 'estimated' : benchmark?.provenance.quality ?? 'unpriced'}`}>
            {demo ? 'synthetic' : benchmark?.provenance.mode ?? 'loading'}
          </span>
        </div>
      </div>

      {performance.points.length >= 2 && first && last ? (
        <div className="pf-performance-body">
          <dl className="pf-performance-kpis">
            <div><dt>현금흐름 보정 TWR</dt><dd className={`num ${tone(performance.timeWeightedReturnPct)}`}>{percent(performance.timeWeightedReturnPct)}</dd></div>
            <div><dt>연환산 TWR</dt><dd className={`num ${tone(performance.annualizedTwrPct)}`}>{percent(performance.annualizedTwrPct)}</dd></div>
            <div><dt>투자자 수익률 XIRR</dt><dd className={`num ${tone(performance.moneyWeightedReturnPct)}`}>{percent(performance.moneyWeightedReturnPct)}</dd></div>
            <div><dt>{benchmarkSymbol} 수익률</dt><dd className={`num ${tone(performance.benchmarkReturnPct)}`}>{percent(performance.benchmarkReturnPct)}</dd></div>
            <div><dt>초과수익</dt><dd className={`num ${tone(performance.excessReturnPct)}`}>{percent(performance.excessReturnPct)}</dd></div>
          </dl>

          <div className="pf-performance-chart">
            <div className="pf-performance-legend" aria-hidden="true">
              <span><i className="portfolio" />포트폴리오 TWR</span>
              <span><i className="benchmark" />{benchmarkSymbol}</span>
            </div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`포트폴리오와 ${benchmarkSymbol}의 누적 수익률 비교 차트`}>
              <path className="pf-chart-grid" d="M0 15H100 M0 40H100 M0 65H100 M0 90H100" />
              <path className="pf-chart-zero" d={`M0 ${chart.zeroY.toFixed(2)}H100`} vectorEffect="non-scaling-stroke" />
              {chart.benchmarkPath && <path className="pf-chart-line benchmark" d={chart.benchmarkPath} vectorEffect="non-scaling-stroke" />}
              <path className="pf-chart-line" d={chart.portfolioPath} vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="pf-chart-axis"><span>{date(first.capturedAt)}</span><span>{date(last.capturedAt)}</span></div>
          </div>

          <section className="pf-decomposition" aria-labelledby="pf-decomposition-title">
            <div>
              <h3 id="pf-decomposition-title">성과 구성</h3>
              <p>평가액이 어디에서 왔는지 현재 원장의 누적값으로 분해합니다.</p>
            </div>
            <dl>
              <div><dt>순입금</dt><dd className="num">{usd(summary.netContributions)}</dd></div>
              <div><dt>가격 손익</dt><dd className={`num ${tone(pricePnl)}`}>{usd(pricePnl)}</dd></div>
              <div><dt>배당·이자</dt><dd className={`num ${tone(summary.income)}`}>{usd(summary.income)}</dd></div>
              <div><dt>수수료</dt><dd className="num neg">−{usd(summary.feesPaid)}</dd></div>
              <div className="total"><dt>총 평가액</dt><dd className="num">{usd(summary.totalValue)}</dd></div>
            </dl>
          </section>

          {warnings.length > 0 && (
            <ul className="pf-performance-warnings" aria-label="성과 계산 주의사항">
              {[...new Set(warnings)].map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}

          <details className="pf-snapshot-details">
            <summary>계산에 사용한 가치 스냅숏 {performance.observations}개 보기</summary>
            <div className="pf-table-wrap" role="region" tabIndex={0} aria-label="포트폴리오 가치 스냅숏">
              <table className="pf-table pf-snapshot-table">
                <thead><tr><th scope="col">기록 시각</th><th scope="col">총 평가액</th><th scope="col">현금</th><th scope="col">시장가치</th><th scope="col">누적 손익</th><th scope="col">품질</th></tr></thead>
                <tbody>{[...snapshots].sort((left, right) => left.capturedAt.localeCompare(right.capturedAt)).map((entry) => (
                  <tr key={entry.id}>
                    <th scope="row">{new Date(entry.capturedAt).toLocaleString('ko-KR')}</th>
                    <td className="num">{usd(entry.totalValue)}</td>
                    <td className="num">{usd(entry.cashBalance)}</td>
                    <td className="num">{usd(entry.marketValue)}</td>
                    <td className={`num ${tone(entry.totalReturn)}`}>{usd(entry.totalReturn)}</td>
                    <td>{entry.valuationQuality}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </details>
        </div>
      ) : (
        <div className="pf-performance-empty">
          <strong>아직 비교 가능한 성과 데이터가 없습니다.</strong>
          <p>{demo ? '데모 스냅숏을 생성하지 못했습니다.' : '서로 다른 시점의 가치 스냅숏이 2개 이상 쌓이면 성과를 계산합니다.'}</p>
        </div>
      )}
    </section>
  );
}
