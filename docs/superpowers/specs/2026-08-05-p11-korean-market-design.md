# P11 — Korean Market Parity

**Design · 2026-08-05 · targets application version 1.12.0**

## Problem

The application only knows one market. `InstrumentUnit` is `'USD' | 'POINTS' | 'PERCENT' |
'USD_PER_OZ' | 'USD_PER_BBL'`, `fmtUsd` hardcodes `US$`, `MarketCalendar` is
`'US_EQUITY' | 'WEEKDAY' | 'CRYPTO_24_7'` with NYSE holidays, and the `US ▾` control on the
market page is a static label with nothing behind it. There is no region concept anywhere.

P11 adds the Korean market as a first-class region: KRX equities, KOSPI/KOSDAQ indices, the
won, and the KRX trading calendar, reachable from a real region switcher.

## Scope

**In:** market home, screener, heatmap, stock detail, earnings, and a watchlist that can hold
both regions.

**Deferred to a later phase:** politicians and prediction markets. Neither has a Korean
equivalent to model. `PoliticianTrade` is bound to the US disclosure regime —
`party: '민주당' | '공화당'`, `chamber: '하원' | '상원'`, `state`, `amountRange: '$100K – $250K'` —
because the STOCK Act requires per-trade disclosure within 45 days. Korea's 공직자윤리법
registers assets once a year with no trade-level filing, so a Korean version of that page
would be inventing records that do not exist. Prediction markets are the same story: every
entry is `Polymarket-style` or `Kalshi 형식`, and securities-based prediction markets are not
operated domestically. Both pages are hidden in Korean mode rather than filled with
fabrications; a Korean-native version of each is its own future phase.

**Out:** the portfolio stays a USD ledger. FIFO lots, snapshots, TWR, XIRR, and the P9 cost
optimizer all assume a single currency. Making the ledger multi-currency reopens P4 through
P9 and is a phase in its own right, not a side effect of adding a market.

## Region model

`MarketRegion = 'US' | 'KR'`, carried in the URL as `?region=kr`, defaulting to `us`.

The URL is the single source of truth at render time. Links and refreshes have to work, and
`PortfolioPage` already reads `useSearchParams`, so this follows an established pattern rather
than introducing a second state mechanism. The last choice is remembered in localStorage and
used only to pick the landing default — never consulted during render, so it cannot disagree
with the URL.

**Region scopes listings, not lookups.** `AssetMeta` carries its own region, so the data
engine resolves any symbol without being told which market it belongs to. `?region=kr` decides
only which universe a page *lists*. Three things follow:

- a watchlist can hold `AAPL` and `005930` together and both resolve correctly
- `/stock/005930` opens without a region parameter
- Korean codes are six digits and US tickers are alphabetic, so the namespaces cannot collide

The `US ▾` label at `MarketPage.tsx:76` becomes the switcher. Switching re-scopes market home,
screener, heatmap, and earnings in one action.

The switcher renders only on region-scoped pages. Crypto, portfolio, apps, and status are not
region-scoped and must not show a control that would do nothing. No new top-level tab is added;
instead 정치인 and 예측 hide while the region is `KR`, since they have no Korean data to show.

## Currency

`InstrumentUnit` gains `'KRW'`. `fmtQuoteValue` already dispatches on unit for `USD_PER_OZ`
and `USD_PER_BBL`, so KRW slots into that same switch rather than requiring a parallel
formatter.

```text
price        ₩246,000        won prices are whole units; KRX quotes in won
market cap   1,568.32조       조/억, because US$1.57T is meaningless to a Korean reader
change       +2.50%          unchanged
```

**`AssetMeta.marketCap` stays USD.** An earlier draft of this design said it would become a
plain number whose currency the asset's `unit` supplied, on the reasoning that "heatmap
weighting compares only within a region, so relative sizing is unaffected". That reasoning was
wrong, and Task 4's review measured how wrong: the existing consumers — `getAll`, `movers`,
`search`, and the heatmap — compare caps across the whole asset list, not within a region. Two
Korean rows carrying raw won put the heatmap at 93.74% Korean by area and pushed Samsung and
SK Hynix above every US name in the movers rail, on the US pages, immediately.

