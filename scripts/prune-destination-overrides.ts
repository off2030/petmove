/**
 * 조직 설정 스냅샷(organization_settings.destination_overrides.custom) 정리 도구.
 *
 * WHY: 설정 → 여행지별 표시정보가 저장 때 **목록 전체**를 쓰는 바람에, 여행지 하나만 고쳐도
 * 코드 하드코딩 여행지까지 전부 조직 설정에 얼어붙었다. getEffectiveExtraFieldEntries 는
 * custom 이 있으면 코드를 통째로 대체하므로, 그 뒤 코드에 추가된 필드는 그 조직에 영영
 * 닿지 않는다. 실제 피해:
 *   · 2026-08-24 신고국 14개에 추가한 '출발일'(departure_flight_date) → 13개국에서 안 보임
 *   · 하와이 return_* · hi_import_quarantine_date 6개 필드 → 안 보임
 *   · 코드에서 eu → portugal 로 분리한 뒤에도 스냅샷 eu 가 '포르투갈' 키워드를 붙들고 있어
 *     포르투갈 케이스가 전용 프로파일 대신 eu 로 매칭
 * 저장 측은 isSameAsHardcodedDestination 필터로 막았지만 이미 저장된 화석은 이 도구로 걷는다.
 *
 *   pnpm tsx scripts/prune-destination-overrides.ts                  # 진단(기본)
 *   pnpm tsx scripts/prune-destination-overrides.ts --apply          # 코드와 동일한 항목만 제거
 *   pnpm tsx scripts/prune-destination-overrides.ts --reset --apply  # custom 전체 비우기
 *
 * `--reset` 은 **진단에서 '설정에만 있는 내용'이 하나도 없을 때만** 쓸 것 — 그 경우 스냅샷은
 * 전부 옛 코드의 화석이라 비우면 조직이 코드 프로파일을 그대로 따라간다. 실제 커스터마이즈가
 * 있으면 그 항목이 사라지므로 쓰면 안 된다. `--backup=<파일>` 로 이전 값을 남길 수 있다.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  isSameAsHardcodedDestination,
  getHardcodedDestinationsAsCustom,
  type CustomDestination,
} from '../packages/domain/src/destination-config'

const APPLY = process.argv.includes('--apply')
const RESET = process.argv.includes('--reset')
const BACKUP = process.argv.find((a) => a.startsWith('--backup='))?.slice('--backup='.length)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync(join(ROOT, 'apps/admin/.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

type Listed = { key: string; species?: string } | string
const keyOf = (e: Listed) => (typeof e === 'string' ? e : e.key)

/** 코드에만 / 설정에만 있는 항목을 뽑아 화석과 진짜 커스터마이즈를 가른다. */
function describeDiff(custom: CustomDestination, code: CustomDestination | undefined) {
  if (!code) return { onlyCustom: ['(코드에 없는 여행지)'], lines: ['코드에 없는 순수 커스텀'] }
  const lines: string[] = []
  const onlyCustom: string[] = []
  const cmp = (label: string, a: Listed[] | undefined, b: Listed[] | undefined) => {
    const ak = new Set((a ?? []).map(keyOf))
    const bk = new Set((b ?? []).map(keyOf))
    const inCode = [...bk].filter((x) => !ak.has(x))
    const inCustom = [...ak].filter((x) => !bk.has(x))
    if (inCode.length) lines.push(`${label} 코드에만: ${inCode.join(', ')}`)
    if (inCustom.length) {
      lines.push(`${label} 설정에만: ${inCustom.join(', ')}`)
      onlyCustom.push(...inCustom.map((x) => `${label}:${x}`))
    }
  }
  cmp('extraFields', custom.extraFields, code.extraFields)
  cmp('vaccines', custom.vaccines, code.vaccines)
  // 키워드는 한 겹 더 본다 — 코드가 여행지를 쪼개면(eu → portugal 분리) 옛 스냅샷에는 넘어간
  // 키워드가 '설정에만' 으로 남는다. 그 키워드를 **다른 코드 여행지가 이미 갖고 있으면**
  // 사용자가 넣은 게 아니라 분리 이전의 화석이다. 그대로 두면 포르투갈 케이스가 전용
  // 프로파일 대신 eu 로 매칭돼 규정이 어긋난다.
  {
    const ck = new Set(custom.keywords)
    const kk = new Set(code.keywords)
    const inCode = [...kk].filter((x) => !ck.has(x))
    const inCustom = [...ck].filter((x) => !kk.has(x))
    if (inCode.length) lines.push(`keywords 코드에만: ${inCode.join(', ')}`)
    if (inCustom.length) {
      const movedTo = (k: string) =>
        getHardcodedDestinationsAsCustom().find((h) => h.id !== code.id && h.keywords.includes(k))
      const moved = inCustom.filter((k) => movedTo(k))
      const genuine = inCustom.filter((k) => !movedTo(k))
      if (moved.length) {
        lines.push(`keywords 설정에만(코드가 분리해 간 화석): ${moved.map((k) => `${k}→${movedTo(k)!.id}`).join(', ')}`)
      }
      if (genuine.length) {
        lines.push(`keywords 설정에만: ${genuine.join(', ')}`)
        onlyCustom.push(...genuine.map((x) => `keywords:${x}`))
      }
    }
  }
  if ((custom.extraSection ?? null) !== (code.extraSection ?? null)) {
    lines.push(`extraSection ${code.extraSection ?? '-'} → ${custom.extraSection ?? '-'}`)
    onlyCustom.push('extraSection')
  }
  if (custom.name !== code.name) {
    lines.push(`name ${code.name} → ${custom.name}`)
    onlyCustom.push('name')
  }
  return { onlyCustom, lines }
}

