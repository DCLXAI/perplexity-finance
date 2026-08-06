# P10 — Rule-Based Portfolio Monitoring and Alerting

**Design · 2026-08-05 · targets application version 1.11.0**

## Problem

P4 gave every investment thesis an `invalidation` field: the condition under which the
original reasoning no longer holds. It is `text`, free prose. Nothing reads it. A thesis can
be silently invalidated for months while the position is still held, which defeats the point
of recording the condition at all.

The same gap exists one level up. P4 computes volatility, VaR, CVaR, maximum drawdown,
concentration HHI, and largest-holding weight, and P4 stress scenarios compute projected loss.
All are calculated on demand and shown; none is watched. A portfolio can drift past any
threshold the owner cares about without anything happening.

P10 closes both gaps with one rule engine.

## Constraints

- **Vercel Hobby allows two Cron schedules per day, and both are taken** —
  `evaluate-alerts` at 00:05 UTC and `daily-maintenance` at 00:20 UTC. P10 must add no
  third schedule.
- **Serverless functions cap at 60 seconds.** `daily-maintenance` already runs market
  capture, portfolio snapshots, contribution monitoring, the rebalance drift scan, and a
  notification drain inside that budget.
- **Alerts are durable and irreversible.** A false alert can move a user to sell a real
  position. The existing provenance discipline — synthetic, stale, divergent, or degraded
  data is never promoted to verified — must extend to alerting.

## Decisions

Four decisions were settled before design; each is load-bearing.

1. **Invalidation conditions become machine-evaluable through a structured rule stored
   alongside the prose, not by rewriting the prose and not by interpreting it with an LLM.**
   The prose `invalidation` field is untouched and remains the human record. LLM
   interpretation was rejected: it is non-deterministic, so identical inputs could yield
   different verdicts on different days, and it costs a provider call per thesis per day.
   Determinism is what makes a breach auditable.
2. **All three monitor kinds ship in P10** — thesis invalidation, risk threshold, and
   stress scenario.
3. **Notification uses a transition latch plus a per-user digest.** A rule fires on the
   transition to breached and re-arms only when it evaluates false again. Multiple breaches
   for one user in one run collapse into a single email or push.
4. **A breach never changes application state.** It does not transition
   `investment_theses.status` to `invalidated`, does not write to the ledger, and does not
   create a plan. It notifies. This matches P7/P8/P9, where approval has no ledger effect
   and every ledger write requires explicit user entry.

## Approach

Three approaches were considered.

**A. One rule engine over a discriminated union of rule kinds.** A single `monitor_rules`
table distinguishes kinds by a `kind` column; one evaluator walks all rules for a portfolio
in a single pass. The expensive inputs — quotes, the verified snapshot, holdings — load once
per portfolio and all three kinds read from them. One latch mechanism, one delivery path.
Server-side JSON validation of the discriminated union follows the pattern P9 already
established for its cost-policy specs.

**B. Three separate subsystems.** Each kind gets its own table, evaluator, and cron step.
Each individual piece is simpler, but the schema, delivery wiring, and latch logic triple,
and each subsystem reloads the same quotes and snapshot. That triples the dominant cost
inside a 60-second budget that is already partly spent.

**C. Client-side evaluation, server delivery only.** Costs no cron budget, but only fires
when the user opens the page. Monitoring that requires the user to show up is not monitoring.

**A is chosen.** Once all three kinds ship together, loading the shared inputs exactly once
is the only realistic way to stay inside 60 seconds.

## Data model

New table `monitor_rules`:

```text
id, user_id, portfolio_id
thesis_id            nullable, references investment_theses
symbol               nullable
kind                 'thesis_invalidation' | 'risk_threshold' | 'stress_scenario'
spec                 jsonb, discriminated union, validated in the database
enabled              boolean
state                'armed' | 'latched'
last_outcome         'breached' | 'clear' | 'deferred' | 'error'
last_evaluated_at    timestamptz
last_observation     jsonb
last_error           text
latched_at           timestamptz
min_interval_hours   smallint   -- default 24 for thesis/risk, 168 for stress
next_evaluation_at   timestamptz
rule_version         integer
```

