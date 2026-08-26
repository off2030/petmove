/**
 * 조직 설정 스냅샷(organization_settings.destination_overrides) vs 코드 프로파일 대조.
 *
 * WHY: 설정 → 여행지별 표시정보에서 한 번 저장하면 코드 하드코딩 여행지까지 전부 custom 으로
 * 얼어붙고, 그 뒤로 코드 프로파일 변경이 그 조직에 닿지 않는다(getEffectiveExtraFieldEntries
 * 는 병합이 아니라 완전 대체). 어떤 항목이 '진짜 사용자 커스터마이즈' 이고 어떤 항목이 그냥
 * 옛 코드의 화석인지 눈으로 가려내기 위한 조회 전용 도구.
 *
 *   pnpm tsx scripts/audit-destination-overrides.ts
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { getHardcodedDestinationsAsCustom, type CustomDestination } from '../packages/domain/src/destination-config'

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

type Entry = { key: string; species?: string }
const keysOf = (list: (Entry | string)[] | undefined): string[] =>
  (list ?? []).map((e) => (typeof e === 'string' ? e : e.key))

/** 두 목록을 순서 무시하고 비교 — species 까지 같아야 동일로 본다. */
function sameEntries(a: (Entry | string)[] | undefined, b: (Entry | string)[] | undefined): boolean {
  const norm = (list: (Entry | string)[] | undefined) =>
    (list ?? [])
      .map((e) => (typeof e === 'string' ? { key: e } : e))
      .map((e) => `${e.key}:${e.species ?? ''}`)
      .sort()
      .join('|')
  return norm(a) === norm(b)
}

function diffOne(custom: CustomDestination, code: CustomDestination | undefined) {
  if (!code) return { verdict: 'code-없음(순수 커스텀 여행지)', notes: [] as string[] }
  const notes: string[] = []
  if (!sameEntries(custom.extraFields, code.extraFields)) {
    const c = new Set(keysOf(custom.extraFields))
    const k = new Set(keysOf(code.extraFields))
    const onlyCode = [...k].filter((x) => !c.has(x))
    const onlyCustom = [...c].filter((x) => !k.has(x))
    if (onlyCode.length) notes.push(`extraFields 코드에만: ${onlyCode.join(', ')}`)
    if (onlyCustom.length) notes.push(`extraFields 설정에만: ${onlyCustom.join(', ')}`)
  }
  if (!sameEntries(custom.vaccines, code.vaccines)) {
    const c = new Set(keysOf(custom.vaccines))
    const k = new Set(keysOf(code.vaccines))
    const onlyCode = [...k].filter((x) => !c.has(x))
    const onlyCustom = [...c].filter((x) => !k.has(x))
    if (onlyCode.length) notes.push(`vaccines 코드에만: ${onlyCode.join(', ')}`)
    if (onlyCustom.length) notes.push(`vaccines 설정에만: ${onlyCustom.join(', ')}`)
    if (!onlyCode.length && !onlyCustom.length) notes.push('vaccines species 차이')
  }
  if ((custom.extraSection ?? null) !== (code.extraSection ?? null)) {
    notes.push(`extraSection ${code.extraSection ?? '-'} → ${custom.extraSection ?? '-'}`)
  }
  return { verdict: notes.length === 0 ? '코드와 동일' : '차이 있음', notes }
}

async function main() {
  const { data, error } = await sb
    .from('organization_settings')
    .select('org_id, value')
    .eq('key', 'destination_overrides')
  if (error) throw error

  const code = new Map(getHardcodedDestinationsAsCustom().map((d) => [d.id, d]))

  for (const row of data ?? []) {
    const custom = ((row.value as { custom?: CustomDestination[] })?.custom ?? [])
    console.log(`\n=== org ${row.org_id} — 스냅샷 ${custom.length}개 / 코드 ${code.size}개 ===`)
    const identical: string[] = []
    for (const c of custom) {
      const { verdict, notes } = diffOne(c, code.get(c.id))
      if (verdict === '코드와 동일') { identical.push(c.id); continue }
      console.log(`  ${c.id} (${c.name}) — ${verdict}`)
      for (const n of notes) console.log(`      · ${n}`)
    }
    console.log(`  [코드와 동일해 지워도 되는 항목 ${identical.length}개] ${identical.join(', ')}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
