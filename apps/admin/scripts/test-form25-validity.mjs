// 별지25(Form25) 제조번호 칸 면역유효기간 병기 검증 (호주·뉴질랜드 목적지 gating).
// 실제 pdf-field-mappings.json 의 Form25 transform 문자열을 그대로 읽어, serial 필드가
// serial_with_expiry 로 바뀌었는지 + 값 포맷이 'batch / YYYY/MM/DD' 인지 확인.
import { readFile } from 'node:fs/promises'

const mappings = JSON.parse(await readFile('data/pdf-field-mappings.json', 'utf8'))
const vaccines = JSON.parse(await readFile('data/vaccine-products.json', 'utf8'))

function fmtDate(s) { return typeof s === 'string' && s ? s.replace(/-/g, '/') : '' }
function addYears(date, n) {
  const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return ''
  return `${Number(m[1]) + n}-${m[2]}-${m[3]}`
}
function resolveValidityTo(rec, date, fb = 1) {
  const raw = rec?.valid_until?.trim()
  const ym = raw?.match(/^(\d+)\s*(?:년|yrs?|years?|y)$/i)
  if (raw && !ym) return fmtDate(raw)
  const years = ym ? Number(ym[1]) : fb
  return fmtDate(addYears(date, years))
}
function joinBatchExpiry(batch, expiry) {
  if (!expiry) return batch
  if (!batch) return expiry
  return `${batch} / ${expiry}`
}
function destinationIsAuNz(d) {
  if (typeof d !== 'string' || !d) return false
  const t = d.split(',').map(s => s.trim())
  return t.includes('호주') || t.includes('뉴질랜드')
}
function lookupRabies(date) { const y = Number(String(date).slice(0, 4)); return vaccines.rabies.find(r => r.year === y) ?? null }
function lookupByDateRange(list, date) {
  if (!date) return null
  const c = list.filter(p => p.expiry && date <= p.expiry).sort((a, b) => (a.expiry < b.expiry ? -1 : 1))
  return c[0] ?? null
}
function lookupComprehensive(sp, date) { return lookupByDateRange(sp === 'dog' ? vaccines.comprehensive_dog : vaccines.comprehensive_cat, date) }
function sortedDescRecords(arr) {
  if (!Array.isArray(arr)) return []
  return arr.map(i => (typeof i === 'string' ? { date: i } : i)).filter(r => r && r.date).slice().sort((a, b) => b.date.localeCompare(a.date))
}
function applyRecOverrides(rec, p) {
  const cat = rec?.other_hospital ? null : p
  return {
    name: rec?.product?.trim() || cat?.vaccine || cat?.product || '',
    manufacturer: rec?.manufacturer?.trim() || cat?.manufacturer || '',
    serial: rec?.lot?.trim() || cat?.batch || '',
    expiry: fmtDate(rec?.expiry?.trim() || cat?.expiry || ''),
  }
}
// 별지25 buildOtherVaccineSequence (maxPerType=1) 의 종합백신 1건만 (이 케이스 범위).
function buildOtherSeq(data) {
  const sp = String(data.species ?? '').toLowerCase()
  const out = []
  const rec = sortedDescRecords(data.general_vaccine_dates).slice(0, 1).reverse()[0]
  if (rec) {
    const p = lookupComprehensive(sp, rec.date)
    out.push({ type: 'Vaccination', ...applyRecOverrides(rec, p), validity: resolveValidityTo(rec, rec.date, 1), date: fmtDate(rec.date) })
  }
  return out
}

function resolve(mp, caseRow) {
  const { transform } = mp
  const data = caseRow.data
  let m
  if ((m = transform?.match(/^vaccine:(rabies):(serial_with_expiry)\[(\d+)\]$/))) {
    const rec = sortedDescRecords(data.rabies_dates).slice().reverse()[+m[3]]
    if (!rec) return ''
    const merged = applyRecOverrides(rec, lookupRabies(rec.date))
    const suffix = destinationIsAuNz(caseRow.destination) ? resolveValidityTo(rec, rec.date, 1) : ''
    return joinBatchExpiry(merged.serial, suffix)
  }
  if ((m = transform?.match(/^other_vacc_seq:(serial_with_expiry)\[(\d+)\]$/))) {
    const entry = buildOtherSeq(data)[+m[2]]
    if (!entry) return ''
    const suffix = destinationIsAuNz(caseRow.destination) ? entry.validity : ''
    return joinBatchExpiry(entry.serial, suffix)
  }
  return '(other transform)'
}

const base = {
  destination: '호주',
  data: {
    species: 'cat',
    rabies_dates: [{ date: '2026-03-23' }],
    general_vaccine_dates: [{ date: '2026-04-27' }],
  },
}

for (const dest of ['호주', '뉴질랜드', '일본']) {
  const caseRow = { ...base, destination: dest }
  const r1 = resolve(mappings.Form25.fields.rabies1_serial, caseRow)
  const o1 = resolve(mappings.Form25.fields.other1_serial, caseRow)
  console.log(`[${dest}]`)
  console.log(`  rabies1_serial transform: ${mappings.Form25.fields.rabies1_serial.transform}`)
  console.log(`  rabies1_serial value    : "${r1}"`)
  console.log(`  other1_serial  transform: ${mappings.Form25.fields.other1_serial.transform}`)
  console.log(`  other1_serial  value    : "${o1}"`)
}
