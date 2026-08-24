/**
 * 한 장에 여러 마리를 적는 폼의 **동물 슬롯 매핑** 계약 검사 — 순수 데이터(PDF 열지 않음).
 *
 * 대상 = pdf-field-mappings.json 에서 `animalSlot` 을 쓰는 폼(현재 태국 R.1/1).
 * 행 이름 규칙(`I28_row2_…`)을 쓰는 Annex III·UK·NZ 와 달리 필드 이름이 임의라, 짝이
 * 어긋나도 아무도 모르게 **빈 칸으로 발급**된다. 그래서 세 가지를 강제한다:
 *
 *   ① 그 폼에 FORM_CAPACITY 선언이 있고, 선언한 마리 수 = 실제 슬롯 수와 같다.
 *      (용량이 슬롯보다 크면 3번째 동물이 조용히 사라지고, 작으면 칸이 비어 나간다.)
 *   ② 모든 슬롯이 **같은 항목 집합**을 채운다 — 슬롯 0 에만 있는 칸이 있으면
 *      두 번째 동물의 그 항목이 빈 채로 제출된다.
 *   ③ 슬롯 필드에 source 가 없으면(=null) 그 칸은 영영 안 채워진다.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FORM_CAPACITY } from '../apps/admin/lib/pdf-multi-forms'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
type Field = { source: string | null; transform?: string; animalSlot?: number }
const maps = JSON.parse(
  readFileSync(path.join(ROOT, 'apps/admin/data/pdf-field-mappings.json'), 'utf-8'),
) as Record<string, { fields: Record<string, Field> }>

const errors: string[] = []
let checked = 0

for (const [formKey, form] of Object.entries(maps)) {
  const slotted = Object.entries(form.fields ?? {}).filter(([, f]) => f.animalSlot != null)
  if (slotted.length === 0) continue
  checked++

  const bySlot = new Map<number, Array<[string, Field]>>()
  for (const [name, f] of slotted) {
    const s = f.animalSlot as number
    if (!Number.isInteger(s) || s < 0) { errors.push(`${formKey}.${name}: animalSlot 이 0 이상 정수가 아님 (${s})`); continue }
    if (!bySlot.has(s)) bySlot.set(s, [])
    bySlot.get(s)!.push([name, f])
  }

  // ① 용량 선언
  const cap = FORM_CAPACITY[formKey]
  const slotCount = bySlot.size
  if (!cap) errors.push(`${formKey}: 동물 슬롯 ${slotCount}개를 쓰는데 FORM_CAPACITY 선언이 없음`)
  else if (cap.animals !== slotCount) {
    errors.push(`${formKey}: FORM_CAPACITY.animals=${cap.animals} 인데 실제 슬롯은 ${slotCount}개`)
  }
  // 슬롯 번호는 0..n-1 연속이어야 한다 (packCases 의 animalSlots 인덱스와 직결).
  for (let i = 0; i < slotCount; i++) {
    if (!bySlot.has(i)) errors.push(`${formKey}: 슬롯 번호가 0..${slotCount - 1} 연속이 아님 (${i} 없음)`)
  }

  // ②③ 슬롯 간 항목 집합 일치 + source 존재
  const sig = (fields: Array<[string, Field]>) =>
    fields.map(([, f]) => `${f.source ?? '∅'}|${f.transform ?? ''}`).sort().join(', ')
  const base = bySlot.get(0)
  if (!base) { errors.push(`${formKey}: 슬롯 0 이 없음`); continue }
  const baseSig = sig(base)
  for (const [s, fields] of [...bySlot.entries()].sort((a, b) => a[0] - b[0])) {
    for (const [name, f] of fields) {
      if (!f.source) errors.push(`${formKey}.${name}: 슬롯 ${s} 필드인데 source 가 비어 있어 영영 안 채워짐`)
    }
    if (s !== 0 && sig(fields) !== baseSig) {
      errors.push(`${formKey}: 슬롯 ${s} 항목이 슬롯 0 과 다름\n      슬롯 0: ${baseSig}\n      슬롯 ${s}: ${sig(fields)}`)
    }
  }
}

if (errors.length > 0) {
  console.error('\n✗ multi-slot forms lint\n')
  for (const e of errors) console.error(`  · ${e}`)
  console.error('')
  process.exit(1)
}
console.log(`✓ multi-slot forms lint: 동물 슬롯을 쓰는 폼 ${checked}개 매핑 정상`)
