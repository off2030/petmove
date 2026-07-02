// 별지25(Form25) 제조번호 칸 = 제품 유효기간(제품 사용기한) 병기 검증.
// 면역유효기간(접종일+valid_until)이 아니라 카탈로그/입력 제품 유효기간이 병기되는지 확인.
// (면역유효기간은 별도 1Y/2Y/3Y 체크박스가 담당.)
import { readFile } from 'node:fs/promises'

const mappings = JSON.parse(await readFile('data/pdf-field-mappings.json', 'utf8'))
const vaccines = JSON.parse(await readFile('data/vaccine-products.json', 'utf8'))

function fmtDate(s) { return typeof s === 'string' && s ? s.replace(/-/g, '/') : '' }
function joinBatchExpiry(batch, expiry) {
  if (!expiry) return batch
  if (!batch) return expiry
  return `${batch} / ${expiry}`
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
    out.push({ type: 'Vaccination', ...applyRecOverrides(rec, p), date: fmtDate(rec.date) })
  }
  return out
}

// pdf-fill.ts serial_with_expiry 신 로직 미러: 제품 유효기간(expiry)만 병기, destination 무관.
function resolve(mp, caseRow) {
  const { transform } = mp
  const data = caseRow.data
  let m
  if ((m = transform?.match(/^vaccine:(rabies):(serial_with_expiry)\[(\d+)\]$/))) {
    const rec = sortedDescRecords(data.rabies_dates).slice().reverse()[+m[3]]
    if (!rec) return ''
    const merged = applyRecOverrides(rec, lookupRabies(rec.date))
    return joinBatchExpiry(merged.serial, merged.expiry ?? '')
  }
  if ((m = transform?.match(/^other_vacc_seq:(serial_with_expiry)\[(\d+)\]$/))) {
    const entry = buildOtherSeq(data)[+m[2]]
    if (!entry) return ''
    return joinBatchExpiry(entry.serial, entry.expiry)
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

// 2026 광견병 배치 G98321 의 제품 유효기간 = 2027/10/07 (면역유효기간 2027/03/23 아님).
const expectRabies = 'G98321 / 2027/10/07'

for (const dest of ['호주', '뉴질랜드', '일본']) {
  const caseRow = { ...base, destination: dest }
  const r1 = resolve(mappings.Form25.fields.rabies1_serial, caseRow)
  const o1 = resolve(mappings.Form25.fields.other1_serial, caseRow)
  const ok = r1 === expectRabies ? 'OK' : `FAIL (expected "${expectRabies}")`
  console.log(`[${dest}]`)
  console.log(`  rabies1_serial value    : "${r1}"  ${ok}`)
  console.log(`  other1_serial  value    : "${o1}"`)
}
