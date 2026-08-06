# Architecture — P10 Rule-Based Portfolio Monitoring

**Version 1.11.0 · 2026-08-05**

## 1. System shape

```text
React/Vite client
├─ market, crypto, earnings, predictions, screener
├─ authenticated watchlists and durable alerts
├─ AI answer panel
├─ public status page
└─ role-gated operations console
          │
          ▼
Vercel Functions API boundary
├─ request IDs, structured logs, rate limits
├─ same-origin mutation guard
├─ bearer-token or machine-secret authentication
├─ hardened response headers
└─ typed error responses
          │
          ├──────────────────────┐
          ▼                      ▼
Market resilience plane       Cloud/operations plane
├─ Alpaca primary            ├─ Supabase Auth/Postgres/RLS
├─ Finnhub equity fallback   ├─ watchlists and alerts
├─ Coinbase crypto fallback  ├─ observations and incidents
├─ circuit breakers          ├─ provider snapshots
├─ quality/reconciliation    ├─ idempotency and audit ledger
├─ last-known-good cache     └─ release-gate records
└─ deterministic fallback
          │
          ├──────────────────────┐
          ▼                      ▼
Delivery plane              AI tool plane
├─ leased alert evaluator   ├─ quote/history/news tools
├─ atomic crossing claim    ├─ earnings/prediction tools
├─ delivery queue           ├─ OpenAI Responses API
├─ Resend email             └─ evidence hash + fallback
└─ Web Push
```

## 2. Quote request lifecycle

### 2.1 Candidate collection

The market service builds an ordered provider plan by asset kind and `MARKET_PROVIDER_MODE`.

```text
Equity: Alpaca → Finnhub
Crypto: Alpaca → Coinbase
```

- `primary`: first configured provider only
- `failover`: stop when a valid provider result is accepted
- `quorum`: collect multiple candidates for reconciliation

Each provider call passes through a circuit breaker and provider registry.

### 2.2 Circuit breaker

Each provider has an independent state:

```text
closed → failure threshold reached → open
open → retry deadline reached → half-open
half-open → success → closed
half-open → failure → open
```

An open circuit prevents repeated calls to an already failing provider. State, consecutive failures, retry time, latency, and recent outcomes are exposed through provider status.

### 2.3 Quality validation

A candidate is rejected or degraded when it violates one of these contracts:

- unknown symbol
- non-finite or non-positive price
- invalid OHLC boundaries
- invalid or future-skewed provider timestamp
- data older than the asset-specific freshness threshold
- incompatible market session
- material cross-provider deviation
- required fields missing

In quorum mode, provider candidates are reconciled. The selected quote carries verification metadata including strategy, providers, deviation, freshness, and lineage.

### 2.4 Recovery order

```text
accepted provider quote
  └─ persist as last-known-good

provider failure or rejection
  → secondary provider
  → eligible last-known-good quote, marked stale when appropriate
  → explicit deterministic synthetic fallback, only when enabled
```

The service never converts synthetic data into provider quality. The UI receives the final provenance and displays the mode.

## 3. Provenance model

A quote contains more than a price. Its provenance identifies:

- source provider and human-readable label
- live, delayed, stale, fallback, or mixed mode
- provider timestamp and ingestion timestamp
- feed identifier
- quality classification
- verification strategy
- providers considered
- cross-provider deviation
- lineage ID
- alert eligibility

This makes a value auditable across UI, alerts, observations, AI tools, and incidents.

## 4. Cache hierarchy

P3 separates three concerns:

1. **request coalescing** — concurrent identical provider requests share one in-flight promise
2. **short response cache** — absorbs repeated UI polling
3. **last-known-good store** — preserves accepted provider observations for controlled failure recovery

`STALE_IF_ERROR_SECONDS` and `LAST_KNOWN_GOOD_SECONDS` are bounded. A stale value remains visibly stale and does not regain verified/live status merely because it was cached.

Upstash Redis is used when configured. A bounded process cache is the local and degraded fallback.

## 5. Provider observability

The in-process provider registry stores a rolling window of:

- attempts and successes
- latency samples
- freshness samples
- last success and failure
- consecutive failures
- current circuit state

The operations summary derives a 60-minute market SLO:

- availability
- p95 latency
- freshness pass rate
- error-budget remaining
- `healthy`, `at-risk`, `breached`, or `no-data`

Persistent provider snapshots are written by the market-capture Cron when Supabase is configured.

