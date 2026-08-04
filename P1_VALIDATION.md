# P1 검증 기록 — v1.2.0

## 재현 명령

```bash
npm ci
npm run check
npm audit --audit-level=low
```

`npm run check` 실행 순서:

1. TypeScript strict + `noUnusedLocals` + `noUnusedParameters`
2. Vitest 단위·컴포넌트 테스트
3. DOM 없는 핵심 계약 테스트
4. 금융 데이터·세션·불변성·배치 검사
5. Vite 프로덕션 빌드

## 자동 테스트 결과

```text
Test Files  7 passed (7)
Tests      12 passed (12)
```

검증된 주요 사용자·런타임 계약:

- 이전 Quote를 변경하지 않고 변경된 심볼만 새 불변 스냅숏으로 교체
- 한 모의 틱당 전역 `MarketBatch` 정확히 1회 발행
- 모든 반환 OHLCV 배열·봉의 불변성과 시간·가격 범위
- 관심목록 손상값 정제와 `storage` 이벤트 기반 다른 탭 갱신
- 알림의 true crossing 판정과 비정상 저장 알림 제거
- 검색 combobox의 listbox 연결, 화살표 이동, Escape 닫기
- 모달 초기 포커스, Tab 순환, root 격리, body 잠금, 호출 요소 포커스 복귀
- 종목·404 경로의 문서 제목과 meta description

## 데이터·엔진 검증 결과

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

독립 핵심 계약 테스트:

```json
{
  "persistenceValidation": "PASS",
  "alertCrossing": "PASS",
  "result": "PASS"
}
```

## 빌드·공급망 결과

- TypeScript strict 및 미사용 코드 검사: **PASS**
- 프로덕션 빌드: **PASS**
- Vite 변환 모듈: **76개**
- 빌드 시간: 약 **0.8초**
- 메인 React 런타임 청크: **163.87 kB / gzip 53.98 kB**
- 종목 상세 청크: **169.02 kB / gzip 55.01 kB**
- `npm audit --audit-level=low`: **알려진 취약점 0건**
- 개발 서버: **HTTP 200**

## 브라우저 자동화 검증 상태

`agent-browser`로 실제 Vite 개발 서버를 열어 검증을 시도했습니다. 실행 환경의 관리형 Chromium에는 전역 URL 차단 정책이 적용되어 아래 오류가 발생했습니다.

```text
net::ERR_BLOCKED_BY_ADMINISTRATOR
URLBlocklist: ["*"]
```

따라서 이 환경에서는 실제 픽셀 렌더링, 360px 가로 오버플로, 브라우저 콘솔과 라우트 클릭 E2E를 완료할 수 없었습니다. 대신 다음 근거로 보완했습니다.

- Vite 개발 서버 기동 및 원문 HTTP 200
- 7개 테스트 파일의 jsdom 상호작용 검증
- 검색·모달·문서 제목·다중 탭 저장소 사용자 흐름 테스트
- TypeScript strict와 프로덕션 번들
- DOM·ARIA·반응형 CSS 정적 리뷰

브라우저 정책이 없는 일반 개발 환경에서는 다음 순서로 최종 시각 회귀를 수행해야 합니다.

```text
1440×900: 홈, 스크리너, 종목 상세
768×1024: 헤더, 탭 스크롤, 테이블
390×844: 전체 화면 검색, 알림·모달, 가로 오버플로
키보드: skip link → 탭 → 검색 → 모달 → 404
다크 모드 + prefers-reduced-motion
```
