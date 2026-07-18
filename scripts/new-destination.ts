#!/usr/bin/env tsx
/**
 * 신규 목적지 스캐폴드 (Phase 4 — docs/destination-architecture-design.md).
 *
 * 하는 일:
 *  1) procedure-checks/<cc>.ts 스텁 생성 (규정 조사 전 빈 껍데기 + 출처 TODO)
 *  2) procedure-checks/registry.ts 에 import + 배열 등록 (과거 5개국 등록 누락 함정 방지)
 *  3) DESTINATION_OVERRIDES 프로파일 스텁 + 남은 수작업 체크리스트 출력
 *
 * Usage:
 *   pnpm new:destination <key> <한글명> --cc <iso2> [--archetype eu-family|jp-2dose|sea-permit|generic]
 *   예) pnpm new:destination vietnam 베트남 --cc vn --archetype generic
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DESTINATION_OVERRIDES } from '../packages/domain/src/destination-config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CHECKS_DIR = path.join(__dirname, '..', 'packages', 'domain', 'src', 'procedure-checks')
const REGISTRY = path.join(CHECKS_DIR, 'registry.ts')

// ── 인자 파싱 ──
const args = process.argv.slice(2)
const flags = new Map<string, string>()
const positional: string[] = []
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) flags.set(args[i].slice(2), args[++i] ?? '')
  else positional.push(args[i])
}
const [key, ko] = positional
const cc = flags.get('cc') ?? ''
const archetype = flags.get('archetype') ?? 'generic'

function die(msg: string): never {
  console.error(`✗ ${msg}`)
  console.error('\nUsage: pnpm new:destination <key> <한글명> --cc <iso2> [--archetype eu-family|jp-2dose|sea-permit|generic]')
  process.exit(1)
}

if (!key || !/^[a-z][a-z_]*$/.test(key)) die('key 는 소문자 영문(snake_case)이어야 합니다. 예: vietnam')
if (!ko || !/[가-힣]/.test(ko)) die('두 번째 인자로 한글 국가명을 주세요. 예: 베트남')
if (!/^[a-z]{2}$/.test(cc)) die('--cc <iso2> (procedure-checks 파일명, 예: vn) 이 필요합니다.')
if (!['eu-family', 'jp-2dose', 'sea-permit', 'generic'].includes(archetype)) die(`알 수 없는 archetype: ${archetype}`)
if (DESTINATION_OVERRIDES[key]) die(`'${key}' 는 이미 DESTINATION_OVERRIDES 에 있습니다.`)

const ccUpper = cc.toUpperCase()
const checksFile = path.join(CHECKS_DIR, `${cc}.ts`)

// ── 1) procedure-checks 스텁 ──
if (existsSync(checksFile)) {
  console.log(`• procedure-checks/${cc}.ts 이미 존재 — 생성 건너뜀`)
} else {
  writeFileSync(
    checksFile,
    `import type { ProcedureCheck } from './types'

/**
 * ${ko}(${key}) 절차 검증.
 *
 * TODO(규정 조사): 공식 1차 출처(정부 규정 URL·확인 일자)를 여기에 기록하고 룰을 채우세요.
 * id 규칙: '${cc}.<kebab-rule-name>' — 카드 validationIds 와 정확히 일치해야 합니다.
 */
export const ${ccUpper}_CHECKS: ProcedureCheck[] = [
  // {
  //   id: '${cc}.example-rule',
  //   country: '${key}',
  //   category: '광견병',
  //   title: '예시 룰',
  //   run: (ctx) => ...,
  // },
]
`,
    'utf8',
  )
  console.log(`✓ packages/domain/src/procedure-checks/${cc}.ts 생성`)
}

// ── 2) registry 등록 ──
// CRLF 체크아웃 대비 정규화 — 커밋 시 git 이 다시 처리한다.
let registry = readFileSync(REGISTRY, 'utf8').replace(/\r\n/g, '\n')
if (registry.includes(`from './${cc}'`)) {
  console.log(`• registry.ts 에 이미 './${cc}' import 있음 — 등록 건너뜀`)
} else {
  // import — 파일 경로 알파벳 순서에 맞춰 삽입.
  const importLine = `import { ${ccUpper}_CHECKS } from './${cc}'`
  const lines = registry.split('\n')
  const importIdx = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => /^import \{ \w+_CHECKS \} from '\.\/\w+'$/.test(l))
  const insertAt =
    importIdx.find(({ l }) => (l.match(/from '\.\/(\w+)'/)?.[1] ?? '') > cc)?.i ??
    importIdx[importIdx.length - 1].i + 1
  lines.splice(insertAt, 0, importLine)
  registry = lines.join('\n')
  // 배열 — ALL_PROCEDURE_CHECKS 닫는 대괄호 앞에 spread 추가.
  registry = registry.replace(
    /(export const ALL_PROCEDURE_CHECKS: ProcedureCheck\[\] = \[[\s\S]*?)(\n\]\n)/,
    `$1\n  ...${ccUpper}_CHECKS,$2`,
  )
  writeFileSync(REGISTRY, registry, 'utf8')
  console.log(`✓ registry.ts 에 ${ccUpper}_CHECKS 등록`)
}

// ── 3) 프로파일 스텁 + 수작업 체크리스트 ──
const profileStub = `  ${key}: {
    keywords: ['${ko}', '${key}'],
    archetype: '${archetype}',
    // TODO(규정 조사 후): rabies { doses, oneYearVaccineOnly? }, titer { entryValidityMonths },
    // importPermit / advanceNotice / vetVisitWindowDays 등 프로파일 필드 채우기.
    vaccines: ['rabies', 'rabies_titer'],
    // 여정·서류 구성이 끝나면 appSupported: true — 펫무브 앱 노출은 이 한 줄이 전부.
  },`

console.log(`
── 남은 수작업 (설계 원칙: 규정 고유는 자동화하지 않음) ──

1. packages/domain/src/destination-config.ts 의 DESTINATION_OVERRIDES 에 프로파일 추가:

${profileStub}

2. 규정 조사 → procedure-checks/${cc}.ts 룰 작성 (1차 출처 필수).
3. 카드 문구 — archetype '${archetype}' ${
  archetype === 'eu-family'
    ? '은 fallback 으로 euFamilyOverrides 한 벌 자동 적용. 나라 델타만 STEP_DESTINATION_OVERRIDES 에.'
    : '은 STEP_DESTINATION_OVERRIDES 에 명시 작성 (sea-permit 은 seaPermitOverrides factory 사용).'
}
4. 필수 서류(required-docs) · 도착 검역 카드 fieldKey 의 스코핑 키 등록(누락 시 lint:dest 가 에러).
5. 히어로 사진(apps/portal/public/destinations/) · www 랜딩(site-data) — 해당 시.
6. 마지막: pnpm lint:dest:write 로 골든 재생성 → git diff 로 신규 목적지 diff 만 확인 후 커밋.
`)
