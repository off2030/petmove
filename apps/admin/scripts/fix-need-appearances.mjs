/**
 * Acrobat Reader가 pdf-lib로 생성/수정한 필드를 표시하도록
 * AcroForm 딕셔너리에 /NeedAppearances true 플래그 설정
 */
import { PDFDocument, PDFName, PDFBool } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'

for (const f of ['data/pdf-templates/FormRE.pdf']) {
  const pdf = await PDFDocument.load(await readFile(f))
  const acroForm = pdf.catalog.lookup(PDFName.of('AcroForm'))
  const before = acroForm.get(PDFName.of('NeedAppearances'))
  acroForm.set(PDFName.of('NeedAppearances'), PDFBool.True)
  await writeFile(f, await pdf.save())
  console.log(`${f}: NeedAppearances ${before} → true`)
}
