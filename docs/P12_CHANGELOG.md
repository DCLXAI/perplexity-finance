# P12 Visual Craft

**Version 1.13.0 · 2026-08-06**

## Added

- Three token axes in `src/styles/global.css`: a **spacing scale** (`--space-0-5` through `--space-16`: 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 40, 48, 64px — the top three steps were added mid-phase, see "Codemod repairs" below), a **type scale** (`--text-2xs` through `--text-3xl`: 10, 11, 12, 13, 15, 17, 20, 24, 32px), and **motion tokens** (`--dur-fast` 120ms, `--dur-base` 150ms, `--dur-slow` 300ms, `--ease-out`, `--ease-spring`), all zeroed by a single `prefers-reduced-motion: reduce` block.
- `scripts/validate-tokens.ts`, wired into `npm run check` as `validate:tokens`. It fails the build on: any raw px in a guarded property (`font-size`, `padding`, `margin`, `gap`, `row-gap`, `column-gap`, `inset`, and their logical-property variants, e.g. `padding-inline-start`) outside `global.css`; a token declared in `:root` with no `[data-theme='dark']` counterpart; an ink/surface pair below its contrast threshold; and a missing `prefers-reduced-motion` escape hatch. Border widths, chart pixel heights, and media-query breakpoint conditions are exempt by design — forcing those onto a spacing scale would misrepresent what they are.
- `scripts/validate-p12.ts`, wired into `npm run check` as `validate:p12`.
- `Skeleton`, a loading-state primitive (`src/components/ui/Skeleton.tsx`) built on the token scales, with a reduced-motion-respecting shimmer.

## Colour corrections

Four tokens fell short of their WCAG contrast threshold and were corrected. Two rounds landed on the final values: an initial pass (commit `73017e6`) fixed the ink tokens against their body-text/UI-mark surfaces, and a fix round (commit `0f25af8`) additionally corrected `--warn`, `--pos`, and `--teal` against their own semantic background chips (`--warn-bg`, `--pos-bg`, `--teal-soft`) — a pairing the original review pass had missed.

| Token | Theme | Before | After | Ratio before → after | Threshold | Why |
| --- | --- | --- | --- | --- | --- | --- |
| `--ink-muted` | light | `#84898c` | `#6e7274` | 3.29 → 4.52 | 4.5:1 (AA, text) | Body/secondary text |
| `--ink-faint` | light | `#aab0b0` | `#8b9090` | 2.05 → 3.02 | 3:1 (WCAG 1.4.11, non-text) | Carets, chevrons, separator dots — UI marks, not text |
| `--ink-faint` | dark | `#566262` | `#606b6b` | 2.63 → 3.01 | 3:1 (WCAG 1.4.11, non-text) | Same role, dark surface |
| `--warn` | light | `#b47d12` | `#8a680f` (via an intermediate `#95680f`) | 3.12 → 4.51 on `--warn-bg` | 4.5:1 (AA, text) | The 로컬 폴백 provenance badge text must stay legible — the phase constraints require provenance to stay prominent |
| `--pos` | light | `#0d8259` | `#0d7259` | 4.16 → 5.08 on `--pos-bg` | 4.5:1 (AA, text) | Positive-change figures on their tinted chip |
| `--teal` | light | `#20808d` | `#20708d` | 3.92 → 4.72 on `--teal-soft` | 4.5:1 (AA, text) | Brand teal on its tinted chip — this is also the literal brand colour (logo mark, focus rings, links, chart strokes across ~20 files); darkening it rather than lightening `--teal-soft` was the smaller, deliberately chosen change (a ~2.4° hue rotation, lightness unchanged), pending design sign-off |

`--warn` moved twice: the phase-1 pass took it from `#b47d12` to `#95680f` against body text; the fix round found `#95680f` still cleared only 4.30:1 against `--warn-bg` and moved it once more to `#8a680f` (4.51:1).

### Why `--ink-faint` is held to 3:1, not 4.5:1

`--ink-faint` carries carets, chevrons, and separator dots — non-text UI, governed by WCAG 1.4.11 (3:1), not the 4.5:1 text threshold. This is load-bearing, not a shortcut: forcing `--ink-faint` to clear AA lands it at `#6f7272` (contrast 4.52 against `--bg-inset`), which is visually indistinguishable from `--ink-muted`'s `#6e7274` — the two colours collapse and the product's five-level ink hierarchy (`--ink`, `--ink-strong`, `--ink-secondary`, `--ink-muted`, `--ink-faint`) drops to four. Holding `--ink-faint` to the correct non-text threshold instead of the text one is what keeps the hierarchy intact.

## Literal discipline: 1,193 declarations → 0

The validator counts guarded **declarations** with a raw px value, not individual px numbers. An earlier report of "1,481" counted raw px *values* without first stripping media-query breakpoint conditions (e.g. `@media (max-width: 768px)` contributes a px value that is not a spacing/type declaration) — that number is not what the gate tracks and should not be quoted as the phase's starting count. The number the gate tracks, and drove to zero, is:

- **Start: 1,193 declarations**, holding 1,463 individual px values, across 23 CSS files.
- **End: 0 declarations.** `npm run validate:tokens` now reports `"literals": 0` and `"result": "PASS"`.

The migration ran as an 11-file codemod pass (`scripts/codemod-tokens.mjs`, since deleted — see "Removed" below), snapping each literal onto the nearest scale step, with two repairs made mid-phase:

