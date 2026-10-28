// Offline regression for the real pre-issue check. No operating records or database writes.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const admin = path.join(root, 'apps/admin'), cache = path.join(root, 'node_modules/.cache')
await mkdir(cache, { recursive: true })
const dir = await mkdtemp(path.join(cache, 'nz-missing-'))
try {
  const runtime = path.join(dir, 'runtime.mjs')
  await build({
    stdin: { contents: `export {inspectMissingPdfFields} from './lib/actions/inspect-missing-pdf-fields'`, resolveDir: admin, loader: 'ts' },
    outfile: runtime, bundle: true, platform: 'node', format: 'esm', tsconfig: path.join(admin, 'tsconfig.json'),
    external: ['pdf-lib', '@pdf-lib/fontkit', 'react'],
    plugins: [{ name: 'offline', setup(b) {
      b.onResolve({ filter: /^(@\/lib\/vaccine-data|@\/lib\/vet-info|server-only|@petmove\/auth\/server|@\/lib\/supabase\/active-org)$/ }, a => ({ path: a.path, namespace: 'offline' }))
      b.onLoad({ filter: /.*/, namespace: 'offline' }, a => ({
        contents: a.path === '@petmove/auth/server'
          ? `export function createClient() {
              return { from(table) {
                if (table !== 'cases') throw Error('Unexpected database table');
                return { select: () => ({ in: (_key, ids) => ({
                  data: globalThis.__nzMissingCases.filter(r => ids.includes(r.id)), error: null,
                }) }) };
              } };
            }`
          : a.path === '@/lib/vaccine-data' ? `export function getOrgVaccineLookups(){throw Error('Unexpected product lookup')}`
          : a.path === '@/lib/vet-info' ? `export const VET_INFO={}`
          : a.path === 'server-only' ? '' : `export function getActiveOrgId(){throw Error('Unexpected org lookup')}`,
        loader: 'ts',
      }))
    } }],
  })
  const { inspectMissingPdfFields } = await import(pathToFileURL(runtime).href)
  for (const form of ['NZ', 'NZ_2', 'NZ26']) {
    const row = { id: 'test', destination: '뉴질랜드(구)', customer_name: 'Owner', customer_name_en: 'ALICE KIM', data: {
      species: 'cat', nz_importer_name: 'Stale importer', address_overseas: 'Stale address', entry_airport: 'Stale airport',
      by_dest: { '뉴질랜드(구)': { nz_importer_name: 'DAVID LEE', address_overseas: 'Christchurch home', entry_airport: 'AKL' } },
    } }
    const inspect = async () => {
      globalThis.__nzMissingCases = [row]
      const result = await inspectMissingPdfFields(form, [row.id], row.destination)
      assert.equal(result.ok, true, result.error)
      return result.cases[0].missingLabels
    }
    const labels = ['뉴질랜드 수입자 영문명', '해외 주소', '도착 공항']
    const filled = await inspect()
    for (const label of labels) assert(!filled.includes(label), `${form}: stored field falsely reported as missing: ${label}`)
    assert(!filled.some(label => label.startsWith('nz_')), 'Internal source names must not be shown')
    row.data.by_dest[row.destination] = { nz_importer_name: null, address_overseas: null, entry_airport: null }
    const fallback = await inspect()
    assert(!fallback.includes(labels[0]), 'The existing owner-as-importer fallback is printed')
    for (const label of labels.slice(1)) assert(fallback.includes(label), `${form}: a cleared trip value must be reported`)
    row.customer_name = ''; row.customer_name_en = ''
    const empty = await inspect()
    for (const label of labels) assert(empty.includes(label), `${form}: real missing field not reported: ${label}`)
  }
  console.log('✓ NZ/NZ_2/NZ26 pre-issue checks: filled trip fields, owner fallback, cleared values and readable labels')
} finally {
  delete globalThis.__nzMissingCases
  assert(dir.startsWith(path.join(cache, 'nz-missing-')))
  await rm(dir, { recursive: true, force: true })
}
