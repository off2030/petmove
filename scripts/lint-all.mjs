#!/usr/bin/env node
/**
 * Lint orchestrator — turbo lint (eslint per app) + lint-rls.mjs 둘 다 항상 실행.
 *
 * 단순 `&&` chain 은 첫 실패 시 두 번째 건너뜀 — admin 에 preexisting lint
 * 에러가 하나라도 있으면 RLS check 가 안 돌아 사고 사전 차단 효과 상실.
 * 둘 다 돌리고 둘 중 하나라도 실패하면 nonzero exit.
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

function run(cmd, args, label, options = {}) {
  return new Promise((resolve) => {
    console.log(`\n─── ${label} ───`)
    const child = spawn(cmd, args, {
      cwd: options.cwd ?? ROOT,
      stdio: 'inherit',
      shell: options.shell ?? false,
    })
    child.on('exit', (code) => resolve(code ?? 1))
    child.on('error', () => resolve(1))
  })
}

function localBin(name) {
  return path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.CMD` : name)
}

const eslintCode = await run(
  localBin('eslint'),
  ['.'],
  'admin eslint',
  { cwd: path.join(ROOT, 'apps/admin'), shell: process.platform === 'win32' },
)
const portalEslintCode = await run(
  localBin('eslint'),
  ['.'],
  'portal eslint',
  { cwd: path.join(ROOT, 'apps/portal'), shell: process.platform === 'win32' },
)
const rlsCode = await run(process.execPath, ['scripts/lint-rls.mjs'], 'RLS recursion lint')
const scopeCode = await run(process.execPath, ['scripts/lint-destination-scoping.mjs'], 'destination scoping lint')
const journeyCode = await run(process.execPath, ['scripts/lint-journey-catalog.mjs'], 'journey catalog lint')
// 신고 탭 '수입'·'수출' 칸 ↔ 여정 카드 연결 — 관리자 화면과 앱 카드가 같은 값을 보는지.
const reportSlotsCode = await run(
  localBin('tsx'),
  ['scripts/check-report-slots.ts'],
  'report slots contract',
  { shell: process.platform === 'win32' },
)
// 지난 여정 '되돌리기' — 보관이 지운 데이터를 스냅샷으로 온전히 복원하는지(오조작 안전망).
const journeyRestoreCode = await run(
  localBin('tsx'),
  ['scripts/check-journey-restore.ts'],
  'journey restore contract',
  { shell: process.platform === 'win32' },
)
// 설정 화면 컨트롤·칩 크기 규격 — 높이 클래스를 직접 쓰면 실패(2026-08-06 신설).
const sizeCode = await run(process.execPath, ['scripts/lint-settings-size.mjs'], 'settings size scale')
const copyCode = await run(
  localBin('tsx'),
  ['scripts/lint-journey-copy.ts'],
  'journey copy snapshot',
  { shell: process.platform === 'win32' },
)
// 카드 ↔ 검증 룰 배선 + 저장 차단 결정 — 여기 없어서 포르투갈 사전통지 미등록이 오래 방치됐다
// (2026-08-21 등록). 날짜칸 카드가 늘 때마다 결정을 강제하는 게 이 lint 의 핵심이라 상시 실행한다.
const wiringCode = await run(
  localBin('tsx'),
  ['scripts/lint-validation-wiring.ts'],
  'validation wiring',
  { shell: process.platform === 'win32' },
)
// 목적지 동작 골든 — 카드·서류·체크 구성이 의도치 않게 바뀌었는지(2026-09-05 CI 편입).
//   copy 만 물려 있어 dest·behavior·checks 는 3f25a261(2026-08-27) 이후 9일간 깨진 채
//   아무도 몰랐다. 골든 4종은 세트로 돌려야 "어느 층이 바뀌었는지"가 드러난다.
const destCode = await run(
  localBin('tsx'),
  ['scripts/lint-destinations.ts'],
  'destinations snapshot',
  { shell: process.platform === 'win32' },
)
// 알림·주의·설명문 골든. NOW 를 2026-01-01 로 고정해 돌리므로 날짜가 흘러도 안 흔들린다.
const behaviorCode = await run(
  localBin('tsx'),
  ['scripts/lint-behavior.ts'],
  'behavior snapshot',
  { shell: process.platform === 'win32' },
)
// 고객 노출 문구에 날짜가 새지 않는지 + 룰 목록 골든.
const checksCode = await run(
  localBin('tsx'),
  ['scripts/lint-checks.ts'],
  'checks snapshot',
  { shell: process.platform === 'win32' },
)
// 형제 목적지 구조 패리티 — 복사해 만든 목적지에 원본의 나중 수정이 전파됐는지(2026-07-29 신설).
const parityCode = await run(
  localBin('tsx'),
  ['scripts/lint-destination-parity.ts'],
  'destination parity',
  { shell: process.platform === 'win32' },
)
// 전화번호 표기 — 네 화면이 각자 11자리로 잘라 0507 안심번호가 깨졌다(2026-08-24 신설).
const phoneCode = await run(
  localBin('tsx'),
  ['scripts/check-phone-format.ts'],
  'phone format',
  { shell: process.platform === 'win32' },
)
// 면역 유효기간 해석 — 표기 흔들림("1 year"/"1Y")이 의료 판정을 뒤집었다(2026-08-24 신설).
const validUntilCode = await run(
  localBin('tsx'),
  ['scripts/check-vaccine-validity.ts'],
  'vaccine validity',
  { shell: process.platform === 'win32' },
)
// 한 장에 여러 마리를 적는 폼(태국 R.1/1)의 동물 슬롯 매핑 — 짝이 어긋나면 두 번째 동물
// 칸이 조용히 빈 채로 발급된다(2026-08-24 신설).
const multiSlotCode = await run(
  localBin('tsx'),
  ['scripts/check-multi-slot-forms.ts'],
  'multi-slot forms',
  { shell: process.platform === 'win32' },
)
// 추가정보 '출발일' ↔ 출국일 sync 룰 시드 패리티 — 선언만 하고 시드를 빼먹으면 출국일 컬럼이
// 영영 안 채워져 신고 탭·목록·D-day 가 그 케이스를 통째로 놓친다(2026-08-24 신설).
const departureSyncCode = await run(
  localBin('tsx'),
  ['scripts/lint-departure-sync.ts'],
  'departure sync seeds',
  { shell: process.platform === 'win32' },
)

const summary = [
  `  admin eslint:  ${eslintCode === 0 ? '✓ pass' : `✗ exit ${eslintCode}`}`,
  `  portal eslint: ${portalEslintCode === 0 ? '✓ pass' : `✗ exit ${portalEslintCode}`}`,
  `  lint:rls:      ${rlsCode === 0 ? '✓ pass' : `✗ exit ${rlsCode}`}`,
  `  lint:scope:    ${scopeCode === 0 ? '✓ pass' : `✗ exit ${scopeCode}`}`,
  `  lint:journey:  ${journeyCode === 0 ? '✓ pass' : `✗ exit ${journeyCode}`}`,
  `  report slots:  ${reportSlotsCode === 0 ? '✓ pass' : `✗ exit ${reportSlotsCode}`}`,
  `  journey undo:  ${journeyRestoreCode === 0 ? '✓ pass' : `✗ exit ${journeyRestoreCode}`}`,
  `  lint:size:     ${sizeCode === 0 ? '✓ pass' : `✗ exit ${sizeCode}`}`,
  `  lint:copy:     ${copyCode === 0 ? '✓ pass' : `✗ exit ${copyCode}`}`,
  `  lint:dest:     ${destCode === 0 ? '✓ pass' : `✗ exit ${destCode}`}`,
  `  lint:behavior: ${behaviorCode === 0 ? '✓ pass' : `✗ exit ${behaviorCode}`}`,
  `  lint:checks:   ${checksCode === 0 ? '✓ pass' : `✗ exit ${checksCode}`}`,
  `  lint:wiring:   ${wiringCode === 0 ? '✓ pass' : `✗ exit ${wiringCode}`}`,
  `  lint:parity:   ${parityCode === 0 ? '✓ pass' : `✗ exit ${parityCode}`}`,
  `  dep sync seed: ${departureSyncCode === 0 ? '✓ pass' : `✗ exit ${departureSyncCode}`}`,
  `  multi slots:   ${multiSlotCode === 0 ? '✓ pass' : `✗ exit ${multiSlotCode}`}`,
  `  valid-until:   ${validUntilCode === 0 ? '✓ pass' : `✗ exit ${validUntilCode}`}`,
  `  phone format:  ${phoneCode === 0 ? '✓ pass' : `✗ exit ${phoneCode}`}`,
].join('\n')
console.log(`\n─── summary ───\n${summary}`)

process.exit(
  Math.max(
    eslintCode, portalEslintCode, rlsCode, scopeCode, journeyCode,
    reportSlotsCode, journeyRestoreCode, sizeCode, copyCode, wiringCode, parityCode,
    departureSyncCode, multiSlotCode, validUntilCode, phoneCode,
    destCode, behaviorCode, checksCode,
  ),
)
