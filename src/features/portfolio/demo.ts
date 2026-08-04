import { engine } from '@/data/engine';
import { SECTOR_BY_ID } from '@/data/universe';
import { buildPortfolioLedger } from '@/domain/portfolio/ledger';
import { computePortfolioRisk } from '@/domain/portfolio/risk';
import { valuePortfolioPositions, type PortfolioAssetDescriptor } from '@/domain/portfolio/valuation';
import type {
  HistoryResponse,
  PortfolioAllocationPolicy,
  PortfolioRecord,
  PortfolioSnapshot,
  PortfolioSummary,
  PortfolioTransaction,
  RemoteCandle,
  RemoteQuotePatch,
} from '@/shared/api';

const portfolio: PortfolioRecord = Object.freeze({
  id: 'demo-portfolio',
  name: 'P4 데모 포트폴리오',
  baseCurrency: 'USD',
  status: 'active',
  createdAt: '2026-01-02T14:30:00.000Z',
  updatedAt: '2026-07-12T06:00:00.000Z',
});

export const DEMO_ALLOCATION_POLICY: PortfolioAllocationPolicy = Object.freeze({
  portfolioId: portfolio.id,
  driftThresholdPct: 5,
  minTradeValue: 500,
  emailEnabled: false,
  pushEnabled: false,
  costPolicy: Object.freeze({
    commissionFixedUsd: 0,
    commissionBps: 0,
    buySlippageBps: 5,
    sellSlippageBps: 5,
    sellTransactionTaxBps: 0,
    capitalGainsTaxPct: 0,
    maxCostPct: 2,
    taxLotMethod: 'fifo',
  }),
  targets: Object.freeze([
    Object.freeze({ symbol: 'NVDA', targetPct: 25 }),
    Object.freeze({ symbol: 'AMD', targetPct: 20 }),
    Object.freeze({ symbol: 'MSFT', targetPct: 25 }),
    Object.freeze({ symbol: 'BTCUSD', targetPct: 25 }),
    Object.freeze({ symbol: 'CASH', targetPct: 5 }),
  ]),
  updatedAt: '2026-07-13T00:00:00.000Z',
});

function transaction(
  id: string,
  kind: PortfolioTransaction['kind'],
  tradeAt: string,
  values: Partial<PortfolioTransaction>,
): PortfolioTransaction {
  return Object.freeze({
    id,
    portfolioId: portfolio.id,
    kind,
    quantity: 0,
    price: 0,
    cashAmount: 0,
    fees: 0,
    tradeAt,
    createdAt: tradeAt,
    ...values,
  });
}

export const DEMO_TRANSACTIONS: readonly PortfolioTransaction[] = Object.freeze([
  transaction('demo-01', 'deposit', '2026-01-02T14:30:00.000Z', { cashAmount: 200_000, note: '초기 운용자금' }),
  transaction('demo-02', 'buy', '2026-01-05T15:00:00.000Z', { symbol: 'NVDA', quantity: 200, price: 140, fees: 4 }),
  transaction('demo-03', 'buy', '2026-01-06T15:00:00.000Z', { symbol: 'AMD', quantity: 120, price: 180, fees: 4 }),
  transaction('demo-04', 'buy', '2026-02-02T15:00:00.000Z', { symbol: 'MSFT', quantity: 100, price: 430, fees: 4 }),
  transaction('demo-05', 'buy', '2026-02-08T12:00:00.000Z', { symbol: 'BTCUSD', quantity: 0.8, price: 70_000, fees: 20 }),
  transaction('demo-06', 'sell', '2026-05-04T15:00:00.000Z', { symbol: 'NVDA', quantity: 40, price: 200, fees: 4 }),
  transaction('demo-07', 'dividend', '2026-06-12T15:00:00.000Z', { symbol: 'MSFT', cashAmount: 75 }),
  transaction('demo-08', 'fee', '2026-07-01T15:00:00.000Z', { cashAmount: 120, note: '데모 계좌 관리비' }),
]);

function remoteQuote(symbol: string): RemoteQuotePatch | null {
  const quote = engine.getQuote(symbol);
  if (!quote) return null;
  const active = quote.kind === 'crypto' ? quote.sessions.continuous : quote.sessions.regular;
  return Object.freeze({
    symbol,
    price: quote.price,
    prevClose: quote.prevClose,
    open: quote.open,
    high: quote.dayHigh,
    low: quote.dayLow,
    volume: quote.volume,
    ...(quote.marketCap !== undefined ? { marketCap: quote.marketCap } : {}),
    asOfISO: active?.asOfISO ?? quote.provenance.providerTimestamp,
    session: quote.kind === 'crypto' ? 'continuous' : 'regular',
    sessionStatus: quote.kind === 'crypto' ? 'open' : 'closed',
    provenance: quote.provenance,
  });
}

