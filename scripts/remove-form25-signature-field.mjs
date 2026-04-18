/**
 * Form25에서 서명 옆에 있는 vet_signature 필드를 제거.
 * 수의사가 직접 수기 서명할 자리이므로 AcroForm 위젯은 불필요.
 */
import { PDFDocument } from 'pdf-lib'
import { readFile, writeFile } from 'node:fs/promises'

const path = 'data/pdf-templates/Form25.pdf'
const pdf = await PDFDocument.load(await readFile(path))
const form = pdf.getForm()

const target = form.getFieldMaybe('vet_signature')
if (!target) {
  console.log('vet_signature 필드가 이미 없습니다.')
  process.exit(0)
}

form.removeField(target)
await writeFile(path, await pdf.save())

// Verify
const pdf2 = await PDFDocument.load(await readFile(path))
const remaining = pdf2.getForm().getFields().map(f => f.getName())
console.log('vet_signature removed:', !remaining.includes('vet_signature'))
console.log('Total fields:', remaining.length)
