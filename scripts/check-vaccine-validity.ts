/**
 * 면역 유효기간 해석 계약 검사 — 순수 도메인(DB·PDF 없음).
 *
 * 왜 있나 (2026-08-24 황현선/루이):
 *   접종증명서 AI 추출이 원문 표기를 그대로 넘겨 `valid_until = "1 year"` 로 저장됐다.
 *   그때 resolveValidUntil 은 한글 "N년" 과 ISO 만 알아듣고 **나머지는 원문을 그대로
 *   반환**했다. 반환값은 곧바로 문자열 비교에 쓰이는데 `"2026-08-22" > "1 year"` 가 true 라,
 *   1차 유효기간(2027-07-14) 안에 맞은 멀쩡한 2차 접종이 "유효기간 초과 = chain 끊김" 으로
 *   경고됐다. 표기 흔들림 하나가 의료 판정을 뒤집은 사고라 계약으로 못 박는다.
 *
 * 계약:
 *   ① resolveValidUntil 은 **언제나 ISO(YYYY-MM-DD)** 를 돌려준다 — 못 알아먹는 값도.
 *   ② 연수 표기는 한글·영문·약어를 모두 같은 값으로 해석한다.
 *   ③ 유효기간 안에 맞은 부스터는 chain 이 끊기지 않는다(사고 재현 케이스 포함).
 */
import { resolveValidUntil, normalizeValidUntil, parseValidUntilYears } from '../packages/domain/src/procedure-checks/utils'
import { findRabiesChainBreak } from '../packages/domain/src/journey-steps/rabies-chain'

const errors: string[] = []
const eq = (label: string, got: unknown, want: unknown) => {
  if (got !== want) errors.push(`${label}: 기대 ${JSON.stringify(want)} · 실제 ${JSON.stringify(got)}`)
}

// ① 반환값은 항상 ISO
const ISO = /^\d{4}-\d{2}-\d{2}$/
const probes: Array<string | null | undefined> = [
  null, undefined, '', '1년', '2 년', '1 year', '1 Year', '1Y', '1 y', '3Y', '3 yrs',
  '2027-10-31', '2027-10-31T00:00:00Z', '유효기간 미상', 'N/A', '0년', '-1년',
]
for (const p of probes) {
  const got = resolveValidUntil('2026-07-14', p)
  if (!ISO.test(got)) errors.push(`resolveValidUntil('2026-07-14', ${JSON.stringify(p)}) 가 ISO 가 아님 → ${JSON.stringify(got)}`)
}

// ② 연수 표기 해석 — 표기가 달라도 같은 답
for (const v of ['1년', '1 년', '1 year', '1 Year', '1years', '1Y', '1 y', '1yr', '1 YRS']) {
  eq(`parseValidUntilYears(${JSON.stringify(v)})`, parseValidUntilYears(v), 1)
  eq(`normalizeValidUntil(${JSON.stringify(v)})`, normalizeValidUntil(v), '1년')
  eq(`resolveValidUntil(2026-07-14, ${JSON.stringify(v)})`, resolveValidUntil('2026-07-14', v), '2027-07-14')
}
for (const v of ['3년', '3 years', '3Y']) {
  eq(`resolveValidUntil(2026-07-14, ${JSON.stringify(v)})`, resolveValidUntil('2026-07-14', v), '2029-07-14')
}
// 연수로 못 읽는 값 → null (호출 측이 원값 유지 판단), 해석은 디폴트 1년
eq("normalizeValidUntil('2027-10-31')", normalizeValidUntil('2027-10-31'), null)
eq("normalizeValidUntil('아무말')", normalizeValidUntil('아무말'), null)
eq("resolveValidUntil ISO 그대로", resolveValidUntil('2026-07-14', '2027-10-31'), '2027-10-31')
eq("resolveValidUntil 미상→+1년", resolveValidUntil('2026-07-14', '유효기간 미상'), '2027-07-14')
eq("resolveValidUntil 빈값→+1년", resolveValidUntil('2026-07-14', null), '2027-07-14')
// N주년 당일 포함 컨벤션 (reference: 2026-07-18 확정)
eq('N주년 당일 포함', resolveValidUntil('2026-01-01', '1년'), '2027-01-01')

// ③ chain — 사고 재현: 1차 2026-07-14("1 year"), 2차 2026-08-22
const brk = findRabiesChainBreak([
  { date: '2026-07-14', valid_until: '1 year' },
  { date: '2026-08-22' },
])
if (brk) errors.push(`유효기간 이내 부스터인데 chain 끊김으로 판정: ${JSON.stringify(brk)}`)
// 진짜 만료 후 접종은 여전히 잡아야 한다
const late = findRabiesChainBreak([
  { date: '2026-07-14', valid_until: '1 year' },
  { date: '2027-07-15' },
])
eq('만료 다음날 접종은 expired', late?.reason, 'expired')
eq('만료 당일 접종은 정상', findRabiesChainBreak([{ date: '2026-07-14', valid_until: '1년' }, { date: '2027-07-14' }]), null)

if (errors.length > 0) {
  console.error('\n✗ vaccine validity lint\n')
  for (const e of errors) console.error(`  · ${e}`)
  console.error('')
  process.exit(1)
}
console.log(`✓ vaccine validity lint: 유효기간 해석 ${probes.length + 12}건 + chain 3건 계약 통과`)