`state` and `last_outcome` are separate on purpose. `state` is the latch — only `armed` or
`latched` — and drives whether a breach fires. `last_outcome` records what the most recent
evaluation actually did, including the two outcomes that produce no transition. The status
screen reads both: a rule can be `armed` with `last_outcome = 'deferred'`, which is precisely
the "it is not watching right now, and here is why" case the screen exists to surface.

Scheduling after each evaluation:

- `breached`, `clear` — `next_evaluation_at = last_evaluated_at + min_interval_hours`
- `deferred`, `error` — `next_evaluation_at` moves to the next run, ignoring
  `min_interval_hours`. A rule that could not be evaluated has not consumed its interval, so
  making it wait a further 24 or 168 hours would compound a transient provider problem into
  a week of blindness.

`spec` shapes by kind:

- `thesis_invalidation` — `price_below`, `price_above`, `drawdown_from_entry_pct`,
  `weight_above_pct`, `no_verified_price_days`
- `risk_threshold` — a metric name drawn from `portfolio_snapshots.metrics` (annualized
  volatility, 1-day 95% VaR, 1-day 95% CVaR, maximum drawdown, concentration HHI, largest
  holding weight), a comparison operator, and a threshold
- `stress_scenario` — an existing P4 scenario definition plus a `projected_loss_pct`
  threshold

Three properties of this schema carry weight:

- **`next_evaluation_at` is both the fairness cursor and the cost control.** Claiming in
  ascending order means the longest-waiting rule goes first, so no batch can starve a later
  one — the same protection P4's snapshot fairness cursor provides. Because stress rules
  default to a 168-hour interval, the most expensive kind spreads to roughly one seventh of
  the daily load without any separate scheduling mechanism.
- **`rule_version` invalidates the latch.** Editing a threshold increments it and forces the
  rule back to `armed`. Without this, a stale latch from the old threshold would swallow the
  first breach of the new one — the exact case where the user is paying most attention.
- **`state` holds only two values.** `deferred` is not a state; it is an outcome that
  produces no transition. See the quality gate below.

Evidence is frozen, following P7 and P9:

```text
monitor_breaches            one immutable row per breach: rule_id, rule_version,
                            observed value, threshold, observed_at, input quality,
                            source snapshot id, digest_id
monitor_digests             one row per user per run  (mirrors portfolio_rebalance_runs)
monitor_digest_deliveries   FK to monitor_digests, unique(digest_id, channel)
```

A sibling delivery table is required, not merely preferred:
`portfolio_rebalance_deliveries` declares
`foreign key(run_id, user_id, portfolio_id) references portfolio_rebalance_runs(...)` and
`unique(run_id, channel)`, so a monitor digest cannot be inserted into it. The new table
copies its column shape, its partial index on due rows, and its claim pattern.

## Evaluation engine

Structured as a pure core with an IO shell, matching `server/alerts/evaluator.ts`, where
`didCross` is exported pure and unit-tested without a database or network.

```text
server/monitors/
  rules.ts            rule spec union types + zod schemas          (pure)
  evaluate.ts         (rule, observation) -> Breach | null         (pure)
  observations.ts     loads the shared observation once per portfolio
  monitor-service.ts  claim due rules -> evaluate -> latch -> enqueue digest
  digest.ts           assembles the per-user digest
```

The shared observation per portfolio:

```text
Observation = latest verified portfolio_snapshots row (metrics, holdings, valuation_quality)
            + quotes for held symbols (existing getMarketQuotes, 200-symbol chunks)
            + average cost per holding from snapshot holdings (for drawdown_from_entry_pct)
```

Rules are claimed grouped by `portfolio_id` so this loads once per portfolio rather than
once per rule. Claiming rule-by-rule would forfeit the entire advantage of approach A.

### Quality gate

When the input for a rule is not `verified`, the rule is recorded as `deferred` and
`next_evaluation_at` moves to the next run. No breach is written, no notification is
enqueued, and **no latch transition occurs in either direction**.

This is the most important rule in the design. A provider wobble that delivers an outlier
price would otherwise fire a thesis-invalidation alert, and the user may sell a real position
in response to an event that never happened. The cost of one false alert exceeds the cost of
one day of delay by a wide margin. This applies the same discipline P4 uses for strict
snapshots — written only when every open holding is provider-verified — to alerting.

### Error isolation