async function main() {
  const { data, error } = await sb
    .from('organization_settings')
    .select('org_id, value')
    .eq('key', 'destination_overrides')
  if (error) throw error

  const code = new Map(getHardcodedDestinationsAsCustom().map((d) => [d.id, d]))

  for (const row of data ?? []) {
    const custom = (row.value as { custom?: CustomDestination[] })?.custom ?? []
    console.log(`\n=== org ${row.org_id} — 스냅샷 ${custom.length}개 / 코드 ${code.size}개 ===`)

    const identical = custom.filter((d) => isSameAsHardcodedDestination(d))
    const differing = custom.filter((d) => !isSameAsHardcodedDestination(d))
    let userContent = 0
    for (const d of differing) {
      const { onlyCustom, lines } = describeDiff(d, code.get(d.id))
      if (onlyCustom.length > 0) userContent++
      console.log(`  ${d.id} (${d.name})${onlyCustom.length > 0 ? '  ← 설정 고유 내용 있음' : '  ← 화석(코드가 앞섬)'}`)
      for (const l of lines) console.log(`      · ${l}`)
    }
    console.log(`  코드와 동일: ${identical.length}개 / 차이: ${differing.length}개 (그중 설정 고유 내용 보유: ${userContent}개)`)

    const next = RESET ? [] : differing
    if (!APPLY) {
      console.log(`  → ${RESET ? '--reset' : '기본'} 적용 시 ${custom.length}개 → ${next.length}개`)
      continue
    }
    if (RESET && userContent > 0) {
      console.log('  ⛔ 설정 고유 내용이 있어 --reset 중단 — 개별 확인 필요')
      continue
    }
    if (BACKUP) {
      writeFileSync(BACKUP, JSON.stringify(row.value, null, 2), 'utf8')
      console.log(`  백업 → ${BACKUP}`)
    }
    const { error: upErr } = await sb
      .from('organization_settings')
      .update({ value: { custom: next } })
      .eq('org_id', row.org_id)
      .eq('key', 'destination_overrides')
    if (upErr) throw upErr
    console.log(`  ✓ ${custom.length}개 → ${next.length}개 저장됨`)
  }
  if (!APPLY) console.log('\n(진단만 — 실제 반영은 --apply)')
}

main().catch((e) => { console.error(e); process.exit(1) })
