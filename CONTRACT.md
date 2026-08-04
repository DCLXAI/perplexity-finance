# P9 Runtime Contract

**Version 1.10.0 · 2026-07-14**

This document defines the invariants that every provider, API route, alert evaluator, operations action, and UI surface must preserve.

## 1. Data truthfulness

1. Every remotely sourced market value carries provenance.
2. `quality: synthetic` is never represented as provider or verified quality.
3. A local fallback response must be visibly identified as fallback.
4. A stale last-known-good value remains stale; cache reuse cannot promote it to live.
5. The UI must not claim a provider, feed, or timestamp that is absent from the response.
6. A provider error must not be hidden by silently fabricating a live-looking value.

## 2. Provider selection

For each symbol, provider candidates are considered only when:

- the provider supports the asset kind
- required credentials or public access are available
- the circuit breaker grants a call
- the provider response is structurally valid
- the quote passes freshness/session validation

`primary` mode uses only the first provider plan. `failover` tries the next provider after failure or rejection. `quorum` reconciles available candidates.

The deterministic recovery order is:

```text
primary → secondary → last-known-good → explicit synthetic fallback
```

If `ALLOW_MOCK_FALLBACK=false` and no acceptable provider or last-known-good value exists, the API returns a structured failure rather than synthetic data.

## 3. Quote quality

A quote cannot be accepted when:

- price is non-finite or `<= 0`
- OHLC values are inconsistent
- timestamp is invalid or unreasonably future-skewed
- data exceeds the asset freshness threshold
- the symbol does not match the requested catalog asset
- required provider fields are absent

Cross-provider reconciliation computes a price deviation in basis points. When the maximum deviation exceeds `QUOTE_MAX_DEVIATION_BPS`:

- a `cross-provider-deviation` incident is emitted
- the selected result is degraded/quarantined
- `alertEligible` is false
- the system does not average disagreement into a falsely precise value

## 4. Immutable client ingestion

External quotes applied to the browser market engine:

- create a new immutable quote snapshot
- preserve unchanged quote references
- emit one batch per ingestion transaction
- retain provenance
- prevent a later local synthetic tick from overwriting a verified provider quote

## 5. Alert eligibility and crossing

A durable alert baseline and trigger observation must be:

- provider-backed
- live or permitted delayed data
- within freshness limits
- not synthetic
- not degraded or quarantined
- explicitly marked alert-eligible

Crossing semantics:

```text
above: previous < target && current >= target
below: previous > target && current <= target
```

Merely satisfying the condition at creation time is not a crossing.

## 6. Durable alert concurrency

- evaluators claim due alerts using a time-bounded lease
- a second evaluator cannot process a valid active lease
- abandoned leases become reclaimable
- trigger transition is atomic
- delivery rows are idempotent per `(alert_id, channel)`
- delivery workers claim rows with bounded leases
- a processing lease that expires may be retried
- delivery timeout and retry limits are bounded by configuration

## 7. Readiness

`GET /api/health` may return `200` while readiness fails.

`GET /api/ready` returns:

- `200` when all required checks pass
- `503` when at least one required check fails

Optional missing capabilities produce warnings, not readiness failures. Requirement flags are:

```text
REQUIRE_LIVE_DATA
REQUIRE_CLOUD
REQUIRE_DURABLE_ALERTS
REQUIRE_AI
```

A configured provider without a successful probe is not evidence of working live data.

## 8. Release gate

The release gate returns `pass`, `warn`, or `fail`.

It must fail when:

- readiness fails
- the market-data SLO is breached
- strict production requires live data but no SLO sample exists
- an unresolved critical data-quality incident exists

It may warn when:

- SLO is at risk
- no non-required sample exists
- optional capabilities are missing
- failed delivery backlog exists

The gate calculation in `server/ops/summary.ts` is canonical. API routes, UI, validation scripts, and operations actions must use that implementation.

## 9. SLO calculation

