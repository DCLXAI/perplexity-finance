# P11 Korean Market Parity

**Version 1.12.0 · 2026-08-06**

## Added

- A `MarketRegion` (`'US' | 'KR'`) carried on the URL as `?region=kr`/`?region=us` (`REGION_PARAM`), defaulting to `US`. The URL is the single source of truth at render time; `localStorage` only picks the *landing* default and is never consulted during render, so a stale bookmark and a fresh link cannot disagree. `?region=` is stamped on generated links only when the target region is not the default `US`.
- `AssetMeta.region` on every seed asset, so the data engine resolves any symbol — a US ticker or a six-digit KRX code — without being told which market it belongs to. `region` scopes *listings* (`engine.listAssets(region)`, movers, screener, heatmap), not symbol lookup.
- Won formatting: `fmtKrw` (`₩246,000`, whole units — KRX quotes in won, so a decimal is noise) and `fmtKrwCompact` (조/억 compaction, e.g. `₩1.27조`, `₩660억`, matching how a Korean reader actually parses a market cap, rather than a translated `US$1.57T`). `fmtInstrumentValue`/`fmtInstrumentChange` gained a `'KRW'` branch; the existing `USD`/`POINTS`/`PERCENT`/`USD_PER_OZ`/`USD_PER_BBL` branches are unchanged.
- A KRX trading calendar (`KR_EQUITY`), added alongside the existing `US_EQUITY`/`WEEKDAY`/`CRYPTO_24_7` calendars. `calendarForAsset(kind, region)` selects it for Korean equities. KST is treated as a fixed UTC+9 offset (`kstTimestamp`) since Korea does not observe daylight saving, unlike the existing Eastern-time helper.
- A KRX non-trading-day table (`KR_NON_TRADING_DAYS`, `src/data/kr-holidays.ts`) covering **2021–2026**, sourced per-year against primary KRX/broker year-end notices rather than computed — see the "Known limitation" note below.
- A 159-stock Korean equity universe (`src/data/universe.kr.ts`, `KR_STOCKS`) across 11 sectors, plus 5 Korean indices (KOSPI, KOSDAQ, KOSPI 200, USD/KRW, VKOSPI). Market caps are authored in trillion KRW and converted once to USD via a single recorded `KRW_PER_USD = 1,392.5` constant — see the "Exchange-rate assumption" note below.
- Korean quotes are stamped with their own as-of (`SNAPSHOT.krAsOfISO`, a 2026-08-05 KRX close), one session after the US equity anchor (`SNAPSHOT.asOfISO`, 2026-08-04). Provenance, session data, and candle end-dates for KR assets all route through the KR as-of rather than incorrectly inheriting the US one.
- Korean market content: a region switcher (US/KR), a Korean market home, a region-aware screener and heatmap, region-scoped earnings and stock detail pages, and a cross-region watchlist. 정치인 (politician trading) and 예측 (prediction markets) tabs are hidden under `KR` — see the "Deferred, not fabricated" note below.
- Real brand marks for 30 of the 159 Korean stocks, via 6 simple-icons slugs (Samsung, LG, Hyundai Motor Group, Kia, NAVER, Kakao) shared correctly across confirmed group affiliates. The other 129 Korean stocks — including SK hynix, the largest Korean name without a mark — keep their existing initial-chip fallback rather than an invented logo.
- `scripts/validate-p11.ts`, wired into `npm run check` as `validate:p11`.

## Known limitation: the holiday table's range

`KR_NON_TRADING_DAYS` covers 2021–2026 only, because 설날/추석/부처님오신날 are lunar and 대체공휴일/임시공휴일 are announced per year by government notice — neither is computable the way `usEquityHolidayKeys` derives US holidays from Gregorian rules. `isKrEquityTradingDay` degrades gracefully for a year outside that range: it still excludes weekends, but treats every weekday as a trading day (no lunar/administrative holidays subtracted). This means generated bars for a Korean equity chart reaching before 2021 or after 2026 will show sessions on days KRX was actually closed. **A future maintainer extending the seed's history further back or forward must extend this table alongside it**, or accept that degraded accuracy for the years outside the table.

## Known limitation: the portfolio remains a USD ledger

P4–P9's portfolio, transaction ledger, risk analytics, rebalancing, goal contributions, and cost optimization are unchanged and remain nominal-USD only. P11 adds no multi-currency ledger, no KRW cash balance, and no FX conversion inside the portfolio domain — a Korean holding cannot currently be held in the demo/authenticated portfolio at all. Multi-currency portfolio accounting (FX-adjusted cost basis, cross-currency risk metrics, KRW deposits/withdrawals) would reopen the P4–P9 domain model and is explicitly out of scope for this phase.

## Deferred, not fabricated: 정치인 and 예측 under `KR`

The 정치인 (politician trading) and 예측 (prediction market) tabs are hidden when `region=KR` rather than populated with Korean data, because:

- **정치인**: Korea's 공직자윤리법 (Public Service Ethics Act) requires officials to register asset holdings *annually*, with no equivalent to the US STOCK Act's per-trade disclosure regime. There is no trade-level filing to source a Korean politician-trading feed from.
- **예측**: there is no domestic securities-linked prediction market in Korea comparable to the US surface this tab presents.

Both are deferred to their own phase rather than filled with synthesized or approximated records — the same principle this project applies to the holiday table and the seed data: a value that cannot be sourced and corroborated is marked absent, not guessed.

## Exchange-rate assumption

The Korean seed's market caps are authored in trillion KRW and converted to the engine's canonical USD `marketCap` field via one recorded constant, `KRW_PER_USD = 1,392.5` (`src/data/universe.kr.ts`), matching the 2026-08-04/05 snapshot window the seed otherwise anchors to. `fmtMarketCap` converts back to won for display (`fmtKrwCompact(quote.marketCap * KRW_PER_USD)`) so a KR-priced quote's cap is never shown in USD. This is a fixed point-in-time assumption baked into demo data, not a live FX feed — it is recorded here rather than left implicit so a future maintainer refreshing the seed knows to refresh this constant too.

## Validation

`npm run validate:p11` asserts: the application version; `parseRegion` case-insensitivity and its US fallback for an unrecognised value; `fmtKrw`/`fmtKrwCompact` won formatting including the 조/억 compaction thresholds; that the existing USD instrument-value formatting is unaffected; that 광복절 (2025-08-15, a weekday) and an ordinary weekend are excluded from the KRX calendar while an ordinary weekday trades; that a year outside `KR_HOLIDAY_YEARS` degrades to weekdays-only instead of throwing; that every Korean seed asset carries `region: 'KR'` and every Korean *stock* carries `unit: 'KRW'` (the Korean index rows are priced in `POINTS`, except the USD/KRW cross); that every US seed asset carries `region: 'US'`; that `engine.listAssets('KR')` and `engine.listAssets('US')` are non-empty and disjoint; and that `vercel.json` still declares exactly two Cron entries.

```bash
npm run validate:p11
npm run check
```
