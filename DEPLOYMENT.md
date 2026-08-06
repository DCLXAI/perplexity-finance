# P11 Deployment Runbook

**Version 1.12.0 · 2026-08-06**

## 1. Prerequisites

- Node.js 22.22+
- Vercel project
- Supabase project for cloud accounts, durable alerts, and operations history
- at least one market provider for provider-backed mode
- optional OpenAI, Resend, VAPID, and Upstash credentials

The package contains no credentials.

## 2. Validate the source before configuration

```bash
npm ci
npm run check
npm audit --audit-level=low
```

Do not deploy when any part of `npm run check` fails.

## 3. Apply database migrations

Apply these files in order in the Supabase SQL editor or migration pipeline:

```text
supabase/migrations/202607120001_p2_cloud.sql
supabase/migrations/202607120002_p3_operations.sql
supabase/migrations/202607120003_p3_hardening.sql
supabase/migrations/202607120004_p4_portfolio_intelligence.sql
supabase/migrations/202607130001_p6_target_allocations.sql
supabase/migrations/202607130002_p7_rebalance_workflow.sql
supabase/migrations/202607140001_p8_goal_contributions.sql
supabase/migrations/202607140002_p9_order_cost_optimization.sql
supabase/migrations/202608050001_p10_monitor_rules.sql
```

Then run:

```bash
npm run validate:migrations
```

The P10 migration applies after P9 and is required by version 1.11.0. It is additive: it creates `monitor_rules`, `monitor_digests`, `monitor_breaches`, and `monitor_digest_deliveries`, plus security-definer RPCs to validate a rule spec, upsert/delete a rule, claim due rules under a lease, record an evaluation, and open/append/enqueue a digest. Every security-definer function it creates has its `PUBLIC`/`anon`/`authenticated` execute privileges explicitly revoked and `service_role` execute explicitly granted — `npm run validate:p10` asserts the revoke count matches the security-definer function count so this cannot silently regress. It does not create another Cron job or a broker/order-placement path.

The P9 migration is required by version 1.10.0. It adds the allocation cost-policy columns, immutable plan/item/fill cost evidence, FIFO lot snapshots, and cost-aware wrappers for P7/P8 plan creation and completion. It does not create another Cron job or an automatic broker/tax-payment path.

The P3 migrations install fair alert claims, market observations, incidents, provider snapshots, heartbeats, cross-instance SLO evidence, atomic alert trigger/delivery enqueue, leased operations idempotency, audit records, release-gate records, and privileged maintenance RPCs.

## 4. Configure authentication

Set the application URL and allowed callback URLs in Supabase Auth.

Assign operations access through trusted admin tooling by placing a role in user `app_metadata`:

```json
{ "role": "ops" }
```

or:

```json
{ "roles": ["ops", "admin"] }
```

Do not allow users to write their own `app_metadata`. The server accepts roles listed in `OPS_ROLES`, which defaults to `ops,admin`.

## 5. Configure Vercel environment variables

Start from `.env.example`.

### Application and origin

```dotenv
PUBLIC_ORIGIN=https://finance.example.com
ALLOWED_ORIGINS=https://finance.example.com
RELEASE_CHANNEL=production
```

### Market providers

Recommended failover configuration:

```dotenv
MARKET_PROVIDER_MODE=failover
ALPACA_API_KEY_ID=...
ALPACA_API_SECRET_KEY=...
ALPACA_DATA_FEED=iex
FINNHUB_API_KEY=...
FINNHUB_MODE=delayed
COINBASE_ENABLED=true
```

Use `quorum` only after both relevant provider paths have been observed in production and their expected timestamp/price differences are understood.

### Supabase