The rolling provider registry supplies attempts, successes, latency, and freshness samples. The 60-minute market SLO exposes:

- availability target
- actual availability
- p95 latency
- freshness pass rate
- error-budget remaining
- status

`RELEASE_MIN_AVAILABILITY_PCT` and `RELEASE_MAX_P95_LATENCY_MS` define release thresholds.

No sample is reported as `no-data`; it is never converted into an invented 100% success rate.

## 10. Operations authorization

`GET /api/ops/summary` and `POST /api/ops/actions` require one of:

- authenticated Supabase user with an allowed operations role
- valid machine `OPS_SECRET`

Allowed roles default to `ops,admin` and may be configured with `OPS_ROLES`.

Client-side route visibility is convenience only. Server authorization is mandatory.

## 11. Operations idempotency and audit

Every operations mutation requires a non-empty `Idempotency-Key`.

When the persistent ledger is configured:

- the first request claims the key and action
- a repeated request returns the recorded result
- the same key cannot execute a second side effect
- actor, action, request ID, input summary, result, status, and timestamps are audited

Actions must not log secrets or full bearer tokens.

## 12. Scheduled job authentication

Cron routes require:

```http
Authorization: Bearer <CRON_SECRET>
```

Missing server configuration returns `503`. Invalid credentials return `401`. Secret comparison is timing-safe.

Cron jobs are bounded by batch, timeout, concurrency, and retention configuration.

## 13. API boundary

All API responses include:

- `X-Request-Id`
- `X-Content-Type-Options: nosniff`
- appropriate cache policy
- structured JSON errors for API failures

State-changing browser requests enforce same-origin or trusted fetch metadata. Public read routes are rate-limited. Authenticated and AI mutations use stricter limits.

Internal stack traces and raw provider responses are not returned to users.

## 14. Logging and telemetry

Structured logs include event name, request ID, route, status, duration, and bounded operational metadata.

Before logging, the redactor removes or masks:

- authorization and cookies
- secrets, tokens, keys, and passwords
- emails and common PII-shaped fields
- deeply nested or oversized values

Telemetry must not accept unrestricted arbitrary payloads. Event names and property size are bounded.

## 15. Cloud authorization

- the server derives user identity from a verified Supabase access token
- request bodies cannot choose another user ID
- browser clients may read only their own RLS-protected records
- service-role operations remain server-side
- operational tables are not directly mutable by ordinary authenticated users

## 16. AI evidence

Financial AI responses include:

- actual execution mode
- model identifier
- tools used
- source list and as-of timestamps
- request ID
- generated timestamp
- evidence hash

When OpenAI or a tool provider is unavailable, the response must say `local-fallback`; it cannot preserve the OpenAI label.

## 17. Packaging

Release archives must not contain:

```text
node_modules/
dist/
.git/
.env
.env.local
.env.*.local
*.tsbuildinfo
.DS_Store
```

`.env.example` contains names and safe defaults only. Secret-valued fields remain empty.


## 18. Portfolio ledger invariants

1. `portfolio_transactions` is an append-only economic event stream.
2. Application corrections create a `reversal` row; they never update or delete the original row.
3. Only the latest active transaction may be reversed, keeping reconstruction deterministic.
4. Buy, sell, withdrawal, and fee cash/position checks execute inside the locked portfolio transaction.
5. New economic events must be appended at or after the latest active `trade_at`; backdated insertion behind later active events is rejected so server checks and FIFO reconstruction cannot disagree.
6. The same user/idempotency key is serialized with a Postgres advisory transaction lock and must replay one result.
7. Direct insert, update, and delete privileges on portfolio transactions are unavailable to ordinary authenticated clients and the service role.
8. FIFO is the canonical cost-basis method for this product version; the UI must not label it average-cost or tax-authoritative accounting.
9. A failed ledger reconstruction returns a structured conflict rather than silently repairing history.
10. Ledger reads page through the database row cap with a stable `(trade_at, created_at, id)` order and fail explicitly rather than silently truncating economic history.

