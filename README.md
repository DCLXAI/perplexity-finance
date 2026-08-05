# Synapsu — P10 Rule-Based Portfolio Monitoring

**Version 1.11.0 · 2026-08-05**

Synapsu is a Vite/React financial terminal with explicit provider provenance, durable alerts, an operations control plane, and an append-only personal investment decision ledger.

P10 adds structured monitor rules over investment theses, risk thresholds, and stress scenarios, evaluated against the same provider-quality data the rest of the product uses, with a transition-latched digest so a breach is reported once, not on every scan.

P9 extends the P7/P8 review workflow with deterministic order optimization that accounts for configured commissions, estimated slippage, sell transaction tax, FIFO capital-gains tax, and a maximum acceptable cost ratio. These values are planning estimates, not tax advice or proof of tax payment.

```text
transaction evidence
  → immutable portfolio ledger
  → FIFO lots and cash reconstruction
  → provider-quality valuation
  → risk and scenario analysis
  → investment thesis and invalidation record
  → verified periodic snapshots
  → cash-flow-adjusted TWR and XIRR
  → SPY, QQQ, and BTC benchmark comparison
  → return decomposition and excess return
  → drift-aware target allocation
  → reviewed buy/sell suggestions without automatic broker execution
  → immutable decision-time price and allocation snapshots
  → approval, rejection, expiry, and completion audit history
  → user-entered fills linked atomically to the transaction ledger
  → structured monitor rules evaluated against the shared observation
  → armed/latched breach detection with per-user digest notification
```

## Runtime modes

### Provider-backed cloud mode

With Supabase and market providers configured, the application supports:

- authenticated cloud portfolios
- append-only transaction RPCs
- provider-backed valuation
- historical risk analytics
- strict periodic snapshots
- structured investment theses
- durable price alerts
- financial AI tools
- public status and role-gated operations screens

### Explicit local demonstration

Without cloud credentials, `/#/portfolio` shows a deterministic demo. It is labelled `DEMO · 합성 시세`; it is not an account, brokerage statement, verified return, or investment recommendation.

Synthetic, stale, divergent, or degraded market data is never promoted to verified data. It may be displayed as an estimated value with warnings, but it cannot create a strict snapshot or trigger a durable alert.

## P10 capabilities

Each portfolio can hold monitor rules of three kinds: thesis invalidation (price, drawdown-from-entry, allocation weight, or days without a verified price, scoped to one held symbol), risk threshold (any P4 risk metric compared above or below a value), and stress scenario (projected loss from the existing P4 shock model). Every rule spec is validated against a `.strict()` Zod schema on the server and re-validated inside the security-definer RPC that stores it, so a malformed shape can never reach the evaluator.

Evaluation runs on one shared observation per portfolio — the same `buildPortfolioSummary` call `snapshot-portfolios` already makes — so a rule can never see input of different quality than a strict snapshot would use. Each rule kind gates on its own scope rather than the whole portfolio: a thesis rule defers only when its watched holding is unverified, a risk rule defers only when the risk history itself is unverified, and a stress rule defers when the portfolio valuation is unverified. This is deliberate — a portfolio-wide gate would let one unrelated stale position blind every thesis rule in the portfolio.

A rule is `armed` or `latched`. It notifies only on the `armed → latched` transition and stays silent on every subsequent breach until it evaluates false again and re-arms. Breaches for one user in one run collapse into a single digest, delivered through the existing email/Web Push queue. A monitor never places an order, never transitions `investment_theses.status`, and never writes to the ledger — it only notifies. Configured thresholds are user assumptions for planning, not investment advice.

Monitor-rule mutations are not idempotent: unlike contributions and rebalances there is no replay store, and `monitor_rules` carries no unique constraint, so a client retry after a timeout can create a duplicate rule — the same alert in every digest until the user deletes it. The Hobby profile scans once per day inside daily maintenance; stress rules default to a 168-hour interval, thesis and risk rules to 24 hours. Each run is bounded by a deadline derived from the remaining function budget, so monitoring can be skipped for a day under load — a skipped rule simply stays due for the next run.

## P9 capabilities

