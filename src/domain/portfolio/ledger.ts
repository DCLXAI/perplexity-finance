import type { PortfolioLedgerPosition, PortfolioTransaction } from '../../shared/api.js';

const MONEY_SCALE = 100_000_000;
const QUANTITY_SCALE = 1_000_000_000_000;
const EPSILON = 1e-9;

function round(value: number, scale: number): number {
  return Math.round((value + Number.EPSILON) * scale) / scale;
}
function money(value: number): number {
  return round(value, MONEY_SCALE);
}
function quantity(value: number): number {
  return round(value, QUANTITY_SCALE);
}
function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new PortfolioLedgerError('INVALID_TRANSACTION', `${label}은 0보다 커야 합니다.`);
  return value;
}
function nonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new PortfolioLedgerError('INVALID_TRANSACTION', `${label}은 음수일 수 없습니다.`);
  return value;
}

export class PortfolioLedgerError extends Error {
  constructor(readonly code: 'INVALID_TRANSACTION' | 'INSUFFICIENT_POSITION', message: string) {
    super(message);
    this.name = 'PortfolioLedgerError';
  }
}

export interface PortfolioOpenFifoLot {
  readonly transactionId: string;
  readonly symbol: string;
  readonly acquiredAt: string;
  quantity: number;
  readonly unitCost: number;
}
interface Lot extends PortfolioOpenFifoLot {}
interface MutablePosition {
  readonly symbol: string;
  lots: Lot[];
  realizedPnl: number;
  income: number;
  feesPaid: number;
}

export interface PortfolioLedgerResult {
  readonly cashBalance: number;
  readonly netContributions: number;
  readonly realizedPnl: number;
  readonly income: number;
  readonly feesPaid: number;
  readonly activeTransactionCount: number;
  readonly positions: readonly PortfolioLedgerPosition[];
  readonly warnings: readonly string[];
}

interface PortfolioLedgerReplay {
  readonly cashBalance: number;
  readonly netContributions: number;
  readonly realizedPnl: number;
  readonly income: number;
  readonly feesPaid: number;
  readonly activeTransactionCount: number;
  readonly positions: ReadonlyMap<string, MutablePosition>;
  readonly warnings: readonly string[];
}

function transactionOrder(left: PortfolioTransaction, right: PortfolioTransaction): number {
  const trade = new Date(left.tradeAt).getTime() - new Date(right.tradeAt).getTime();
  if (trade !== 0) return trade;
  const created = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
  return created !== 0 ? created : left.id.localeCompare(right.id);
}

function mutablePosition(map: Map<string, MutablePosition>, symbol: string): MutablePosition {
  const existing = map.get(symbol);
  if (existing) return existing;
  const created: MutablePosition = { symbol, lots: [], realizedPnl: 0, income: 0, feesPaid: 0 };
  map.set(symbol, created);
  return created;
}

export function activePortfolioTransactions(transactions: readonly PortfolioTransaction[]): readonly PortfolioTransaction[] {
  const ids = new Set(transactions.map((transaction) => transaction.id));
  const reversed = new Set(
    transactions
      .filter((transaction) => transaction.kind === 'reversal' && transaction.reversalOf && ids.has(transaction.reversalOf))
      .map((transaction) => transaction.reversalOf as string),
  );
  return Object.freeze(
    transactions
      .filter((transaction) => transaction.kind !== 'reversal' && !reversed.has(transaction.id))
      .sort(transactionOrder),
  );
}

function sellLots(position: MutablePosition, requestedQuantity: number): number {
  const available = position.lots.reduce((sum, lot) => sum + lot.quantity, 0);
  if (requestedQuantity - available > EPSILON) {
    throw new PortfolioLedgerError(
      'INSUFFICIENT_POSITION',
      `${position.symbol} 매도 수량 ${requestedQuantity}이 보유 수량 ${quantity(available)}을 초과합니다.`,
    );
  }

  let remaining = requestedQuantity;
  let consumedCost = 0;
  while (remaining > EPSILON && position.lots.length) {
    const lot = position.lots[0];
    const consumed = Math.min(remaining, lot.quantity);
    consumedCost += consumed * lot.unitCost;
    lot.quantity = quantity(lot.quantity - consumed);
    remaining = quantity(remaining - consumed);
    if (lot.quantity <= EPSILON) position.lots.shift();
  }
  return money(consumedCost);
}

