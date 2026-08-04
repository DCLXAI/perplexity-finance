import type {
  PortfolioOrderCostBreakdown as OrderCosts,
  PortfolioOrderCostPolicy,
} from '../../shared/api.js';

interface OrderCostBreakdownProps {
  readonly costs: OrderCosts;
  readonly label: string;
  readonly policy?: PortfolioOrderCostPolicy;
  readonly actual?: boolean;
  readonly className?: string;
}

function usd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function signedUsd(value: number): string {
  return `${value > 0 ? '+' : ''}${usd(value)}`;
}

export function OrderCostBreakdown({
  costs,
  label,
  policy,
  actual = false,
  className = '',
}: OrderCostBreakdownProps) {
  return (
    <section className={`pf-order-cost-breakdown ${className}`.trim()} aria-label={label}>
      <header>
        <strong>{label}</strong>
        {policy && (
          <span>
            고정 {usd(policy.commissionFixedUsd)} + {policy.commissionBps.toFixed(2)}bp · 매수/매도 슬리피지 {policy.buySlippageBps.toFixed(2)}/{policy.sellSlippageBps.toFixed(2)}bp · 매도 거래세 {policy.sellTransactionTaxBps.toFixed(2)}bp · 양도세 {policy.capitalGainsTaxPct.toFixed(2)}% · 비용 한도 {policy.maxCostPct.toFixed(2)}% · FIFO
          </span>
        )}
      </header>
      <dl>
        <div><dt>수수료</dt><dd>{usd(costs.commission)}</dd></div>
        <div><dt>슬리피지</dt><dd className={costs.slippage < 0 ? 'pos' : ''}>{signedUsd(costs.slippage)}</dd></div>
        <div><dt>거래세</dt><dd>{usd(costs.transactionTax)}</dd></div>
        <div><dt>과세이익</dt><dd>{usd(costs.taxableGain)}</dd></div>
        <div><dt>추정 양도세</dt><dd>{usd(costs.capitalGainsTax)}</dd></div>
        <div><dt>{actual ? '체결 기준 추정세금' : '추정 세금 합계'}</dt><dd>{usd(costs.tax)}</dd></div>
        <div><dt>총비용</dt><dd>{usd(costs.total)}</dd></div>
        <div><dt>비용모델 현금 영향</dt><dd className={costs.netCashEffect < 0 ? 'neg' : 'pos'}>{signedUsd(costs.netCashEffect)}</dd></div>
      </dl>
      {actual && (
        <p>체결 기준 추정세금은 비용 정책으로 다시 계산한 예상 세액이며, 원장에 기록된 납부액이나 세무 자문이 아닙니다.</p>
      )}
    </section>
  );
}