The allocation policy now carries one cost policy shared by rebalance and contribution planning: fixed and basis-point commission, buy/sell slippage, sell transaction tax, capital-gains tax, maximum order-cost percentage, and the canonical `FIFO` lot method. Defaults remain conservative and user-editable. Tax rates are user assumptions for planning only; the application does not determine legal tax liability.

The cent-safe optimizer processes sells before buys, reserves estimated taxes, preserves configured cash, reduces buys to fit their full estimated cash requirement, and converts below-minimum, unaffordable, incomplete-lot, or cost-inefficient candidates to explicit hold decisions. Contribution plans remain buy-only and cannot spend more than the frozen contribution after commission and slippage.

Every new plan freezes the cost policy, requested and optimized value, decision reason, estimated cost basis, FIFO lot slices, and commission/slippage/tax breakdown. At completion the server caps quantity at the approved estimate, rechecks prices and current FIFO evidence, and derives actual signed slippage and estimated tax from the user-entered price, quantity, and fee. Only the actual user-entered fee affects the append-only transaction ledger; estimated taxes remain visible reserves and are never marked paid automatically. P9 still does not place broker orders or initiate bank transfers.

## P8 capabilities

Each portfolio can hold one active or paused nominal-USD goal with a target amount, target date, explicit expected-return assumption, monthly contribution amount, and contribution day. The projection shows current progress, projected value, shortfall, and the monthly amount required by the stated assumptions; a goal can be completed only against a verified funded valuation. It is not a return guarantee and excludes inflation and taxes.

Every due contribution creates a reviewable buy-only plan from the verified portfolio value and the existing P6 target policy. New cash is reserved for the `CASH` target first, then directed to underweight assets without proposing a sale. Minimum-order leftovers remain explicit cash, and suggested purchases can never exceed the frozen contribution amount.

P7 and P8 share one open investment-plan lock per portfolio. Approval has no ledger effect. Completion records the frozen deposit first and then the user-entered fills in one database transaction, with price freshness, policy/goal/ledger versions, minimum order, and a 3% price-movement boundary rechecked. Historical runs keep their original goal assumptions and show plan-versus-actual cash and residual drift. The product never initiates a bank transfer or broker order.

The existing Hobby daily-maintenance Cron scans due contribution goals before drift rebalancing, so no additional Cron slot is consumed.

## P7 capabilities

Every generated rebalance plan preserves the decision-time prices, provenance, target weights, drift, policy and portfolio versions, and proposed orders. A portfolio can have only one open plan, preventing the daily monitor from creating duplicate pending or approved plans for the same drift.

Plans move through `pending → approved → completed`, or to `rejected`/`expired`. Approval does not write to the transaction ledger. Completion requires the user to enter every actual fill; one database transaction rechecks plan expiry, policy/ledger versions, minimum trade value, cash and position sufficiency, and a 3% price-movement limit before appending fills to the existing ledger. A larger movement requires a newly generated plan and approval.

Optional email and Web Push notifications use a durable retry queue and identify the largest drift, for example `NVDA 목표 대비 +7.2%p 초과`. They link back to the persisted plan and explicitly state that no broker order was placed. The Vercel Hobby profile scans once per day; minute-level monitoring requires Pro or an authenticated external scheduler.

## P6 capabilities

Each cloud portfolio can persist a target allocation policy containing up to 50 uppercase asset symbols, including the reserved `CASH` target. Target percentages must total 100%. The policy also stores a drift threshold and minimum suggested trade value.

The P6 engine compares current marked value with the target value for every held and targeted asset. When maximum allocation drift breaches the threshold, it generates review-only buy and sell suggestions, estimated quantities, total buy/sell values, and estimated remaining cash. It does not connect to a broker or execute orders automatically.

Policy replacement runs through a service-role-only Supabase RPC under a locked portfolio row, so validation and replacement are atomic. Direct authenticated writes remain revoked and RLS limits reads to the portfolio owner.

## P5 capabilities

The portfolio performance panel links returns between verified value snapshots while removing changes in net contributions. It reports cumulative and annualized time-weighted return (TWR), investor money-weighted return (XIRR), selected benchmark return, and excess return over the same observed period.

