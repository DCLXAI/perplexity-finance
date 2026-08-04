# P5 Performance Intelligence

**Version 1.6.0 · 2026-07-12**

## Added

- Cash-flow-adjusted linked time-weighted return (TWR) from portfolio snapshots.
- Annualized TWR and investor money-weighted return (XIRR).
- SPY, QQQ, and BTCUSD benchmark selection with aligned-period return and excess return.
- Benchmark provenance and synthetic/stale-data warnings.
- Portfolio value decomposition into net contributions, price P&L, income, fees, and total value.
- Deterministic benchmark history for explicitly labelled local demo mode.
- Domain regression tests and the `npm run validate:p5` release contract.

## Data and calculation notes

- External cash flows are inferred from changes in snapshot `netContributions` and applied at snapshot boundaries.
- Reversed deposits and withdrawals are excluded from XIRR.
- Benchmark closes are aligned at or before each portfolio snapshot timestamp.
- P5 reuses the P4 append-only ledger and snapshot schema; no new Supabase migration is required.

## Deployment status

Source validation is independent of deployment. The existing Vercel Hobby cron-frequency limitation still needs to be resolved before production deployment: upgrade the plan or reduce the configured cron count/frequency.
