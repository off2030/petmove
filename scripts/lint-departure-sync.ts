/**
 * 추가정보 '출발일'(departure_flight_date) ↔ 출국일(departure_date) sync 룰 **패리티** 검사.
 *
 * 왜 필요한가 — 이 키는 `cases.departure_date` 컬럼과 짝이고, 짝을 맞추는 건 코드가 아니라
 * `org_auto_fill_rules` 시드(마이그레이션)다. 그래서 프로파일에 키만 선언하고 시드를 빼먹으면
 * **화면엔 출발일 칸이 생기는데 출국일 컬럼은 영영 안 채워진다** — 목록 정렬·D-day·신고 탭
 * 자동 포함이 통째로 그 케이스를 놓친다. 실제로 하와이(2026-08-18)·태국(2026-08-24)이 그
 * 상태로 한동안 굴러갔다.
 *
 * 검사 — extraFields 에 departure_flight_date 를 선언한 목적지 키가, 그 sync 를 시드하는
 * 마이그레이션 파일 어딘가에 등장하는지. (개별 insert 형태·배열 loop 형태 둘 다 잡는다.)
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DESTINATION_OVERRIDES } from '../packages/domain/src/destination-config'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = path.join(ROOT, 'supabase/migrations')

const declared = Object.entries(DESTINATION_OVERRIDES)
  .filter(([, o]) =>
    (o.extraFields ?? []).some((e) => (typeof e === 'string' ? e : e.key) === 'departure_flight_date'),
  )
  .map(([key]) => key)

/** departure_flight_date ↔ departure_date 를 시드하는 마이그레이션 본문 모음. */
const seedFiles = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(path.join(MIGRATIONS, f), 'utf-8'))
  .filter((sql) => sql.includes('departure_flight_date') && sql.includes('org_auto_fill_rules'))

const missing = declared.filter((key) => !seedFiles.some((sql) => sql.includes(`'${key}'`)))

if (missing.length > 0) {
  console.error('\n✗ departure sync lint: 출발일을 선언했는데 sync 룰 시드가 없는 목적지\n')
  for (const key of missing) console.error(`  · ${key}`)
  console.error(
    '\n  supabase/migrations 에 departure_flight_date ↔ departure_date 양방향 룰을 시드하세요.',
  )
  console.error('  본보기: 20260824000002_seed_report_departure_sync_rules.sql\n')
  process.exit(1)
}

console.log(`✓ departure sync lint: 출발일 선언 목적지 ${declared.length}개 모두 sync 룰 시드됨`)
