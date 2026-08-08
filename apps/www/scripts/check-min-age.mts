/**
 * 최소 일령 정합성 검사 — 앱 판정값(destination-config) vs 웹 가이드 본문 표기.
 *
 * 왜 필요한가: 과거의 "44개국 전수 통일" 작업들은 전부 섹션 구조·문답 골격·CTA 같은
 * **문구·형식**을 맞춘 것이었고, 최소 일령 같은 **숫자를 앱과 대조한 적은 없었다.**
 * 그 결과 27곳 중 5곳(태국·하와이·UAE·미국·싱가포르)이 어긋난 채 남아 있었고,
 * 하필 웹이 앱보다 이른 날짜를 안내하는 방향이라 보호자가 웹을 믿고 접종하면 앱이
 * 나중에 "너무 이르다"고 경고하는 상태였다. 사람이 눈으로 훑는 방식으로는 또 샌다.
 *
 * 판정: 가이드 본문의 `생후 N일/주/개월` 표기가 앱 판정값(minAgeDays·minAgeMonths)을
 * 환산한 형태 중 하나와 일치해야 한다. 84일 = 12주처럼 같은 값의 다른 표기는 통과.
 *
 * ⚠️ 광견병 최소 연령이 아닌 `생후 N`(괌 CDC 도착 연령 6개월, 홍콩 Dog Licence 5개월,
 *   수입허가 자격 9주 등)은 오탐이므로 ALLOW 에 등록해 제외한다. 새 오탐이 생기면
 *   숫자를 지우지 말고 여기에 사유와 함께 추가할 것.
 *
 * 사용: pnpm --filter www check:min-age
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DESTINATION_OVERRIDES } from '../../../packages/domain/src/destination-config'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = path.join(ROOT, 'content/docs')

/** 광견병 최소 연령이 아닌 표기 — 목적지별로 사유와 함께 제외. */
const ALLOW: Record<string, Array<{ text: string; why: string }>> = {
  guam: [
    { text: '생후 6개월', why: '미국 CDC 도착 연령 규정(2024-08-01 시행)' },
    { text: '생후 9주', why: '수입 허가 신청 자격 연령' },
  ],
  hongkong: [{ text: '생후 5개월', why: 'Dog Licence 대상 연령 · 운송 제한' }],
  usa: [{ text: '생후 6개월', why: '미국 CDC 도착 연령 규정' }],
}

const files = new Set(readdirSync(DOCS))
const problems: string[] = []
let checked = 0

for (const [key, o] of Object.entries(DESTINATION_OVERRIDES)) {
  const r = (o as { rabies?: { minAgeDays?: number; minAgeMonths?: number; minAgeLabel?: string } }).rabies
  if (!r) continue
  const { minAgeDays: days, minAgeMonths: months } = r
  if (days === undefined && months === undefined) continue

  const file = `${key}-pet-travel-guide.json`
  if (!files.has(file)) continue
  checked++

  const json = JSON.parse(readFileSync(path.join(DOCS, file), 'utf-8')) as { html?: string }
  const text = String(json.html ?? '').replace(/<[^>]+>/g, ' ')

  // 앱 판정값을 표기 가능한 모든 형태로 환산.
  const ok = new Set<string>()
  if (days !== undefined) {
    ok.add(`생후 ${days}일`)
    if (days % 7 === 0) ok.add(`생후 ${days / 7}주`)
  }
  if (months !== undefined) ok.add(`생후 ${months}개월`)

  const allowed = new Set((ALLOW[key] ?? []).map((a) => a.text))
  const hits = [...new Set([...text.matchAll(/생후\s*([0-9]+)\s*(일|주|개월)/g)].map((m) => `생후 ${m[1]}${m[2]}`))]
  const bad = hits.filter((h) => !ok.has(h) && !allowed.has(h))

  if (hits.length === 0) {
    problems.push(`${key}: 가이드에 최소 일령 표기가 없음 (앱 = ${r.minAgeLabel ?? [...ok][0]})`)
  } else if (bad.length > 0) {
    problems.push(`${key}: 웹 "${bad.join(', ')}" ≠ 앱 "${[...ok].join(' / ')}"`)
  }
}

if (problems.length > 0) {
  console.error(`최소 일령 불일치 ${problems.length}건 (검사 ${checked}곳)\n`)
  for (const p of problems) console.error('  · ' + p)
  console.error('\n앱(destination-config)이 판정 기준이다. 가이드 문구를 앱 값에 맞추거나,')
  console.error('광견병과 무관한 연령이면 이 스크립트의 ALLOW 에 사유와 함께 등록할 것.')
  process.exit(1)
}
console.log(`최소 일령 정합성 OK — ${checked}곳 전부 앱 판정값과 일치.`)
