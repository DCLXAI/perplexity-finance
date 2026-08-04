# P2 변경 내역 — v1.3.0

## 실데이터 공급자

- Alpaca 주식·ETF·암호화폐 snapshot 어댑터
- Alpaca 주식·암호화폐 OHLCV history 어댑터
- Alpaca News 어댑터
- Alpha Vantage earnings calendar 어댑터
- Polymarket Gamma + Kalshi public market 어댑터
- 공급자 timeout, 파서 검증, 캐시, 부분 누락, 명시적 폴백
- live/delayed/snapshot/mixed/stale/fallback provenance UI
- 검증 시세가 합성값으로 회귀하지 않는 stale-value protection

## 기간·시장 정합성

- 1D/5D/7D의 자산별 정확한 15분 봉 예산
- 1M/6M/1Y/5Y를 달력 시작점으로 계산
- YTD를 현재 연도 1월 1일부터 계산
- 미국 주식 open 상태에 주말뿐 아니라 NYSE 표준 휴장일 반영
- 알 수 없는 심볼은 빈 200이 아니라 400 `UNKNOWN_SYMBOL`

## 계정·클라우드 상태

- Supabase PKCE 매직 링크 인증
- 서버 `auth.getUser(token)` 검증
- 관심목록 최초 병합·동기화
- price alerts/deliveries Realtime + 60초 폴링 폴백
- 클라우드 알림과 브라우저 로컬 알림 분리
- RLS read-own, 서버 API 전용 mutation

## 지속 가격 알림

- 기준선 포함 서버 알림 생성
- live/delayed 시세만 생성·평가 허용
- 방향성 crossing 평가
- atomic claim RPC
- durable delivery queue
- Resend 이메일 idempotency
- VAPID Web Push
- exponential retry, stale lease recovery, terminal state
- 평가 장애와 무관하게 기존 delivery queue 처리

## 금융 AI

- OpenAI Responses API 연결
- quote/history/news/earnings/prediction 도구
- 모든 후속 도구 호출에도 동일한 금융 안전·provenance 지시 유지
- 모델·도구·출처·시각·토큰·request ID 표시
- OpenAI 실패 시 명시적 local-fallback
- Supabase AI audit 기록

## 운영·보안

- Vercel Functions routes
- Vercel Cron
- 구조화 JSON 로그
- 메트릭과 `Server-Timing`
- 보호된 `/api/metrics`
- client telemetry에서 질문/이메일/token 제외
- Upstash 분산 캐시/rate limit 옵션
- 500개 bounded local cache
- 공개 공급자 endpoint와 사용자 mutation endpoint rate limit
- local `.env.local` 선행 로딩

## 검증

- P2 공급자 기간 계약 테스트
- unknown-symbol API 계약 테스트
- 불변 외부 quote/history ingestion 테스트
- server alert crossing 테스트
- AI explicit fallback 테스트
- P1 데이터·접근성·저장소 테스트 전부 유지
