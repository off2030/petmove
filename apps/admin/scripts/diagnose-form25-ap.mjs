// 위젯(widget annotation) 레벨까지 AP 존재/상태 확인.
// updateFieldAppearances가 AP 스트림을 어디에 붙였는지 확인.
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFRef } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'node:fs/promises'

const tmpl = await readFile('data/pdf-templates/Form25.pdf')
const pdf = await PDFDocument.load(tmpl)
pdf.registerFontkit(fontkit)
const font = await pdf.embedFont(await readFile('data/fonts/NanumGothic.ttf'), { subset: false })
const form = pdf.getForm()

// Fill a few fields with KR text
form.getTextField('owner_name').setText('홍길동 Gildong Hong')
form.getTextField('owner_address').setText('서울특별시 관악구 관악로29길 3')
form.getTextField('hospital_name').setText('로잔 동물병원')

form.updateFieldAppearances(font)

// Inspect first 3 text fields' widgets
for (const name of ['owner_name', 'owner_address', 'hospital_name']) {
  const f = form.getTextField(name)
  const widgets = f.acroField.getWidgets()
  console.log(`\n[${name}] widgets: ${widgets.length}`)
  const fd = f.acroField.dict
  const fieldAP = fd.lookup(PDFName.of('AP'))
  console.log(`  field dict AP: ${fieldAP ? 'yes' : 'no'}`)
  const fieldDA = fd.lookup(PDFName.of('DA'))
  console.log(`  field DA: ${fieldDA instanceof PDFString ? fieldDA.decodeText() : '-'}`)
  for (const w of widgets) {
    const wDict = w.dict
    const wAP = wDict.lookup(PDFName.of('AP'))
    const wDA = wDict.lookup(PDFName.of('DA'))
    console.log(`  widget AP: ${wAP ? 'yes' : 'no'}`)
    console.log(`  widget DA: ${wDA instanceof PDFString ? wDA.decodeText() : '-'}`)
    if (wAP instanceof PDFDict) {
      const n = wAP.lookup(PDFName.of('N'))
      console.log(`    /N = ${n ? n.constructor.name : 'none'}`)
      if (n instanceof PDFRef) {
        const resolved = pdf.context.lookup(n)
        console.log(`    /N resolved: ${resolved ? resolved.constructor.name : 'null'}`)
      }
    }
  }
  const v = fd.lookup(PDFName.of('V'))
  console.log(`  V (value): ${v instanceof PDFString ? JSON.stringify(v.decodeText()) : v ? v.toString().slice(0, 40) : 'none'}`)
}

// Check AcroForm DR after update
const acro = pdf.catalog.lookup(PDFName.of('AcroForm'))
if (acro instanceof PDFDict) {
  const dr = acro.lookup(PDFName.of('DR'))
  if (dr instanceof PDFDict) {
    const fonts = dr.lookup(PDFName.of('Font'))
    if (fonts instanceof PDFDict) {
      console.log(`\nDR fonts after update: ${fonts.keys().map(k => k.toString()).join(', ')}`)
    }
  }
}
