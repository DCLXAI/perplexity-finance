# P4 Validation Record

**Version 1.5.0 · 2026-07-12**

The P4 gate is designed to prove accounting and evidence contracts, not to claim that unconfigured third-party accounts were exercised.

## Required commands

```bash
npm ci
npm run check
npm audit --audit-level=low
```

`npm run check` includes:

```text
strict TypeScript
unused symbol checks
Vitest regression suite
browser persistence and alert contracts
P0/P1 financial-data invariants
P2 provider/cloud contracts
P3 resilience/operations contracts
P4 portfolio intelligence contracts
ordered migration validation
production build
static security scan
```

## P4-specific assertions

- FIFO lots consume the earliest open cost basis.
- A sell larger than the open position fails rather than creating an implicit short.
- A reversal cancels the referenced original row without mutating or deleting it.
- Provider-backed accepted quotes are `verified`; synthetic/stale/degraded quotes remain estimated or unpriced.
- Historical risk exposes observation count, data quality, and market-value coverage.
- Stress tests leave cash unchanged and cap an asset shock at a 100% loss.
- Transaction mutation is unavailable directly to authenticated users and the service role.
- Concurrent idempotent transaction requests are serialized by a Postgres advisory transaction lock.
- Backdated insertion behind the latest active economic event is rejected, keeping database checks and FIFO reconstruction consistent.
- Ledger reconstruction pages through database result caps and fails explicitly at its supported ceiling instead of silently truncating transactions.
- Portfolio snapshot selection is fair across bounded Cron batches.
- Strict snapshots require verified holding valuation and an available, verified risk series.
- Snapshot retries preserve the first accepted observation in each 15-minute bucket, and reads return the latest bounded history in chronological order.
- The 15-minute snapshot Cron is protected by `CRON_SECRET`.

## Credential-dependent acceptance

The following require the target deployment and are not represented as locally proven:

- Supabase migration execution and RLS behavior against the real project
- concurrent RPC calls across real serverless instances
- Alpaca/Finnhub/Coinbase entitlement and freshness
- verified snapshot creation under real provider conditions
- Vercel production Cron invocation
- magic-link authentication and cross-device portfolio reads

Use the post-deployment smoke test and the acceptance checklist in `DEPLOYMENT.md` after secrets are configured.

## Latest local verification result

The final source tree was checked on Node.js 22.16.0 with no production credentials:

```text
TypeScript strict + unused symbols    PASS
Vitest files                          24/24 PASS
Vitest tests                          42/42 PASS
P0/P1 data contracts                  PASS
P2 provider/cloud contracts           PASS
P3 resilience/operations contracts    PASS
P4 portfolio contracts                PASS
Ordered migrations                    PASS
Production build                      PASS
Static security scan                  PASS
npm audit                             0 known vulnerabilities
Production preview                    HTTP 200
```

No-credential API behavior was also verified:

```text
/api/config                            200
/api/health                            200 degraded
/api/ready                             200 development-ready
/api/market/quotes                     200 explicit fallback
authenticated portfolio/research APIs  401
/api/cron/snapshot-portfolios          503 CRON_NOT_CONFIGURED
all tested API responses               X-Request-Id present
```

The browser automation CLI was invoked against the local production preview, but the execution environment rejected loopback navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`. HTTP preview, jsdom interaction tests, semantic source scans, and production compilation passed; a credentialed deployed-browser acceptance remains required.
