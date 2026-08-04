# P3 Changelog — v1.4.0

**Completed: 2026-07-12**

## Objective

P3 upgrades the P2 provider integration into a resilient, observable, and release-gated financial system. It concentrates on evidence, recovery, and operator control rather than additional visual features.

## Market-data resilience

- added Finnhub secondary equity adapter
- added Coinbase Exchange secondary crypto adapter
- added `primary`, `failover`, and `quorum` modes
- added per-provider circuit breakers with open/half-open/closed state
- added provider request registry with attempts, success rate, latency, freshness, and failure state
- added in-flight request coalescing and stale-if-error behavior
- added last-known-good provider quote storage
- enforced provider → secondary → last-known-good → explicit synthetic recovery order
- prevented synthetic regression over accepted provider values

## Quality and provenance

- added quote freshness, session, OHLC, numeric, and timestamp validation
- added cross-provider basis-point deviation reconciliation
- added degraded quarantine for material disagreement
- added lineage and verification metadata
- added alert-eligibility decision to provenance
- added bounded data-quality incident generation
- added AI evidence hashing

## Durable operations

- added fair alert-evaluation claims and expiring leases
- added bounded delivery concurrency and timeouts
- added market observation capture Cron
- made alert trigger state and delivery enqueue one atomic database operation
- added persistent provider snapshots, heartbeats, and cross-instance SLO evidence
- added incidents, operation idempotency, operation audit, and release-gate records
- added retry-failed-delivery and retention-pruning RPCs

## Readiness and release safety

- added `GET /api/ready`
- separated liveness from deployment readiness
- added 60-minute market SLO calculation
- added availability, p95 latency, freshness pass rate, and error budget
- added canonical release-gate calculation
- blocked release on required readiness failures, breached SLO, or unresolved critical incidents

## Operations interface

- added public `/#/status`
- added role-gated `/#/ops`
- added provider status, circuit state, SLO, backlog, incidents, and release gate views
- added privileged provider probe, circuit reset, failed-delivery retry, retention pruning, and release-gate actions
- required `Idempotency-Key` for every operation mutation
- added atomic claim/complete/release leases for cross-instance operation replay safety
- added operations role/secret authorization

## Security and observability

- added same-origin mutation checks
- added timing-safe machine-secret comparison
- separated Cron, metrics, and operations secrets
- added structured-log redaction tests
- added hardened API responses and request IDs
- added static security scan for unsafe HTML, browser-exposed secrets, insecure external links, and forbidden environment files
- added deployment smoke test

## Database

Added:

```text
supabase/migrations/202607120002_p3_operations.sql
supabase/migrations/202607120003_p3_hardening.sql
```

Both migrations are additive and follow the P2 cloud migration in order.

## Tests and validation

- added circuit-breaker tests
- added cross-provider quality tests
- added API-boundary hardening tests
- added log-redaction tests
- added SLO/release-gate tests
- added P3 contract validator
- added migration contract validator
- expanded CI to run the complete P3 gate

## Package hygiene

- version raised from `1.3.0` to `1.4.0`
- `.env.example` expanded with provider, resilience, operations, retention, and release-gate configuration
- Vercel functions and Cron configuration expanded
- no live credentials included
