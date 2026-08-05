# P10 Rule-Based Portfolio Monitoring

**Version 1.11.0 · 2026-08-05**

## Added

- Structured monitor rules of three kinds: thesis invalidation (price above/below, drawdown from entry, allocation weight, or days without a verified price, scoped to one held symbol), risk threshold (any P4 risk metric compared above or below a value), and stress scenario (projected loss from the existing P4 shock model).
- A pure evaluator (`server/monitors/evaluate.ts`) shared by every rule kind: `evaluateRule`, `nextState`, and `shouldNotify` have no I/O and are unit-tested independently of the database.
- One shared portfolio observation per evaluation run, built from the same `buildPortfolioSummary` call the interactive summary and the strict-snapshot Cron already use, so a monitor never judges on looser input than a verified snapshot would accept.
- An armed/latched notification latch: a rule notifies only on the `armed → latched` transition and stays silent on every subsequent breach until it evaluates false again and re-arms.
- A per-user digest that collapses every breach from one evaluation run into a single email/Web Push message, delivered through the existing P7 delivery-queue extraction.
- `GET/POST/PATCH/DELETE /api/portfolio/monitor-rules` and `GET /api/portfolio/monitor-status`, plus a monitor-rule editor beside each investment thesis and a status panel showing state, last outcome, deferral/error reason, and recent breach history.
- `supabase/migrations/202608050001_p10_monitor_rules.sql`: `monitor_rules`, `monitor_digests`, `monitor_breaches`, `monitor_digest_deliveries`, and eleven security-definer RPCs for spec validation, rule upsert/delete, leased claiming, evaluation recording, and digest assembly/delivery.
- `MONITOR_RULE_LIMIT` and `MONITOR_BUDGET_MS` configuration, and a monitor step inside the existing `daily-maintenance` Cron — no third Vercel Cron schedule is added.

## Evaluation rules

- Each rule kind gates on its own scope, not the whole portfolio: a thesis rule defers unless its watched holding is `verified`; a risk rule defers unless the risk history itself is `verified` and `available`; a stress rule defers unless portfolio-level valuation is `verified`. A portfolio-wide gate would let one unrelated stale position blind every thesis rule in the portfolio, and would make `no_verified_price_days` — whose entire purpose is to fire when something is unverified — permanently unable to fire.
- A `deferred` or `error` outcome changes neither the latch state nor the rule's schedule: `next_evaluation_at` is left as "now" so the rule is retried on the very next run instead of sitting out a full interval because of a transient fault.
- A `breached`/`clear` verdict consumes the rule's configured interval (24 hours for thesis/risk rules, 168 hours for stress rules, by default).
- A rule spec is validated twice: once by a `.strict()` Zod schema on the server (`server/monitors/rules.ts`), and again by `validate_monitor_rule_spec` inside the security-definer RPC that stores it, so a direct RPC call cannot store a shape the evaluator would later refuse to parse.
- Editing a rule always re-arms it and increments `rule_version`, so an edited threshold can never be silently suppressed by a latch left over from the previous threshold.
- The monitor step runs last in daily maintenance, after market capture, strict snapshots, the contribution scan, the rebalance scan, and rebalance delivery, and is bounded by a deadline derived from whichever is tighter — `MONITOR_BUDGET_MS` or what remains of the function's 60-second wall-clock budget. A run that hits its deadline stops claiming further portfolios; the unclaimed rules keep their existing `next_evaluation_at` and are retried on the next run.

## Safety boundary

- A monitor rule never places an order, never transitions `investment_theses.status`, and never writes to the append-only ledger. It notifies, nothing more.
- A rule never fires on unverified input. Synthetic, stale, degraded, or otherwise non-`verified` data always produces `deferred`, never a guessed `breached`/`clear` verdict.
- Configured thresholds (prices, drawdown percentages, risk limits, projected-loss limits) are the user's own planning assumptions, not investment advice.
- **Monitor-rule mutations are not idempotent.** Unlike contributions and rebalances, there is no replay store for monitor rules and `monitor_rules` has no unique constraint, so a client retry after a network timeout can create a duplicate rule. A duplicate rule means duplicate evaluations, duplicate breach rows, and the same alert appearing twice in every digest until the user deletes it. `POST`/`PATCH /api/portfolio/monitor-rules` therefore do not require an `Idempotency-Key` — requiring one we do not honor would be worse than not requiring one at all.
- On the Vercel Hobby profile, monitors are scanned once per day inside daily maintenance; stress rules default to a 168-hour interval. Minute-level or sub-daily monitoring requires Vercel Pro or an authenticated external scheduler.
- A run is bounded by a deadline derived from the remaining function budget, so monitoring can be skipped for a day under load. A skipped rule simply stays due; nothing is silently marked evaluated.

## Database

Apply `supabase/migrations/202608050001_p10_monitor_rules.sql` after P9 and before deploying version 1.11.0. The migration is purely additive — no existing table is altered — and creates eleven security-definer RPCs, every one of which has its `PUBLIC`/`anon`/`authenticated` execute privileges explicitly revoked and `service_role` execute explicitly granted. `npm run validate:p10` asserts the revoke count matches the security-definer function count, guarding against the class of hole a Task 3 review found: RPCs shipped with zero grants, callable by any authenticated user.

Run:

```bash
npm run validate:p10
npm run validate:migrations
npm run check
```
