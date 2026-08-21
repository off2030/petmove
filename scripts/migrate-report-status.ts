/**
 * 신고 탭 수동값(`import_import_status`/`import_export_status`) 정리 — 1회성 마이그레이션.
 *
 * 배경(2026-08-21): 신고 탭 '수입'·'수출' 칸이 어느 여정 카드와 이어지는지를 목적지 프로파일
 * (`report: { importStep, exportStep }`)에 선언하는 구조로 바꿨다. 그 전까지 이 두 키는
 *   ① case.data **top-level 전역** 이라 다중 여행지에서 옆 나라 칸으로 샜고,
 *   ② 버튼 완료형 카드(하와이 입국 신청)와는 아예 연결이 없어 관리자에서 '완료'로 바꿔도
 *      펫무브 앱 카드가 영영 미완료로 남았다.
 *
 * 하는 일 — 딱 두 가지:
 *
 *   A) **버튼 완료형 카드에 이어진 목적지의 '완료'를 카드 날짜로 승격**
 *      (현재 하와이 = hi_import_declaration_date). 완료로 바꾼 날짜는 지어내지 않고
 *      `case_history` 에서 그 케이스가 **처음 'done' 이 된 시각**을 찾아 쓴다.
 *      승격한 케이스는 수동값을 지운다 — 카드가 단일 출처가 된다.
 *
 *   B) **남은 수동값을 활성 여행지 by_dest 로 이동**(전역 → 목적지별).
 *      값·의미는 그대로고 저장 위치만 바뀐다. 다중 여행지 누수가 여기서 끊긴다.
 *
 * ⛔ 신청형 카드(일본 사전신고·수입 허가)의 옛 값은 **건드리지 않는다.** 그 카드들은 수동값을
 *    바닥(floor)으로 읽으므로 앱·관리자가 이미 같은 값을 보고 있고, 운영자가 체크한 날짜를
 *    '신청일'로 지어 넣으면 앱 카드에 없던 날짜가 생기고 마감 검증이 헛돌 수 있다.
 *
 * 사용:
 *   pnpm tsx scripts/migrate-report-status.ts            # dry-run (변경 없음)
 *   pnpm tsx scripts/migrate-report-status.ts --apply    # 실제 반영
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseDestinations } from '../packages/domain/src/destination-config'
import {
  REPORT_LEGACY_STATUS_KEY,
  resolveReportBinding,
} from '../packages/domain/src/journey-steps/report-slots'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const APPLY = process.argv.includes('--apply')

function loadEnv(f: string): Record<string, string> {
  if (!existsSync(f)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(f, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
  return out
}
const env = {
  ...loadEnv(path.join(ROOT, 'apps/admin/.env.local')),
  ...loadEnv(path.join(ROOT, 'apps/portal/.env.local')),
  ...process.env,
} as Record<string, string>

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

type CaseLite = {
  id: string
  pet_name: string | null
  destination: string | null
  data: Record<string, unknown> | null
}

/** KST 기준 날짜(YYYY-MM-DD). */
function kstDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