export function buildDemoPortfolioSummary(): PortfolioSummary {
  const ledger = buildPortfolioLedger(DEMO_TRANSACTIONS);
  const quotes = new Map<string, RemoteQuotePatch>();
  const assets = new Map<string, PortfolioAssetDescriptor>();
  for (const position of ledger.positions) {
    const quote = engine.getQuote(position.symbol);
    const patch = remoteQuote(position.symbol);
    if (patch) quotes.set(position.symbol, patch);
    assets.set(position.symbol, Object.freeze({
      symbol: position.symbol,
      name: quote?.nameKo ?? quote?.name ?? position.symbol,
      ...(quote?.sectorId ? { sector: SECTOR_BY_ID[quote.sectorId].nameKo } : {}),
      assetKind: quote?.kind ?? 'stock',
    }));
  }
  const valuation = valuePortfolioPositions(ledger.positions, quotes, assets);
  const histories = ledger.positions.flatMap((position) => {
    const quote = engine.getQuote(position.symbol);
    if (!quote) return [];
    const candles: readonly RemoteCandle[] = Object.freeze(engine.getHistory(position.symbol, '1Y').map((candle) => Object.freeze({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    })));
    return [{ symbol: position.symbol, candles, provenance: quote.provenance }];
  });
  const risk = computePortfolioRisk(valuation.holdings, histories, valuation.marketValue);
  const totalValue = Math.round((ledger.cashBalance + valuation.marketValue) * 100) / 100;
  const totalReturn = Math.round((totalValue - ledger.netContributions) * 100) / 100;
  return Object.freeze({
    portfolio,
    generatedAt: new Date().toISOString(),
    asOfISO: valuation.asOfISO,
    transactionCount: DEMO_TRANSACTIONS.length,
    cashBalance: ledger.cashBalance,
    netContributions: ledger.netContributions,
    investedValue: valuation.investedValue,
    marketValue: valuation.marketValue,
    totalValue,
    realizedPnl: ledger.realizedPnl,
    unrealizedPnl: valuation.unrealizedPnl,
    income: ledger.income,
    feesPaid: ledger.feesPaid,
    totalReturn,
    totalReturnPct: Math.round((totalReturn / ledger.netContributions) * 10_000) / 100,
    valuationQuality: valuation.valuationQuality,
    holdings: valuation.holdings,
    risk,
    warnings: Object.freeze([...new Set([...ledger.warnings, ...valuation.warnings, ...risk.warnings])]),
  });
}


export function buildDemoPortfolioSnapshots(summary: PortfolioSummary): readonly PortfolioSnapshot[] {
  const dates = [
    '2026-01-09T21:00:00.000Z', '2026-01-23T21:00:00.000Z', '2026-02-06T21:00:00.000Z',
    '2026-02-20T21:00:00.000Z', '2026-03-06T21:00:00.000Z', '2026-03-20T20:00:00.000Z',
    '2026-04-03T20:00:00.000Z', '2026-04-17T20:00:00.000Z', '2026-05-01T20:00:00.000Z',
    '2026-05-15T20:00:00.000Z', '2026-05-29T20:00:00.000Z', '2026-06-12T20:00:00.000Z',
    '2026-06-26T20:00:00.000Z', '2026-07-10T20:00:00.000Z',
  ] as const;
  const start = 200_000;
  const end = summary.totalValue;
  return Object.freeze(dates.map((capturedAt, index): PortfolioSnapshot => {
    const progress = index / (dates.length - 1);
    const wobble = Math.sin(index * 1.37) * 0.035 * start * (1 - progress * 0.35);
    const totalValue = index === dates.length - 1
      ? end
      : Math.round((start + (end - start) * progress + wobble) * 100) / 100;
    const cashBalance = Math.max(0, Math.min(totalValue, summary.cashBalance + (1 - progress) * 8_000));
    return Object.freeze({
      id: `demo-snapshot-${index + 1}`,
      portfolioId: summary.portfolio.id,
      capturedAt,
      asOfISO: capturedAt,
      totalValue,
      cashBalance: Math.round(cashBalance * 100) / 100,
      marketValue: Math.round((totalValue - cashBalance) * 100) / 100,
      netContributions: summary.netContributions,
      totalReturn: Math.round((totalValue - summary.netContributions) * 100) / 100,
      valuationQuality: 'estimated',
    });
  }));
}

export function buildDemoBenchmarkHistory(symbol: string): HistoryResponse {
  const quote = engine.getQuote(symbol);
  const candles: readonly RemoteCandle[] = Object.freeze(engine.getHistory(symbol, '1Y').map((candle) => Object.freeze({
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  })));
  const asOfISO = quote?.provenance.providerTimestamp ?? new Date().toISOString();
  const provenance = quote?.provenance ?? Object.freeze({
    source: 'local-simulation' as const,
    sourceLabel: 'P5 deterministic benchmark',
    mode: 'mock' as const,
    quality: 'synthetic' as const,
    providerTimestamp: asOfISO,
    ingestedAt: new Date().toISOString(),
    feed: 'deterministic-local',
  });
  return Object.freeze({
    requestId: `demo-benchmark-${symbol.toLowerCase()}`,
    symbol,
    range: '1Y',
    candles,
    provenance,
    warning: '데모 벤치마크는 결정론적 합성 시계열이며 실제 투자 성과 검증에 사용할 수 없습니다.',
  });
}
