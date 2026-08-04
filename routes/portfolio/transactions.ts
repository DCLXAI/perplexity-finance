import { z } from 'zod';
import { requireUser } from '../../server/auth/supabase.js';
import {
  ApiError,
  clientIp,
  json,
  readJson,
  requireIdempotencyKey,
  withFunction,
} from '../../server/http/function.js';
import { sanitizeSymbols } from '../../server/market/catalog.js';
import {
  appendPortfolioTransaction,
  getPortfolio,
  listPortfolioTransactions,
  reversePortfolioTransaction,
} from '../../server/portfolio/store.js';
import { enforceRateLimit } from '../../server/rate-limit.js';
import type {
  PortfolioTransactionMutationResponse,
  PortfolioTransactionsResponse,
} from '../../src/shared/api.js';

const common = {
  portfolioId: z.string().uuid(),
  tradeAt: z.string().datetime({ offset: true }),
  note: z.string().trim().max(500).optional(),
};
const transactionSchema = z.union([
  z.object({ action: z.literal('append'), kind: z.enum(['buy', 'sell']), ...common,
    symbol: z.string().min(1).max(20), quantity: z.number().positive().finite().max(1e12),
    price: z.number().positive().finite().max(1e12), fees: z.number().nonnegative().finite().max(1e9).default(0),
  }).strict(),
  z.object({ action: z.literal('append'), kind: z.enum(['deposit', 'withdrawal', 'fee']), ...common,
    cashAmount: z.number().positive().finite().max(1e15), symbol: z.string().min(1).max(20).optional(),
  }).strict(),
  z.object({ action: z.literal('append'), kind: z.literal('dividend'), ...common,
    cashAmount: z.number().positive().finite().max(1e15), symbol: z.string().min(1).max(20).optional(),
  }).strict(),
  z.object({ action: z.literal('reverse'), portfolioId: z.string().uuid(), transactionId: z.string().uuid(),
    note: z.string().trim().max(500).optional(),
  }).strict(),
]);

function mapStoreError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/insufficient cash/i.test(message)) throw new ApiError(409, 'INSUFFICIENT_CASH', '현금 잔액이 부족합니다.');
  if (/insufficient position/i.test(message)) throw new ApiError(409, 'INSUFFICIENT_POSITION', '보유 수량이 부족합니다.');
  if (/latest active transaction/i.test(message)) throw new ApiError(409, 'REVERSAL_ORDER_CONFLICT', '가장 최근의 활성 거래만 역분개할 수 있습니다.');
  if (/trade time precedes latest active transaction/i.test(message)) throw new ApiError(409, 'TRANSACTION_ORDER_CONFLICT', '거래는 원장 시간순으로 추가해야 합니다. 가장 최근 거래 이후 시각을 사용하세요.');
  if (/ledger exceeds supported limit/i.test(message)) throw new ApiError(409, 'PORTFOLIO_LEDGER_LIMIT', '포트폴리오 원장이 지원 한도를 초과했습니다. 새 포트폴리오로 이전해야 합니다.');
  if (/ledger changed during reconstruction/i.test(message)) throw new ApiError(409, 'PORTFOLIO_LEDGER_CHANGED', '원장을 읽는 동안 변경이 발생했습니다. 다시 시도하세요.');
  if (/not found/i.test(message)) throw new ApiError(404, 'PORTFOLIO_TRANSACTION_NOT_FOUND', '포트폴리오 또는 거래를 찾을 수 없습니다.');
  throw error;
}

export default withFunction('portfolio.transactions', ['GET', 'POST'], async (request, requestId) => {
  const user = await requireUser(request);
  await enforceRateLimit('portfolio-transactions', `${user.id}:${clientIp(request)}`, 180, 60);

  if (request.method === 'POST') {
    const key = requireIdempotencyKey(request);
    if (key.toLowerCase().startsWith('p7:') || key.toLowerCase().startsWith('p8:')) {
      throw new ApiError(400, 'RESERVED_IDEMPOTENCY_KEY', 'p7:/p8: 접두사는 승인된 투자 계획의 원장 연결에만 사용됩니다.');
    }
    const input = transactionSchema.parse(await readJson<unknown>(request));
    try {
      let transaction;
      if (input.action === 'reverse') {
        transaction = await reversePortfolioTransaction(
          user.id,
          input.portfolioId,
          input.transactionId,
          key,
          input.note,
        );
      } else {
        const rawSymbol = 'symbol' in input ? input.symbol : undefined;
        const normalizedSymbol = rawSymbol ? sanitizeSymbols([rawSymbol], 1)[0] : undefined;
        if (rawSymbol && !normalizedSymbol) throw new ApiError(400, 'UNKNOWN_SYMBOL', '지원하지 않는 심볼입니다.');
        transaction = await appendPortfolioTransaction(user.id, input.portfolioId, key, {
          kind: input.kind,
          ...(normalizedSymbol ? { symbol: normalizedSymbol } : {}),
          quantity: 'quantity' in input ? input.quantity : 0,
          price: 'price' in input ? input.price : 0,
          cashAmount: 'cashAmount' in input ? input.cashAmount : 0,
          fees: 'fees' in input ? input.fees : 0,
          tradeAt: input.tradeAt,
          ...(input.note ? { note: input.note } : {}),
        });
      }
      const response: PortfolioTransactionMutationResponse = Object.freeze({ requestId, transaction });
      return json(response, { status: 201 }, requestId);
    } catch (error) {
      return mapStoreError(error);
    }
  }

  const portfolioId = z.string().uuid().parse(new URL(request.url).searchParams.get('portfolioId'));
  const portfolio = await getPortfolio(user.id, portfolioId);
  if (!portfolio) throw new ApiError(404, 'PORTFOLIO_NOT_FOUND', '포트폴리오를 찾을 수 없습니다.');
  let transactions;
  try {
    transactions = await listPortfolioTransactions(user.id, portfolioId);
  } catch (error) {
    return mapStoreError(error);
  }
  const response: PortfolioTransactionsResponse = Object.freeze({
    requestId,
    portfolio,
    transactions,
    generatedAt: new Date().toISOString(),
  });
  return json(response, {}, requestId);
});