## 19. Portfolio valuation and risk

1. Every priced holding retains its quote provenance.
2. Synthetic, stale, fallback, or rejected/degraded data cannot be labelled verified.
3. Unpriced holdings remain explicit and are excluded from market value; they are never assigned zero as though that were a market price.
4. Portfolio-level quality is derived from holding quality.
5. Risk outputs expose observation count, data quality, and covered market-value percentage.
6. Fewer than 20 aligned daily returns produces insufficient data, not a fabricated VaR.
7. VaR, CVaR, volatility, and drawdown are historical estimates and must not be described as forecasts or guarantees.
8. Stress scenarios are deterministic sensitivity calculations and leave cash unchanged.
9. `totalReturnPct` is the simple ratio of cumulative gain to net contributions. It is not time-weighted return, money-weighted return, IRR, or tax reporting.

## 20. Snapshot truthfulness and fairness

1. Scheduled snapshots require verified holding valuation.
2. Portfolios with holdings also require verified risk history with `risk.status = available` before strict snapshot persistence.
3. A skipped snapshot is counted and logged; it is not replaced by synthetic data.
4. Snapshot writes are idempotent per portfolio and fifteen-minute capture bucket; retries preserve the first accepted observation instead of overwriting it.
5. Bounded Cron batches rotate by `last_snapshot_attempt_at` so one cohort cannot starve all later portfolios.
6. Snapshot rows are user-scoped under RLS and are immutable to ordinary browser clients.

## 21. Investment thesis contract

A thesis record separates the core claim, bull case, bear case, catalysts, invalidation condition, target price, confidence, evidence, and lifecycle status. Confidence is a user judgment score, not a calibrated probability. Archival changes state without erasing the historical record.

## 22. Durable rebalance workflow

1. A rebalance run is an immutable decision record: reference prices and timestamps, provenance, current and target weights, drift, policy/portfolio versions, and proposed orders remain attributable to the generation time.
2. At most one `pending` or `approved` run exists per portfolio. Scheduled scans are bounded and rotate by `last_rebalance_scan_at`; repeated observation of the same open condition does not create another plan.
3. The only normal success path is `pending → approved → completed`. Pending or approved runs may become rejected or expired; terminal states cannot return to an active state.
4. Every state change is represented by an append-only audit event. Approval alone cannot append, update, or delete a portfolio transaction.
5. Every rebalance mutation requires an idempotency key. The same key may replay the same request result but cannot authorize a different action or payload.
6. Approval and completion require a currently verified valuation, an unexpired plan, unchanged target-policy and portfolio-ledger versions, sufficient cash/positions, and orders that still satisfy the configured minimum value.
7. A reference-price movement above 3%, a changed order direction, stale pricing beyond 96 hours, or a restored within-threshold allocation invalidates the old approval path and requires a new plan.
8. Completion accepts user-entered actual quantities, prices, fees, and execution timestamps for every proposed buy/sell. All resulting ledger rows and fill links commit atomically or none do.
9. A later reversal remains in the append-only transaction ledger and adds an `execution_reversed` audit event; it does not erase the original plan or fill evidence.
10. Email and Web Push are explicit per-policy opt-ins. Notifications contain a plan link and state that the message is a suggestion, not an automatic broker order.
11. The product never submits a broker order. Broker credentials, order placement, and unattended execution are outside the P7 boundary.
12. The Vercel Hobby profile evaluates portfolio drift once per day inside daily maintenance. Minute-level monitoring is a Pro/external-scheduler capability and must retain the same authentication, bounded work, deduplication, and audit rules.

## 23. Goal contribution contract

