#!/usr/bin/env node
/**
 * 펫무브워크 cases(=동물) 월별 등록수 확인 + 2006년부터 누적 추정(외삽).
 * READ-ONLY. 사용: node scripts/estimate-animals.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
function loadEnv(fp) {
  if (!existsSync(fp)) return {}
  const out = {}
  for (const line of readFileSync(fp, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
  return out
}
const env = { ...loadEnv(path.join(ROOT, 'apps/admin/.env.local')), ...loadEnv(path.join(ROOT, 'apps/portal/.env.local')), ...process.env }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// 총 건수
const { count: total } = await admin.from('cases').select('*', { count: 'exact', head: true })
console.log('총 cases(동물):', total)

// created_at 전부 가져와 월별 집계 (페이지네이션)
let rows = [], from = 0
while (true) {
  const { data, error } = await admin.from('cases').select('created_at').order('created_at', { ascending: true }).range(from, from + 999)
  if (error) { console.error(error.message); process.exit(1) }
  rows = rows.concat(data)
  if (data.length < 1000) break
  from += 1000
}
const byMonth = {}
for (const r of rows) {
  if (!r.created_at) continue
  const ym = r.created_at.slice(0, 7)
  byMonth[ym] = (byMonth[ym] || 0) + 1
}
const months = Object.keys(byMonth).sort()
console.log('\n월별 등록수:')
for (const m of months) console.log(`  ${m}: ${byMonth[m]}`)

const first = months[0], last = months[months.length - 1]
const nMonths = months.length
const sum = months.reduce((a, m) => a + byMonth[m], 0)
const avgPerMonth = sum / nMonths
console.log(`\n활동 기간: ${first} ~ ${last} (${nMonths}개월, 합계 ${sum})`)
console.log(`월평균: ${avgPerMonth.toFixed(1)}마리/월`)

// 2006-01 ~ 현재까지 개월수
const start = new Date('2006-01-01')
const now = new Date(last + '-01')
const totalMonthsSince2006 = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1
console.log(`\n2006-01 ~ ${last}: ${totalMonthsSince2006}개월 (약 ${(totalMonthsSince2006/12).toFixed(0)}년)`)
console.log('── 외삽 추정 (현재 월평균이 20년간 일정했다고 가정) ──')
console.log(`  ${Math.round(avgPerMonth * totalMonthsSince2006).toLocaleString()}마리`)
console.log('  ※ 초기엔 물량이 적었을 가능성이 커서 이 값은 상한(과대추정)에 가까움.')
