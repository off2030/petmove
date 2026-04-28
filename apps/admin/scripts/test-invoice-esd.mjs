// Smoke test Invoice + ESD mappings with tube_count + consignee_lab extras.
import { PDFDocument, PDFName, PDFString, PDFDict, PDFTextField, PDFCheckBox } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const mappings = JSON.parse(await readFile('data/pdf-field-mappings.json', 'utf8'))

const VET_INFO = {
  name_en: 'Jinwon Lee',
  clinic_en: 'Lausanne Veterinary Medical Center',
  address_en: '1st floor, 3, Gwanak-ro 29-gil, Gwanak-gu, Seoul, Republic of Korea',
  postal_code: '08801',
  phone_intl: '+82-2-872-7588',
  mobile_phone: '010-1234-5678',
  email: 'petmove@naver.com',
  license_no: '9608',
  custom_fields: [
    { id: '1', label: 'Account No.', value: 'FX-987654' },
    { id: '2', label: 'MID', value: 'MID-12345' },
  ],
}

function fmtPhoneIntlKr(raw) {
  let s = String(raw ?? '').replace(/\D/g, '')
  if (!s) return ''
  if (s.startsWith('82')) s = s.slice(2)
  if (s.startsWith('0')) s = s.slice(1)
  if (!s) return ''
  const areaLen = s.startsWith('2') ? 1 : 2
  const area = s.slice(0, areaLen)
  const rest = s.slice(areaLen)
  if (!rest) return `+82-${area}`
  const tailLen = rest.length >= 7 ? 4 : 3
  const mid = rest.slice(0, rest.length - tailLen)
  const tail = rest.slice(rest.length - tailLen)
  return `+82-${area}-${mid}-${tail}`
}

const LAB_SHIPPING = {
  ksvdl_r: { name: 'Kansas State University Rabies Laboratory', line1: '2005 Research Park Circle', line2: '', city: 'Manhattan', state: 'KS', zip: '66502', country: 'United States of America', phone: '+1-785-532-4483' },
  ksvdl: { name: 'Kansas State Veterinary Diagnostic Laboratory', line1: '1800 Denison Avenue', line2: 'Mosier D117', city: 'Manhattan', state: 'KS', zip: '66506', country: 'United States of America', phone: '+1-866-512-5650' },
  vbddl: { name: 'Vector Borne Disease Diagnostic Laboratory', line1: 'CVM Research Building, Room 462A', line2: '1060 William Moore Drive', city: 'Raleigh', state: 'NC', zip: '27607', country: 'United States of America' },
}

function formatLab(code, attr) {
  const lab = LAB_SHIPPING[code?.toLowerCase()]
  if (!lab) return ''
  if (attr === 'name') return lab.name
  if (attr === 'line1') return lab.line1
  if (attr === 'line2') return lab.line2
  if (attr === 'city_state_zip') return `${lab.city}, ${lab.state} ${lab.zip}`
  if (attr === 'country') return lab.country
  if (attr === 'phone') return lab.phone ?? ''
  if (attr === 'full') {
    const p = [lab.name, lab.line1, lab.line2, `${lab.city}, ${lab.state} ${lab.zip}`, lab.country].filter(Boolean)
    if (lab.phone) p.push(`Tel ${lab.phone}`)
    return p.join('\n')
  }
  return ''
}

