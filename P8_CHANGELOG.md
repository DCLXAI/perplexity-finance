# P8 Goal Contribution Planning

**Version 1.9.0 · 2026-07-14**

## Added

- One versioned goal per portfolio with target amount/date, explicit expected-return assumption, monthly contribution, contribution day, pause/resume/verified completion/archive, and a live progress projection.
- Deterministic cent-safe contribution allocation that reserves the `CASH` target, buys only underweight assets, honors minimum order value, and never suggests a sale.
- Persisted manual and scheduled contribution plans with goal, policy, portfolio, valuation, price provenance, and allocation snapshots.
- Shared cross-kind open-plan protection so a P7 rebalance and P8 contribution cannot be approved concurrently for one portfolio.
- Audited pending, approved, completed, rejected, and expired workflow with idempotent mutations.
- Atomic deposit-first ledger completion followed by user-entered buy fills and immutable transaction links.
- Goal and contribution UI with projection disclosure, immutable historical goal evidence, plan-versus-actual results, residual drift, and actual deposit/fill entry.

## Safety boundary

- Projection output is an assumption-based scenario, not a guarantee; inflation and taxes are not modeled.
- Approval writes no ledger rows. Completion revalidates goal/policy/ledger versions, expiry, verified price freshness, minimum order, and a 3% price movement limit.
- Suggested and actual purchases cannot exceed the frozen contribution amount. Existing cash cannot subsidize the plan.
- P8 never initiates a bank transfer, stores broker credentials, or submits an order.

## Scheduling

The existing Vercel Hobby daily-maintenance Cron scans a bounded fair batch of due goals before P7 drift monitoring. Fairness rotates first by the last scan attempt, verified funded goals become completed, and overdue goals cannot monopolize the queue. A unique goal/date cycle and database advisory locks prevent duplicate plans, and no third Cron slot is used.

## Database

Apply `supabase/migrations/202607140001_p8_goal_contributions.sql` after P7. It adds goal persistence, contribution metadata to the durable investment-plan tables, goal/version RPCs, scheduled-cycle deduplication, and atomic deposit/fill completion.
