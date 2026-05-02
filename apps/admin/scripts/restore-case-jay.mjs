#!/usr/bin/env node
/**
 * 이효선 / 제이 케이스의 접종·검사 데이터 복구.
 *
 * 모드:
 *   inspect          현재 데이터와 history 출력
 *   plan             history 로부터 어떤 필드를 어떤 값으로 되돌릴지 출력 (dry-run)
 *   apply            plan 을 실제로 적용
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE env')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

const mode = process.argv[2] || 'inspect'

// 복구 대상 필드 — 접종/검사/약품 관련 모두.
const RESTORE_FIELDS = [
  'rabies_dates',
  'rabies_titer_records',
  'comprehensive_dates',
  'comprehensive_cat_dates',
  'civ_dates',
  'kennel_cough_dates',
  'parasite_internal_dates',
  'parasite_internal_cat_dates',
  'parasite_external_dates',
  'parasite_external_cat_dates',
  'parasite_combo_dates',
  'parasite_combo_cat_dates',
  'heartworm_dog_dates',
  'heartworm_cat_dates',
  'microchip_implant_date',
  'vet_visit_date',
  'birth_date',
  'inspection_records',
  'health_certificate_records',
  // 약품 (vaccine/product/manufacturer/batch/expiry) 관련 — case detail 에서 자동 매칭되므로 별도 저장이 적은데, 혹시 모를 대비.
]

async function findCase() {
  const { data, error } = await sb
    .from('cases')
    .select('id, customer_name, pet_name, data, destination, created_at, updated_at')
    .ilike('customer_name', '%이효진%')
  if (error) throw error
  if (!data || data.length === 0) return null
  // 제이로 추가 필터
  const matched = data.filter(c => (c.pet_name || '').includes('제이'))
  return matched
}

async function main() {
  const cases = await findCase()
  if (!cases || cases.length === 0) {
    console.error('이효선 / 제이 매칭되는 케이스 없음')
    process.exit(1)
  }
  if (cases.length > 1) {
    console.log(`${cases.length}개 매칭됨 — 각 id 출력:`)
    cases.forEach(c => console.log(`  ${c.id}  customer="${c.customer_name}" pet="${c.pet_name}"  updated=${c.updated_at}`))
  }
  for (const c of cases) {
    await processCase(c)
  }
}

async function processCase(c) {
  console.log('═'.repeat(80))
  console.log(`Case ${c.id}  ${c.customer_name} / ${c.pet_name}`)
  console.log(`updated_at=${c.updated_at}  destination=${c.destination ?? '(없음)'}`)

  const data = c.data ?? {}
  console.log('\n— 현재 data 의 접종/검사 관련 키 —')
  for (const f of RESTORE_FIELDS) {
    if (data[f] !== undefined) {
      const v = data[f]
      console.log(`  [${f}] type=${Array.isArray(v) ? 'array' : typeof v}`)
      console.log(`    raw:`, JSON.stringify(v))
    }
  }
  console.log('\n— data 전체 키 목록 —')
  console.log('  ', Object.keys(data).sort().join(', '))

  // history 가져오기 (최근 200건)
  const { data: hist, error } = await sb
    .from('case_history')
    .select('field_key, field_storage, old_value, new_value, changed_at')
    .eq('case_id', c.id)
    .order('changed_at', { ascending: false })
    .limit(500)
  if (error) throw error

  console.log(`\n— case_history 최근 ${hist.length}건 —`)
  for (const h of hist.slice(0, 30)) {
    const oldStr = (h.old_value ?? '').slice(0, 80)
    const newStr = (h.new_value ?? '').slice(0, 80)
    console.log(`  ${h.changed_at}  ${h.field_storage}.${h.field_key}`)
    console.log(`    old: ${oldStr}`)
    console.log(`    new: ${newStr}`)
  }

  if (mode === 'inspect') return

  // plan: 각 RESTORE_FIELDS 에 대해 history 에서 가장 최근의 "값이 있던 시점" 의 값을 찾음.
  // 즉 new_value 가 비어있지 않으면서 가장 최근 entry 의 new_value 를 후보로.
  // 단 현재 값이 더 최근에 비워졌다면 (new_value 가 'null' 또는 '[]') 그 직전 non-empty 를 사용.
  const plan = {}
  for (const field of RESTORE_FIELDS) {
    const fieldHist = hist.filter(h => h.field_key === field).sort((a, b) => a.changed_at.localeCompare(b.changed_at))
    if (fieldHist.length === 0) continue
    // 현재 값
    const currentRaw = data[field]
    const currentStr = currentRaw === undefined ? null : JSON.stringify(currentRaw)
    // 가장 최근 history 의 new_value
    const last = fieldHist[fieldHist.length - 1]
    // 현재 값이 빈 배열·null·undefined 이고, 과거 어딘가에 nontrivial value 가 있었다면 복구 후보
    const currentEmpty = currentRaw === null || currentRaw === undefined ||
      (Array.isArray(currentRaw) && currentRaw.length === 0) ||
      (typeof currentRaw === 'string' && currentRaw === '')
    if (!currentEmpty) continue

    // 비어있지 않았던 가장 최근 시점 찾기
    let restoreVal = null
    for (let i = fieldHist.length - 1; i >= 0; i--) {
      const h = fieldHist[i]
      const v = h.new_value
      if (v === null || v === undefined) continue
      try {
        const parsed = JSON.parse(v)
        if (parsed === null) continue
        if (Array.isArray(parsed) && parsed.length === 0) continue
        if (typeof parsed === 'string' && parsed === '') continue
        restoreVal = { rawNew: v, parsed, at: h.changed_at }
        break
      } catch {
        // 비-JSON (string column 같은 경우) — 그대로 사용
        if (v === '') continue
        restoreVal = { rawNew: v, parsed: v, at: h.changed_at }
        break
      }
    }
    if (restoreVal) plan[field] = restoreVal
  }

  console.log('\n— 복구 plan —')
  for (const [k, v] of Object.entries(plan)) {
    console.log(`  ${k}  (history ${v.at})`)
    console.log(`    → ${typeof v.parsed === 'object' ? JSON.stringify(v.parsed) : v.parsed}`)
  }

  if (mode === 'plan') return
  if (mode !== 'apply') {
    console.log(`\nUnknown mode: ${mode}`)
    return
  }

  // apply
  if (Object.keys(plan).length === 0) {
    console.log('\n복구할 필드 없음.')
    return
  }
  // 모든 필드는 data jsonb 안의 키 (RESTORE_FIELDS 기준). data 를 통째로 머지.
  const newData = { ...data }
  for (const [k, v] of Object.entries(plan)) {
    newData[k] = v.parsed
  }
  const { error: upErr } = await sb
    .from('cases')
    .update({ data: newData })
    .eq('id', c.id)
  if (upErr) throw upErr
  console.log(`\n✓ ${Object.keys(plan).length}개 필드 복구 완료.`)
}

main().catch(e => { console.error(e); process.exit(1) })
