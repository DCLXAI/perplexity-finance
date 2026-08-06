import { Link } from 'react-router';
import type { PortfolioSummary } from '@/shared/api';

function usd(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Math.abs(value) < 100 ? 2 : 0,
  }).format(value);
}
function number(value: number, digits = 4): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value);
}
function pct(value?: number): string {
  return value === undefined || !Number.isFinite(value) ? '—' : `${value.toFixed(2)}%`;
}
function signedClass(value?: number): string {
  return value === undefined || value === 0 ? '' : value > 0 ? 'pos' : 'neg';
}

export default function PortfolioSummaryView({ summary }: { summary: PortfolioSummary }) {
  const risk = summary.risk;
  return (
    <>
      <section className="pf-kpis" aria-label="포트폴리오 핵심 지표">
        <article>
          <span>총 평가액</span>
          <strong className="num">{usd(summary.totalValue)}</strong>
          <small>{summary.valuationQuality} · {new Date(summary.asOfISO).toLocaleString('ko-KR')}</small>
        </article>
        <article>
          <span>누적 손익</span>
          <strong className={`num ${signedClass(summary.totalReturn)}`}>{usd(summary.totalReturn)}</strong>
          <small className={signedClass(summary.totalReturnPct)}>순입금 대비 단순 {pct(summary.totalReturnPct)}</small>
        </article>
        <article>
          <span>현금</span>
          <strong className="num">{usd(summary.cashBalance)}</strong>
          <small>순입금 {usd(summary.netContributions)}</small>
        </article>
        <article>
          <span>95% 1일 VaR</span>
          <strong className="num neg">{usd(risk.historicalVar95Amount)}</strong>
          <small>{pct(risk.historicalVar95Pct)} · {risk.observations} 관측</small>
        </article>
        <article>
          <span>연환산 변동성</span>
          <strong className="num">{pct(risk.annualizedVolatilityPct)}</strong>
          <small>{risk.dataQuality} · {risk.status}</small>
        </article>
        <article>
          <span>최대 낙폭</span>
          <strong className="num neg">{pct(risk.maxDrawdownPct)}</strong>
          <small>유효 보유종목 {risk.effectiveHoldings.toFixed(2)}</small>
        </article>
      </section>

      <div className="pf-main-grid">
        <section className="pf-panel" aria-labelledby="pf-holdings-title">
          <div className="pf-panel-head">
            <div>
              <h2 id="pf-holdings-title">보유자산</h2>
              <p>FIFO 원가와 공급자 provenance를 기준으로 평가합니다.</p>
            </div>
            <span className={`pf-quality ${summary.valuationQuality}`}>{summary.valuationQuality}</span>
          </div>
          <div className="pf-table-wrap" role="region" tabIndex={0} aria-label="보유자산 표">
            <table className="pf-table">
              <caption className="sr-only">포트폴리오 보유자산, 원가, 시장가치와 손익</caption>
              <thead>
                <tr>
                  <th scope="col">자산</th>
                  <th scope="col">수량</th>
                  <th scope="col">평균단가</th>
                  <th scope="col">현재가</th>
                  <th scope="col">시장가치</th>
                  <th scope="col">미실현 손익</th>
                  <th scope="col">비중</th>
                  <th scope="col">품질</th>
                </tr>
              </thead>
              <tbody>
                {summary.holdings.map((holding) => (
                  <tr key={holding.symbol}>
                    <th scope="row">
                      <Link to={`/stock/${encodeURIComponent(holding.symbol)}`} className="pf-symbol-link">
                        <strong>{holding.symbol}</strong>
                        <span>{holding.name}</span>
                      </Link>
                    </th>
                    <td className="num">{number(holding.quantity, 8)}</td>
                    <td className="num">{usd(holding.averageCost)}</td>
                    <td className="num">{usd(holding.price)}</td>
                    <td className="num">{usd(holding.marketValue)}</td>
                    <td className={`num ${signedClass(holding.unrealizedPnl)}`}>{usd(holding.unrealizedPnl)}</td>
                    <td className="num">{pct(holding.allocationPct)}</td>
                    <td><span className={`pf-quality ${holding.valuationQuality}`}>{holding.valuationQuality}</span></td>
                  </tr>
                ))}
                {!summary.holdings.length && (
                  <tr><td colSpan={8} className="pf-empty">입금 후 첫 거래를 추가하면 보유자산이 표시됩니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="pf-panel pf-allocation" aria-labelledby="pf-allocation-title">
          <div className="pf-panel-head">
            <div><h2 id="pf-allocation-title">배분과 집중도</h2><p>시장가치 기준입니다.</p></div>
          </div>
          <div className="pf-allocation-list">
            {summary.holdings.slice(0, 10).map((holding) => (
              <div key={holding.symbol}>
                <div><strong>{holding.symbol}</strong><span className="num">{pct(holding.allocationPct)}</span></div>
                <span className="pf-allocation-track" aria-hidden="true">
                  <i style={{ width: `${Math.max(1, holding.allocationPct)}%` }} />
                </span>
              </div>
            ))}
            {!summary.holdings.length && <p className="pf-empty">배분 데이터가 없습니다.</p>}
          </div>
          <dl className="pf-risk-list">
            <div><dt>HHI 집중도</dt><dd className="num">{risk.concentrationHhi.toFixed(4)}</dd></div>
            <div><dt>최대 보유비중</dt><dd className="num">{pct(risk.topHoldingPct)}</dd></div>
            <div><dt>CVaR 95%</dt><dd className="num neg">{usd(risk.historicalCvar95Amount)}</dd></div>
            <div><dt>리스크 커버리지</dt><dd className="num">{pct(risk.pricedCoveragePct)}</dd></div>
            <div><dt>실현 손익</dt><dd className={`num ${signedClass(summary.realizedPnl)}`}>{usd(summary.realizedPnl)}</dd></div>
            <div><dt>배당·현금수익</dt><dd className="num pos">{usd(summary.income)}</dd></div>
          </dl>
        </aside>
      </div>

      {summary.warnings.length > 0 && (
        <details className="pf-warnings">
          <summary>데이터 및 계산 주의사항 {summary.warnings.length}개</summary>
          <ul>{summary.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </details>
      )}
    </>
  );
}
