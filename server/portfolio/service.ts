import { ApiError } from '../http/function.js';
import { catalogQuote } from '../market/catalog.js';
import { getMarketHistory, getMarketQuotes } from '../market/service.js';
import { logger } from '../observability/logger.js';
import { engine } from '../../src/data/engine.js';
import { SECTOR_BY_ID } from '../../src/data/universe.js';
import { buildPortfolioLedger, PortfolioLedgerError } from '../../src/domain/portfolio/ledger.js';
import { computePortfolioRisk, type PortfolioHistorySeries } from '../../src/domain/portfolio/risk.js';
import { valuePortfolioPositions, type PortfolioAssetDescriptor } from '../../src/domain/portfolio/valuation.js';
import type {
  DataProvenance,
  MarketQuotesResponse,
  PortfolioRiskMetrics,
  PortfolioSummary,
  RemoteCandle,
} from '../../src/shared/api.js';
import { getPortfolio, listPortfolioTransactions } from './store.js';

const MAX_RISK_POSITIONS = 25;

function assetDescriptor(symbol: string): PortfolioAssetDescriptor {
  const quote = catalogQuote(symbol);
  if (!quote) return Object.freeze({ symbol, name: symbol, assetKind: 'stock' });
  return Object.freeze({
    symbol,
    name: quote.nameKo ?? quote.name,
    ...(quote.sectorId ? { sector: SECTOR_BY_ID[quote.sectorId].nameKo } : {}),
    assetKind: quote.kind,
  });
}

function fallbackHistory(symbol: string): PortfolioHistorySeries | null {
  const quote = engine.getQuote(symbol);
  if (!quote) return null;
  const candles = engine.getHistory(symbol, '1Y');
  if (!candles.length) return null;
  const provenance: DataProvenance = Object.freeze({
    ...quote.provenance,
    note: '외부 1년 히스토리를 사용할 수 없어 결정론적 로컬 시계열을 사용했습니다.',
  });
  return Object.freeze({
    symbol,
    candles: Object.freeze(candles.map((candle): RemoteCandle => Object.freeze({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    }))),
    provenance,
  });
}

async function historySeries(symbol: string, requestId: string): Promise<PortfolioHistorySeries | null> {
  try {
    const history = await getMarketHistory(symbol, '1Y', `${requestId}:risk:${symbol}`);
    if (history.candles.length) {
      return Object.freeze({ symbol, candles: history.candles, provenance: history.provenance });
    }
  } catch {
    // Risk is best-effort. Valuation remains available when history providers fail.
  }
  return fallbackHistory(symbol);
}

function emptyRisk(pricedCoveragePct: number): PortfolioRiskMetrics {
  return Object.freeze({
    status: 'insufficient-data',
    dataQuality: 'synthetic',
    observations: 0,
    concentrationHhi: 0,
    effectiveHoldings: 0,
    topHoldingPct: 0,
    pricedCoveragePct,
    warnings: Object.freeze(['열린 포지션이 없어 역사적 리스크를 계산하지 않았습니다.']),
  });
}

export interface PortfolioSummaryOptions {
  readonly includeRisk?: boolean;
}

export async function buildPortfolioSummary(
  userId: string,
  portfolioId: string,
  requestId: string,
  options: PortfolioSummaryOptions = {},
): Promise<PortfolioSummary> {
  const portfolio = await getPortfolio(userId, portfolioId);
  if (!portfolio) throw new ApiError(404, 'PORTFOLIO_NOT_FOUND', '포트폴리오를 찾을 수 없습니다.');
  let transactions;
  try {
    transactions = await listPortfolioTransactions(userId, portfolioId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ledger exceeds supported limit/i.test(message)) {
      throw new ApiError(409, 'PORTFOLIO_LEDGER_LIMIT', '포트폴리오 원장이 지원 한도를 초과했습니다. 새 포트폴리오로 이전해야 합니다.');
    }
    if (/ledger changed during reconstruction/i.test(message)) {
      throw new ApiError(409, 'PORTFOLIO_LEDGER_CHANGED', '원장을 읽는 동안 변경이 발생했습니다. 다시 시도하세요.');
    }
    throw error;
  }

  let ledger;
  try {
    ledger = buildPortfolioLedger(transactions);
  } catch (error) {
    if (error instanceof PortfolioLedgerError) {
      throw new ApiError(409, 'PORTFOLIO_LEDGER_INVALID', error.message);
    }
    throw error;
  }

  const symbols = ledger.positions.map((position) => position.symbol);
  let quoteResponse: MarketQuotesResponse | null = null;
  let quoteFailureWarning: string | undefined;
  if (symbols.length) {
    try {
      quoteResponse = await getMarketQuotes(symbols, `${requestId}:valuation`);
    } catch (error) {
      quoteFailureWarning = '시장 시세를 사용할 수 없어 원장은 유지하되 보유자산을 미평가 상태로 표시합니다.';
      logger.warn('portfolio.valuation_unavailable', {
        requestId,
        portfolioId,
        symbolCount: symbols.length,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const quotes = new Map((quoteResponse?.quotes ?? []).map((quote) => [quote.symbol, quote]));
  const assets = new Map(symbols.map((symbol) => [symbol, assetDescriptor(symbol)]));
  const valuation = valuePortfolioPositions(ledger.positions, quotes, assets);
  const totalValue = Math.round((ledger.cashBalance + valuation.marketValue) * 100) / 100;
  const totalReturn = Math.round((totalValue - ledger.netContributions) * 100) / 100;

  let risk = emptyRisk(valuation.pricedCoveragePct);
  if (options.includeRisk !== false && valuation.holdings.length) {
    const selected = valuation.holdings
      .filter((holding) => holding.marketValue !== undefined)
      .slice(0, MAX_RISK_POSITIONS);
    const histories = (await Promise.all(selected.map((holding) => historySeries(holding.symbol, requestId))))
      .filter((series): series is PortfolioHistorySeries => series !== null);
    risk = computePortfolioRisk(valuation.holdings, histories, valuation.marketValue);
  }

  const warnings = [
    ...ledger.warnings,
    ...valuation.warnings,
    ...(quoteFailureWarning ? [quoteFailureWarning] : []),
    ...(quoteResponse?.warnings ?? []),
    ...risk.warnings,
  ];
  if (symbols.length > MAX_RISK_POSITIONS) warnings.push(`리스크 계산은 시장가치 상위 ${MAX_RISK_POSITIONS}개 포지션으로 제한됩니다.`);

  return Object.freeze({
    portfolio,
    generatedAt: new Date().toISOString(),
    asOfISO: valuation.asOfISO,
    transactionCount: transactions.length,
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
    ...(ledger.netContributions > 0
      ? { totalReturnPct: Math.round((totalReturn / ledger.netContributions) * 10_000) / 100 }
      : {}),
    valuationQuality: valuation.valuationQuality,
    holdings: valuation.holdings,
    risk,
    warnings: Object.freeze([...new Set(warnings)]),
  });
}
