# P4 Changelog — Portfolio Intelligence

**Version 1.5.0 · 2026-07-12**

## Product surface

- Added `/#/portfolio` as a lazy-loaded, responsive portfolio workspace.
- Added a deterministic signed-out demo that is visibly labelled synthetic.
- Added cloud portfolios, transaction entry, latest-transaction reversal, portfolio archival, refresh, and 60-second reconciliation.
- Added holdings, cash, net contributions, realized and unrealized P&L, income, fees, total return, allocations, and data-quality warnings.
- Added historical volatility, one-day 95% VaR/CVaR, maximum drawdown, concentration HHI, effective holdings, and risk coverage.
- Added portfolio stress scenarios by whole portfolio, symbol, sector, or asset kind.
- Added a structured investment-thesis ledger with bull case, bear case, catalysts, invalidation conditions, target price, confidence, and lifecycle status.
- Added verified-value snapshot history and an accessible source table.

## Accounting and valuation

- Added an append-only transaction domain with deposit, withdrawal, buy, sell, dividend, fee, and reversal rows.
- Added deterministic FIFO tax-lot reconstruction.
- Added oversell rejection and negative-cash disclosure.
- Added provider-aware valuation states: `verified`, `mixed`, `estimated`, and `unpriced`.
- Prevented synthetic or degraded valuations from entering strict scheduled snapshots.
- Preserved per-holding provenance instead of flattening the portfolio into one unsupported timestamp.

## Server and database

- Added authenticated APIs for portfolios, transactions, summaries, snapshots, stress scenarios, and research.
- Added `202607120004_p4_portfolio_intelligence.sql`.
- Added RLS-protected `portfolios`, `portfolio_transactions`, `portfolio_snapshots`, and `investment_theses` tables.
- Revoked direct transaction mutation from both authenticated users and the service role. Transactions are written only through security-definer append/reversal RPCs.
- Added user-scoped advisory locking around idempotency keys so concurrent serverless retries replay instead of double-posting.
- Restricted reversal to the latest active transaction, preserving deterministic ledger reconstruction.
- Rejected backdated inserts behind later active events so SQL cash/position checks cannot diverge from chronological FIFO replay.
- Added a fair snapshot cursor so a bounded Cron batch does not repeatedly select the same portfolios.
- Added a 15-minute `snapshot-portfolios` Vercel Cron protected by `CRON_SECRET`.
- Made snapshot buckets first-write-wins and changed bounded history reads to select the latest rows before returning chronological output.

## Quality gates

- Added P4 unit tests for FIFO accounting, reversal, oversell rejection, valuation quality, historical risk, and scenario calculation.
- Added `scripts/validate-p4.ts` and expanded migration validation.
- Expanded post-deployment smoke coverage for the P4 Cron and authenticated portfolio boundary.
- Updated runtime capabilities and document metadata for portfolio ledger, risk, and research availability.
