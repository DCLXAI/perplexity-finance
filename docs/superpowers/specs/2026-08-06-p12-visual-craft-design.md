# P12 — Visual Craft

**Design · 2026-08-06 · targets application version 1.13.0**

## Problem

Synapsu is structurally close to its reference. Placed side by side with Perplexity Finance,
the tab row, top-asset cards, market-summary accordion, heatmap, and right rail all correspond,
and the dark palette is already authored in parallel rather than derived from light — semantic
colours carry their own dark values (`--pos` `#0d8259` → `#3bbf8b`), the heatmap ramp is
re-authored, shadows are adjusted.

What separates the two is craft, and the craft gap has a measurable cause: there is no scale.

`src/styles/global.css` defines colour, typography family, geometry and shadow tokens. It does
not define spacing, type size, or motion. Those live as raw literals across 5,294 lines of CSS
in eleven files — `padding: 12px 6px 14px 12px` here, `font-size: 12.5px` there, `transition:
color 0.12s` elsewhere. Nothing prevents the next one. Screens drift from each other because
nothing holds them together.

Contrast is unverified, and measuring it inverts the intuition:

```text
                 light            dark
--ink-faint      2.05 – 2.20      2.63 – 2.94     fails AA in both themes
--ink-muted      3.29 – 3.54      passes          large-text only, used at 11–13px
--warn           3.32 – 3.57      passes          large-text only
```

Light is the weaker theme. `--ink-faint` fails WCAG AA on every surface in both themes, and
`--ink-muted` clears only the large-text threshold while carrying tab labels and sub-captions at
11–13px. No amount of looking finds this; it is arithmetic.

## Scope

**In:** the four craft axes, across all fifteen routes — layout defects, density and type scale,
dark mode brought to parity as a designed theme rather than a working one, and motion.

**Out:** anything that changes what a screen *says*. The reference's sector-grouped heatmap
labels with per-sector change, its `-3% / +3%` legend, "업데이트된 5분 전" freshness stamps,
per-card source counts, the 워크플로우 tab, and inline intraday charts in the movers rail are all
information-density work. They are a separate phase with a separate spec, and folding them in
here would turn a craft pass into a feature build.

**Also out:** data model changes, new routes, and new runtime dependencies. The contrast maths
is twenty lines; it does not need a package.

## Token layer

Three axes are added. Existing colour tokens keep their names and meanings.

**Spacing** — `--space-1` … `--space-8` on a 4px base. Today's values (6, 11, 12, 13, 14px)
encode no rhythm, so vertical alignment between neighbouring cards is coincidental.

**Type** — `--text-2xs` … `--text-3xl`. The set in use is 9, 11, 12.5, 13, 15px. 9px is why the
market tab's caret read as a dot rather than a disclosure arrow; 12.5px and 13px are not
distinguishable and serve no purpose as separate values. A scale is what produces the
reference's small-label / large-numeral contrast.

**Motion** — `--dur-fast|base|slow` and `--ease-out|spring`, with a single
`prefers-reduced-motion` block that collapses every duration to zero. One place to honour the
preference, rather than eleven files that each might.

**Colour correction** — held to the threshold each token's *role* requires, not one blanket
number. `--ink`, `--ink-strong`, `--ink-secondary`, `--ink-muted` and `--warn` carry text and
answer to WCAG AA at 4.5:1. `--ink-faint` carries carets, chevrons and separator dots — non-text
UI, governed by WCAG 1.4.11 at 3:1.

The distinction is load-bearing rather than pedantic. Forcing `--ink-faint` to 4.5:1 on a
near-white surface lands it on `#6f7272` while `--ink-muted` lands on `#6e7274`: the two become
the same colour and the five-level ink hierarchy collapses. Correct values:

```text
light  --ink-muted   #84898c → #6e7274    3.29 → 4.52   text, AA
light  --ink-faint   #aab0b0 → #8b9090    2.05 → 3.02   non-text, 1.4.11
light  --warn        #b47d12 → #95680f    3.32 → 4.58   text, AA
dark   --ink-faint   #566262 → #606b6b    2.63 → 3.01   non-text, 1.4.11
```

