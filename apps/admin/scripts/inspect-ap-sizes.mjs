// FormAC / FormRE 템플릿을 샘플 데이터로 채운 뒤,
// 각 텍스트 필드의 AP 스트림에서 실제 렌더 크기(Tf size)를 추출한다.
// pdf-lib가 size=0(auto)을 어떻게 해석해서 AP에 구웠는지 보려는 목적.
import { PDFDocument, PDFName, PDFDict, PDFRef, PDFStream, PDFString, decodePDFRawStream, PDFRawStream } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const samples = {
  // 현실적인 길이의 데이터 — 실제 증명서와 비슷
  default: '홍길동',
  long: 'Very Long Hospital Name Clinic Co., Ltd.',
}

async function run(template) {
  const tmpl = await readFile(path.join('data/pdf-templates', template))
  const pdf = await PDFDocument.load(tmpl)
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(await readFile('data/fonts/NanumGothic.ttf'), { subset: false })
  const form = pdf.getForm()

  // 모든 텍스트 필드에 짧은 샘플 채움
  for (const f of form.getFields()) {
    if (f.constructor.name !== 'PDFTextField') continue
    f.setText(samples.default)
  }

  // pdf-fill.ts와 동일한 순서로 AP 재생성
  form.updateFieldAppearances(font)

  const sizeHistogram = new Map()
  const perField = []

  for (const f of form.getFields()) {
    if (f.constructor.name !== 'PDFTextField') continue
    const name = f.getName()
    for (const w of f.acroField.getWidgets()) {
      const ap = w.dict.lookup(PDFName.of('AP'))
      if (!(ap instanceof PDFDict)) continue
      const n = ap.get(PDFName.of('N'))
      let stream = null
      if (n instanceof PDFRef) stream = pdf.context.lookup(n)
      else stream = n
      if (!(stream instanceof PDFStream) && !(stream instanceof PDFRawStream)) continue

      // Stream 내용 디코드 (Flate 해제)
      let contents = ''
      try {
        let raw
        if (stream instanceof PDFRawStream) {
          raw = decodePDFRawStream(stream).decode()
        } else if (typeof stream.getUnencodedContents === 'function') {
          raw = stream.getUnencodedContents()
        } else {
          raw = stream.getContents()
        }
        contents = new TextDecoder('latin1').decode(raw)
      } catch (e) {
        console.error(`decode failed for ${name}:`, e.message)
        continue
      }
      // "/Fname size Tf" 패턴 추출 (여러 개 있을 수 있음, 첫번째만)
      const m = contents.match(/\/\S+\s+(-?\d*\.?\d+)\s+Tf/)
      if (m) {
        const s = Number(m[1])
        sizeHistogram.set(s, (sizeHistogram.get(s) || 0) + 1)
        perField.push({ name, size: s })
      } else {
        perField.push({ name, size: 'NO_TF' })
      }
    }
  }

  console.log(`\n=== ${template} — AP에 구워진 실제 폰트 크기 ===`)
  const sorted = [...sizeHistogram.entries()].sort((a, b) => b[1] - a[1])
  console.log('  분포:', sorted.map(([s, c]) => `${s}pt×${c}`).join(', '))
  const small = perField.filter(p => typeof p.size === 'number' && p.size < 8)
  if (small.length) {
    console.log(`  8pt 미만 (${small.length}개):`)
    for (const p of small.slice(0, 15)) console.log(`    ${p.name.padEnd(30)} ${p.size}pt`)
    if (small.length > 15) console.log(`    … +${small.length - 15} more`)
  }
  // 필드별 전체 리스트 (원하면 보려면 주석 해제)
  // for (const p of perField) console.log(`  ${p.name.padEnd(30)} ${p.size}pt`)
}

for (const t of ['FormAC.pdf', 'FormRE.pdf', 'Form25.pdf', 'IdentificationDeclaration.pdf']) {
  await run(t)
}
