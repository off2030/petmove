/**
 * Rewrite new NZ.pdf field names to match old naming scheme.
 * Walk each page's /Widget annotations, resolve their effective field name
 * via parent chain, and match by page + center distance.
 */
import { PDFDocument, PDFName, PDFString, PDFRef } from 'pdf-lib'
import fs from 'fs'
import os from 'os'
import path from 'path'

const OLD = path.join(os.tmpdir(), 'NZ_old.pdf')
const NEW = process.env.NZ_INPUT ?? path.join(os.tmpdir(), 'NZ_new.pdf')
const OUT = process.env.NZ_OUTPUT ?? 'data/pdf-templates/NZ.pdf'

function resolveFieldName(doc, annotDict) {
  // Walk /Parent chain, concatenating /T values (root → leaf)
  const parts = []
  let node = annotDict
  const seen = new Set()
  while (node && !seen.has(node)) {
    seen.add(node)
    const t = node.get(PDFName.of('T'))
    if (t) {
      const str = t.decodeText?.() ?? t.toString().replace(/^\(|\)$/g, '')
      parts.unshift(str)
    }
    const parent = node.get(PDFName.of('Parent'))
    if (parent instanceof PDFRef) node = doc.context.lookup(parent)
    else if (parent) node = parent
    else break
  }
  return parts.join('.')
}

function collectWidgets(doc) {
  const out = []
  let pi = 0
  for (const page of doc.getPages()) {
    pi++
    const annots = page.node.Annots()
    if (!annots) continue
    for (let i = 0; i < annots.size(); i++) {
      const a = annots.lookup(i)
      if (!a) continue
      if (a.get(PDFName.of('Subtype'))?.toString() !== '/Widget') continue
      const name = resolveFieldName(doc, a)
      if (!name) continue
      const rect = a.get(PDFName.of('Rect'))
      if (!rect) continue
      const x1 = rect.get(0).asNumber()
      const y1 = rect.get(1).asNumber()
      const x2 = rect.get(2).asNumber()
      const y2 = rect.get(3).asNumber()
      out.push({
        name,
        page: pi,
        cx: (x1 + x2) / 2,
        cy: (y1 + y2) / 2,
        w: x2 - x1,
        h: y2 - y1,
        annotDict: a,
      })
    }
  }
  return out
}

const oldDoc = await PDFDocument.load(fs.readFileSync(OLD))
const newDoc = await PDFDocument.load(fs.readFileSync(NEW))
const oldWidgetsAll = collectWidgets(oldDoc)
const newWidgets = collectWidgets(newDoc)
// Dedupe old by name: if a field has multiple widgets (same name, different pages),
// keep the first — we only need one anchor per old field name for matching.
const seenOldNames = new Set()
const oldWidgets = []
for (const w of oldWidgetsAll) {
  if (seenOldNames.has(w.name)) continue
  seenOldNames.add(w.name)
  oldWidgets.push(w)
}

console.log('old widgets:', oldWidgetsAll.length, '→ deduped:', oldWidgets.length)
console.log('new widgets:', newWidgets.length, '(unique names:', new Set(newWidgets.map(w => w.name)).size, ')')

// Match each new widget to closest old widget on the same page
// User-confirmed overrides (new field name → old field name)
const OVERRIDES = {
  'text_79gxpw': 'Text78',   // p4 vet name
  'text_81ljgw': 'Text80',   // p4 vet address line 1
  'text_82yamc': 'Text81',   // p4 vet address line 2
}
const FORCE_UNMATCH_OLD = new Set(['Text78', 'Text80', 'Text81'])

const TOL = 35
const usedOldIdx = new Set()
const renameMap = new Map() // new name → old name
const nameToPages = new Map() // old name → set of pages (sanity: multi-widget fields)

for (const nw of newWidgets) {
  // Honor user-confirmed override first
  if (OVERRIDES[nw.name]) {
    const targetName = OVERRIDES[nw.name]
    const idx = oldWidgets.findIndex(w => w.name === targetName)
    if (idx >= 0) usedOldIdx.add(idx)
    renameMap.set(nw.name, targetName)
    continue
  }
  let best = null
  let bestDist = Infinity
  for (let i = 0; i < oldWidgets.length; i++) {
    if (usedOldIdx.has(i)) continue
    const ow = oldWidgets[i]
    if (FORCE_UNMATCH_OLD.has(ow.name)) continue
    if (ow.page !== nw.page) continue
    const dx = ow.cx - nw.cx
    const dy = ow.cy - nw.cy
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d < bestDist) { bestDist = d; best = i }
  }
  if (best !== null && bestDist <= TOL) {
    const ow = oldWidgets[best]
    usedOldIdx.add(best)
    if (renameMap.has(nw.name) && renameMap.get(nw.name) !== ow.name) {
      console.log('CONFLICT:', nw.name, 'already maps to', renameMap.get(nw.name), 'but also to', ow.name)
    }
    renameMap.set(nw.name, ow.name)
    if (!nameToPages.has(ow.name)) nameToPages.set(ow.name, new Set())
    nameToPages.get(ow.name).add(nw.page)
  } else {
    console.log('UNMATCHED new:', nw.name, 'p' + nw.page, '(' + nw.cx.toFixed(1) + ',' + nw.cy.toFixed(1) + ')', 'dist=' + (bestDist === Infinity ? '-' : bestDist.toFixed(2)))
  }
}

const oldUnused = oldWidgets.filter((_, i) => !usedOldIdx.has(i))
if (oldUnused.length) {
  console.log('\nOLD widgets with no match:')
  for (const ow of oldUnused) console.log('  ', ow.name, 'p' + ow.page, '(' + ow.cx.toFixed(1) + ',' + ow.cy.toFixed(1) + ')')
}

console.log('\ntotal mapped field names:', renameMap.size)

// Apply renames: iterate form fields, update /T on the parent dict
const form = newDoc.getForm()
let renamed = 0
for (const f of form.getFields()) {
  const cur = f.getName()
  const target = renameMap.get(cur)
  if (!target || target === cur) continue
  f.acroField.dict.set(PDFName.of('T'), PDFString.of(target))
  renamed++
}
console.log('renamed fields:', renamed)

// Sanity: list final field names
const finalNames = form.getFields().map(f => f.getName())
const dupes = {}
for (const n of finalNames) dupes[n] = (dupes[n] || 0) + 1
const dupList = Object.entries(dupes).filter(([, c]) => c > 1)
if (dupList.length) console.log('DUPLICATES POST-RENAME:', JSON.stringify(dupList))
const stillNew = finalNames.filter(n => /^(text|checkbox|dropdown)_[a-z0-9]/.test(n))
console.log('still-unrenamed:', stillNew)

const outBytes = await newDoc.save()
fs.writeFileSync(OUT, outBytes)
console.log('\nwrote', OUT, outBytes.length, 'bytes,', finalNames.length, 'fields')
