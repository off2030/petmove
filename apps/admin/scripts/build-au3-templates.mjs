// 호주 건강증명서 Declaration 1번 — 세 문장 중 하나만 남기고 취소선("Strike through as required").
//   A. exported from Australia on [ ]   → AU_2 (호주에서 출국해 온 경우)
//   B. underwent an identity verification → AU   (ID 인증 받음)
//   C. not exported ... not undergone ID  → AU_3 (ID 안 받음)
//
// 1) AU_3 / AU_Cat_3 신규 — AU_2 계열(B 에 취소선)을 복제하고 A 에도 취소선을 긋는다.
//    → A·B 지워지고 C 만 남는다. 날짜 칸 두 개는 매핑에서 공란.
// 2) AU_2 / AU_Cat_2 보정 — 원본에 C 취소선이 빠져 있어(A·C 둘 다 살아 있던 상태) C 에 긋는다.
//
// 취소선 좌표·색은 AU / AU_Cat 원본에 그어진 선을 그대로 옮겼다(PyMuPDF get_drawings, 좌상단 기준 y).
// 실행: apps/admin 에서 `node scripts/build-au3-templates.mjs` — AU_3.pdf 가 있으면 전체를 건너뛴다.
import { PDFDocument, rgb } from 'pdf-lib'
import { readFile, writeFile, access } from 'node:fs/promises'

const DIR = 'data/pdf-templates/'
const RED = rgb(0.8588, 0.2039, 0.1451)

/** 원본 선 [x0, x1, yTop] (좌상단 기준) — 페이지 높이로 뒤집어 그린다. */
function strike(page, lines) {
  const h = page.getHeight()
  for (const [x0, x1, yTop] of lines) {
    page.drawLine({ start: { x: x0, y: h - yTop }, end: { x: x1, y: h - yTop }, thickness: 1, color: RED })
  }
}

async function edit(src, dst, pageIndex, lines) {
  const pdf = await PDFDocument.load(await readFile(DIR + src))
  strike(pdf.getPage(pageIndex), lines)
  await writeFile(DIR + dst, await pdf.save({ updateFieldAppearances: false }))
  console.log(`${src} → ${dst}: p${pageIndex} 취소선 ${lines.length}줄`)
}

// 개 — A(p3), C(p4)
const DOG_A = [[72.7, 477.2, 532.1], [72.7, 301.1, 545.9]]
const DOG_C = [[75.3, 444.4, 80.5], [75.9, 132.2, 94.3]]
// 고양이 — A·C 모두 p2
const CAT_A = [[70.7, 514.5, 248.1], [72.7, 261.8, 261.2]]
const CAT_C = [[71.3, 499.4, 399.9]]

const exists = await access(DIR + 'AU_3.pdf').then(() => true, () => false)
if (exists) {
  console.log('AU_3.pdf 이미 있음 — 건너뜀 (AU_2 보정도 이미 적용된 것으로 간주)')
} else {
  // 순서 중요: AU_3 은 C 가 살아 있어야 하므로 AU_2 보정 **전**에 복제한다.
  await edit('AU_2.pdf', 'AU_3.pdf', 3, DOG_A)
  await edit('AU_Cat_2.pdf', 'AU_Cat_3.pdf', 2, CAT_A)
  await edit('AU_2.pdf', 'AU_2.pdf', 4, DOG_C)
  await edit('AU_Cat_2.pdf', 'AU_Cat_2.pdf', 2, CAT_C)
}