function resolve(mp, data) {
  const { source, transform } = mp
  const raw = source ? data[source] : null
  let m

  if (transform === 'today_ymd_slash') { const d = new Date(); return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}` }
  if ((m = transform?.match(/^vet:(.+)$/))) {
    const k = m[1]
    if (k === 'invoice_shipper_block') {
      const v = VET_INFO
      const lines = []
      if (v.name_en) lines.push(`Contact Name: ${v.name_en}`)
      const addrParts = []
      if (v.clinic_en) addrParts.push(v.clinic_en)
      if (v.address_en) addrParts.push(v.address_en)
      let addrLine = addrParts.join(', ')
      if (v.postal_code && !addrLine.includes(v.postal_code)) {
        addrLine = addrLine ? `${addrLine} ${v.postal_code}` : v.postal_code
      }
      if (addrLine) lines.push(`Company name/Address: ${addrLine}`)
      const contactParts = []
      if (v.phone_intl) contactParts.push(`Tel. ${v.phone_intl}`)
      if (v.mobile_phone) {
        const mobileIntl = fmtPhoneIntlKr(v.mobile_phone)
        contactParts.push(`Mobile: ${mobileIntl || v.mobile_phone}`)
      }
      if (v.email) contactParts.push(`email: ${v.email}`)
      if (contactParts.length) lines.push(contactParts.join(' / '))
      const customs = v.custom_fields ?? []
      const findCustom = (label) => customs.find(f => f.label.trim().toLowerCase() === label.toLowerCase())?.value
      const accountNo = findCustom('account no.') || findCustom('account no') || findCustom('account number')
      const mid = findCustom('mid')
      const idParts = []
      if (accountNo) idParts.push(`Account No.: ${accountNo}`)
      if (mid) idParts.push(`MID: ${mid}`)
      if (idParts.length) lines.push(idParts.join(' / '))
      return lines.join('\n')
    }
    return VET_INFO[k] ?? ''
  }
  if ((m = transform?.match(/^lab_shipping:(name|line1|line2|city_state_zip|country|phone|full|name_line|block)$/))) {
    const code = String(raw ?? '').toLowerCase()
    const attr = m[1]
    if (attr === 'name_line') {
      const full = formatLab(code, 'full')
      return full.split('\n').filter(s => !s.startsWith('Tel ')).join(', ')
    }
    if (attr === 'block') return formatLab(code, 'full')
    return formatLab(code, attr)
  }
  if (transform === 'invoice_specimen_desc') {
    const n = Math.trunc(Number(raw) || 1)
    return `Non-infectious canine serum (0.5 mL × ${n} ${n===1?'tube':'tubes'})`
  }
  if (transform === 'invoice_total_value') {
    const n = Math.trunc(Number(raw) || 1)
    return `${n}.00`
  }

  if (source === null) return mp.default ?? ''
  if (raw == null || raw === '') return mp.default ?? ''
  return String(raw)
}

for (const [key, extras] of [
  ['Invoice', { tube_count: 3, consignee_lab: 'ksvdl' }],
  ['ESD',     { tube_count: 3, consignee_lab: 'ksvdl' }],
]) {
  const form = mappings[key]
  const tpl = await readFile(path.join('data/pdf-templates', form.template))
  const pdf = await PDFDocument.load(tpl)
  pdf.registerFontkit(fontkit)
  const fontBytes = await readFile('data/fonts/NanumGothic.ttf')
  const customFont = await pdf.embedFont(fontBytes, { subset: false })
  const pdfForm = pdf.getForm()

  const filled = {}, empty = [], missing = []
  for (const [name, mp] of Object.entries(form.fields)) {
    const v = resolve(mp, extras)
    if (v === '' || v === false) empty.push(name)
    else filled[name] = v
    try {
      const f = pdfForm.getField(name)
      if (f instanceof PDFTextField && typeof v === 'string' && v) f.setText(v)
      else if (f instanceof PDFCheckBox) { v === true ? f.check() : f.uncheck() }
    } catch { missing.push(name) }
  }
  const tplFields = new Set(pdfForm.getFields().map(f => f.getName()))
  const mapFields = new Set(Object.keys(form.fields))
  const inTplNotMap = [...tplFields].filter(x => !mapFields.has(x))
  const inMapNotTpl = [...mapFields].filter(x => !tplFields.has(x))

  console.log(`=== ${key} === extras=${JSON.stringify(extras)} mapped ${mapFields.size}/${tplFields.size}, filled ${Object.keys(filled).length}, empty ${empty.length}`)
  if (inTplNotMap.length) console.warn('  ⚠ template but NOT mapped:', inTplNotMap)
  if (inMapNotTpl.length) console.warn('  ⚠ mapping but NOT in template:', inMapNotTpl)
  if (missing.length) console.warn('  ⚠ getField failed:', missing)
  for (const [k, v] of Object.entries(filled)) console.log('   ', k.padEnd(15), JSON.stringify(v).slice(0, 120))

  await mkdir('data/pdf-analysis', { recursive: true })
  await writeFile(`data/pdf-analysis/${key}_test.pdf`, await pdf.save())
  console.log()
}