A rule that throws fails alone. Its `last_error` is recorded, it retries on the next run,
and the batch continues. This follows `loadQuotes`, which already logs a failed market batch
at `warn` and proceeds.

## Latch transitions

| Transition | Condition |
|---|---|
| `armed` → `latched` | Verified input, predicate true. This is the only firing point. |
| `latched` → `armed` | Verified input, predicate false. Re-arms. |
| any → `armed` | `rule_version` incremented by a user edit. |
| no transition | Input not verified (`deferred`), or evaluation errored. |

## Delivery

Delivery logic is shared, not duplicated. `server/notifications/rebalances.ts` already
contains retry backoff (`min(3600, 30 * 2^(attempts-1))` seconds, 5 attempts), email and Web
Push senders, 404/410 subscription pruning, and timeout wrapping. These move to
`server/notifications/delivery.ts` and are used by both rebalance and monitor delivery.
Copying them would fork the retry policy into two implementations that will diverge.

Idempotency keys follow the existing convention: `pf-monitor-${digest_id}-email`.

The digest body states, as the rebalance notification does, that it is not an order
suggestion and that nothing has been written to the transaction ledger.

## Cron integration

Two steps append to `daily-maintenance`:

```text
1. capture-market || snapshot-portfolios     (parallel, existing)
2. monitorPortfolioContributions             (existing)
3. monitorPortfolioRebalances                (existing)
4. deliverPendingRebalances                  (existing)
5. monitorRules(deadline)                    NEW
6. deliverPendingMonitorDigests()            NEW
```

They go last on priority grounds. Contributions and rebalances create reviewable plans that
lead to ledger writes; monitors only notify. If the budget runs out, skipping a day of
monitoring is preferable to skipping a contribution.

**The budget is enforced by deadline, not by count.** Per-portfolio cost varies with holding
count, so a fixed item cap either wastes budget or overruns it. The remaining time is passed
into `monitorRules`, which checks it before starting each portfolio and returns without
claiming when the budget is nearly spent. Unclaimed rules stay due and the next run takes
them.

`MONITOR_RULE_LIMIT` (default 200, capped 600) backs the deadline as a safety net, in the
same shape as `PORTFOLIO_SNAPSHOT_LIMIT` (default 8, capped 20).

No Cron schedule is added. The Hobby profile keeps its two.

### Rejected alternative

Thesis rules could ride the lighter `evaluate-alerts` run at 00:05, which already loads
quotes. This looks free, but it splits the digest across two runs and breaks the one-digest-
per-user policy — two notifications a day is the fatigue outcome decision 3 exists to
prevent. Merging across runs would require carrying state between them, which costs more
complexity than the shared quote load saves.

## User interface

Rule editing lives where the watched thing lives. No separate alert-settings screen: writing
a rule beside the thesis it guards is the natural moment, and separating them lets rules go
stale as the thesis evolves.

- `thesis_invalidation` → `ThesisDialog`, directly beside the prose invalidation field
- `risk_threshold` and `stress_scenario` → the `PortfolioPage` risk panel

A monitor status surface shows, per rule: latch `state`, `last_outcome`, last evaluation
time, last observed value, next scheduled evaluation, and breach history from
`monitor_breaches`. The question that destroys trust in an alerting system is always "why
didn't it fire?" — a visible `deferred` outcome with its last observation answers it.

## Testing

- Pure unit tests on `evaluate.ts`: each rule kind, boundary values, all latch transitions,
  and deferral on unverified input.
- `scripts/validate-p10.ts` following the P2–P9 contract-assertion pattern, wired into
  `npm run check` as `validate:p10`.
- Migration `supabase/migrations/202608050001_p10_monitor_rules.sql`, applied after P9.
- Version 1.10.0 → 1.11.0 across `server/config.ts`, the router tests, and the validate
  scripts that assert it.

## Safety boundary

- Monitors place no orders, initiate no transfers, and write nothing to the ledger.
- A breach never transitions thesis status automatically.
- Nothing fires on unverified input.
- Thresholds are user assumptions for planning, not investment advice.

## Out of scope

- Intraday or minute-level monitoring, which requires Vercel Pro or an authenticated
  external scheduler.
- Natural-language interpretation of the prose `invalidation` field.
- Any automatic action taken in response to a breach.