So Korean market caps are converted to USD where the asset is built, through a single named
`KRW_PER_USD` constant carrying its own as-of date. The seed keeps its authored column in
trillion won, because that is what the source publishes and what a human can check against a
Korean quote page; the conversion happens once, in one auditable place. Display converts back
to won via `fmtKrwCompact`.

The cost is that the seed now embeds an exchange-rate assumption, which is recorded beside the
constant rather than left implicit.

## Trading calendar

`MarketCalendar` gains `'KR_EQUITY'`: KRX regular session 09:00–15:30 KST, with a
`kstTimestamp` helper beside the existing `easternTimestamp`.

**Holidays are a hardcoded table, not a rule set.** `US_EQUITY` computes NYSE holidays with
helpers like `nthWeekday` because every US market holiday follows a Gregorian rule. Korea's do
not: 설날, 추석, and 부처님오신날 are lunar, so no arithmetic over the Gregorian calendar
produces them. Adding a lunar-conversion dependency to generate seed data would be a poor
trade. 대체공휴일 and 임시공휴일 settle the question anyway — they are announced per year by
government notice rather than derived from any rule, so a table is the only correct
representation.

The table covers 2021–2026, the span the seed's 5Y history reaches. Years outside it fall back
to excluding weekends only. That fallback is a real limitation, recorded in a code comment at
the table and in `DEPLOYMENT.md`, so a future maintainer extending the seed knows to extend
the table with it.

## Data

```text
top assets   KOSPI · KOSDAQ · KOSPI200 · USD/KRW · VKOSPI
equities     KRX by descending market cap (005930 삼성전자, 000660 SK하이닉스, …)
```

The equity seed targets the top 150 KRX listings by market cap, against 187 for the US. The
number is a target rather than a guarantee: it is whatever can be sourced with corroborated
price, change, and market cap. Whatever lands is the count the screener reports, the same way
the US screener reports 187 — the header must never claim a number the seed does not hold.

**Sectors are shared in taxonomy, split in value.** The `SectorId` union is reused so the
screener and heatmap sector filters keep working unchanged, but `SECTORS` currently holds US
sector index levels. Those become region-scoped, so the 주식 섹터 rail card has real numbers
in both markets.

**Earnings needs no type change.** `session: 'pre' | 'post' | 'during'` still reads correctly
against KRX hours — disclosure before the open or after the close — even though KRX has no
US-style extended-hours session.

**Logo coverage will be partial and that is expected.** Korean listing codes 404 on both
ticker-keyed sources used in the existing set (`nvstly/icons`, `parqet`). simple-icons carries
some Korean brands by slug; everything else keeps its initial chip. Any source that answers
HTTP 404 with a placeholder image in the body is rejected — that behaviour was already
observed from DuckDuckGo's icon service, and shipping its output would put invented artwork on
a financial surface.

**Market copy** — 시장 요약, 최신 시장 뉴스, 탐색 카드 — is written against Korean market
conditions under the same discipline the seed refresh used: only corroborated figures, and
anything a source disagrees on is left out rather than averaged.

## Testing

Two pure units carry the new logic and both are directly testable without a database or
network:

- the KRW formatter: whole-won prices, 조/억 compaction, and that a USD asset is unaffected
- the KR calendar: the holiday table, the 09:00–15:30 KST session boundaries, and that a year
  outside the table falls back to weekdays-only rather than throwing

`scripts/validate-p11.ts` follows the P2–P10 contract-assertion pattern and joins
`npm run check`. Version moves 1.11.0 → 1.12.0 across `server/config.ts`, the router test, and
the validate scripts that assert it.

## Safety boundary

- Korean market data is seeded and labelled exactly as the US demo is: `DEMO · 합성 시세`, never
  presented as verified or as an account.
- Region selection changes which universe is listed. It does not change the provenance rules,
  the quality gate, or what may become a strict snapshot.
- No Korean page implies an order was or will be placed.