```dotenv
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

The service-role key must never be prefixed with `VITE_` or exposed to the browser.

### AI and delivery

```dotenv
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-mini
RESEND_API_KEY=...
ALERT_EMAIL_FROM=alerts@finance.example.com
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:ops@finance.example.com
```

Verify the Resend sending domain before enabling email alerts.
Rebalance email and Web Push are opt-in per allocation policy. Enabling a channel without its server credentials leaves the durable delivery disabled or retryable; it never bypasses approval or submits an order.

### Portfolio monitoring

```dotenv
MONITOR_RULE_LIMIT=200
MONITOR_BUDGET_MS=25000
```

`MONITOR_RULE_LIMIT` caps how many due monitor rules `claim_due_monitor_rules` claims in one daily-maintenance run (default 200, allowed range 1-600). `MONITOR_BUDGET_MS` caps how long the monitor step itself may run (default 25,000ms, allowed range 1,000-55,000ms); the step actually uses whichever is tighter — this budget or what remains of the 60-second function after market capture, snapshots, contributions, rebalances, and rebalance delivery have already run in the same invocation — so raising it does not by itself guarantee more monitor time. Monitor digests reuse the existing Resend/VAPID delivery credentials above; there is no separate monitoring transport to configure.

### Machine secrets

Use independent, high-entropy values:

```dotenv
CRON_SECRET=...
METRICS_SECRET=...
OPS_SECRET=...
```

Do not reuse a browser session token or provider key.

### Strict release requirements

```dotenv
ALLOW_MOCK_FALLBACK=false
REQUIRE_LIVE_DATA=true
REQUIRE_CLOUD=true
REQUIRE_DURABLE_ALERTS=true
REQUIRE_AI=true
RELEASE_MIN_AVAILABILITY_PCT=99
RELEASE_MAX_P95_LATENCY_MS=2500
```

For preview deployments, leave requirement flags false until provider and callback configuration is available. Preview must still display degraded/fallback status honestly.

## 6. Configure Vercel protection and smoke access

This project runs with SSO protection on every deployment except custom domains, so a preview
URL answers `302` to an unauthenticated request and the smoke script cannot reach it. Preview
acceptance therefore requires an automation bypass secret:

```bash
curl -X PATCH \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"generate":{"note":"CI post-deploy smoke"}}' \
  "https://api.vercel.com/v1/projects/$PROJECT_ID/protection-bypass?teamId=$TEAM_ID"
```

The response is keyed by the generated secret. Put it in two places and nowhere else:

```dotenv
VERCEL_AUTOMATION_BYPASS_SECRET=...
```

- `.env.local` for local runs — matched by `.env*.local` in `.gitignore`
- the `VERCEL_AUTOMATION_BYPASS_SECRET` GitHub Actions secret, which
  `.github/workflows/postdeploy-smoke.yml` reads

The smoke script sends `x-vercel-protection-bypass` on every request and never prints the value.
It deliberately does **not** send `x-vercel-set-bypass-cookie`: that asks Vercel to establish a
bypass cookie, which it does by answering `307` + `Set-Cookie`, and every call uses
`redirect: 'manual'` with an exact-status assertion — so the redirect failed the run before the
first real assertion. A stateless script gains nothing from the cookie.

## 7. Deploy

```bash
vercel link
vercel env pull .env.local
npm run check
vercel deploy
```

Promote only after preview acceptance passes.

## 8. Preview acceptance

Run:

```bash
SMOKE_BASE_URL=https://preview.example.vercel.app \
SMOKE_EXPECT_VERSION=1.12.0 \
npm run smoke:deployment
```

Expected degraded-safe behavior when secrets are intentionally absent:

- public configuration, health, readiness, and market APIs respond with request IDs
- unknown symbols return `400`
- telemetry returns `202`
- unconfigured or unauthorized machine routes return `401` or `503`
- operations summary rejects unauthenticated access
- fallback market responses identify themselves as fallback

## 9. Strict production acceptance

After all credentials and migrations are configured:

```bash
SMOKE_BASE_URL=https://finance.example.com \
SMOKE_EXPECT_VERSION=1.12.0 \
SMOKE_REQUIRE_READY=1 \
SMOKE_REQUIRE_PROVIDER=1 \
npm run smoke:deployment
```

Then verify manually:

1. `/api/ready` returns `200` and `ready: true`.
2. `/status` shows provider-backed data, not hidden fallback.
3. `/ops` is denied to an ordinary account and available to an operations role.
4. provider probe updates attempts, latency, and circuit state.
5. a test alert is created from a verified baseline.
6. the alert evaluator Cron creates one trigger and no duplicate delivery.
7. Resend email arrives and Web Push arrives on a subscribed device.
8. market capture persists accepted observations and a heartbeat.
9. an operations action replay with the same idempotency key does not repeat the side effect.
10. release gate is recorded as pass or an explicitly reviewed warning.

## 10. Cron verification

Vercel invokes the configured routes from `vercel.json`:

```text
/api/cron/evaluate-alerts  daily at 00:05 UTC
/api/cron/daily-maintenance daily at 00:20 UTC
```

This is the Vercel Hobby profile: two Cron jobs with daily schedules, both already in use — P10 adds no third schedule. `daily-maintenance` runs market capture and portfolio snapshots, scans allocation drift and delivers newly queued rebalance notifications, then runs due monitor rules last and drains the monitor digest queue. Minute-level alerts, rebalance monitoring, and intraday/sub-daily monitor evaluation require Vercel Pro or an authenticated external scheduler.

Confirm in production logs that:

- authorization succeeds
- duration remains below function limits
- alert leases are released or expire safely
- provider failures create bounded incidents, not retry storms
- accepted/rejected capture counts are plausible
- heartbeats remain current
- the monitor step's claimed/evaluated/breached/deferred/errored/digest counts are plausible, and `budgetExhausted` is not persistently `true` (a persistent `true` means `MONITOR_RULE_LIMIT` or `MONITOR_BUDGET_MS` needs attention, since rules stay due but silently unevaluated)

## 11. Operations action examples

Using a machine secret:

```bash
curl -X POST https://finance.example.com/api/ops/actions \
  -H 'Content-Type: application/json' \
  -H 'X-Ops-Secret: ...' \
  -H 'Idempotency-Key: probe-2026-07-12T10:00Z' \
  -d '{"action":"probe-providers"}'