## 6. Readiness and release gating

`/api/health` answers whether the process is alive and describes capabilities.

`/api/ready` answers whether the configured release requirements are satisfied. A deployment may be healthy but not ready.

Readiness checks include:

- complete and valid environment configuration
- configured providers and recent successful probe
- required cloud account
- required durable alerts
- required AI tools
- persistent market ledger

The release gate combines readiness, provider SLO, unresolved critical data incidents, and delivery backlog. This gate is shared by the API, operations console, tests, and release-gate recording action so that there is no second contradictory implementation.

## 7. Durable alert lifecycle

```text
create alert
  → require provider-backed baseline
  → armed alert stored in Postgres
  → Cron claims due alerts fairly with a lease
  → grouped provider quote fetch
  → quality and alert-eligibility gate
  → directional threshold crossing
  → atomic trigger claim
  → idempotent delivery rows
  → email and/or Web Push delivery
  → retry or terminal failure
```

Key invariants:

- a synthetic or degraded quote cannot trigger an alert
- `above` means `previous < target && current >= target`
- `below` means `previous > target && current <= target`
- only one concurrent evaluator may own a lease
- only one trigger transition succeeds
- only one delivery exists for an alert/channel pair
- failed delivery attempts are bounded and auditable

## 8. Market observation capture

The five-minute capture job:

1. verifies `CRON_SECRET`
2. selects a bounded catalog slice
3. fetches quotes through the same resilience and quality path used by the product
4. accepts only eligible provider observations
5. persists observations, provider snapshots, incidents, and a heartbeat
6. returns accepted/rejected counts with a request ID

It does not bypass quality validation to create a deceptively complete ledger.

## 9. Operations control plane

### Public status

`/#/status` consumes public health and readiness endpoints and presents:

- process state
- readiness state
- version and release channel
- provider/capability summaries
- checks and warnings

It exposes no secrets or privileged mutations.

### Role-gated operations console

`/#/ops` is visible to Supabase users with `ops` or `admin` app metadata. The server still independently verifies authorization.

It presents:

- readiness and release gate
- provider and circuit state
- SLO and error budget
- alert/delivery/incident backlog
- open incidents
- privileged action controls

Supported actions:

- provider probe
- circuit reset
- failed-delivery retry
- operational retention pruning
- release-gate evaluation and record

Every action requires an `Idempotency-Key`. With Supabase enabled, action claims, results, and audit records are persistent.

## 10. Security model

- service-role, provider, AI, delivery, Cron, metrics, and operations secrets exist only in server code
- browser mutations require same-origin context
- machine secrets use timing-safe comparison
- API errors expose stable codes, not stack traces
- structured logs redact credential and PII-shaped fields
- operations mutations are authenticated, authorized, idempotent, and audited
- Supabase RLS protects user-facing data; privileged mutations remain server-only
- CI scans source and built assets for unsafe HTML, browser-exposed secrets, insecure external links, and forbidden environment files

## 11. Why P3 does not add a queue/workflow platform

The current recurring work has bounded duration and is naturally modeled by:

- Vercel Cron for scheduling
- PostgreSQL leases for exclusive claims
- unique constraints and idempotency keys for deduplication
- retry state in durable tables

A queue becomes justified when message fan-out, burst absorption, or independent consumer groups are required. A durable workflow becomes justified when a process must pause/resume across multiple dependent steps or human approval. P3 deliberately avoids adding those systems before the workload requires them.


## P4 portfolio intelligence plane

```text
/#/portfolio
   │
   ├─ authenticated portfolio API
   │    ├─ portfolio metadata
   │    ├─ append/reversal transaction RPC
   │    ├─ snapshot history
   │    └─ investment thesis records
   │
   ├─ deterministic calculation domain
   │    ├─ FIFO ledger reconstruction
   │    ├─ provider-aware valuation
   │    ├─ aligned historical return risk
   │    └─ targetable stress scenarios
   │
   └─ scheduled snapshot job (daily in Hobby)
        ├─ fair target cursor
        ├─ verified valuation gate
        ├─ verified history gate
        └─ idempotent capture bucket
```

The domain calculation files under `src/domain/portfolio` contain no database or HTTP dependencies, so the same accounting and risk rules are shared by the browser demo, server summaries, Cron snapshots, contract validation, and unit tests.

