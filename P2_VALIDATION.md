# P2 검증 기록 — v1.3.0

## 검증 원칙

이 환경에는 실제 사용자 Supabase 프로젝트, Alpaca/OpenAI/Resend 자격증명을 넣지 않았습니다. 따라서 검증은 다음 두 층으로 나눕니다.

1. **무자격증명 런타임 검증**: 모든 API가 명시적 폴백·비활성·401/503 상태를 정확히 반환하는지 확인
2. **공급자 계약 검증**: TypeScript 계약, 공급자 파서, 기간 계산, 외부 quote ingestion, alert provenance gate, AI tool loop를 자동 테스트

실 공급자 계정의 entitlement·rate limit·프로덕션 네트워크 성공은 배포 환경 acceptance test에서 별도로 확인해야 합니다.

## 자동 검사

```bash
npm ci
npm run check
npm audit --audit-level=low
```

검사 범위:

- TypeScript strict
- 미사용 로컬·파라미터 검사
- Vitest 단위·컴포넌트 테스트
- DOM 없는 핵심 계약 스모크 테스트
- P1 캘린더/OHLC/확률/세션/배치 검증
- P2 fallback/provenance/alert/AI/external-ingestion 검증
- Vite production build
- 알려진 의존성 취약점

## P2 불변식

```text
외부 자격증명 없음 → market mode=fallback
local-simulation → live/delayed로 승격 불가
fallback history → 브라우저의 P1 거래일 차트 유지
fallback quote → 서버 alert 생성/발화 불가
alert above → previous < target && current >= target
alert below → previous > target && current <= target
external Quote 적용 → 새 immutable reference
한 외부 batch → 전역 subscriber 1회
YTD 시작 → 현재 연도 1월 1일
1M/6M/1Y/5Y → 실제 달력 시작점
unknown symbol → HTTP 계약상 400
```

## 로컬 API smoke 대상

```text
/api/health
/api/config
/api/market/quotes?symbols=AMD,BTCUSD
/api/market/history?symbol=AMD&range=5D
/api/predictions?limit=4
/api/earnings
/api/news?limit=2
/api/ai/answer
/api/telemetry
/api/watchlist (unauthenticated)
/api/alerts (unauthenticated)
/api/metrics (secret missing / invalid)
/api/cron/evaluate-alerts (secret missing / invalid)
```

기대 결과:

- 공개 API: 200 또는 202, 공급자 미설정 시 `fallback=true/mode=fallback`
- 인증 API: 401
- Cron/metrics 미설정: 503
- 응답마다 `X-Request-Id`, 보안 헤더, 구조화 오류 payload

## 패키지 검사

배포 ZIP에 포함하지 않는 항목:

```text
node_modules/
dist/
.git/
.env
.env.local
*.tsbuildinfo
.DS_Store
```

`.env.example`은 빈 값만 포함하며 실제 secret은 포함하지 않습니다.

## 최종 실행 결과

```text
TypeScript strict + noUnused       PASS
Vitest test files                  12/12 PASS
Vitest tests                       20/20 PASS
Core contract smoke               PASS
P1 data validation                PASS
P2 contract validation            PASS
Production build                  PASS
Local API smoke                    14/14 PASS
Production preview HTTP           200 OK (localhost)
npm audit --audit-level=low        0 vulnerabilities
Interactive semantic scan         PASS
Unsafe HTML scan                   PASS
Browser bundle secret scan        PASS
```

프로덕션 빌드 주요 크기:

```text
main JS       350.99 kB / gzip 109.88 kB
stock chunk   172.92 kB / gzip 56.55 kB
main CSS       24.70 kB / gzip 5.67 kB
```

브라우저 자동화 CLI는 실행 환경 정책 때문에 `http://localhost:5602` 탐색이 `ERR_BLOCKED_BY_ADMINISTRATOR`로 차단됐습니다. 대신 production preview의 HTTP 200, 모든 정적 자산 빌드, jsdom 사용자 흐름 테스트, semantic interaction scan으로 보완했습니다.

이 환경에서 Polymarket/Kalshi 외부 네트워크 요청은 실패했고, 두 공급자 모두 화면과 API에서 정적 폴백으로 명확하게 전환되는 것을 확인했습니다. 실제 공급자 성공 경로는 배포 시 자격증명·네트워크·plan entitlement를 포함해 acceptance test해야 합니다.