async function main() {
  const { count } = await sb.from('cases').select('id', { count: 'exact', head: true })
  const rows: CaseLite[] = []
  for (let from = 0; from < (count ?? 0); from += 1000) {
    const { data, error } = await sb
      .from('cases')
      .select('id, pet_name, destination, data')
      .range(from, from + 999)
    if (error) throw error
    rows.push(...((data ?? []) as CaseLite[]))
  }

  const targets = rows.filter((c) => {
    const d = c.data ?? {}
    return d[REPORT_LEGACY_STATUS_KEY.import] != null || d[REPORT_LEGACY_STATUS_KEY.export] != null
  })
  console.log(`전체 ${rows.length}건 중 수동값 보유 ${targets.length}건\n`)

  // 완료 시각 — 케이스 × 키별 **최초** 'done' 전환. 되돌렸다 다시 완료한 케이스는 처음 기록을
  // 쓴다(운영자가 실제로 절차를 마쳤다고 처음 판단한 날에 가장 가깝다).
  const { data: hist, error: histErr } = await sb
    .from('case_history')
    .select('case_id, field_key, new_value, changed_at')
    .in('field_key', [REPORT_LEGACY_STATUS_KEY.import, REPORT_LEGACY_STATUS_KEY.export])
    .order('changed_at', { ascending: true })
  if (histErr) throw histErr
  const firstDoneAt = new Map<string, string>()
  for (const h of (hist ?? []) as Array<{
    case_id: string
    field_key: string
    new_value: string | null
    changed_at: string
  }>) {
    let v: unknown = h.new_value
    try { v = JSON.parse(String(h.new_value)) } catch { /* 옛 엔트리는 raw 문자열 */ }
    if (v !== 'done') continue
    const key = `${h.case_id}|${h.field_key}`
    if (!firstDoneAt.has(key)) firstDoneAt.set(key, kstDate(h.changed_at))
  }

  let promoted = 0
  let moved = 0
  let skipped = 0

  for (const c of targets) {
    const data = c.data ?? {}
    const dests = parseDestinations(c.destination)
    const activeRaw = data.import_report_active_dest
    const active =
      typeof activeRaw === 'string' && activeRaw
        ? activeRaw
        : dests.length === 1
          ? dests[0]
          : null
    if (!active) {
      console.log(`⚠ ${c.id.slice(0, 8)} ${c.pet_name ?? ''} — 활성 여행지를 정할 수 없어 건너뜀 (${c.destination})`)
      skipped++
      continue
    }

    const next: Record<string, unknown> = { ...data }
    const byDest = { ...((next.by_dest as Record<string, Record<string, unknown>>) ?? {}) }
    const destObj = { ...(byDest[active] ?? {}) }
    const notes: string[] = []

    for (const slot of ['import', 'export'] as const) {
      const key = REPORT_LEGACY_STATUS_KEY[slot]
      const stored = data[key]
      if (stored == null || String(stored) === '') continue

      // A) 버튼 완료형 카드 승격 — 그 여행지가 dated 모델 카드에 이어져 있고 값이 '완료' 일 때만.
      const binding = resolveReportBinding(active, slot)
      if (binding?.model === 'dated' && String(stored) === 'done') {
        const already = destObj[binding.dateField] ?? data[binding.dateField]
        if (typeof already === 'string' && already.length >= 10) {
          notes.push(`${key}: 카드에 이미 ${binding.dateField}=${already} — 수동값만 제거`)
          delete next[key]
          delete destObj[key]
          promoted++
          continue
        }
        const when = firstDoneAt.get(`${c.id}|${key}`)
        if (!when) {
          notes.push(`${key}: 완료 시각을 이력에서 못 찾아 승격 보류 — 수동값을 by_dest 로만 이동`)
          destObj[key] = stored
          delete next[key]
          moved++
          continue
        }
        destObj[binding.dateField] = when
        delete next[key]
        delete destObj[key]
        notes.push(`${key}: 완료 → ${binding.dateField}=${when} 로 승격`)
        promoted++
        continue
      }

      // B) 그 외 — 값 그대로 활성 여행지 by_dest 로 이동(전역 누수 차단).
      destObj[key] = stored
      delete next[key]
      notes.push(`${key}: '${String(stored)}' → by_dest[${active}] 로 이동`)
      moved++
    }

    if (notes.length === 0) continue
    byDest[active] = destObj
    next.by_dest = byDest

    console.log(`${c.id.slice(0, 8)} ${c.pet_name ?? ''} (${c.destination} / 활성=${active})`)
    for (const n of notes) console.log(`    ${n}`)

    if (APPLY) {
      const { error } = await sb.from('cases').update({ data: next }).eq('id', c.id)
      if (error) console.log(`    ✗ 저장 실패: ${error.message}`)
    }
  }

  console.log(
    `\n${APPLY ? '반영 완료' : 'DRY-RUN (변경 없음)'} — 카드 승격 ${promoted}건 · by_dest 이동 ${moved}건 · 건너뜀 ${skipped}건`,
  )
  if (!APPLY) console.log('실제로 반영하려면 --apply 를 붙이세요.')
}

main()
