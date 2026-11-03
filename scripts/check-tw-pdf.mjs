// Exercise the real filler and pre-issue check with fictional records, never a live DB.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const admin = path.join(root, 'apps/admin'), cache = path.join(root, 'node_modules/.cache')
const require = createRequire(path.join(admin, 'package.json'))
const { PDFDocument, PDFName } = require('pdf-lib')
const { getDocument } = await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href)
await mkdir(cache, { recursive: true })
const dir = await mkdtemp(path.join(cache, 'tw-pdf-')), previousCwd = process.cwd()
try {
  const runtime = path.join(dir, 'runtime.cjs')
  await build({
    stdin: { contents: `export {fillPdf} from './lib/pdf-fill'; export {inspectMissingPdfFields} from './lib/actions/inspect-missing-pdf-fields'; export {flattenCaseForDestination} from '@petmove/domain'`, resolveDir: admin, loader: 'ts' },
    outfile: runtime, bundle: true, platform: 'node', format: 'cjs', tsconfig: path.join(admin, 'tsconfig.json'),
    external: ['pdf-lib', '@pdf-lib/fontkit', 'react'],
    plugins: [{ name: 'offline', setup(b) {
      b.onResolve({ filter: /^(@\/lib\/vaccine-data|@\/lib\/vet-info|server-only|@petmove\/auth\/server)$/ }, a => ({ path: a.path, namespace: 'offline' }))
      b.onLoad({ filter: /.*/, namespace: 'offline' }, a => ({
        contents: a.path === '@petmove/auth/server'
          ? `export function createClient(){return {from(table){if(table!=='cases')throw Error('Unexpected DB table');return {select:()=>({in:(_key,ids)=>({data:globalThis.__twCases.filter(r=>ids.includes(r.id)),error:null})})}}}}`
          : a.path === '@/lib/vaccine-data' ? 'export async function getOrgVaccineLookups(){return undefined}'
          : a.path === '@/lib/vet-info' ? `export const VET_INFO={name_en:'Alice Vet'}` : '',
        loader: 'ts',
      }))
    } }],
  })
  const { fillPdf, inspectMissingPdfFields, flattenCaseForDestination } = require(runtime)
  const mappings = JSON.parse(await readFile(path.join(admin, 'data/pdf-field-mappings.json'), 'utf8')).TW
  const template = await PDFDocument.load(await readFile(path.join(admin, 'data/pdf-templates/TW.pdf')))
  assert.equal(template.getPageCount(), 1)
  assert.equal(template.getForm().getFields().length, 28)
  assert.deepEqual(template.getForm().getFields().map(f => f.getName()).sort(), Object.keys(mappings.fields).sort())
  for (const field of template.getForm().getFields()) {
    assert(!field.getText(), 'Blank public template must contain no customer information')
    assert.equal(field.acroField.getWidgets().length, 1)
    assert(field.acroField.getWidgets()[0].dict.has(PDFName.of('AP')))
    assert(!field.acroField.getWidgets()[0].getAppearanceCharacteristics()?.getBackgroundColor(), 'Transparent widgets must preserve official underlines')
  }
  const row = { id: 'fictional', org_id: 'offline', destination: '대만', customer_name_en: 'Alice Kim', pet_name_en: 'Test Cat', microchip: '900000000000001', data: {
    species: 'cat', sex: 'female', birth_date: '2020-02-03', permit_no: 'TEST-PERMIT-001', certificate_no: 'TEST-CERT-001', vet_visit_date: '2026-10-20',
    // Intentionally unsorted; newest, permit dose, and unrelated middle dose must not mix.
    rabies_dates: [
      { date: '2025-03-04', other_hospital: true, product: 'PermitVac', manufacturer: 'PermitMaker' },
      { date: '2026-07-08', other_hospital: true, product: 'LatestVac', manufacturer: 'LatestMaker' },
      { date: '2025-11-12', other_hospital: true, product: 'UnrelatedVac', manufacturer: 'UnrelatedMaker' },
    ],
    rabies_titer_records: [{ date: '2025-05-06', value: '1.23', lab: 'PreviousLab' }, { date: '2026-08-09', value: '4.56', lab: 'RecentLab' }],
    tw_permit_rabies_date: '2025-03-04',
  } }
  const original = structuredClone(row)
  process.chdir(admin)
  async function output(r = row, opts = {}) {
    const result = await fillPdf('TW', r, { includeSignature: false, includeVet: true, ...opts })
    assert.equal(result.ok, true, result.error)
    const bytes = Buffer.from(result.pdf, 'base64'), parsed = await PDFDocument.load(bytes)
    assert.equal(parsed.getForm().getFields().length, 0, 'Existing static issuance contract')
    const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise
    assert.equal(doc.numPages, 1)
    const page = await doc.getPage(1), content = await page.getTextContent()
    const text = content.items.map(i => i.str).join(' ').replace(/\s+/g, ' ')
    await doc.destroy()
    return text
  }
  const text = await output()
  for (const value of ['2025/2/6', 'no less than 90 days', 'Alice Kim', 'TEST-PERMIT-001', '900000000000001', '03/02/2020', 'LatestVac', 'LatestMaker', '08/07/2026', 'PermitVac', 'PermitMaker', '04/03/2025', '09/08/2026', '4.56', 'RecentLab', '06/05/2025', '1.23', 'PreviousLab', 'ALICE VET', '20/10/2026']) {
    assert(text.includes(value), `Missing output: ${value}`)
  }
  assert(!text.includes('UnrelatedVac'), 'Permit row must not use the second latest dose')
  assert(!text.includes('BAPHIQ'), 'Old template labels must not survive')
  assert.deepEqual(row, original, 'Issuance must not mutate case history')
  const single = structuredClone(row)
  single.data.rabies_dates = [row.data.rabies_dates[1]]
  single.data.rabies_titer_records = [row.data.rabies_titer_records[1]]
  delete single.data.tw_permit_rabies_date
  const singleText = await output(single)
  assert(!singleText.includes('PermitVac') && !singleText.includes('PreviousLab'))
  assert.equal(singleText.split('LatestVac').length - 1, 1, 'Do not repeat latest dose in optional row')
  single.data.tw_permit_rabies_date = '2026-07-08'
  assert.equal((await output(single)).split('LatestVac').length - 1, 1)
  single.data.tw_permit_rabies_date = '1999-01-01'
  assert.equal((await fillPdf('TW', single)).ok, false, 'Unmatched permit date must stop issuance')
  delete single.data.tw_permit_rabies_date
  globalThis.__twCases = [single]
  const missing = await inspectMissingPdfFields('TW', [single.id], '대만')
  assert(missing.ok)
  assert.deepEqual(missing.cases[0].missingLabels, [], 'Optional permit and previous-test rows are normal blank fields')
  const noVet = await output(row, { includeVet: false })
  assert(!noVet.includes('ALICE VET') && !noVet.includes('20/10/2026'))
  const noVisit = structuredClone(single); delete noVisit.data.vet_visit_date
  const noVisitText = await output(noVisit)
  assert(!noVisitText.includes('20/10/2026'), 'Missing examination date must stay blank')
  const trip = { ...row, destination: '대만, 대만(2차)', data: { ...row.data, by_dest: { '대만(2차)': { permit_no: 'SECOND-TRIP', tw_permit_rabies_date: '2025-11-12' } } } }
  const scoped = flattenCaseForDestination(trip, '대만(2차)')
  assert.equal(scoped.data.tw_permit_rabies_date, '2025-11-12')
  const tripText = await output(scoped)
  assert(tripText.includes('SECOND-TRIP') && tripText.includes('UnrelatedVac') && !tripText.includes('PermitVac'))
  console.log('✓ TW 2025 official template, canonical blank fields, full issuance, matched permit dose, paired RNATT history, optional blanks, missing check, vet gating and trip scope')
} finally {
  process.chdir(previousCwd)
  delete globalThis.__twCases
  assert(dir.startsWith(path.join(cache, 'tw-pdf-')))
  await rm(dir, { recursive: true, force: true })
}
