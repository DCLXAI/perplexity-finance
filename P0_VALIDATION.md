# P0 검증 기록

## 재현 명령

```bash
npm ci
npm run check
npm audit --audit-level=low
```

`npm run check`는 다음을 순서대로 실행합니다.

1. TypeScript strict 검사
2. 거래일·OHLCV·확률·실적·자산별 틱 정합성 검사
3. Vite 프로덕션 빌드

## 최종 검증 결과

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
  "result": "PASS"
}
```

- TypeScript strict: PASS
- `noUnusedLocals`·`noUnusedParameters`: PASS
- 프로덕션 빌드: PASS
- `npm audit --audit-level=low`: 알려진 취약점 0건
- Preview 서버: HTTP 200

## 검증 범위

- 미국 시장 스냅숏이 2026년 7월 10일 금요일인지 확인
- 모든 자산 심볼의 중복·단위 누락 검사
- 모든 표본 범위의 OHLCV 불변식과 시간 오름차순 검사
- 미국 주식 일봉에서 주말·표준 휴장일 제외 확인
- 1D·5D·7D 세션 수와 암호화폐 7D 봉 수 확인
- YTD가 2026년 첫 거래일인 1월 2일부터 시작하는지 확인
- 예측시장 확률 합계와 숨겨진 결과 계약 확인
- 실적 주간 카운트와 실제 엔트리 수 일치 확인
- 모의 틱이 암호화폐에만 발생하고 시가총액 비율이 함께 갱신되는지 확인

## 브라우저 검증 한계

프로덕션 Preview의 HTTP 응답은 확인했지만, 검증 환경의 브라우저 보안 정책이 localhost와 file URL 탐색을 차단해 픽셀 비교와 실제 브라우저 E2E는 수행하지 못했습니다. 정적 DOM·CSS 검토와 프로덕션 빌드 검증은 완료했습니다.
