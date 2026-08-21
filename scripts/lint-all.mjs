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
// 설정 화면 컨트롤·칩 크기 규격 — 높이 클래스를 직접 쓰면 실패(2026-08-06 신설).
const sizeCode = await run(process.execPath, ['scripts/lint-settings-size.mjs'], 'settings size scale')
const copyCode = await run(
  localBin('tsx'),
  ['scripts/lint-journey-copy.ts'],
  'journey copy snapshot',
  { shell: process.platform === 'win32' },
)
// 형제 목적지 구조 패리티 — 복사해 만든 목적지에 원본의 나중 수정이 전파됐는지(2026-07-29 신설).
const parityCode = await run(
  localBin('tsx'),
  ['scripts/lint-destination-parity.ts'],
  'destination parity',
  { shell: process.platform === 'win32' },
)

const summary = [
  `  admin eslint:  ${eslintCode === 0 ? '✓ pass' : `✗ exit ${eslintCode}`}`,
  `  portal eslint: ${portalEslintCode === 0 ? '✓ pass' : `✗ exit ${portalEslintCode}`}`,
  `  lint:rls:      ${rlsCode === 0 ? '✓ pass' : `✗ exit ${rlsCode}`}`,
  `  lint:scope:    ${scopeCode === 0 ? '✓ pass' : `✗ exit ${scopeCode}`}`,
  `  lint:journey:  ${journeyCode === 0 ? '✓ pass' : `✗ exit ${journeyCode}`}`,
  `  report slots:  ${reportSlotsCode === 0 ? '✓ pass' : `✗ exit ${reportSlotsCode}`}`,
  `  lint:size:     ${sizeCode === 0 ? '✓ pass' : `✗ exit ${sizeCode}`}`,
  `  lint:copy:     ${copyCode === 0 ? '✓ pass' : `✗ exit ${copyCode}`}`,
  `  lint:parity:   ${parityCode === 0 ? '✓ pass' : `✗ exit ${parityCode}`}`,
].join('\n')
console.log(`\n─── summary ───\n${summary}`)

process.exit(
  Math.max(
    eslintCode, portalEslintCode, rlsCode, scopeCode, journeyCode,
    reportSlotsCode, sizeCode, copyCode, parityCode,
  ),
)
