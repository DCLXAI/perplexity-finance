# P3 Validation Record — v1.4.0

**Validation date: 2026-07-12**

## Commands

```bash
npm ci
npm run check
npm audit --audit-level=low
```

`npm run check` executes:

```text
typecheck:strict
test
test:contracts
validate:data
validate:p2
validate:p3
validate:migrations
build
security:scan
```

## Verified results

| Gate | Result |
|---|---:|
| TypeScript strict and unused-symbol check | PASS |
| Vitest files | 20/20 PASS |
| Vitest tests | 35/35 PASS |
| persistence and alert crossing contracts | PASS |
| deterministic financial data validation | PASS |
| P2 provider/cloud contracts | PASS |
| P3 resilience and operations contracts | PASS |
| migration contracts | PASS |
| production Vite build | PASS |
| static security scan | PASS |
| npm known vulnerabilities | 0 |

## P3 contract output

```json
{
  "version": "1.4.0",
  "multiProviderQualityGate": "PASS",
  "syntheticExcludedFromAlerts": "PASS",
  "circuitBreaker": "PASS",
  "readinessAndReleaseGate": "PASS",
  "aiEvidenceHash": "PASS",
  "logRedaction": "PASS",
  "result": "PASS"
}
```

## Migration contract output

```json
{
  "migrations": [
    "202607120001_p2_cloud.sql",
    "202607120002_p3_operations.sql",
    "202607120003_p3_hardening.sql"
  ],
  "fairScheduler": true,
  "atomicAlertDelivery": true,
  "leasedOpsIdempotency": true,
  "opsLedger": true,
  "privilegedMutations": true,
  "result": "PASS"
}
```

## Financial-data regression output

```json
{
  "assets": 219,
  "stocks": 187,
  "crypto": 20,
  "equity1DBars": 26,
  "equity5DBars": 130,
  "equity7DBars": 182,
  "crypto7DBars": 672,
  "ytdFirstSession": "2026-01-02",
  "predictions": 10,
  "earnings": 17,
  "immutableSnapshots": true,
  "sessionSeparation": true,
  "batchesPerTick": 1,
  "result": "PASS"
}
```

## Production bundle from the validated tree

```text
main JavaScript     344.82KB · gzip 107.81KB
stock page chunk    172.95KB · gzip 56.56KB
operations chunk      8.92KB · gzip  3.01KB
status chunk          6.72KB · gzip  2.25KB
main CSS             24.70KB · gzip  5.67KB
```

## Security scan output

```json
{
  "scannedFiles": 142,
  "unsafeHtml": 0,
  "browserSecrets": 0,
  "unsafeExternalLinks": 0,
  "result": "PASS"
}
```

The npm advisory database reported zero known vulnerabilities across production and development dependencies at validation time.

## What this validation proves

- the source type-checks and builds
- unit and integration contracts pass
- provider disagreement is quarantined
- synthetic data cannot trigger durable alerts
- the circuit breaker state machine behaves as intended
- readiness and release-gate calculations share one canonical implementation
- log redaction removes tested credential and PII values
- P2 and P3 migrations contain the required fair scheduling, atomic delivery, leased idempotency, and operations contracts
- built client assets contain no tested server secret markers

## What still requires target-environment acceptance

No real provider or service credentials were embedded in the validation environment. Therefore the following must be verified after deployment:

- Alpaca entitlement and selected feed
- Finnhub plan behavior and timestamp expectations
- Coinbase public endpoint availability from the deployment region
- Supabase Auth redirect and operations-role metadata
- Supabase Realtime delivery
- Postgres RPC permissions under the actual project
- Resend sending-domain authorization
- Web Push on a real subscribed browser
- OpenAI tool-call round trip
- Vercel production Cron invocation
- Upstash rate-limit and cache behavior
- provider SLO accumulation over a real 60-minute window

Use `npm run smoke:deployment` and the strict production checklist in `DEPLOYMENT.md` for those checks.

## Local runtime smoke

The Vite application and local API runtime were started together and checked through the same `/api` proxy used by development:

```text
GET  /api/config                         200
GET  /api/health                         200
GET  /api/ready                          200 (development requirements are optional)
GET  /api/market/quotes?symbols=AMD,BTCUSD 200 + explicit fallback
GET  /api/market/quotes?symbols=NOT_A_SYMBOL 400
POST /api/telemetry                      202
GET  /api/metrics                        503 when secret is not configured
GET  /api/cron/evaluate-alerts           503 when secret is not configured
GET  /api/cron/capture-market            503 when secret is not configured
GET  /api/ops/summary                    401 without operations authorization
GET  /                                   200
```

Every API response in the smoke suite included `X-Request-Id`, and the suite returned `PASS`.

A real-browser navigation attempt was also made with `agent-browser`, but the execution environment blocked loopback navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`. Pixel-level and mobile screenshot verification therefore remains a target-environment acceptance item; component interaction, semantic accessibility, production build, and HTTP runtime behavior were verified by automated tests and the smoke suite.
