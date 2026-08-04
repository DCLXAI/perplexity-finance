import { useMemo, useState } from 'react';
import { computeRebalancePlan } from '@/domain/portfolio/rebalance';
import type { PortfolioAllocationPolicy, PortfolioSummary } from '@/shared/api';
import TargetAllocationDialog from './TargetAllocationDialog.js';

interface RebalancePanelProps {
  readonly summary: PortfolioSummary;
  readonly policy: PortfolioAllocationPolicy | null;
  readonly accessToken?: string;
  readonly demo?: boolean;
  readonly onPolicySaved: (policy: PortfolioAllocationPolicy) => Promise<void> | void;
}

function usd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function pct(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export default function RebalancePanel({
  summary,
  policy,
  accessToken,
  demo = false,
  onPolicySaved,
}: RebalancePanelProps) {
  const [editing, setEditing] = useState(false);
  const plan = useMemo(() => policy ? computeRebalancePlan({
    totalValue: summary.totalValue,
    cashBalance: summary.cashBalance,
    holdings: summary.holdings,
    policy,
  }) : null, [policy, summary.cashBalance, summary.holdings, summary.totalValue]);

  return (
    <section className="pf-panel pf-rebalance" aria-labelledby="pf-rebalance-title">
      <div className="pf-panel-head">
        <div>
          <h2 id="pf-rebalance-title">목표배분과 자동 리밸런싱</h2>
          <p>현재 가치와 목표 비중의 편차를 감지해 주문 제안을 계산합니다. 실제 주문은 자동 실행하지 않습니다.</p>
        </div>
        <div className="pf-rebalance-actions">
          {plan && <span className={`pf-rebalance-status ${plan.rebalanceNeeded ? 'needed' : 'balanced'}`}>{plan.rebalanceNeeded ? '조정 필요' : '목표 범위'}</span>}
          <button type="button" className="ui-btn" onClick={() => setEditing(true)}>{policy ? '목표 수정' : '목표 설정'}</button>
        </div>
      </div>

      {!policy || !plan ? (
        <div className="pf-rebalance-empty">
          <strong>목표배분이 아직 없습니다.</strong>
          <p>자산별 목표 비중, 허용 편차, 최소 주문금액을 설정하면 현재 포트폴리오에 맞는 주문안을 생성합니다.</p>
          <button type="button" className="ui-btn primary" onClick={() => setEditing(true)}>첫 목표배분 만들기</button>
        </div>
      ) : (
        <div className="pf-rebalance-body">
          <dl className="pf-rebalance-kpis">
            <div><dt>최대 편차</dt><dd className={`num ${plan.rebalanceNeeded ? 'neg' : 'pos'}`}>{plan.maxDriftPct.toFixed(2)}%</dd><small>임계치 {plan.driftThresholdPct.toFixed(2)}%</small></div>
            <div><dt>제안 매도</dt><dd className="num">{usd(plan.sellValue)}</dd><small>추정 체결 전</small></div>
            <div><dt>제안 매수</dt><dd className="num">{usd(plan.buyValue)}</dd><small>최소 {usd(plan.minTradeValue)}</small></div>
            <div><dt>예상 잔여 현금</dt><dd className={`num ${plan.estimatedCashAfter < 0 ? 'neg' : ''}`}>{usd(plan.estimatedCashAfter)}</dd><small>수수료 제외</small></div>
          </dl>

          <div className="pf-table-wrap" role="region" tabIndex={0} aria-label="리밸런싱 주문 제안">
            <table className="pf-table pf-rebalance-table">
              <thead><tr><th scope="col">자산</th><th scope="col">현재 비중</th><th scope="col">목표 비중</th><th scope="col">편차</th><th scope="col">목표 가치</th><th scope="col">제안</th><th scope="col">예상 수량</th></tr></thead>
              <tbody>{plan.items.map((item) => (
                <tr key={item.symbol}>
                  <th scope="row">{item.symbol === 'CASH' ? '현금 · CASH' : item.symbol}</th>
                  <td className="num">{item.currentPct.toFixed(2)}%</td>
                  <td className="num">{item.targetPct.toFixed(2)}%</td>
                  <td className={`num ${item.driftPct > 0 ? 'pos' : item.driftPct < 0 ? 'neg' : ''}`}>{pct(item.driftPct)}</td>
                  <td className="num">{usd(item.targetValue)}</td>
                  <td><span className={`pf-trade-action ${item.action}`}>{item.action === 'buy' ? `매수 ${usd(item.tradeValue)}` : item.action === 'sell' ? `매도 ${usd(item.tradeValue)}` : '유지'}</span></td>
                  <td className="num">{item.estimatedQuantity === undefined ? '—' : item.estimatedQuantity.toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          <p className="pf-rebalance-disclaimer">이 표는 현재 편차 미리보기입니다. 저장되는 P9 계획은 서버에서 FIFO 세금 lot, 수수료, 슬리피지와 비용 한도를 다시 적용하며 실제 주문은 자동 실행하지 않습니다.</p>
          {plan.warnings.length > 0 && <ul className="pf-performance-warnings">{plan.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        </div>
      )}

      {editing && (
        <TargetAllocationDialog
          summary={summary}
          policy={policy}
          accessToken={accessToken}
          demo={demo}
          onClose={() => setEditing(false)}
          onSaved={onPolicySaved}
        />
      )}
    </section>
  );
}
