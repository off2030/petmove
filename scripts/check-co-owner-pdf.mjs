// Offline output regression: production PDF filler and real templates, synthetic cases only.
// Requires PyMuPDF; set PYTHON to the installed Python executable when necessary.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir, mkdtemp, writeFile, copyFile, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const admin = path.join(root, 'apps/admin'), cache = path.join(root, 'node_modules/.cache')
await mkdir(cache, { recursive: true })
const temp = await mkdtemp(path.join(cache, 'co-owner-pdf-'))
try {
  const runtime = path.join(temp, 'runtime.mjs')
  await build({
    stdin: { contents: `export {fillPdf,fillPdfMulti,packCases,pdfDocumentOwnerGroup} from './lib/pdf-fill';export {countPackedDocuments} from './lib/pdf-multi-forms'`, resolveDir: admin, loader: 'ts' },
    outfile: runtime, bundle: true, platform: 'node', format: 'esm', tsconfig: path.join(admin, 'tsconfig.json'),
    external: ['pdf-lib', '@pdf-lib/fontkit', 'react'],
    plugins: [{ name: 'offline', setup(b) {
      b.onResolve({ filter: /^(@\/lib\/vaccine-data|@\/lib\/vet-info|server-only|@petmove\/auth\/server|@\/lib\/supabase\/active-org)$/ }, a => ({ path: a.path, namespace: 'offline' }))
      b.onLoad({ filter: /.*/, namespace: 'offline' }, a => ({
        contents: a.path === '@/lib/vaccine-data'
          ? `import {createVaccineLookups,emptyVaccineProductsData} from '@petmove/domain';export async function getOrgVaccineLookups(){return createVaccineLookups(emptyVaccineProductsData())}`
          : a.path === '@/lib/vet-info' ? `export const VET_INFO={name_en:'TEST VET',clinic_en:'TEST CLINIC',address_en:'TEST ADDRESS',phone_intl:'+82-2-0000-0000',email:'test@example.com'}`
          : a.path === 'server-only' ? '' : `export function createClient(){throw Error('Offline test attempted DB access')}export function getActiveOrgId(){throw Error('Offline test attempted org lookup')}`,
        loader: 'ts', resolveDir: admin,
      }))
    } }],
  })
  const { fillPdf, fillPdfMulti, packCases, pdfDocumentOwnerGroup, countPackedDocuments } = await import(pathToFileURL(runtime).href)
  const makeCase = (id, coOwner = true) => ({
    id, customer_name: 'Primary Owner', customer_name_en: 'Stale Name', pet_name_en: id,
    microchip: '999000000000001', destination: '뉴질랜드(구)', departure_date: '2026-11-03',
    data: { species: 'cat', sex: 'spayed_female', breed_en: 'Domestic Shorthair', birth_date: '2020-01-01',
      customer_first_name_en: 'ALICE', customer_last_name_en: 'KIM',
      ...(coOwner ? { co_owner: { first_name_en: 'CHARLES', last_name_en: 'MONTGOMERY' } } : {}),
      address_en: '1 Example Road, Seoul', address_overseas: '2 Example Road, Auckland', vet_visit_date: '2026-11-02',
      rabies_dates: [{ date: '2026-03-23' }], rabies_titer_records: [{ date: '2026-04-27', value: '23.93' }],
    },
  })
  const specs = []
  const save = async (name, result, contains, absent = []) => {
    assert.equal(result.ok, true, result.error)
    const file = path.join(temp, `${name}.pdf`)
    await writeFile(file, Buffer.from(result.pdf, 'base64'))
    if (process.env.PDF_CHECK_OUTPUT_DIR) {
      await mkdir(process.env.PDF_CHECK_OUTPUT_DIR, { recursive: true })
      await copyFile(file, path.join(process.env.PDF_CHECK_OUTPUT_DIR, `${name}.pdf`))
    }
    specs.push({ file, contains, absent })
  }
  process.chdir(admin)
  for (const form of ['Form25', 'Form25AuNz', 'NZ', 'NZ_2', 'NZ26']) {
    const row = makeCase('TEST CAT'), before = JSON.stringify(row)
    await save(`${form}-two-owners`, await fillPdf(form, row, { includeSignature: false }), ['ALICE KIM / CHARLES MONTGOMERY'], ['Stale Name'])
    await save(`${form}-one-owner`, await fillPdf(form, makeCase('TEST CAT', false), { includeSignature: false }), ['ALICE KIM'], ['CHARLES', 'Stale Name'])
    assert.equal(JSON.stringify(row), before, 'PDF output must not change case data')
    if (form.startsWith('NZ')) {
      const other = makeCase('OTHER CAT'); other.data.co_owner.first_name_en = 'DIFFERENT'
      const cases = [row, other, makeCase('THIRD CAT')]
      const summary = cases.map(c => ({ rabiesDoseCount: 1, ownerGroup: pdfDocumentOwnerGroup(form, c) }))
      assert.equal(countPackedDocuments(form, summary), packCases(form, cases).length)
      const docs = await fillPdfMulti(form, cases, { includeSignature: false })
      assert.equal(docs.length, 2)
      await save(`${form}-same-co-owner`, docs[0], ['ALICE KIM / CHARLES MONTGOMERY', 'TEST CAT', 'THIRD CAT'], ['DIFFERENT', 'OTHER CAT'])
      await save(`${form}-different-co-owner`, docs[1], ['ALICE KIM / DIFFERENT MONTGOMERY', 'OTHER CAT'], ['CHARLES', 'THIRD CAT'])
    }
  }
  for (const form of ['NZ', 'NZ_2', 'NZ26']) {
    const row = makeCase('FIRST CAT')
    row.data.nz_importer_name = 'DAVID LEE'
    row.data.address_overseas = '5 Example Road, Christchurch 8041, New Zealand'
    row.data.entry_airport = 'AKL'
    await save(`${form}-importer`, await fillPdf(form, row, { includeSignature: false }),
      ['DAVID LEE', row.data.address_overseas, 'Auckland Airport (AKL)', 'ALICE KIM / CHARLES MONTGOMERY', ...(form === 'NZ26' ? [] : ['Airplane'])])
    const second = structuredClone(row); second.pet_name_en = 'SECOND CAT'; second.microchip = '999000000000002'
    const third = structuredClone(row); third.pet_name_en = 'THIRD CAT'; third.microchip = '999000000000003'
    const same = [row, second, third]
    assert.equal(packCases(form, same).length, 1)
    const docs = await fillPdfMulti(form, same, { includeSignature: false })
    assert.equal(docs.length, 1)
    await save(`${form}-three-cats`, docs[0], ['DAVID LEE', 'Auckland Airport (AKL)', ...same.flatMap(c => [c.pet_name_en, c.microchip])])
    const other = structuredClone(row); other.data.nz_importer_name = 'OTHER IMPORTER'
    const mixed = [row, other, third]
    assert.equal(packCases(form, mixed).length, 2, 'Different importers must not share the first animal header')
    assert.equal(countPackedDocuments(form, mixed.map(c => ({ rabiesDoseCount: 1, ownerGroup: pdfDocumentOwnerGroup(form, c) }))), 2)
    other.data.nz_importer_name = row.data.nz_importer_name
    other.data.entry_airport = 'CHC'
    assert.equal(packCases(form, [row, other]).length, 2, 'Different arrival ports must remain separate')
    delete row.data.entry_airport
    await save(`${form}-no-arrival`, await fillPdf(form, row, { includeSignature: false }), ['DAVID LEE', row.data.address_overseas], ['Auckland Airport (AKL)', 'Christchurch Airport (CHC)'])
  }
  await writeFile(path.join(temp, 'checks.json'), JSON.stringify(specs))
  execFileSync(process.env.PYTHON || 'python', ['-c', `import json,sys,pymupdf
for s in json.load(open(sys.argv[1],encoding='utf-8')):
 d=pymupdf.open(s['file']); text='\\n'.join(p.get_text() for p in d)
 assert not any(list(p.widgets() or []) for p in d),s['file']
 for v in s['contains']: assert ' '.join(v.split()) in ' '.join(text.split()),(s['file'],v)
 for v in s['absent']: assert ' '.join(v.split()) not in ' '.join(text.split()),(s['file'],v)
`, path.join(temp, 'checks.json')], { stdio: 'inherit' })
  console.log(`✓ ${specs.length} PDFs: owners, NZ importer/address/airport, three animals, missing airport and packing preview verified`)
} finally {
  process.chdir(root)
  assert(temp.startsWith(path.join(cache, 'co-owner-pdf-')))
  await rm(temp, { recursive: true, force: true })
}
