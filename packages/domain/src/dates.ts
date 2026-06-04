/** 오늘 날짜 'YYYY-MM-DD' (Asia/Seoul, UTC+9 고정).
 *
 * 모든 도메인 검증·표시(D-day, 만료 임박, 도래 여부)의 단일 '오늘' 기준.
 * `toISOString()` 단순 사용은 UTC 자정 기준이라 한국 시간 00:00~09:00 KST 사이에
 * 어제 날짜를 반환해 D-day·검증이 하루 어긋나는 버그가 생긴다. */
export function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
