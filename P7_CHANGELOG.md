# P7 Durable Rebalance Workflow

**Version 1.8.0 · 2026-07-14**

## Added

- Persisted rebalance runs with immutable decision-time prices, provenance, weights, drift, policy/portfolio versions, and suggested orders.
- Bounded fair daily drift monitoring with one-open-plan deduplication per portfolio.
- Audited pending, approved, completed, rejected, and expired lifecycle states.
- Separate durable email and Web Push delivery queue with opt-in allocation-policy settings and plan deep links.
- User-entered actual fills linked to append-only portfolio transactions through one atomic completion RPC.
- Planned-versus-actual fill data and retained `execution_reversed` audit evidence when a linked ledger transaction is later reversed.
- Release validation through `npm run validate:p7` and expanded migration-contract validation.

## Safety boundary

- Approval has no ledger side effect.
- Generation, approval, and completion require verified, fresh valuation evidence and unchanged policy/ledger versions.
- Completion rechecks expiry, minimum order value, cash and positions, execution time, and a 3% reference-price movement limit.
- Any fill failure rolls back the whole completion transaction.
- P7 does not accept broker credentials or place orders automatically.

## Scheduling

The Vercel Hobby profile retains two daily Cron jobs. At 00:20 UTC, daily maintenance completes market capture and strict snapshots, scans a bounded fair portfolio batch, and then delivers newly queued rebalance notices. Minute-level monitoring requires Vercel Pro or an authenticated external scheduler.

## Database

Apply `supabase/migrations/202607130002_p7_rebalance_workflow.sql` after the P6 migration. It creates rebalance run, item, fill, audit-event, and delivery tables plus security-definer RPCs for creation, transitions, expiry, claims, and atomic completion.