- **Negative-value bug**: the codemod initially emitted invalid CSS for negative literals (`margin-left: -5px` → `-var(--space-1-5)`, which the CSS parser drops silently — `getComputedStyle` returns `""`). Fixed to emit `calc(var(--token) * -1)`.
- **Above-ceiling crushing**: any value above the then-current scale ceiling (32px) silently snapped to the top step regardless of magnitude — a 96px `padding-top` became 32px, a 66% cut, with nothing in the pipeline able to detect it (a lone crushed value produces no collapse warning, and post-codemod the property holds a valid token with zero raw px left to flag). Fixed by extending the spacing scale to `--space-10`/`--space-12`/`--space-16` (40/48/64px) and adding a snap warning fired when a value moves by both ≥3px absolute and >20% relative — tuned with a magnitude floor after an unfiltered version produced 33 false positives for 1 real one across a seven-file proof run.

## AskBar overlap fix

The AI AskBar (`.ai-askbar`, a `position: fixed` bar) covered the last one to two rows of on-load page content on narrow viewports across all fifteen routes. **The plan's prescribed fix — `padding-bottom` on `.app-main` — was proven unable to fix the defect** and was not shipped: trailing padding lengthens the *scroll range*, but a fixed-position overlay sitting mid-viewport cannot be pushed off content that renders above the fold; toggling that padding from 0 to 400px on production still left 2 rows covered every time, with `askbarTop` frozen at the same value.

What shipped instead (commit `2f891f8`, following a fix round that found three further defects in the first attempt at the corrected approach):

- `#root` is a flex column at `100svh`.
- `.app-main` is `flex: 1 1 auto`, `position: relative`, `overscroll-behavior-y: contain`.
- The bottom-margin reservation is scoped with `body:has(.ai-askbar)`, so it applies only on the routes where the AskBar actually mounts.

Measured effect: document scroll extent (the symptom that made `/#/crypto` render an entirely blank viewport at its old scroll offset) went from 752px/1539px to 0 on the affected routes at both 1280×800 and 375×812. Dead reserved space dropped to 0 on the four routes where the AskBar never mounts (`/portfolio`, `/screener`, `/watchlist`, `/apps`), while the routes where it does mount keep 124px of reservation. Clearance between `.app-main`'s bottom edge and the AskBar's top edge is 17.8px (was ~1px). The skip link, previously broken by an `overflow-y: auto` interaction, now correctly returns `scrollTop` to 0 with the header on screen. `scripts/check-overlap.mjs` — hardened during this fix to actually detect the class of bug it exists to catch (it previously reported false-clean because it only checked block-level selectors and missed the `<span>` summary rows the AskBar overlapped) — reproducibly reports the overlap against the unfixed layout and names `ai-askbar` as the covering element, confirming the checker itself is now a real gate for Tasks 5–10 to reuse.

**Not closed by this fix, deferred:** the same `100vh`/`100dvh` hazard class exists in `ai.css`'s `.ai-panel` (the user-opened chat panel, a different element from the on-load AskBar reservation this task fixed) — out of scope here. Real-device toolbar-show/hide behavior could not be exercised in this environment (DevTools emulation reports `vh == svh == lvh == dvh` on every probe), so the `100svh` fix is closed by construction — `#root` is fixed at `svh` regardless of toolbar state — rather than by direct observation; only real-device testing converts this to observation.

## Removed

- `scripts/codemod-tokens.mjs` and its type-declaration sibling `scripts/codemod-tokens.d.mts`. It existed for the one-time migration described above; every screen has been migrated, `validate:tokens` reports zero literals, and leaving a file-mutating script beside the gate it fed would invite someone to "fix" a red gate by re-running the mutator instead of reading what broke. The test cases in `scripts/validate-tokens.test.ts` that covered the codemod's rewrite behavior were removed along with it; every test covering `validate-tokens.ts` itself (contrast, `nearestStep`, `findLiteralViolations`) remains.

## Known gaps carried out of this phase

- **`--teal` brand-colour deviation** (see the colour-corrections table above) shipped without explicit design sign-off; recommended before this ships further downstream.
- **`src/features/stock/PriceChart.tsx`'s `readPalette()`** carries stale hardcoded hex fallbacks (`#20808d`, `#0d8259`) that no longer match the corrected tokens. Defensive-path only — it fires solely if `getComputedStyle` fails — but is now stale.
- **`.ai-panel`'s `100vh`/`100dvh` usage** (see "AskBar overlap fix" above) was not touched by this phase.
- **`.ui-card:hover` scoping** (`a.ui-card:hover, button.ui-card:hover`, added in Task 11) currently matches zero call sites — `Card` always renders a bare `<div>` at all 34 existing usages — shipped as a forward-compatible interface contract for a not-yet-built interactive variant, mirroring the existing `a.ui-qrow:hover` idiom, rather than as dead CSS.
- **`.pf-empty-state`, `.er-day-logos`/`.er-day-meta`/`.er-day-none`/`.er-entry-bullets`, and `ops.css`'s minified formatting** are pre-existing gaps (unreachable demo branch, dead CSS selectors, and inconsistent formatting respectively) noted during this phase's review but out of its scope to fix.
- **`scroll-margin: 24px`** in the codebase was incidentally rewritten by the codemod's margin-property regex (a known prefix-matching sharp edge). It is the only such site in the repository, resolves to exactly 24px with zero drift, and was left as-is — reverting it would reintroduce a literal.

## Validation

`npm run validate:p12` asserts: the application version is `1.13.0`; `validate:tokens` runs inside the `check` chain; `global.css` declares each of the three token axes' representative tokens (`--space-1`, `--space-8`, `--text-2xs`, `--text-3xl`, `--dur-fast`, `--ease-out`); `global.css` carries the `prefers-reduced-motion: reduce` block; and the pre-correction `--ink-faint`/`--ink-muted` light values are gone.

`npm run validate:tokens` asserts theme parity, contrast (per the thresholds above), zero literal declarations, and the reduced-motion escape hatch, independently of `validate:p12`.

```bash
npm run validate:tokens
npm run validate:p12
npm run check
```
