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

function run(cmd, args, label) {
  return new Promise((resolve) => {
    console.log(`\n─── ${label} ───`)
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    child.on('exit', (code) => resolve(code ?? 1))
    child.on('error', () => resolve(1))
  })
}

const eslintCode = await run('pnpm', ['exec', 'turbo', 'lint'], 'turbo lint (eslint)')
const rlsCode = await run('node', ['scripts/lint-rls.mjs'], 'RLS recursion lint')

const summary = [
  `  turbo lint:  ${eslintCode === 0 ? '✓ pass' : `✗ exit ${eslintCode}`}`,
  `  lint:rls:    ${rlsCode === 0 ? '✓ pass' : `✗ exit ${rlsCode}`}`,
].join('\n')
console.log(`\n─── summary ───\n${summary}`)

process.exit(Math.max(eslintCode, rlsCode))
