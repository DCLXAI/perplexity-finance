/* ============================================================
   KRX non-trading dates, 2021–2026.

   A table rather than a rule set, and deliberately so. US market holidays
   all follow Gregorian rules, which is why usEquityHolidayKeys can compute
   them. Korea's cannot be computed: 설날, 추석 and 부처님오신날 are lunar,
   and 대체공휴일/임시공휴일 are announced per year by government notice
   rather than derived from anything. Adding a lunar-conversion dependency
   to generate seed data would be a poor trade.

   The range covers what the seed's 5Y history reaches. A year outside it
   falls back to weekdays-only — see isKrEquityTradingDay. If you extend
   the seed further back or forward, extend this table with it, or the
   generated series will show bars on days KRX was closed.

   Each year's array lists every category the KRX trading calendar closes
   for that year: 신정, 설날 연휴(3일), 삼일절, 어린이날, 부처님오신날,
   현충일, 광복절, 추석 연휴(3일), 개천절, 한글날, 성탄절, 근로자의날
   (KRX closes though it is not a legal public holiday), any 대체공휴일 /
   임시공휴일, and the year-end 연말휴장일 (Dec 31, regardless of weekday).
   Dates that also happen to fall on a weekend are still listed for
   per-category traceability against sources; isKrEquityTradingDay checks
   the weekday first, so their presence here is inert.

   2022 and 2024 additionally include national/local election days
   (선거일, a standing category under 관공서의 공휴일에 관한 규정 for
   elections due to term expiration — not 임시공휴일) on which KRX is
   confirmed closed by its own announcements. 2026 additionally includes
   7/17 제헌절 (Constitution Day), reinstated as a public holiday from
   2026 by an April 2026 cabinet decision, and 6/3 지방선거일, both
   confirmed closed by KRX's own May 2026 announcement. Neither falls
   under the brief's named categories, but both are real, sourced KRX
   closures, so leaving them out would be the same silent-shift failure
   this table exists to prevent.

   Sources (fetched 2026-08-05):
   - 대한민국 정책브리핑(korea.kr), "한 장으로 알아보는 2022년 공휴일":
     https://www.korea.kr/news/policyNewsView.do?newsId=148897861
   - namu.wiki, 대체공휴일 (compiled substitute-holiday dates 2021–2026):
     https://namu.wiki/w/%EB%8C%80%EC%B2%B4%EA%B3%B5%ED%9C%B4%EC%9D%BC
   - PublicHolidays.co.kr, South Korea 2026: https://publicholidays.co.kr/2026-dates/
   - CalendarLabs, "List of Trading Holidays of KRX Market" 2023/2025/2026:
     https://www.calendarlabs.com/krx-market-holidays-2023/
     https://www.calendarlabs.com/krx-market-holidays-2025/
     https://www.calendarlabs.com/krx-market-holidays-2026/
   - wegive, "2026년 공휴일 & 대체공휴일 달력": https://www.wegive.co.kr/wezine/detail/1368
   - shiftee.io, 2023/2024 holiday-calendar posts:
     https://shiftee.io/ko/blog/article/2023-holiday-calendar
     https://shiftee.io/ko/blog/article/difference-between-substitue-and-temporary-holiday
   - KRX-closure news (elections, 제헌절, year-end): Sentv, Newdaily,
     Businesspost, Metroseoul, Newsprime, MoneyToday(mt.co.kr), YTN,
     Hankyung — e.g. https://www.sentv.co.kr/news/view/611461 (2022 elections),
     https://www.businesspost.co.kr/BP?command=article_view&num=347114 (2024
     election + 근로자의날), https://www.newsprime.co.kr/news/article/?no=734115
     (2026 지방선거·제헌절), https://www.mt.co.kr/stock/2025/12/18/2025121810595318229
     (2025 연말휴장일), broker year-end notices confirming 2026-12-31 (KB증권,
     삼성POP, Toss Securities, 12월 결산 공지).
   - 부처님오신날 2021 cross-check: 대한불교조계종(buddhism.or.kr) and
     Wikipedia "Buddha's Birthday" both independently give 2021-05-19; agreed.
   ============================================================ */

