import { readFile } from 'node:fs/promises'
import path from 'node:path'
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

for (const file of process.argv.slice(2)) {
  const data = new Uint8Array(await readFile(file))
  const doc = await pdfjs.getDocument({ data }).promise
  console.log(`\n=== ${path.basename(file)} ===`)
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const items = content.items
      .map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5] }))
      .filter(it => it.str && it.str.trim())
      .sort((a, b) => b.y - a.y || a.x - b.x)
    console.log(`--- page ${i} ---`)
    for (const it of items) {
      console.log(`  y=${it.y.toFixed(0)} x=${it.x.toFixed(0)} :: ${it.str}`)
    }
  }
}
