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

const summary = [
  `  admin eslint:  ${eslintCode === 0 ? '✓ pass' : `✗ exit ${eslintCode}`}`,
  `  portal eslint: ${portalEslintCode === 0 ? '✓ pass' : `✗ exit ${portalEslintCode}`}`,
  `  lint:rls:      ${rlsCode === 0 ? '✓ pass' : `✗ exit ${rlsCode}`}`,
  `  lint:scope:    ${scopeCode === 0 ? '✓ pass' : `✗ exit ${scopeCode}`}`,
  `  lint:journey:  ${journeyCode === 0 ? '✓ pass' : `✗ exit ${journeyCode}`}`,
].join('\n')
console.log(`\n─── summary ───\n${summary}`)

process.exit(Math.max(eslintCode, portalEslintCode, rlsCode, scopeCode, journeyCode))