Benchmark choices are SPY, QQQ, and BTCUSD. Live portfolios load their history through the public market-history API and expose provenance quality; local demo mode uses clearly labelled deterministic synthetic history. Cash-flow timing is approximated at snapshot boundaries, so the panel surfaces a warning whenever contributions changed between observations.

Current portfolio value is decomposed into net contributions, price P&L, income, and fees. P5 uses the existing append-only ledger and snapshot schema, so it requires no additional database migration.

## P4 capabilities

### Append-only portfolio ledger

Supported transaction kinds:

```text
deposit
withdrawal
buy
sell
dividend
fee
reversal
```

Saved transactions are not edited or deleted through the application. A correction is a new reversal row referencing the latest active transaction. New events are entered in chronological order; inserting an event behind a later active transaction is rejected. FIFO lots reconstruct open quantity, cost basis, average cost, and realized P&L from the complete event history.

The database boundary adds:

- RLS reads scoped to the authenticated user
- no direct authenticated transaction writes
- no direct service-role transaction insert/update/delete
- security-definer append and reversal RPCs
- user-scoped advisory locking for idempotent concurrent retries
- cash and position checks inside the same portfolio lock

### Provider-aware valuation

Each holding is classified as:

| State | Meaning |
|---|---|
| `verified` | Provider-backed, fresh/live-delayed-snapshot data accepted by the quality gate. |
| `estimated` | A numeric stale, degraded, fallback, or synthetic value is available but cannot be treated as verified. |
| `unpriced` | No usable positive price is available. |
| `mixed` | Portfolio holdings contain more than one quality class. |

The UI shows holding-level provenance and portfolio warnings. Unpriced holdings are excluded from market value rather than assigned a fabricated price.

### Risk analytics

P4 calculates from aligned daily return history:

- annualized historical volatility
- historical one-day 95% VaR
- historical one-day 95% CVaR
- maximum drawdown
- concentration HHI
- effective number of holdings
- largest holding weight
- priced/risk history coverage

Every result includes observation count and history quality. Fewer than 20 aligned observations returns `insufficient-data`; incomplete coverage returns warnings rather than false precision. The displayed cumulative percentage is a simple net-contribution ratio, not TWR, IRR, tax reporting, or a brokerage statement.

### Stress scenarios

Scenarios can target:

- all holdings
- one symbol
- a sector
- an asset kind

Matching shocks are additive, asset prices cannot fall below zero, and cash remains unchanged. These are deterministic sensitivity calculations—not forecasts or probabilities.

### Investment thesis ledger

Each thesis can record:

- symbol and title
- core claim
- bull and bear cases
- catalysts
- explicit invalidation condition
- target price
- confidence score
- watching, active, invalidated, realized, or archived state

The product intentionally emphasizes invalidation conditions so the research record can reveal when the original decision is no longer supported.

### Verified snapshot history

On the Vercel Hobby profile, the daily maintenance Cron inspects a fair bounded set of active portfolios. Pro deployments or an authenticated external scheduler may invoke the standalone snapshot route more frequently. `PORTFOLIO_SNAPSHOT_LIMIT` defaults to 8 and is capped at 20 so the 60-second function does not attempt unbounded provider work. A snapshot is written only when:

- all open holdings are provider-verified
- portfolio valuation quality is `verified`
- risk history is verified and `available` when holdings exist

Skipped portfolios remain visible through Cron counts and logs. A fairness cursor prevents the same first batch from starving later portfolios.

## Quick start

Requirements: Node.js 22.22 or newer.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Local services:

```text
Web  http://localhost:5602
API  http://localhost:5603
```

Quality gate:

```bash
npm run check
npm audit --audit-level=low
```

## Routes

### User interface

```text
/#/portfolio  Portfolio intelligence and research ledger
/#/status     Public system status
/#/ops        Role-gated operations console
```

### Authenticated portfolio API