export const KR_NON_TRADING_DAYS: Readonly<Record<number, readonly string[]>> = Object.freeze({
  2021: Object.freeze([
    '2021-01-01', // 신정
    '2021-02-11', // 설날 연휴
    '2021-02-12', // 설날
    '2021-02-13', // 설날 연휴 (Sat)
    '2021-03-01', // 삼일절
    '2021-05-01', // 근로자의날 (Sat)
    '2021-05-05', // 어린이날
    '2021-05-19', // 부처님오신날
    '2021-06-06', // 현충일 (Sun)
    '2021-08-15', // 광복절 (Sun)
    '2021-08-16', // 광복절 대체공휴일
    '2021-09-20', // 추석 연휴
    '2021-09-21', // 추석
    '2021-09-22', // 추석 연휴
    '2021-10-03', // 개천절 (Sun)
    '2021-10-04', // 개천절 대체공휴일
    '2021-10-09', // 한글날 (Sat)
    '2021-10-11', // 한글날 대체공휴일
    '2021-12-25', // 성탄절 (Sat)
    '2021-12-31', // 연말휴장일 (Fri)
  ]),
  2022: Object.freeze([
    '2022-01-01', // 신정 (Sat)
    '2022-01-31', // 설날 연휴
    '2022-02-01', // 설날
    '2022-02-02', // 설날 연휴
    '2022-03-01', // 삼일절
    '2022-03-09', // 20대 대통령선거일 (KRX 휴장 확인)
    '2022-05-01', // 근로자의날 (Sun)
    '2022-05-05', // 어린이날
    '2022-05-08', // 부처님오신날 (Sun)
    '2022-06-01', // 전국동시지방선거일 (KRX 휴장 확인)
    '2022-06-06', // 현충일
    '2022-08-15', // 광복절
    '2022-09-09', // 추석 연휴
    '2022-09-10', // 추석 (Sat)
    '2022-09-11', // 추석 연휴 (Sun)
    '2022-09-12', // 추석 대체공휴일
    '2022-10-03', // 개천절
    '2022-10-09', // 한글날 (Sun)
    '2022-10-10', // 한글날 대체공휴일
    '2022-12-25', // 성탄절 (Sun)
    '2022-12-31', // 연말휴장일 (Sat)
  ]),
  2023: Object.freeze([
    '2023-01-01', // 신정 (Sun)
    '2023-01-21', // 설날 연휴 (Sat)
    '2023-01-22', // 설날 (Sun)
    '2023-01-23', // 설날 연휴
    '2023-01-24', // 설날 대체공휴일
    '2023-03-01', // 삼일절
    '2023-05-01', // 근로자의날
    '2023-05-05', // 어린이날
    '2023-05-27', // 부처님오신날 (Sat)
    '2023-05-29', // 부처님오신날 대체공휴일
    '2023-06-06', // 현충일
    '2023-08-15', // 광복절
    '2023-09-28', // 추석 연휴
    '2023-09-29', // 추석
    '2023-09-30', // 추석 연휴 (Sat)
    '2023-10-02', // 임시공휴일 (추석-개천절 징검다리)
    '2023-10-03', // 개천절
    '2023-10-09', // 한글날
    '2023-12-25', // 성탄절
    '2023-12-31', // 연말휴장일 (Sun)
  ]),
  2024: Object.freeze([
    '2024-01-01', // 신정
    '2024-02-09', // 설날 연휴
    '2024-02-10', // 설날 (Sat)
    '2024-02-11', // 설날 연휴 (Sun)
    '2024-02-12', // 설날 대체공휴일
    '2024-03-01', // 삼일절
    '2024-04-10', // 22대 국회의원선거일 (KRX 휴장 확인)
    '2024-05-01', // 근로자의날
    '2024-05-05', // 어린이날 (Sun)
    '2024-05-06', // 어린이날 대체공휴일
    '2024-05-15', // 부처님오신날
    '2024-06-06', // 현충일
    '2024-08-15', // 광복절
    '2024-09-16', // 추석 연휴
    '2024-09-17', // 추석
    '2024-09-18', // 추석 연휴
    '2024-10-03', // 개천절
    '2024-10-09', // 한글날
    '2024-12-25', // 성탄절
    '2024-12-31', // 연말휴장일
  ]),
  2025: Object.freeze([
    '2025-01-01', // 신정
    '2025-01-27', // 임시공휴일 (설날 연휴 징검다리)
    '2025-01-28', // 설날 연휴
    '2025-01-29', // 설날
    '2025-01-30', // 설날 연휴
    '2025-03-01', // 삼일절 (Sat)
    '2025-03-03', // 삼일절 대체공휴일
    '2025-05-01', // 근로자의날
    '2025-05-05', // 어린이날 · 부처님오신날 (겹침)
    '2025-05-06', // 어린이날 · 부처님오신날 대체공휴일
    '2025-06-06', // 현충일
    '2025-08-15', // 광복절
    '2025-10-03', // 개천절
    '2025-10-05', // 추석 연휴 (전날, Sun)
    '2025-10-06', // 추석
    '2025-10-07', // 추석 연휴 (다음날)
    '2025-10-08', // 추석 대체공휴일
    '2025-10-09', // 한글날
    '2025-12-25', // 성탄절
    '2025-12-31', // 연말휴장일 (Wed)
  ]),
  2026: Object.freeze([
    '2026-01-01', // 신정
    '2026-02-16', // 설날 연휴
    '2026-02-17', // 설날
    '2026-02-18', // 설날 연휴
    '2026-03-01', // 삼일절 (Sun)
    '2026-03-02', // 삼일절 대체공휴일
    '2026-05-01', // 근로자의날
    '2026-05-05', // 어린이날
    '2026-05-24', // 부처님오신날 (Sun)
    '2026-05-25', // 부처님오신날 대체공휴일
    '2026-06-03', // 전국동시지방선거일 (KRX 휴장 확인)
    '2026-06-06', // 현충일 (Sat)
    '2026-07-17', // 제헌절 (2026년 공휴일로 복원, KRX 휴장 확인)
    '2026-08-15', // 광복절 (Sat)
    '2026-08-17', // 광복절 대체공휴일
    '2026-09-24', // 추석 연휴
    '2026-09-25', // 추석
    '2026-09-26', // 추석 연휴 (Sat)
    '2026-10-03', // 개천절 (Sat)
    '2026-10-05', // 개천절 대체공휴일
    '2026-10-09', // 한글날
    '2026-12-25', // 성탄절
    '2026-12-31', // 연말휴장일 (Thu)
  ]),
});

export const KR_HOLIDAY_YEARS: readonly number[] = Object.freeze(
  Object.keys(KR_NON_TRADING_DAYS).map(Number).sort((a, b) => a - b),
);
