// 기존 '뉴질랜드' 케이스 → '뉴질랜드(구)' (구 IHS 2021 규정) 이관 — 2026-10-06 사용자 지시.
//
// 실행: apps/admin/.env.local 의 service role 키를 쓴다.
//   node scripts/migrate-nz-legacy-2026-10.mjs              → 시험 실행(아무것도 안 바꿈)
//   node scripts/migrate-nz-legacy-2026-10.mjs --apply      → 실제 반영(반영 전 원본 백업)
//   --exclude=<case_id>,<case_id>  옮기지 않을 케이스(신 규정으로 남길 케이스)
//
// 케이스 안에서 목적지 **이름**이 키·값으로 쓰이는 자리를 모두 바꾼다:
//   destination(콤마 토큰) / data.trip_type·by_dest·dest_started_at 의 키 /
//   data.export_doc_active_dest·import_report_active_dest 값 / data.documents[].destination 값.
//   data.estimate.country 는 계산기 가격표(calculator_items '뉴질랜드') 이름이라 그대로 둔다.
// 자동채움 규칙은 목적지 **키**로 매칭되므로, 조직의 'new_zealand' 규칙을 'new_zealand_legacy' 로
// 복제한다(원본은 신 규정 '뉴질랜드'용으로 남긴다).
import fs from 'node:fs'
import path from 'node:path'

const OLD = '뉴질랜드'
const NEW = '뉴질랜드(구)'
const apply = process.argv.includes('--apply')
const exclude = new Set(
  (process.argv.find((a) => a.startsWith('--exclude=')) ?? '--exclude=').slice(10).split(',').filter(Boolean),
)

const envText = fs.readFileSync('apps/admin/.env.local', 'utf8')
const env = Object.fromEntries(
  envText.split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => {
    const i = l.indexOf('=')
    return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]
  }),
)
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
async function rest(p, init = {}) {
  const r = await fetch(`${URL_}/rest/v1/${p}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } })
  const t = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${p}: ${t}`)
  return t ? JSON.parse(t) : null
}

const renameKey = (obj) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || !(OLD in obj)) return obj
  if (NEW in obj) throw new Error('이미 두 키가 모두 있음')
  const out = {}
  for (const [k, v] of Object.entries(obj)) out[k === OLD ? NEW : k] = v
  return out
}

function transform(c) {
  const tokens = (c.destination ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!tokens.includes(OLD)) return null
  const destination = tokens.map((t) => (t === OLD ? NEW : t)).join(', ')
  const data = { ...(c.data ?? {}) }
  const changed = ['destination']
  for (const k of ['trip_type', 'by_dest', 'dest_started_at']) {
    const next = renameKey(data[k])
    if (next !== data[k]) { data[k] = next; changed.push(`data.${k}{key}`) }
  }
  for (const k of ['export_doc_active_dest', 'import_report_active_dest']) {
    if (data[k] === OLD) { data[k] = NEW; changed.push(`data.${k}`) }
  }
  if (Array.isArray(data.documents)) {
    let n = 0
    data.documents = data.documents.map((d) => (d && d.destination === OLD ? (n++, { ...d, destination: NEW }) : d))
    if (n) changed.push(`data.documents[${n}].destination`)
  }
  // 남은 '뉴질랜드' 이름 키가 없는지 — 놓친 자리가 있으면 멈춘다.
  const leftover = []
  const walk = (v, p) => {
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (k === OLD) leftover.push(`${p}.${k}`)
        walk(x, `${p}.${k}`)
      }
    }
  }
  walk(data, 'data')
  if (leftover.length) throw new Error(`${c.id} 남은 이름 키: ${leftover.join(', ')}`)
  return { destination, data, changed }
}

const orgs = Object.fromEntries((await rest('organizations?select=id,name')).map((o) => [o.id, o.name]))
const cases = await rest(`cases?select=*&destination=ilike.*${encodeURIComponent(OLD)}*`)
const plan = []
for (const c of cases) {
  if (exclude.has(c.id)) { console.log(`  제외  ${orgs[c.org_id]} | ${c.pet_name || '(이름 없음)'} | ${c.destination}`); continue }
  const t = transform(c)
  if (!t) continue
  plan.push({ c, t })
}
console.log(`\n옮길 케이스 ${plan.length}건 (제외 ${exclude.size}건)`)
for (const { c, t } of plan) {
  console.log(`  ${orgs[c.org_id]} | ${c.pet_name || '(이름 없음)'}${c.deleted_at ? ' [삭제됨]' : ''} | ${c.destination} → ${t.destination} | ${t.changed.join(', ')}`)
}

const rules = await rest('org_auto_fill_rules?select=*&destination_key=eq.new_zealand')
const legacyRules = await rest('org_auto_fill_rules?select=id&destination_key=eq.new_zealand_legacy')
console.log(`\n자동채움 규칙 복제: new_zealand ${rules.length}개 → new_zealand_legacy (이미 있음 ${legacyRules.length}개)`)

if (!apply) {
  console.log('\n시험 실행 — 아무것도 바꾸지 않았다. 반영하려면 --apply')
  process.exit(0)
}

const backupDir = path.join('scripts', 'backups')
fs.mkdirSync(backupDir, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupFile = path.join(backupDir, `nz-legacy-migration-${stamp}.json`)
fs.writeFileSync(backupFile, JSON.stringify({ cases: plan.map((p) => p.c), rules }, null, 2))
console.log(`\n원본 백업: ${backupFile}`)

for (const { c, t } of plan) {
  await rest(`cases?id=eq.${c.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ destination: t.destination, data: t.data }),
  })
}
console.log(`케이스 ${plan.length}건 반영`)

if (legacyRules.length === 0 && rules.length > 0) {
  const copies = rules.map(({ id, created_at, updated_at, ...r }) => ({ ...r, destination_key: 'new_zealand_legacy' }))
  await rest('org_auto_fill_rules', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(copies) })
  console.log(`자동채움 규칙 ${copies.length}개 복제`)
}
console.log('완료')