```

Never reuse the same idempotency key for a different intended action.

## 12. Observability checks

Monitor:

- readiness transitions
- provider success rate and p95 latency
- freshness pass rate and error-budget remaining
- circuit-open events
- cross-provider deviation incidents
- failed delivery backlog
- market-capture heartbeat age
- release-gate status
- API error rate and duration by route

The metrics endpoint requires `METRICS_SECRET`. Do not make it public.

## 13. Rollback

A code rollback must preserve database compatibility.

Recommended order:

1. stop promotion and record the failed release gate
2. roll back the Vercel deployment
3. keep P3 additive tables and RPCs in place
4. disable affected provider or capability through environment configuration
5. verify `/api/health`, `/api/ready`, and alert delivery backlog
6. re-run the smoke test against the rolled-back deployment

Do not drop operational tables during an incident; they contain the evidence needed for diagnosis and replay safety.

## 14. Secret rotation

After rotating a secret:

- redeploy all environments that use it
- test the associated route/provider
- revoke the old secret
- inspect logs for repeated unauthorized attempts
- rotate dependent subscriptions or push keys when required

A leaked service-role, provider, OpenAI, Resend, VAPID private, Cron, metrics, or operations secret is a production incident.


## P11 Korean market acceptance

P11 adds no database migration, no new Cron schedule, and no new environment variable — it is a data/UI-layer change only. `git diff --exit-code vercel.json` must still report no changes.

1. Open `/#/?region=kr` and confirm prices render in won (`fmtKrw`/`fmtKrwCompact`, e.g. `₩246,000`, `₩1.27조`) and the trading calendar reflects KRX sessions, not NYSE ones.
2. Confirm 정치인 and 예측 tabs are absent under `region=kr` and present under the default `region=us` (or no `region` parameter).
3. Confirm a region-aware link (market home → screener/heatmap/stock detail) carries `?region=kr` when generated from a KR-scoped page, and carries no `region` parameter when generated from the default US market.
4. Confirm `engine.listAssets('KR')` and `engine.listAssets('US')` are each non-empty and disjoint, and that a Korean symbol (e.g. `005930`) resolves correctly regardless of which region is currently selected on the page.
5. **Known limitation to confirm, not fix:** `KR_NON_TRADING_DAYS` (`src/data/kr-holidays.ts`) covers 2021–2026 only. A Korean equity chart whose history reaches outside that range will show sessions on days KRX was actually closed, since `isKrEquityTradingDay` degrades to weekdays-only for a year outside the table. This is expected until the table is extended alongside any future extension of the seed's history range.
6. Confirm the portfolio (`/#/portfolio`) is unaffected: it remains a USD-only ledger with no KRW balance, no FX conversion, and no Korean holding option.
7. Run `npm run validate:p11` and the full `npm run check` before deployment.

Korean market data in this phase is demo/seed data with the same synthetic-data disclosure as the rest of the product; it is not a live KRX feed and carries no investment recommendation.

## P10 portfolio-monitoring acceptance

