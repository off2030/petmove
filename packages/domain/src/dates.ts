/** 오늘 날짜 'YYYY-MM-DD' (Asia/Seoul, UTC+9 고정).
 *
 * 모든 도메인 검증·표시(D-day, 만료 임박, 도래 여부)의 단일 '오늘' 기준.
 * `toISOString()` 단순 사용은 UTC 자정 기준이라 한국 시간 00:00~09:00 KST 사이에
 * 어제 날짜를 반환해 D-day·검증이 하루 어긋나는 버그가 생긴다. */
export function todayKst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** 시:분을 24시간 'HH:mm' 으로 정규화 — 시간(type: 'time') 필드의 단일 출처.
 *
 * 입력 폼(admin TimeInput · portal 시간 마스킹)은 콜론을 넣어 저장하지만 **AI 자동추출**은
 * 원문 표기를 그대로 뱉는다 — 일본 검역소 예약 확인 메일의 '1300' 이 그대로 저장돼
 * 케이스 상세에 '1300' 으로 보였다(2026-09-08). 시간 값은 저장 전 반드시 여기를 거친다.
 * done-resolver·리마인더·PDF 채움이 전부 /^\d{1,2}:\d{2}$/ 를 전제하기 때문.
 *
 * 받는 표기: '13:00' · '1300' · '9:30' · '930' · '13' · '1:30 PM' · '오후 1시 30분'.
 * 파싱 불가·범위 초과(24시·60분)면 null — 깨진 시간을 저장하느니 비운다.
 */
export function normalizeTimeHhmm(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s) return null
  const pm = /(p\.?\s?m\.?|오후)/i.test(s)
  const am = /(a\.?\s?m\.?|오전)/i.test(s)
  let hh: number
  let mm: number
  // 구분자(: 시 .)가 있으면 시·분 경계가 명확 — 숫자 길이 추정 없이 그대로 읽는다.
  const split = s.match(/(\d{1,2})\s*[:시.]\s*(\d{1,2})/)
  if (split) {
    hh = Number(split[1])
    mm = Number(split[2])
  } else {
    const d = s.replace(/\D/g, '')
    if (d.length === 0 || d.length > 4) return null
    if (d.length <= 2) {
      hh = Number(d) // '13' · '9' — 분 없음
      mm = 0
    } else {
      // 3자리는 한 자리 시('930'→9:30), 4자리는 두 자리 시('1300'→13:00).
      const cut = d.length - 2
      hh = Number(d.slice(0, cut))
      mm = Number(d.slice(cut))
    }
  }
  if (pm && hh < 12) hh += 12
  if (am && hh === 12) hh = 0
  if (hh > 23 || mm > 59) return null
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
