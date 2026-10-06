// 뉴질랜드 신 IHS 2026 서식 3종 생성 — NZ26(건강증명서)·NZ_ID(사전 ID 확인서)·RCF(광견병 증명서).
//
// 1) python scripts/nz2026-layout.py   — 원본 PDF 문구 위치에서 입력칸·취소선 좌표 계산
// 2) node scripts/build-nz2026-templates.mjs — 원본 PDF 에 입력칸을 얹어 data/pdf-templates/ 에 저장
//
// 원본(data/pdf-templates/src/):
//   NZ26_base.pdf  — 사용자 제공 'Model-certificate-template.docx' 를 Word 로 PDF 변환(2026-10-06)
//   NZ_ID_base.pdf — MPI 'Appendix 2B (guidance) … category 3 … 2026 IHS' 공식 PDF(2026-09-29 수정본, 2쪽)
//   RCF_base.pdf   — MPI 'Rabies Certification Form (RCF) 2026 IHS' 공식 PDF(Version: October 2025)
// 입력칸 이름·채움 규칙은 data/pdf-field-mappings.json 의 NZ26 / NZ_ID / RCF.
// 실행: apps/admin 에서. 기존 출력은 덮어쓴다(원본에서 다시 만들기 때문에 안전하다).
import { PDFDocument } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'

const SRC = 'data/pdf-templates/src/'
const OUT = 'data/pdf-templates/'
const layouts = JSON.parse(await readFile(SRC + 'nz2026-layout.json', 'utf8'))

for (const [key, lay] of Object.entries(layouts)) {
  const pdf = await PDFDocument.load(await readFile(SRC + lay.base))
  const form = pdf.getForm()
  const pages = pdf.getPages()
  let n = 0
  for (const f of lay.fields) {
    const page = pages[f.page]
    const rect = { x: f.x, y: f.y, width: f.w, height: f.h, borderWidth: 0 }
    // pdf-lib 은 바탕색을 안 주면 흰색으로 칠한다 — 인쇄된 상자 선과 겹치는 서식(RCF)은 투명으로.
    //   키를 **명시적으로 undefined** 로 넣어야 기본값(흰색)이 안 붙는다.
    if (lay.transparent) Object.assign(rect, { backgroundColor: undefined, borderColor: undefined })
    if (f.type === 'check') {
      const cb = form.createCheckBox(f.name)
      cb.addToPage(page, rect)
    } else {
      const tf = form.createTextField(f.name)
      if (f.multiline) tf.enableMultiline()
      tf.addToPage(page, rect)
    }
    n++
  }
  await writeFile(OUT + lay.out, await pdf.save())
  console.log(`${key}: ${lay.base} → ${lay.out} (입력칸 ${n}개)`)
}
