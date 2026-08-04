# Maintenance — Runtime and dependency upgrade

**Application version 1.10.0 (unchanged) · 2026-08-05**

This entry records a dependency and toolchain upgrade. It changes no API contract, database
schema, or product behaviour, so the reported application version stays at `1.10.0`.

## Runtime floor

Node.js minimum moves from **20.19** to **22.22**. React Router 8 requires Node `>=22.22.0`, and
`package.json` `engines` is what Vercel reads when selecting the serverless function runtime.
`README.md`, `DEPLOYMENT.md`, and the CI matrix were updated together.

## Dependencies

| Package | From | To | Note |
|---|---|---|---|
| `react` / `react-dom` | 18.3.1 | 19.2.8 | |
| `@types/react` / `@types/react-dom` | 18.3.x | 19.2.x | |
| `react-router-dom` | 6.30.4 | — | Package removed upstream in v8 |
| `react-router` | — | 8.3.0 | Replaces `react-router-dom` |
| `typescript` | 5.6.3 | 5.9.3 | Not 7.x — see below |
| `lightweight-charts` | 4.2.3 | 5.2.0 | |
| `vite` | 8.1.4 | 8.2.0 | |
| `@supabase/supabase-js` | 2.110.2 | 2.112.0 | |
| `@upstash/redis` | 1.38.0 | 1.38.2 | |
| `@vitejs/plugin-react` | 6.0.3 | 6.0.5 | |
| `tsx` | 4.23.0 | 4.23.5 | |
| `@testing-library/user-event` | 14.6.1 | 14.6.3 | |

`npm audit --audit-level=low` now reports **0 vulnerabilities**. Resolved advisories: PostCSS path
traversal (high, transitively via Vite), five `undici` advisories (high, transitively via jsdom),
React Router open redirect (moderate) and RSC-mode CSRF bypass (high).

## Deliberate version pins

Two packages are intentionally *not* on their npm `latest` tag. Do not "fix" these without
re-reading this section.

- **`typescript` stays on 5.9.3, not 7.0.2.** TypeScript 7's package exports map `.` to
  `./lib/version.cjs`; the compiler API moved to `typescript/unstable/*`, which upstream labels
  unstable. `scripts/validate-esm-imports.ts` uses `ts.createSourceFile` and the AST helpers, so
  TS 7 would require rewriting a validation script against an explicitly unstable API. On 7.0.2 the
  only other errors were the two `Uint8Array` variance issues fixed below, so this can be revisited
  once the compiler API stabilises.
- **`@types/node` stays on the 22.x line (22.20.1), not 26.x.** Types should describe the oldest
  supported runtime. With `engines` at `>=22.22.0`, Node 26 types would let code compile against
  APIs absent from the deployment floor.

## Code changes required by the upgrade

- **React 19 ref types.** `useRef<T>(null)` now yields `RefObject<T | null>`. Widened the
  declarations in `src/components/ui/Modal.tsx`, `src/components/ui/useDialogFocus.ts`, and
  `src/features/market/MarketPage.tsx`; the 14 dependent call sites needed no change.
- **Global `JSX` namespace removed.** `src/features/rail/RailWidgets.tsx` now imports
  `type JSX` from `react`.
- **React Router.** All 18 `react-router-dom` imports became `react-router`. The app uses only
  declarative APIs (`HashRouter`, `Link`, `NavLink`, `Route`, `Routes`, `Outlet`, `MemoryRouter`,
  `useLocation`, `useNavigate`, `useParams`, `useSearchParams`), all exported from `react-router`;
  no `RouterProvider`, so the `react-router/dom` entry point is unused. Obsolete
  `future={{ v7_startTransition, v7_relativeSplatPath }}` props were dropped from two tests —
  those behaviours are defaults since v7.
- **`Uint8Array` variance.** Under `@types/node`, a bare `Uint8Array` widens to
  `Uint8Array<ArrayBufferLike>`, which is not assignable to `BufferSource`. Both producers return
  `ArrayBuffer`-backed buffers, so `src/cloud/push.ts` (`decodeVapidKey`) and
  `server/local-server.ts` (`body`) now declare `Uint8Array<ArrayBuffer>`.
- **`tsconfig.json`.** Removed `baseUrl` and made the `@/*` path mapping relative (`./src/*`).
  Required by TS 7 and equivalent under 5.9, so it is kept as forward-compatible.
- **lightweight-charts v5.** `chart.addAreaSeries(o)` / `addCandlestickSeries(o)` /
  `addHistogramSeries(o)` became `chart.addSeries(AreaSeries, o)` / `addSeries(CandlestickSeries, o)` /
  `addSeries(HistogramSeries, o)` in `src/features/stock/PriceChart.tsx`, the only consumer.

## CI

- `actions/checkout`, `actions/setup-node`, `actions/upload-artifact` moved v4 → v5.
- `verify` now runs as a matrix across Node 22.22 and 24; the bundle artifact uploads once, from 22.
- `npm audit --audit-level=low` moved out of `verify` into its own `audit` job, so a future advisory
  reports as a distinct failure instead of masking the build result.
- `postdeploy-smoke.yml` had `SMOKE_EXPECT_VERSION: 1.5.0` hardcoded against an application at
  1.10.0, which would fail every run. It now reads the version from `package.json`.

## Verification

`npm run check` passes end to end: strict typecheck, 37 test files / 102 tests, all 15 validation
scripts, production build, and security scan. `npm audit --audit-level=low` reports 0
vulnerabilities.

`PriceChart` has no unit test, so the lightweight-charts v5 migration was verified in a browser
against `/#/stock/AAPL`: candlestick series, area/line series, volume histogram, price line, time
scale, and the theme-change `applyOptions` path all render, with no console errors.