1. Apply `202608050001_p10_monitor_rules.sql` after P9 and verify `monitor_rules`, `monitor_digests`, `monitor_breaches`, `monitor_digest_deliveries`, their RLS select-own policies, and that every security-definer RPC it creates has `PUBLIC`/`anon`/`authenticated` execute revoked and `service_role` execute granted.
2. Create one rule of each kind (thesis invalidation, risk threshold, stress scenario) against a portfolio with verified valuation. Confirm `POST /api/portfolio/monitor-rules` rejects an unknown risk metric, an unknown thesis condition, and an empty `shocks` array with `400 MONITOR_RULE_SPEC_INVALID`.
3. Make one holding's valuation `estimated` (e.g. by disabling its provider). Confirm a thesis rule watching that symbol returns `deferred`, while a thesis rule watching a different, still-verified holding in the same portfolio still judges normally — a portfolio-wide quality gate would incorrectly defer both.
4. Force a rule's condition true and run daily maintenance twice. Confirm the rule transitions `armed → latched` and a digest is sent on the first run, and that the second run sends no second notification for the same unresolved breach.
5. Let the condition go false and run daily maintenance again. Confirm the rule re-arms (`latched → armed`) with no notification for the re-arm itself.
6. Edit a latched rule's threshold through `PATCH`. Confirm it returns to `armed`, `ruleVersion` increments, and `next_evaluation_at` resets to now.
7. Retry the same `POST /api/portfolio/monitor-rules` request after a simulated timeout and confirm it is accepted again as a new rule — this is the accepted non-idempotency gap; there is no dedupe. Delete the duplicate.
8. Confirm `GET /api/portfolio/monitor-status` shows `lastError` populated when `lastOutcome` is `error`, and the deferred `reason` when `lastOutcome` is `deferred`.
9. Confirm another authenticated user cannot read or mutate another user's monitor rules, breaches, or digests.
10. Confirm the Vercel project still has exactly two Hobby Cron entries after this change (`git diff --exit-code vercel.json`).
11. Run `npm run validate:p10`, `npm run validate:migrations`, and the full `npm run check` before deployment.

Monitors place no orders, never transition `investment_theses.status`, and never write the ledger. Thresholds are the user's own planning assumptions, not investment advice.

## P7 rebalance-workflow acceptance

1. Apply `202607130002_p7_rebalance_workflow.sql` after the P6 migration.
2. Save a target policy with an exceeded drift threshold, generate a plan, and confirm its reference prices, provenance, weights, drift, and proposed orders remain unchanged when live prices move.
3. Invoke daily maintenance twice and confirm there is at most one pending or approved plan per portfolio and at most one queued delivery per run/channel.
4. Confirm approval adds an audit event but no `portfolio_transactions` row; reject and expire paths must also be audited.
5. Approve a fresh plan, enter every actual fill, and confirm completion atomically creates ledger rows and fill links. A failed cash, position, minimum-order, or fill validation must create none.
6. Move a reference price by more than 3%, change the portfolio ledger or target policy, or allow the plan to expire; confirm approval/completion requires a new plan.
7. With Resend and VAPID configured and the policy channels opted in, confirm the message names the largest drift and says that it is not an automatic order.
8. Reverse a linked transaction and confirm an `execution_reversed` audit event is retained.
9. Confirm another authenticated user cannot read or mutate any run, item, fill, event, or delivery row.
10. Run `npm run validate:p7` and `npm run validate:migrations` before deployment.

Broker credentials are intentionally out of scope. P7 only records user-entered actual fills after explicit approval.

## P8 goal-contribution acceptance

1. Apply `202607140001_p8_goal_contributions.sql` after P7 and verify `portfolio_goals`, `plan_kind`, goal RLS, the cross-kind open-plan index, and all P8 RPC privileges.
2. Save a goal and confirm the projection states its assumptions and remains read-only until user action.
3. Generate a contribution plan and verify it contains only buy/hold items, conserves the contribution amount, and leaves minimum-order/CASH amounts visible.
4. Confirm approval writes no transaction. Complete with an actual deposit and fills, then verify one deposit plus linked buys commit atomically.
5. Change the goal, policy, ledger, or price by more than 3% between approval and completion and confirm the old plan expires for reapproval.
6. Confirm daily maintenance creates one due goal/date cycle before the P7 drift scan while the Vercel project still has exactly two Hobby Cron jobs.

## P9 cost-optimization acceptance

1. Apply `202607140002_p9_order_cost_optimization.sql` after P8 and verify the seven numeric cost-policy columns, `cost_model_version`, immutable run/item/fill JSON evidence, constraints, RLS, and service-role RPC privileges.
2. Save fixed/percentage commission, buy/sell slippage, sell transaction tax, capital-gains tax, and maximum cost percentage. Refresh and confirm the values persist with `taxLotMethod = 'fifo'`.
3. Generate a P7 rebalance containing a profitable sale. Confirm the plan freezes requested and optimized order values, FIFO lot slices and cost basis, commission, slippage, transaction tax, capital-gains tax, total estimated cost, and estimated tax reserve.
4. Generate a P8 contribution plan whose gross base allocation consumes the full contribution. Confirm optimized buys shrink so commission and slippage fit inside the frozen contribution while the `CASH` target remains reserved.
5. Configure a fixed commission that exceeds `maxCostPct` for a small order. Confirm it becomes an explicit `cost-inefficient` hold and no rejected-order cost is charged.
6. Approve a plan and enter actual price, quantity, fee, and execution time. Confirm quantity cannot exceed the approved estimate, signed slippage is derived from the reference price, FIFO tax is recomputed for sells, and `actual_costs` is linked atomically with the fill.
7. Confirm only the user-entered actual fee changes ledger cash. Estimated transaction and capital-gains taxes remain planning evidence and are never represented as paid or appended automatically.
8. Change the policy, ledger/FIFO evidence, or price beyond the existing safety boundary and confirm the old plan requires regeneration/reapproval rather than silently changing its immutable cost snapshot.
9. Verify historical P7/P8 runs created before P9 remain readable with the legacy zero-cost model.
10. Run `npm run validate:p9`, `npm run validate:migrations`, and the full `npm run check` before deployment.