function replayPortfolioLedger(transactions: readonly PortfolioTransaction[]): PortfolioLedgerReplay {
  let cashBalance = 0;
  let netContributions = 0;
  let realizedPnl = 0;
  let income = 0;
  let feesPaid = 0;
  const warnings: string[] = [];
  const positions = new Map<string, MutablePosition>();
  const active = activePortfolioTransactions(transactions);

  for (const transaction of active) {
    const fees = nonNegative(transaction.fees, '수수료');
    switch (transaction.kind) {
      case 'deposit': {
        const amount = positive(transaction.cashAmount, '입금액');
        cashBalance = money(cashBalance + amount);
        netContributions = money(netContributions + amount);
        break;
      }
      case 'withdrawal': {
        const amount = positive(transaction.cashAmount, '출금액');
        cashBalance = money(cashBalance - amount);
        netContributions = money(netContributions - amount);
        break;
      }
      case 'buy': {
        if (!transaction.symbol) throw new PortfolioLedgerError('INVALID_TRANSACTION', '매수 거래에는 심볼이 필요합니다.');
        const bought = positive(transaction.quantity, '매수 수량');
        const price = positive(transaction.price, '매수가');
        const gross = money(bought * price);
        cashBalance = money(cashBalance - gross - fees);
        feesPaid = money(feesPaid + fees);
        const position = mutablePosition(positions, transaction.symbol);
        position.feesPaid = money(position.feesPaid + fees);
        position.lots.push({
          transactionId: transaction.id,
          symbol: transaction.symbol,
          acquiredAt: transaction.tradeAt,
          quantity: quantity(bought),
          unitCost: money((gross + fees) / bought),
        });
        break;
      }
      case 'sell': {
        if (!transaction.symbol) throw new PortfolioLedgerError('INVALID_TRANSACTION', '매도 거래에는 심볼이 필요합니다.');
        const sold = positive(transaction.quantity, '매도 수량');
        const price = positive(transaction.price, '매도가');
        const position = mutablePosition(positions, transaction.symbol);
        const cost = sellLots(position, sold);
        const proceeds = money(sold * price - fees);
        const pnl = money(proceeds - cost);
        cashBalance = money(cashBalance + proceeds);
        realizedPnl = money(realizedPnl + pnl);
        feesPaid = money(feesPaid + fees);
        position.realizedPnl = money(position.realizedPnl + pnl);
        position.feesPaid = money(position.feesPaid + fees);
        break;
      }
      case 'dividend': {
        const amount = positive(transaction.cashAmount, '배당금');
        cashBalance = money(cashBalance + amount);
        income = money(income + amount);
        if (transaction.symbol) {
          const position = mutablePosition(positions, transaction.symbol);
          position.income = money(position.income + amount);
        }
        break;
      }
      case 'fee': {
        const amount = positive(transaction.cashAmount, '비용');
        cashBalance = money(cashBalance - amount);
        feesPaid = money(feesPaid + amount);
        if (transaction.symbol) {
          const position = mutablePosition(positions, transaction.symbol);
          position.feesPaid = money(position.feesPaid + amount);
        }
        break;
      }
      case 'reversal':
        // Reversal rows are consumed by activeTransactions and never reach this branch.
        break;
    }
  }

  if (cashBalance < -EPSILON) warnings.push('현금 잔액이 음수입니다. 외부 계좌에서 가져온 거래라면 초기 입금 내역을 추가하세요.');

  return Object.freeze({
    cashBalance: money(cashBalance),
    netContributions: money(netContributions),
    realizedPnl: money(realizedPnl),
    income: money(income),
    feesPaid: money(feesPaid),
    activeTransactionCount: active.length,
    positions,
    warnings: Object.freeze(warnings),
  });
}

/**
 * Reconstructs the still-open FIFO acquisition lots from the append-only ledger.
 * The returned order is canonical by symbol and FIFO consumption order. Buy fees
 * are included in unit cost, exactly as they are in buildPortfolioLedger().
 */
export function buildPortfolioOpenFifoLots(
  transactions: readonly PortfolioTransaction[],
): readonly PortfolioOpenFifoLot[] {
  const replay = replayPortfolioLedger(transactions);
  return Object.freeze([...replay.positions.values()]
    .sort((left, right) => left.symbol.localeCompare(right.symbol))
    .flatMap((position) => position.lots.map((lot) => Object.freeze({
      transactionId: lot.transactionId,
      symbol: lot.symbol,
      acquiredAt: lot.acquiredAt,
      quantity: quantity(lot.quantity),
      unitCost: money(lot.unitCost),
    }))));
}

export function buildPortfolioLedger(transactions: readonly PortfolioTransaction[]): PortfolioLedgerResult {
  const replay = replayPortfolioLedger(transactions);
  const normalizedPositions = [...replay.positions.values()]
    .map((position): PortfolioLedgerPosition | null => {
      const openQuantity = quantity(position.lots.reduce((sum, lot) => sum + lot.quantity, 0));
      if (openQuantity <= EPSILON) return null;
      const costBasis = money(position.lots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0));
      return Object.freeze({
        symbol: position.symbol,
        quantity: openQuantity,
        costBasis,
        averageCost: openQuantity > 0 ? money(costBasis / openQuantity) : 0,
        realizedPnl: money(position.realizedPnl),
        income: money(position.income),
        feesPaid: money(position.feesPaid),
      });
    })
    .filter((position): position is PortfolioLedgerPosition => position !== null)
    .sort((left, right) => left.symbol.localeCompare(right.symbol));

  return Object.freeze({
    cashBalance: replay.cashBalance,
    netContributions: replay.netContributions,
    realizedPnl: replay.realizedPnl,
    income: replay.income,
    feesPaid: replay.feesPaid,
    activeTransactionCount: replay.activeTransactionCount,
    positions: Object.freeze(normalizedPositions),
    warnings: replay.warnings,
  });
}
