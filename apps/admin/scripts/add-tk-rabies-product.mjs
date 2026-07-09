// TK.pdf 템플릿의 광견병 섹션에는 "Üretici ve ürünün adı / Manufacturer and name
// of product (4)" 라벨만 인쇄돼 있고 입력 폼 필드가 없다. 라벨 아래 빈 띠
// (y≈243, 라벨 baseline 255 와 Batch 라벨행 232 사이)에 full-width 텍스트
// 필드 `rabies_product` 를 추가해 광견병 제품명이 자동으로 채워지게 한다.
import { PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'

const targetPath = 'data/pdf-templates/TK.pdf'
const RECT = { x: 73, y: 243, width: 462, height: 11 }
const AUTO_DA = '/Helv 0 Tf 0 0 0 rg' // auto-size, black

const pdf = await PDFDocument.load(await readFile(targetPath))
const form = pdf.getForm()

if (form.getFields().some((f) => f.getName() === 'rabies_product')) {
  console.log('rabies_product 필드가 이미 존재 — 건너뜀')
  process.exit(0)
}

const field = form.createTextField('rabies_product')
field.addToPage(pdf.getPages()[0], { ...RECT, borderWidth: 0 })
field.acroField.dict.set(PDFName.of('DA'), PDFString.of(AUTO_DA))
for (const w of field.acroField.getWidgets()) {
  w.dict.set(PDFName.of('DA'), PDFString.of(AUTO_DA))
}

await writeFile(targetPath, await pdf.save({ updateFieldAppearances: false }))
console.log(`rabies_product 필드 추가 완료 — x=${RECT.x} y=${RECT.y} w=${RECT.width} h=${RECT.height}`)