```text
GET/POST/PATCH       /api/portfolios
GET/POST             /api/portfolio/transactions
GET                  /api/portfolio/summary
GET                  /api/portfolio/snapshots
GET/PUT              /api/portfolio/allocation
GET/POST             /api/portfolio/rebalances
GET/PUT/PATCH        /api/portfolio/goal
GET/POST             /api/portfolio/contributions
POST                 /api/portfolio/scenario
GET/POST/PATCH/DELETE /api/portfolio/monitor-rules
GET                  /api/portfolio/monitor-status
GET/POST/PATCH/DELETE /api/research
```

Transaction and rebalance mutation `POST` requests require an `Idempotency-Key` header. `/api/portfolio/monitor-rules` mutations deliberately do not: there is no replay store for monitor rules, so requiring an unhonoured header would be worse than not requiring one — see the safety-boundary note in `P10_CHANGELOG.md`.

### Machine-protected jobs

```text
GET /api/cron/evaluate-alerts       daily at 00:05 UTC
GET /api/cron/daily-maintenance     daily at 00:20 UTC
```

All Cron endpoints verify `Authorization: Bearer <CRON_SECRET>`. The Hobby deployment uses two daily schedules, the plan maximum. Daily maintenance runs market capture and portfolio snapshots, then performs the bounded rebalance scan and immediately drains its notification queue. The original task endpoints remain available for authenticated manual or external scheduling.

## Database migrations

Apply in order:

```text
202607120001_p2_cloud.sql
202607120002_p3_operations.sql
202607120003_p3_hardening.sql
202607120004_p4_portfolio_intelligence.sql
202607130001_p6_target_allocations.sql
202607130002_p7_rebalance_workflow.sql
202607140001_p8_goal_contributions.sql
202607140002_p9_order_cost_optimization.sql
202608050001_p10_monitor_rules.sql
```

The P10 migration adds `monitor_rules`, `monitor_digests`, `monitor_breaches`, and `monitor_digest_deliveries`, plus the security-definer RPCs that validate a rule spec, upsert/delete a rule, claim due rules with a lease, record an evaluation, and assemble/enqueue a digest. It is additive and applies after P9, before deploying version 1.11.0.

The P9 migration adds allocation cost assumptions, immutable plan/fill cost evidence, server-side JSON validation, FIFO snapshots, and cost-aware wrappers around both P7 and P8 creation/completion RPCs. Apply it after P8 before deploying version 1.10.0.

The P7 migration creates the durable run, immutable item snapshot, fill link, audit-event, and notification-delivery tables plus security-definer RPCs for generation, transitions, expiry, delivery claims, and atomic ledger completion. P8 extends those tables for goal contribution plans.

The P4 migration creates:

```text
portfolios
portfolio_transactions
portfolio_snapshots
investment_theses
append_portfolio_transaction(...)
reverse_latest_portfolio_transaction(...)
portfolio_current_cash(...)
portfolio_current_quantity(...)
```

## Strict production profile

```dotenv
ALLOW_MOCK_FALLBACK=false
REQUIRE_LIVE_DATA=true
REQUIRE_CLOUD=true
REQUIRE_DURABLE_ALERTS=true
REQUIRE_AI=true
PUBLIC_ORIGIN=https://finance.example.com
```

At minimum, configure independent `CRON_SECRET`, `METRICS_SECRET`, and `OPS_SECRET` values. The Supabase service-role key and provider secrets must never use a `VITE_` prefix.

## Validation commands

```bash
npm run typecheck:strict
npm run test
npm run test:contracts
npm run validate:data
npm run validate:p2
npm run validate:p3
npm run validate:p4
npm run validate:p5
npm run validate:p6
npm run validate:p7
npm run validate:p8
npm run validate:p9
npm run validate:p10
npm run validate:migrations
npm run build
npm run security:scan
npm audit --audit-level=low
```

Post-deployment:

```bash
SMOKE_BASE_URL=https://your-deployment.example \
SMOKE_EXPECT_VERSION=1.11.0 \
SMOKE_REQUIRE_READY=1 \
SMOKE_REQUIRE_PROVIDER=1 \
npm run smoke:deployment
```

See `DEPLOYMENT.md`, `CONTRACT.md`, `ARCHITECTURE.md`, `P10_CHANGELOG.md`, and `P9_CHANGELOG.md` for operational details and remaining credential-dependent acceptance tests.