Adjacent ink levels stay at least 1.38 apart in light and 1.14 in dark, so the ladder still
reads. Every other pair already clears its threshold and is left alone.

Dark is already a parallel palette, so it needs scale adoption and the same contrast correction,
not a redesign.

## Enforcement

`scripts/validate-tokens.ts` joins `npm run check` and asserts four things.

**Contrast.** Every declared ink × surface pair, in both themes, computed and required to clear
WCAG AA. A token intended for large text only must say so explicitly to be held to 3:1.

**Theme parity.** Every token declared in `:root` must also exist under `[data-theme='dark']`.
Adding a token to light and forgetting dark is invisible to the eye — the value silently
inherits — and this is the check that catches it.

**Literal discipline.** Outside `global.css`, no raw hex and no raw px for `font-size`,
`padding`, `margin`, or `gap`. Border widths of 1–2px, chart pixel heights, and media-query
breakpoints stay exempt: forcing them onto a spacing scale would be a lie about what they are.

Counting them first changes where the work goes. There is exactly **one** raw hex outside
`global.css` — `#1b1c1e`, once — so colour discipline is already sound and the hex rule costs
nothing to keep. Size and spacing are the problem: **1,481 occurrences across 23 files**, with 30
distinct font sizes including 7.5, 8.8, 9.5, 10.5, 11.5 and 13.5px, and every integer from 1 to
20 used as spacing. Portfolio alone holds 574 of them.

A number that large is not a hand-editing job. A one-shot codemod maps each literal to its
nearest scale step, breaking ties upward so nothing silently shrinks, and each screen-group task
reviews what the codemod produced rather than accepting the diff. The codemod is deleted once
the migration is done — a file-mutating script left beside a gate invites someone to "fix" a red
gate by running it.

**Reduced motion.** Every transition duration resolves to zero under the preference.

## Application order

Shared layers first, because fifteen screens inherit from them.

1. Tokens and the contrast correction
2. `validate-tokens`, wired into `npm run check`
3. UI primitives — `Card`, `ChipTabs`, `SegTabs`, `QuoteRow`
4. The shell — header, tab bar, rail — and the AskBar overlap defect
5. Market home and heatmap
6. Stock detail and chart
7. Screener and crypto
8. Watchlist and earnings
9. Predictions and politicians
10. Portfolio
11. Motion and skeletons, as one pass over the settled layout
12. `validate-p12`, version 1.12.0 → 1.13.0, documentation

Portfolio is its own task: P4 through P9 accumulated there and it is the heaviest screen in the
application. Motion comes after layout because animating a layout still in flux means animating
it twice.

## Verification

Craft is where review degenerates into opinion, so this phase carries the same standard as the
ones before it: a claim is evidence only once something has been observed to fail without it.

**Executable.** `validate-tokens` decides contrast, theme parity, literal discipline and reduced
motion. These are computed, not judged.

**Browser evidence, per task.** Both themes × three viewports (375 / 768 / 1280), with
screenshots, plus a scripted overlap check: if a floating element's bounding box intersects body
text, the task fails. The AskBar covering the market-summary list is the reference case for that
check — it is a live defect today, visible in production.

**Guards must be seen to fail.** Any test added is proven by breaking what it guards, observing
the actual failure output, restoring, and observing the pass. This branch has already shipped two
tests that passed against the code they claimed to cover; both were caught by this rule.

## Safety boundary

Nothing here touches provenance, the quality gate, or what may become a strict snapshot. Demo
and synthetic data stay labelled exactly as they are (`DEMO · 합성 시세`). A visual pass must not
make simulated data look more authoritative than it is — in particular, polish applied to price
and change surfaces must leave every provenance badge, fallback notice, and as-of stamp at least
as prominent as it is today.
