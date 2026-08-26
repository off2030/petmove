/**
 * 전화번호 표기 — **단일 출처**.
 *
 * 예전엔 같은 포맷터가 네 곳에 따로 있었다(펫무브워크 케이스 상세·정보 요청 링크 폼·
 * 펫무브앱 내 정보·병원 정보 표시). 넷 다 **11자리로 자르고** 3-4-4 로만 끊어서,
 * 0507 안심번호(12자리)를 넣으면 마지막 자리가 조용히 잘려 나갔다(2026-08-24 사용자 확인).
 * 서울 9자리(02-123-4567)도 010 규칙으로 끊겨 02-1234-567 로 보였다.
 *
 * 저장 형식은 **숫자만**(하이픈 없음) — 화면에서만 하이픈을 넣는다.
 */

/** 한국 번호로 저장할 수 있는 최대 자릿수 — 0507 안심번호(12자리)가 가장 길다. */
export const KOREAN_PHONE_MAX_DIGITS = 12

/** 숫자만 남긴다. */
export function phoneDigits(raw: string | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '')
}

/**
 * 완성된 한국 번호인지 (숫자만 기준).
 *
 *  · 휴대폰      010 + 8자리 (010 번호는 전부 11자리), 011/016~019 는 + 7~8자리
 *  · 서울        02 + 7~8자리
 *  · 그 외 지역   031~033·041~044·051~055·061~064 + 7~8자리
 *  · 인터넷전화   070 + 8자리
 *  · 안심·평생번호 050X + 7~8자리 (0507-1234-5678 = 12자리)
 *
 * 1588 같은 대표번호는 개인 연락처가 아니라 제외한다.
 */
const KOREAN_PHONE_PATTERNS: readonly RegExp[] = [
  /^010\d{8}$/,
  /^01[16789]\d{7,8}$/,
  /^02\d{7,8}$/,
  /^0(?:3[1-3]|4[1-4]|5[1-5]|6[1-4])\d{7,8}$/,
  /^070\d{8}$/,
  /^050\d{8,9}$/,
]

export function isKoreanPhoneDigits(digits: string): boolean {
  return KOREAN_PHONE_PATTERNS.some((re) => re.test(digits))
}

/** 지역·서비스 접두 길이 — 서울 2, 050X 안심번호 4, 나머지 3. */
function prefixLength(digits: string): number {
  if (digits.startsWith('02')) return 2
  if (/^050\d/.test(digits)) return 4
  return 3
}

/**
 * 하이픈 표기. **입력 중(부분 자릿수)에도** 자연스럽게 끊기도록 점진 규칙을 쓴다.
 * 숫자가 아닌 문자는 무시하므로 이미 하이픈이 든 값을 넣어도 된다.
 */
export function formatKoreanPhone(raw: string | null | undefined): string {
  const digits = phoneDigits(raw)
  const p = prefixLength(digits)
  if (digits.length <= p) return digits
  const pre = digits.slice(0, p)
  const rest = digits.slice(p)
  if (rest.length <= 4) return `${pre}-${rest}`
  // 아직 짧으면 앞 4자리를 가운데로 — 다 치면 아래 규칙으로 자연스럽게 넘어간다.
  if (rest.length < 7) return `${pre}-${rest.slice(0, 4)}-${rest.slice(4)}`
  return `${pre}-${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`
}

/**
 * 사람이 친 값이 **한국 번호 입력으로 보이는지** — 숫자·하이픈·공백·괄호·점만 썼는가.
 * `+81-90-…` 처럼 국가번호가 붙었거나 글자가 섞이면 false (= 자유 입력으로 취급).
 */
export function looksLikeKoreanPhoneInput(raw: string | null | undefined): boolean {
  const s = String(raw ?? '').trim()
  if (!s) return true
  if (!/^[\d\s().-]+$/.test(s)) return false
  const digits = phoneDigits(s)
  return digits.length > 0 && digits.length <= KOREAN_PHONE_MAX_DIGITS && digits.startsWith('0')
}

/**
 * 저장값 정규화 — **하이브리드**(2026-08-24 사용자 결정).
 *  · 한국 번호 입력으로 보이면 숫자만 남긴다 (기존 저장 규칙 유지, 앱·PDF·검색과 round-trip).
 *  · 그 외(해외번호·내선·메모 등)는 **친 그대로** 보존한다 — 운영자가 예외를 적을 수 있게.
 */
export function normalizePhoneForStorage(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  return looksLikeKoreanPhoneInput(s) ? phoneDigits(s).slice(0, KOREAN_PHONE_MAX_DIGITS) : s
}

/** 정보 요청 링크 폼용 예시 — 허용 형식을 한 줄로 보여준다. */
export const KOREAN_PHONE_EXAMPLES = '010-1234-5678 · 02-123-4567 · 0507-1234-5678'

/**
 * 국제표기 — `+국가번호` + 숫자 8~15자리(E.164 상한). 하이픈·공백·점은 허용.
 *
 * 링크 폼이 한국 번호만 받으면 **해외 거주 보호자가 제출 자체를 못 한다.** 실제 데이터에
 * 일본 090…·UAE +971…·싱가포르 65… 등 16건이 phone 에 들어와 있다(2026-08-24 확인).
 * 그래서 "지정 형식"은 [한국 번호] 또는 [+로 시작하는 국제번호] 둘로 정의한다.
 */
export function isInternationalPhoneInput(raw: string | null | undefined): boolean {
  const s = String(raw ?? '').trim()
  if (!/^\+[\d\s.()-]+$/.test(s)) return false
  const d = phoneDigits(s)
  return d.length >= 8 && d.length <= 15
}

/**
 * 링크 폼(보호자 입력) 검증 — 지정 형식만 통과. 통과면 null, 아니면 안내 문구.
 * 빈 값은 여기서 판단하지 않는다(필수 여부는 폼의 빈 항목 경고가 담당).
 *
 * client 폼과 anon 서버 액션이 **같은 함수**를 쓴다 — 폼 검증만 두면 우회 제출로 뚫린다.
 */
export function phoneInputError(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  if (s.startsWith('+')) {
    return isInternationalPhoneInput(s)
      ? null
      : '해외번호는 +국가번호로 시작하는 숫자 8~15자리로 적어주세요. (예: +81-90-1234-5678)'
  }
  const digits = phoneDigits(s)
  if (!digits) return null
  if (!isKoreanPhoneDigits(digits)) {
    return `전화번호 형식을 확인해주세요. (${KOREAN_PHONE_EXAMPLES} / 해외번호는 +81-90-1234-5678 처럼)`
  }
  return null
}