The server never accepts a user ID from a portfolio request body. `requireUser()` verifies the bearer token, and every store query includes that verified user ID. Transaction writes use security-definer RPCs because cash, position, idempotency, and reversal ordering must be decided inside one database transaction rather than through a read-then-write HTTP race.

Snapshot history is intentionally stricter than the interactive summary. The interactive page may show an explicitly estimated fallback value so the user can inspect degraded state; the scheduled performance ledger records only verified evidence. This prevents a temporary provider outage from permanently contaminating the historical performance series.

## P7 durable rebalance workflow

```text
verified portfolio + target policy
  → deterministic drift plan
  → immutable run and item snapshots
  → pending human review
      ├─ rejected / expired → audit only
      └─ approved → user enters actual fills
                    → safety revalidation
                    → atomic ledger append + fill links
                    → completed audit event
```

The browser never supplies a trusted calculated plan. The server rebuilds it from the authenticated portfolio, verified market marks, and persisted policy, hashes the decision inputs, and asks one security-definer RPC to store the run, items, initial audit event, and any opted-in deliveries. A partial unique index permits only one `pending` or `approved` run per portfolio.

Approval and completion are separate transactions. Approval changes workflow state only. Completion locks the run and portfolio, rechecks expiry and policy/ledger versions, requires one user-entered fill per proposed buy or sell, enforces price/time/minimum-order limits, and calls the existing append-only transaction RPC for every fill inside the same database transaction. Any failure rolls back all ledger rows and fill links. A reversal of a linked ledger event adds an `execution_reversed` audit event instead of rewriting the completed run.

The daily maintenance sequence is intentionally ordered: market capture and strict snapshots run first, then the bounded fair rebalance scan, then the new delivery queue is drained so a Hobby deployment does not wait another day to send its notice. Hobby retains exactly two daily Cron schedules; Vercel Pro or an authenticated external scheduler is required for minute-level monitoring. Email and Web Push share the existing transports but use a separate rebalance delivery queue, idempotency keys, retries, and plan deep links.

## P8 goal contribution planning

P8 treats each portfolio as one goal bucket. `portfolio_goals` stores the user-authored nominal target and monthly schedule; the existing P6 allocation policy remains the only source of target weights. Projection is deterministic monthly compounding with end-of-period contributions and explicit assumptions.

Contribution plans reuse the P7 durable run, item, fill, and event tables through `plan_kind = 'contribution'`. The existing partial unique index therefore becomes a cross-kind mutex: only one pending or approved rebalance/contribution plan can exist per portfolio. Each P8 run freezes goal, policy, ledger, valuation, provenance, contribution amount, and buy-only allocation evidence.

Daily maintenance orders work as market capture → strict snapshots → due contribution scan → drift scan → delivery. Completion acquires user/key and portfolio advisory locks, appends the frozen deposit, appends each verified user-entered buy fill, links them to the plan, and records completion in one transaction. There is no bank or broker execution path.

## P9 cost-aware order optimization

```text
verified P7/P8 base plan + persisted allocation cost policy
  → deterministic cent-safe optimizer
      ├─ sells first, with FIFO lot consumption and tax reserve
      ├─ buys reduced to available cash after commission/slippage
      ├─ CASH target and contribution envelope preserved
      └─ below-minimum / cost-inefficient / cash-limited / invalid-lot evidence
  → immutable run, item, policy, cost and FIFO snapshots
  → human approval (no ledger effect)
  → user-entered actual quantity, price, fee and execution time
  → price/policy/ledger/quantity/cost revalidation
  → atomic ledger fills plus derived actual-cost evidence
```

`src/domain/portfolio/order-optimizer.ts` is a pure calculation boundary shared by P7 rebalance generation and P8 contribution generation. Monetary envelopes and configured costs are normalized to integer cents. Estimated costs round conservatively, sells are evaluated before buys, equal-priority orders have deterministic symbol ordering, and a binary search finds the largest buy notional whose execution debit fits the remaining cash. `maxCostPct` converts uneconomic candidates to explicit holds instead of allowing fixed fees to dominate a small order.

For a sale, the optimizer consumes open lots in the same chronological FIFO order as the append-only portfolio ledger. It freezes the source transaction, acquisition timestamp, quantity, unit cost, and cost basis used by the estimate. Estimated sell proceeds increase execution cash, while estimated transaction and capital-gains taxes are retained as a separate spendability reserve. This prevents a downstream buy from spending money earmarked by the configured tax assumption.

