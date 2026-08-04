# P9 Cost-Aware Order Optimization

**Version 1.10.0 · 2026-07-14**

## Added

- One versioned cost policy shared by P7 rebalancing and P8 contribution planning: fixed and basis-point commission, side-specific slippage, sell transaction tax, capital-gains tax, maximum acceptable cost ratio, and canonical FIFO lots.
- A deterministic cent-safe optimizer that processes sells before buys, reserves estimated taxes, protects target cash, fits contribution purchases inside the full cost envelope, and records explicit skip/trim reasons.
- FIFO lot reconstruction and immutable per-sale lot slices, estimated basis, taxable gain, transaction tax, capital-gains tax, commission, slippage, total cost, and net cash effect.
- Immutable cost-policy and cost-model snapshots on each run, plus requested trade value and optimization decision on every item.
- Actual-fill cost evidence derived from user-entered quantity, price and fee, including signed execution slippage and refreshed FIFO tax estimates.
- Cost-policy editing and estimated/actual cost displays across rebalance and goal-contribution review and execution surfaces.
- Database validation and cost-aware wrappers for P7/P8 plan creation and completion while retaining legacy run compatibility.

## Optimization rules

- Estimated costs use conservative cent rounding; equal-priority orders are deterministic.
- Sells fund buys first. Estimated sell taxes remain reserved and cannot be spent by a later buy.
- Buy values shrink when commission or slippage would exceed available execution cash.
- Below-minimum, cash-limited, cost-inefficient, and incomplete-FIFO candidates remain explicit decisions instead of disappearing from the plan.
- A rejected order adds no cost to plan totals. Actual quantity cannot exceed the approved estimate.

## Safety boundary

- Configured tax rates and calculated liabilities are user-directed estimates, not legal or tax advice.
- Only actual user-entered fees affect ledger cash. Estimated transaction and capital-gains taxes are never marked paid or appended automatically.
- Approval still has no ledger effect. Completion retains the P7/P8 expiry, price, policy, goal, ledger, cash, position, idempotency, audit and atomicity checks.
- P9 does not store broker credentials, place orders, initiate transfers, select a jurisdiction, or remit tax.

## Database

Apply `supabase/migrations/202607140002_p9_order_cost_optimization.sql` after P8 and before deploying version 1.10.0. The migration is additive for stored evidence, keeps legacy runs readable through `cost_model_version = 0`, and preserves the public P7/P8 completion signatures through validated P9 wrappers.

Run:

```bash
npm run validate:p9
npm run validate:migrations
npm run check
```
