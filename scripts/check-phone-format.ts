/**
 * 전화번호 표기 계약 검사 — 순수 도메인.
 *
 * 왜 있나 (2026-08-24): 같은 포맷터가 네 곳에 복사돼 있었고 넷 다 11자리에서 잘랐다.
 * 그래서 **0507 안심번호(12자리)** 는 마지막 자리가 조용히 사라졌고, 서울 9자리는
 * 010 규칙으로 끊겨 02-1234-567 로 보였다. 자릿수 규칙은 눈으로 못 잡으니 계약으로 둔다.
 */
import {
  formatKoreanPhone, isKoreanPhoneDigits, phoneInputError,
  looksLikeKoreanPhoneInput, normalizePhoneForStorage, phoneDigits,
} from '../packages/domain/src/phone'

const errors: string[] = []
const eq = (label: string, got: unknown, want: unknown) => {
  if (got !== want) errors.push(`${label}: 기대 ${JSON.stringify(want)} · 실제 ${JSON.stringify(got)}`)
}

// 표기 — 완성된 번호
const FORMAT: Array<[string, string]> = [
  ['01012345678', '010-1234-5678'],
  ['0111234567', '011-123-4567'],
  ['0212345678', '02-1234-5678'],
  ['021234567', '02-123-4567'],
  ['0311234567', '031-123-4567'],
  ['07012345678', '070-1234-5678'],
  ['050712345678', '0507-1234-5678'],   // ← 안심번호 12자리
  ['05051234567', '0505-123-4567'],
  ['010-1234-5678', '010-1234-5678'],   // 이미 하이픈이 있어도 동일 결과
]
for (const [inp, want] of FORMAT) eq(`formatKoreanPhone(${inp})`, formatKoreanPhone(inp), want)

// 표기 — 입력 중(부분 자릿수)에도 깨지지 않는다
eq('타이핑 010', formatKoreanPhone('010'), '010')
eq('타이핑 0101', formatKoreanPhone('0101'), '010-1')
eq('타이핑 01012345', formatKoreanPhone('01012345'), '010-1234-5')
eq('타이핑 0507', formatKoreanPhone('0507'), '0507')

// 완성 판정
for (const ok of ['01012345678', '0111234567', '021234567', '0212345678', '0311234567',
                  '07012345678', '050712345678', '05071234567']) {
  if (!isKoreanPhoneDigits(ok)) errors.push(`isKoreanPhoneDigits(${ok}) 가 false`)
}
for (const bad of ['010123456', '0101234567', '0101234567890', '15881234', '1234567890', '', '0201234']) {
  if (isKoreanPhoneDigits(bad)) errors.push(`isKoreanPhoneDigits(${bad}) 가 true`)
}

// 링크 폼 검증 — 지정 형식만 통과
eq('링크: 휴대폰 통과', phoneInputError('010-1234-5678'), null)
eq('링크: 0507 통과', phoneInputError('0507-1234-5678'), null)
eq('링크: 서울 유선 통과', phoneInputError('02-123-4567'), null)
eq('링크: 빈 값은 형식 검증 대상 아님', phoneInputError(''), null)
if (!phoneInputError('010-1234-567')) errors.push('링크: 자릿수 부족을 통과시킴')
eq('링크: +국제번호 통과', phoneInputError('+81-90-1234-5678'), null)
if (!phoneInputError('+1')) errors.push('링크: 자릿수 모자란 국제번호를 통과시킴')
if (!phoneInputError('09032111992')) errors.push('링크: + 없는 해외번호를 통과시킴')

// 관리자 하이브리드 — 한국 번호는 숫자만, 그 외는 원문 보존
eq('관리자: 한국 번호 → 숫자만', normalizePhoneForStorage('010-1234-5678'), '01012345678')
eq('관리자: 0507 → 12자리 보존', normalizePhoneForStorage('0507-1234-5678'), '050712345678')
eq('관리자: 해외번호 원문 보존', normalizePhoneForStorage('+81-90-1234-5678'), '+81-90-1234-5678')
eq('관리자: 메모 원문 보존', normalizePhoneForStorage('010-1234-5678 (남편)'), '010-1234-5678 (남편)')
eq('관리자: 내선 원문 보존', normalizePhoneForStorage('02-123-4567 내선 12'), '02-123-4567 내선 12')
eq('관리자: 빈 값', normalizePhoneForStorage('  '), '')
eq('looksLike: 해외번호 false', looksLikeKoreanPhoneInput('+81 90 1234 5678'), false)
eq('phoneDigits', phoneDigits('010-1234-5678'), '01012345678')

if (errors.length > 0) {
  console.error('\n✗ phone format lint\n')
  for (const e of errors) console.error(`  · ${e}`)
  console.error('')
  process.exit(1)
}
console.log('✓ phone format lint: 표기·판정·정규화 계약 통과 (0507 안심번호 포함)')
