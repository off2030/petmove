#!/usr/bin/env node
/**
 * 매핑 파일의 transform 이름 중 production resolveField 에 핸들러가 없을
 * 가능성이 높은 것들을 찾아 출력. 휴리스틱 — head token 이 pdf-fill.ts
 * 어디에도 없으면 unimplemented 후보.
 */
import { readFileSync } from 'node:fs'

const mappings = JSON.parse(readFileSync('apps/admin/data/pdf-field-mappings.json', 'utf8'))
const fillSrc = readFileSync('apps/admin/lib/pdf-fill.ts', 'utf8')

const used = new Map() // transform → [{form, fieldName}]
for (const [formKey, form] of Object.entries(mappings)) {
  for (const [fieldName, fld] of Object.entries(form.fields ?? {})) {
    if (!fld.transform) continue
    const list = used.get(fld.transform) ?? []
    list.push({ form: formKey, field: fieldName })
    used.set(fld.transform, list)
  }
}

const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const heads = new Set()
for (const t of used.keys()) {
  // Strip array indices and trailing args
  let head = t.split('[')[0].split(':')[0]
  heads.add(head)
}

const unimplementedHeads = new Set()
for (const h of heads) {
  const rx = new RegExp(escapeRx(h), 'g')
  if (!rx.test(fillSrc)) unimplementedHeads.add(h)
}

const suspectTransforms = []
for (const t of used.keys()) {
  const head = t.split('[')[0].split(':')[0]
  if (unimplementedHeads.has(head)) suspectTransforms.push(t)
}

console.log(`Total transforms used: ${used.size}`)
console.log(`Suspect (head token not found in pdf-fill.ts): ${suspectTransforms.length}\n`)
const groups = new Map()
for (const t of suspectTransforms) {
  const refs = used.get(t)
  for (const r of refs) {
    const key = `${r.form}: ${t}`
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
}
const sorted = Array.from(groups.entries()).sort()
for (const [k, n] of sorted) console.log(`  ${k}  (${n} field${n > 1 ? 's' : ''})`)