The database is a second calculation boundary, not a passive JSON store. The P9 migration validates the cost-policy snapshot and each proposed/actual breakdown, preserves legacy zero-cost runs through `cost_model_version`, and wraps the existing P7/P8 RPC signatures so plan/fill evidence and ledger changes remain atomic. The browser never supplies trusted tax or slippage totals.

Actual execution evidence deliberately separates economics from accounting. The user supplies the actual fill price, quantity, fee and time; the server derives signed slippage and estimated sell taxes from frozen reference evidence and current FIFO lots. The ledger cash effect includes actual notional and the actual user-entered fee only. Estimated tax is neither appended as a fee nor labelled paid. Automatic broker orders, tax remittance and jurisdiction-specific tax advice remain outside the architecture.

## P10 rule-based portfolio monitoring

```text
armed/latched monitor rules (thesis, risk, stress)
  → daily-maintenance Cron, run last, deadline-bounded
      → claim due rules with a lease, grouped by portfolio
      → one shared MonitorObservation per portfolio (buildPortfolioSummary)
      → pure per-scope evaluation: breached / clear / deferred
      → latch transition; notify only on armed → latched
  → breach rows + per-user digest (open → append → enqueue)
  → shared email/Web Push delivery queue (from P7's extraction)
```

`server/monitors/` holds five files with one responsibility each. `rules.ts` defines the three rule-spec shapes as discriminated, `.strict()` Zod schemas — an unknown key or an unknown enum value is rejected before it ever reaches storage or evaluation, and the same shapes are mirrored by `validate_monitor_rule_spec` in the migration as a second, database-side backstop. `evaluate.ts` is a pure function, `evaluateRule(rule, observation) -> EvaluationOutcome`, with no I/O; `nextState` and `shouldNotify` implement the armed/latched latch as two more pure functions next to it, so the whole decision surface is unit-testable without a database. `observations.ts` builds the one `MonitorObservation` a portfolio's rules share, by calling the same `buildPortfolioSummary` the interactive summary and the strict-snapshot Cron already call — so a monitor never sees looser input than a snapshot would accept. `monitor-service.ts` orchestrates: it claims due rules through the leased `claim_due_monitor_rules` RPC, groups them by portfolio with `groupRulesByPortfolio` (the RPC's `RETURNING` order is not the same as its claim order, so grouping cannot rely on row adjacency), evaluates each rule against its portfolio's shared observation, and computes each rule's next `next_evaluation_at` with `nextEvaluationAt` — a `breached`/`clear` verdict consumes the rule's configured interval, but `deferred` and `error` do not, so a transient provider wobble does not blind a weekly stress rule for a week. `digest.ts` turns a run's accumulated breaches into one Korean-language email/push payload per user.

The quality gate is deliberately per-scope, not portfolio-wide, inside `evaluate.ts`: a thesis rule defers only when its own watched holding is unverified, a risk rule defers only when the risk history itself is unverified, and a stress rule defers when portfolio-level valuation is unverified (the one case where the whole-portfolio aggregate is the right scope, since a stress scenario values the whole portfolio). A portfolio-wide gate would have two failure modes instead: one unrelated stale position would blind every thesis rule in the portfolio, and the `no_verified_price_days` condition — whose entire purpose is to fire when something has gone unverified — could never fire at all.

Monitors reuse the P7 delivery-queue extraction (`server/notifications/`) rather than a fourth bespoke delivery path: `monitor_digest_deliveries` is claimed, retried, and marked sent/failed/disabled through the same shared helpers as rebalance and contribution notifications. Monitors run last in daily maintenance, after market capture, strict snapshots, the contribution scan, the rebalance scan, and rebalance delivery — contributions and rebalances can lead to ledger writes, monitors only notify, so if the 60-second function budget runs out, losing a day of monitoring is the cheaper thing to lose. The monitor step's own deadline is bounded by whichever is tighter: its configured `MONITOR_BUDGET_MS`, or what is actually left of the function's total wall-clock budget after everything that already ran in the same invocation — a fresh full-length window computed without accounting for that prior work could let the platform kill the whole function before it returns a response. A skipped rule simply keeps its existing `next_evaluation_at` and is retried on the next run; nothing is lost, only delayed.

A breach never mutates other application state: it does not transition `investment_theses.status`, does not write `portfolio_transactions`, and does not create a plan. It only notifies. Configured thresholds are user-authored planning assumptions, not investment advice.
