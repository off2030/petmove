// 별지25(Form25.pdf)·EX(Form25AuNz.pdf) 하단 안내문 아래 우측에 보조 마이크로칩
// 각주 필드(secondary_chip_note)를 추가한다. 칩 칸(text_78pnvw/text_103mjxj)은
// microchip_primary(주칩만)로 바뀌었고, 보조칩은 이 각주에
// "* 보조 마이크로칩 번호: <칩>[, <칩>]" 형식으로 출력된다 (없으면 공란).
//
// 좌표 근거 (프로브 렌더로 확인, 2026-08-01):
//  - Form25:    안내문 마지막 줄 baseline ≈ y=103 → 각주 rect y=84
//  - Form25AuNz: 하단 섹션이 32pt 아래 (안내문 마지막 줄 ≈ y=70) → 각주 rect y=51
//  - 우측 끝은 표 우측 테두리(x≈523)에 맞춤. 정렬은 fill 시 mapping.align=right.
import { PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'

const FIELD = 'secondary_chip_note'
// Form25.text_81fpfb 과 동일한 auto-size(0pt) DA — 실제 폰트는 fill 시 교체됨.
const AUTO_DA = '/Helv 0 Tf 0 0 0 rg'

const TARGETS = [
  { path: 'data/pdf-templates/Form25.pdf',     rect: { x: 150, y: 84, width: 373, height: 12 } },
  { path: 'data/pdf-templates/Form25AuNz.pdf', rect: { x: 150, y: 51, width: 373, height: 12 } },
]

for (const { path, rect } of TARGETS) {
  const pdf = await PDFDocument.load(await readFile(path))
  const form = pdf.getForm()

  if (form.getFields().some((f) => f.getName() === FIELD)) {
    console.log(`${path}: ${FIELD} 필드가 이미 존재 — 건너뜀`)
    continue
  }

  const field = form.createTextField(FIELD)
  field.addToPage(pdf.getPages()[0], { ...rect, borderWidth: 0 })

  field.acroField.dict.set(PDFName.of('DA'), PDFString.of(AUTO_DA))
  for (const w of field.acroField.getWidgets()) {
    w.dict.set(PDFName.of('DA'), PDFString.of(AUTO_DA))
  }

  await writeFile(path, await pdf.save({ updateFieldAppearances: false }))
  console.log(`${path}: ${FIELD} 추가 완료 — x=${rect.x} y=${rect.y} w=${rect.width} h=${rect.height}`)
}
