import type {
  PortfolioHolding,
  PortfolioLedgerPosition,
  PortfolioValuationQuality,
  RemoteQuotePatch,
} from '../../shared/api.js';

const MONEY_SCALE = 100_000_000;
function money(value: number): number {
  return Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
}

export interface PortfolioAssetDescriptor {
  readonly symbol: string;
  readonly name: string;
  readonly sector?: string;
  readonly assetKind: PortfolioHolding['assetKind'];
}
export interface PortfolioValuationResult {
  readonly asOfISO: string;
  readonly investedValue: number;
  readonly marketValue: number;
  readonly unrealizedPnl: number;
  readonly valuationQuality: PortfolioValuationQuality;
  readonly pricedCoveragePct: number;
  readonly holdings: readonly PortfolioHolding[];
  readonly warnings: readonly string[];
}

function quoteQuality(quote: RemoteQuotePatch | undefined): PortfolioValuationQuality {
  if (!quote) return 'unpriced';
  const decision = quote.provenance.verification?.decision;
  const providerBacked = quote.provenance.quality === 'provider' || quote.provenance.quality === 'verified';
  const freshMode = ['live', 'delayed', 'snapshot'].includes(quote.provenance.mode);
  if (providerBacked && freshMode && (!decision || decision === 'accepted')) return 'verified';
  if (quote.price > 0 && Number.isFinite(quote.price)) return 'estimated';
  return 'unpriced';
}

function overallQuality(qualities: readonly PortfolioValuationQuality[]): PortfolioValuationQuality {
  if (!qualities.length || qualities.every((quality) => quality === 'verified')) return 'verified';
  if (qualities.every((quality) => quality === 'unpriced')) return 'unpriced';
  if (qualities.every((quality) => quality === 'estimated')) return 'estimated';
  return 'mixed';
}

export function valuePortfolioPositions(
  positions: readonly PortfolioLedgerPosition[],
  quotes: ReadonlyMap<string, RemoteQuotePatch>,
  assets: ReadonlyMap<string, PortfolioAssetDescriptor>,
): PortfolioValuationResult {
  const warnings: string[] = [];
  const rows = positions.map((position) => {
    const quote = quotes.get(position.symbol);
    const asset = assets.get(position.symbol) ?? {
      symbol: position.symbol,
      name: position.symbol,
      assetKind: 'stock' as const,
    };
    const valuationQuality = quoteQuality(quote);
    const priced = quote && Number.isFinite(quote.price) && quote.price > 0;
    const marketValue = priced ? money(position.quantity * quote.price) : undefined;
    const unrealizedPnl = marketValue === undefined ? undefined : money(marketValue - position.costBasis);
    return {
      position,
      asset,
      quote,
      valuationQuality,
      marketValue,
      unrealizedPnl,
    };
  });

  const investedValue = money(positions.reduce((sum, position) => sum + position.costBasis, 0));
  const marketValue = money(rows.reduce((sum, row) => sum + (row.marketValue ?? 0), 0));
  const unrealizedPnl = money(rows.reduce((sum, row) => sum + (row.unrealizedPnl ?? 0), 0));
  const pricedCost = rows.reduce((sum, row) => sum + (row.marketValue === undefined ? 0 : row.position.costBasis), 0);
  const pricedCoveragePct = investedValue > 0 ? Math.max(0, Math.min(100, (pricedCost / investedValue) * 100)) : 100;
  const denominator = marketValue > 0 ? marketValue : 0;

  for (const row of rows) {
    if (row.valuationQuality === 'unpriced') warnings.push(`${row.position.symbol}은 사용할 수 있는 시세가 없어 가치평가에서 제외됐습니다.`);
    else if (row.valuationQuality === 'estimated') warnings.push(`${row.position.symbol}은 stale·degraded·synthetic 시세를 사용한 추정값입니다.`);
  }

  const holdings: readonly PortfolioHolding[] = Object.freeze(
    rows
      .map((row): PortfolioHolding => Object.freeze({
        ...row.position,
        name: row.asset.name,
        ...(row.asset.sector ? { sector: row.asset.sector } : {}),
        assetKind: row.asset.assetKind,
        ...(row.quote ? { price: row.quote.price, provenance: row.quote.provenance } : {}),
        ...(row.marketValue !== undefined ? { marketValue: row.marketValue } : {}),
        ...(row.unrealizedPnl !== undefined
          ? {
            unrealizedPnl: row.unrealizedPnl,
            totalPnl: money(row.position.realizedPnl + row.position.income + row.unrealizedPnl),
          }
          : {}),
        allocationPct: denominator > 0 && row.marketValue !== undefined
          ? Math.max(0, Math.min(100, (row.marketValue / denominator) * 100))
          : 0,
        valuationQuality: row.valuationQuality,
      }))
      .sort((left, right) => (right.marketValue ?? 0) - (left.marketValue ?? 0)),
  );

  // A portfolio is no fresher than its oldest priced component. Unpriced
  // rows do not get to move the aggregate timestamp backwards or forwards.
  const asOfISO = rows
    .filter((row) => row.marketValue !== undefined)
    .map((row) => row.quote?.asOfISO)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(0) ?? new Date().toISOString();

  return Object.freeze({
    asOfISO,
    investedValue,
    marketValue,
    unrealizedPnl,
    valuationQuality: overallQuality(holdings.map((holding) => holding.valuationQuality)),
    pricedCoveragePct: Math.round(pricedCoveragePct * 100) / 100,
    holdings,
    warnings: Object.freeze([...new Set(warnings)]),
  });
}
