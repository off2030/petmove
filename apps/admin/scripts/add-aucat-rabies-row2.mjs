// AU 고양이 증명서(AU_Cat.pdf, AU_Cat_2.pdf)의 광견병 "Vaccination date(s)"
// 칸은 큰 단일 셀(y 612~728)인데 1회차 날짜 필드(text_18rloc, y=713)만 있어
// 광견병 2회 접종 시 2회차 접종일이 누락됐다. 같은 열(x=219)에 1회차 바로
// 아래로 2회차 날짜 필드를 추가한다 (개 양식 AU.pdf 의 행 간격 17pt 기준).
import { PDFDocument, PDFName, PDFString, PDFArray } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'

const NEW = 'rabies_date_2'
// text_18rloc = {x:219, y:713, w:114, h:14}; 2회차는 17pt 아래.
const RECT = { x: 219, y: 696, width: 114, height: 14 }
const AUTO_DA = '/Helv 0 Tf 0 0 0 rg' // text_18rloc 와 동일 (auto-size)

/** 주어진 (x,y) 좌하단 좌표의 위젯이 있는 페이지를 Rect 매칭으로 찾는다. */
function findPageOfWidget(pdf, x, y) {
  for (const p of pdf.getPages()) {
    const annots = p.node.Annots && p.node.Annots()
    if (!annots) continue
    for (let i = 0; i < annots.size(); i++) {
      const d = pdf.context.lookup(annots.get(i))
      if (!d || typeof d.lookup !== 'function') continue
      const rect = d.lookup(PDFName.of('Rect'))
      if (!(rect instanceof PDFArray)) continue
      const x0 = rect.lookup(0)?.asNumber?.()
      const y0 = rect.lookup(1)?.asNumber?.()
      if (typeof x0 === 'number' && typeof y0 === 'number' &&
          Math.abs(x0 - x) < 2 && Math.abs(y0 - y) < 2) return p
    }
  }
  return null
}

for (const file of ['AU_Cat.pdf', 'AU_Cat_2.pdf']) {
  const path = 'data/pdf-templates/' + file
  const pdf = await PDFDocument.load(await readFile(path))
  const form = pdf.getForm()

  if (form.getFields().some((f) => f.getName() === NEW)) {
    console.log(`${file}: ${NEW} 이미 존재 — 건너뜀`)
    continue
  }

  const page = findPageOfWidget(pdf, 219, 713) // text_18rloc 위치
  if (!page) throw new Error(`${file}: text_18rloc(219,713) 페이지를 찾지 못함`)

  const field = form.createTextField(NEW)
  field.addToPage(page, { ...RECT, borderWidth: 0 })
  field.acroField.dict.set(PDFName.of('DA'), PDFString.of(AUTO_DA))
  for (const w of field.acroField.getWidgets()) {
    w.dict.set(PDFName.of('DA'), PDFString.of(AUTO_DA))
  }

  await writeFile(path, await pdf.save({ updateFieldAppearances: false }))
  console.log(`${file}: ${NEW} 추가 완료 — x=${RECT.x} y=${RECT.y} w=${RECT.width} h=${RECT.height}`)
}
