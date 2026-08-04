# P6 Target Allocation and Rebalancing

**Version 1.7.0 · 2026-07-13**

## Added

- Persistent per-portfolio target allocations with optional `CASH` target.
- Configurable drift threshold and minimum suggested trade value.
- Automatic drift detection across held, targeted, and cash positions.
- Review-only buy/sell values, estimated quantities, and estimated remaining cash.
- Atomic service-role-only Supabase RPC for policy replacement.
- Owner-scoped RLS reads and revoked direct authenticated mutations.
- Explicit demo policy with session-only editing.
- Domain regression tests and `npm run validate:p6` release validation.
- Vercel Hobby-compatible scheduling with two daily Cron jobs; market capture and portfolio snapshots are combined in daily maintenance.

## Safety boundary

P6 does not connect to a broker and never submits orders. Suggestions use current portfolio marks and exclude taxes, fees, slippage, lot constraints, and order-book liquidity. Users must review and record any resulting trades through the append-only portfolio ledger.

## Database

Apply `supabase/migrations/202607130001_p6_target_allocations.sql` before enabling cloud persistence. The migration creates `portfolio_allocation_policies`, `portfolio_allocation_targets`, their RLS policies, and the atomic `replace_portfolio_allocation_policy` RPC.
