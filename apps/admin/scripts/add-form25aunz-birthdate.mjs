// 별지25 EX(Form25AuNz.pdf) 템플릿에는 "(생년월일:" 라벨만 인쇄돼 있고
// 입력 폼 필드가 없어 증명서 생성 시 생년월일이 항상 공란이었다.
// 일반 별지25(Form25.pdf)의 birth_date 필드(text_81fpfb)를 위치 그대로
// 복제해 birth_date 텍스트 필드를 추가한다. 두 양식은 동일 레이아웃이며
// Form25AuNz 는 y 축이 일괄 +20pt 시프트돼 있다 (라벨/체크박스 좌표로 확인).
import { PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'

const targetPath = 'data/pdf-templates/Form25AuNz.pdf'

// Form25.text_81fpfb = { x:357, y:559, w:54, h:12 }, +20 y-shift for Form25AuNz.
const RECT = { x: 357, y: 579, width: 54, height: 12 }
// Form25.text_81fpfb DA — auto-size(0pt), black text.
const AUTO_DA = '/Helv 0 Tf 0 0 0 rg'

const pdf = await PDFDocument.load(await readFile(targetPath))
const form = pdf.getForm()

if (form.getFields().some((f) => f.getName() === 'birth_date')) {
  console.log('birth_date 필드가 이미 존재 — 건너뜀')
  process.exit(0)
}

const field = form.createTextField('birth_date')
field.addToPage(pdf.getPages()[0], { ...RECT, borderWidth: 0 })

field.acroField.dict.set(PDFName.of('DA'), PDFString.of(AUTO_DA))
for (const w of field.acroField.getWidgets()) {
  w.dict.set(PDFName.of('DA'), PDFString.of(AUTO_DA))
}

await writeFile(targetPath, await pdf.save({ updateFieldAppearances: false }))
console.log(`birth_date 필드 추가 완료 — x=${RECT.x} y=${RECT.y} w=${RECT.width} h=${RECT.height}`)
