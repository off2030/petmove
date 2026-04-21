/**
 * FormAC.pdf 의 폼 필드 이름이 시각적 위치보다 한 칸 위로 밀려 있는
 * 템플릿 버그를 바로잡는다.
 *
 * 변경 매핑 (한 칸 내림):
 *   exporting_country → consignor_name
 *   consignor_name    → consignor_address
 *   consignor_address → consignee_name
 *   consignee_name    → consignee_address
 *
 * "Exporting country: Republic of Korea" 는 템플릿에 static text로 박혀 있어
 * 해당 필드는 필요 없음.
 */
import { PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'

const IN = 'data/pdf-templates/FormAC.pdf'
const OUT = IN

const RENAMES = {
  exporting_country: 'consignor_name',
  consignor_name:    'consignor_address',
  consignor_address: 'consignee_name',
  consignee_name:    'consignee_address',
}

const pdf = await PDFDocument.load(await readFile(IN))
const form = pdf.getForm()

// 충돌 방지: 두 단계로 처리. 먼저 임시 이름(__tmp_*)으로 바꾼 뒤, 최종 이름으로 교체.
// 이렇게 해야 "A→B, B→C" 같은 체인에서 기존 B가 덮어써지지 않는다.
const tmpRenames = {}
for (const [oldName, newName] of Object.entries(RENAMES)) {
  tmpRenames[oldName] = `__tmp_${newName}`
}

function rename(field, newName) {
  field.acroField.dict.set(PDFName.of('T'), PDFString.of(newName))
}

// pass 1: 기존 이름 → 임시 이름
for (const [oldName, tmpName] of Object.entries(tmpRenames)) {
  const f = form.getFieldMaybe(oldName)
  if (!f) { console.warn(`미발견: ${oldName}`); continue }
  rename(f, tmpName)
  console.log(`${oldName} → ${tmpName}`)
}

// pass 2: 임시 이름 → 최종 이름
const reloaded = pdf.getForm()  // 폼 내부 맵 재생성
for (const [oldName, tmpName] of Object.entries(tmpRenames)) {
  const finalName = RENAMES[oldName]
  const f = reloaded.getFieldMaybe(tmpName)
  if (!f) { console.warn(`임시 미발견: ${tmpName}`); continue }
  rename(f, finalName)
  console.log(`${tmpName} → ${finalName}`)
}

await writeFile(OUT, await pdf.save())
console.log(`\nwrote ${OUT}`)

// 검증
const verify = await PDFDocument.load(await readFile(OUT))
const names = verify.getForm().getFields().map(f => f.getName()).sort()
const expected = ['consignor_name', 'consignor_address', 'consignee_name', 'consignee_address']
for (const e of expected) {
  console.log(`${names.includes(e) ? 'OK ' : 'MISS'} ${e}`)
}
console.log(`exporting_country 잔존: ${names.includes('exporting_country')}`)
