// Guard the intentionally narrow WWW dependency against missed deployments.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const ts = createRequire(path.join(root, 'apps/www/package.json'))('typescript')
const read = (file) => readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')
const workflows = Object.fromEntries(['admin', 'portal', 'www'].map((app) => {
  const text = read(`.github/workflows/deploy-${app}.yml`)
  const block = text.split('    paths:\n')[1]?.split('  workflow_dispatch:')[0]
  assert(block, `Missing paths filter for ${app}`)
  return [app, [...block.matchAll(/^\s+- '([^']+)'/gm)].map((m) => m[1])]
}))
function matches(pattern, file) {
  return new RegExp('^' + pattern.split('**').map((p) => p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '$').test(file)
}
function targets(file) {
  return Object.keys(workflows).filter((app) => {
    let included = false
    for (const rule of workflows[app]) {
      if (matches(rule.replace(/^!/, ''), file)) included = !rule.startsWith('!')
    }
    return included
  })
}
for (const [file, expected] of [
  ['apps/admin/lib/pdf-fill.ts', ['admin']],
  ['apps/portal/app/page.tsx', ['portal']],
  ['apps/www/content/docs/japan.json', ['www']],
  ['packages/domain/src/co-owner.ts', ['admin', 'portal']],
  ['packages/domain/src/transport-partners.ts', ['admin', 'portal', 'www']],
  ['packages/auth/src/server.ts', ['admin', 'portal']],
  ['packages/db/src/types.ts', []],
  ['docs/work-management/README.md', []],
  ['apps/www/README.md', []],
  ['package.json', ['admin', 'portal', 'www']],
  ['.npmrc', ['admin', 'portal', 'www']],
  ['pnpm-lock.yaml', ['admin', 'portal', 'www']],
  ['pnpm-workspace.yaml', ['admin', 'portal', 'www']],
  ['turbo.json', ['admin', 'portal', 'www']],
]) assert.deepEqual(targets(file), expected, file)

for (const app of ['admin', 'portal']) {
  const pkg = JSON.parse(read(`apps/${app}/package.json`))
  for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
    if (version.startsWith('workspace:')) {
      const folder = name.replace('@petmove/', '')
      assert(workflows[app].includes(`packages/${folder}/**`), `${app}: missing deployment path for ${name}`)
    }
  }
}

function inspect(file, standalone = false) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true)
  function visit(node) {
    let specifier
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifier = node.moduleSpecifier.text
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === 'require') && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) specifier = node.arguments[0].text
    if (specifier) {
      if (standalone) assert.fail(`${file} now imports ${specifier}; expand WWW deployment paths to cover its dependencies`)
      if (specifier.startsWith('@petmove/')) assert.equal(specifier, '@petmove/domain/transport-partners', `${file}: expand WWW deployment paths before adding a shared dependency`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}
function walk(dir) {
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (/^(node_modules|public|content|\.next.*)$/.test(entry.name)) continue
    const file = `${dir}/${entry.name}`
    if (entry.isDirectory()) walk(file)
    else if (/\.(tsx?|m?js)$/.test(file)) inspect(file)
  }
}
walk('apps/www')
inspect('packages/domain/src/transport-partners.ts', true)
console.log('Deployment paths and standalone WWW dependency: passed')