P9 estimates depend on user-entered rates and the product's FIFO model. They are not tax advice, a tax return calculation, or a broker execution service.

## P6 target-allocation acceptance

1. Apply `202607130001_p6_target_allocations.sql` to the linked Supabase project.
2. Open `/#/portfolio`, save targets totaling 100%, then refresh and confirm they persist.
3. Confirm drift below the configured threshold produces no orders.
4. Confirm drift above the threshold produces review-only buy/sell suggestions and reconciled estimated cash.
5. Confirm another authenticated user cannot read or replace the policy.
6. Run `npm run validate:p6` before deployment.

## P5 performance acceptance

P5 has no additional database migration. After authenticated portfolio snapshots exist at two or more distinct timestamps:

1. Open `/#/portfolio` and confirm TWR, annualized TWR, and XIRR are shown.
2. Switch between SPY, QQQ, and BTC and confirm the benchmark line and excess return update.
3. Confirm provider mode/quality is visible and synthetic or stale benchmark data produces a warning.
4. Confirm the decomposition reconciles net contributions, price P&L, income, and fees to total portfolio value.
5. Run `npm run validate:p5` before deployment.

## P4 portfolio acceptance

After applying `202607120004_p4_portfolio_intelligence.sql`:

1. Create a test user through the configured Supabase magic-link flow.
2. Create a portfolio and append a deposit with a unique `Idempotency-Key`.
3. Replay the exact same request and verify that the same transaction ID is returned.
4. Send two concurrent requests with the same key and verify one economic transaction exists.
5. Append two buys at different prices and a partial sell; verify the summary uses FIFO cost basis.
6. Attempt to sell more than the open quantity and confirm HTTP `409 INSUFFICIENT_POSITION`.
7. Reverse the latest active transaction and verify that the original and reversal rows both remain readable.
8. Attempt to reverse an older active transaction and confirm HTTP `409 REVERSAL_ORDER_CONFLICT`.
9. Confirm a synthetic/fallback valuation is labelled estimated and is skipped by the snapshot Cron.
10. With verified providers and at least 20 aligned historical observations, invoke the snapshot Cron and verify a `portfolio_snapshots` row.
11. Confirm `/api/portfolio/snapshots` returns only the authenticated user's rows.
12. Create and archive an investment thesis; confirm another user cannot read it.

On the Hobby profile, portfolio snapshots run inside the daily maintenance job at 00:20 UTC and require the same independent `CRON_SECRET` used by the other Vercel Cron routes. The bounded target list is ordered by `last_snapshot_attempt_at` so successive runs rotate fairly across active portfolios. Pro deployments may restore the standalone fifteen-minute schedule.

### Authenticated portfolio endpoints

```text
GET/POST/PATCH        /api/portfolios
GET/POST              /api/portfolio/transactions
GET                   /api/portfolio/summary
GET                   /api/portfolio/snapshots
GET/PUT               /api/portfolio/allocation
GET/POST              /api/portfolio/rebalances
GET/PUT/PATCH         /api/portfolio/goal
GET/POST              /api/portfolio/contributions
POST                  /api/portfolio/scenario
GET/POST/PATCH/DELETE /api/portfolio/monitor-rules
GET                   /api/portfolio/monitor-status
GET/POST/PATCH/DELETE /api/research
```

### Portfolio production checks

```bash
npm run validate:p4
npm run validate:p5
npm run validate:p6
npm run validate:p7
npm run validate:p8
npm run validate:p9
npm run validate:p10
npm run validate:migrations
SMOKE_BASE_URL=https://your-deployment.example SMOKE_EXPECT_VERSION=1.12.0 npm run smoke:deployment
```

### P4 snapshot batch sizing

`PORTFOLIO_SNAPSHOT_LIMIT` defaults to 8 and is capped at 20. Increase it only after observing the real provider latency and function duration; the fairness cursor will rotate smaller batches without starving later portfolios.