1. A portfolio has at most one active or paused goal. Multiple financial goals require separate portfolio ledgers so current value is not attributed twice.
2. Target amount is nominal USD. Expected return is an explicit user assumption; projections are not guarantees and do not silently model inflation, taxes, or future fees.
3. A contribution plan is buy-only. It first reserves the `CASH` target, then uses no more than the frozen contribution amount for underweight assets. It never suggests a sale or consumes pre-existing cash.
4. Minimum-order leftovers remain cash and are visible. Cent rounding is deterministic and contribution value is conserved.
5. P7 and P8 share the one-open-plan invariant per portfolio. A contribution plan cannot race an approved rebalance.
6. A scheduled goal/date cycle is created at most once. Operational scan timestamps and next-date advancement do not rewrite the user-authored goal version.
7. Goal, policy, ledger, valuation and price evidence are immutable snapshots on the run. Approval has no transaction-ledger effect.
8. Completion requires the approved, unexpired plan and unchanged goal/policy/ledger versions. Verified current prices and each actual fill must remain within the 3% safety boundary.
9. The frozen deposit is appended before buys. Deposit, all fills, links and completion audit commit atomically or none commit.
10. Reversal evidence is append-only. P8 never initiates a bank transfer or broker order and never accepts broker credentials.
11. Scan fairness is ordered by the least-recent attempt before due date. Overdue goals leave the due queue, and a goal becomes completed only from a verified funded valuation.
12. Historical contribution responses expose the frozen goal name, target amount/date, return assumption, contribution schedule, and version even after the live goal changes.

## 24. Cost-aware order optimization contract

1. P7 and P8 use the same persisted cost policy: fixed commission, basis-point commission, buy and sell slippage, sell transaction tax, capital-gains tax, maximum cost percentage, and `FIFO` tax-lot method.
2. Cost and tax rates are explicit user assumptions. Outputs are planning estimates, not tax advice, a tax return, a broker statement, or evidence that any tax was paid.
3. The optimizer uses deterministic cent arithmetic for cash and cost envelopes, conservative rounding for estimated costs, sells-before-buys ordering, and stable priority/symbol tie-breaking.
4. A contribution plan cannot spend more than the frozen contribution after estimated commission and slippage, cannot consume pre-existing cash, and must preserve its configured `CASH` reserve.
5. Estimated sell taxes reduce spendable cash but do not reduce ledger cash until the user separately records a real economic payment. Estimated taxes must never be inserted automatically as a fee transaction.
6. FIFO is shared with portfolio reconstruction. A taxable sale without sufficient valid lot evidence becomes `invalid-tax-lots`; the system cannot fabricate basis or silently substitute average cost, LIFO, or HIFO.
7. An order below the minimum, above the available cash envelope, or above `maxCostPct` remains an explicit hold/cash-limited decision. A rejected order contributes zero to plan totals.
8. Every P9 run freezes `cost_model_version`, the full cost policy, requested and optimized values, optimization decision, estimated costs, sell basis, and consumed FIFO lot slices. Later policy or market changes cannot rewrite that evidence.
9. Approval remains workflow-only. Before completion the server revalidates plan expiry, policy and ledger versions, price safety, position/cash sufficiency, cost constraints, FIFO evidence, and that actual quantity does not exceed the approved estimate.
10. Actual costs are derived from the user-entered quantity, price and fee plus the frozen reference price and FIFO evidence. Slippage may be negative when execution improves on the reference price; estimated cost totals must retain that sign rather than presenting improvement as an expense.
11. The append-only ledger records actual notional and the user-entered actual fee. Derived slippage and tax estimates are immutable fill evidence, not additional ledger debits.
12. P9 plan creation, fill completion, cost evidence, ledger rows and audit transitions retain the existing security-definer, advisory-lock, RLS, idempotency and all-or-nothing transaction guarantees.
13. Runs created before P9 remain readable under the legacy zero-cost model; compatibility must not relabel missing historical estimates as observed costs.
14. The product never stores broker credentials, places an order, initiates a bank transfer, remits tax, or chooses a jurisdiction-specific tax treatment.
15. Completion inputs are normalized before hashing and calculation to 12 decimal places for quantity and 8 for price and fee, matching database numeric canonicalization. Legacy runs may still show their recorded actual fee, but never invent historical slippage or tax estimates.
