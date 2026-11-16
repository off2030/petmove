// Offline tests against the production renderer. No live cases, network or DB access.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const admin = path.join(root, 'apps/admin')
const dir = path.join(root, '.codex-temp/ph-form1-check')
await mkdir(dir, { recursive: true })
const runtime = path.join(dir, 'runtime.mjs')
await build({
  stdin: { contents: `export {fillPdf} from './lib/pdf-fill'`, resolveDir: admin, loader: 'ts' },
  outfile: runtime, bundle: true, platform: 'node', format: 'esm', tsconfig: path.join(admin, 'tsconfig.json'), external: ['pdf-lib', '@pdf-lib/fontkit', 'react'],
  plugins: [{ name: 'offline', setup(b) {
    b.onResolve({ filter: /^(@\/lib\/vaccine-data|server-only|@petmove\/auth\/server|@\/lib\/supabase\/active-org)$/ }, a => ({ path: a.path, namespace: 'offline' }))
    b.onLoad({ filter: /.*/, namespace: 'offline' }, a => ({ contents: a.path === '@/lib/vaccine-data'
      ? `import {createVaccineLookups,emptyVaccineProductsData} from '@petmove/domain';export async function getOrgVaccineLookups(){return createVaccineLookups(emptyVaccineProductsData())}`
      : a.path === 'server-only' ? '' : a.path === '@petmove/auth/server' ? `export function createClient(){throw Error('DB access forbidden in offline tests')}` : `export function getActiveOrgId(){throw Error('Org access forbidden in offline tests')}`, loader: 'ts', resolveDir: admin }))
  } }],
})
const { fillPdf } = await import(pathToFileURL(runtime).href)
const row = { id: 'sample', customer_name: 'Test Owner', customer_name_en: 'Test Owner', pet_name: 'Test Pet', pet_name_en: 'Test Pet', microchip: '999000000000001', destination: '필리핀', departure_date: '2027-01-15', data: {
  species: 'cat', sex: 'spayed_female', breed_en: 'Domestic Shorthair', color_en: 'Brown Tabby', birth_date: '2025-01-01', weight: '4.5', microchip_implant_date: '2025-01-01',
  email: 'test@example.com', phone: '+82-10-0000-0000', address_overseas: 'Test Street, Manila, Philippines', import_permit_application_date: '2027-01-01', ph_form1_issue_date: '2026-11-10',
  rabies_dates: [{ date: '2026-09-01', valid_until: '3년', product: 'Test Rabies', manufacturer: 'Test Manufacturer', lot: 'R-001' }],
  general_vaccine_dates: [{ date: '2026-09-01', product: 'Test FVRCP', manufacturer: 'Test Manufacturer', lot: 'G-001' }],
  internal_parasite_dates: [{ date: '2026-11-01', product_id: 'nexgard_cat_combo_cat', valid_until: '2027-02-01', lot: 'P-001', expiry: '2028-12-31' }],
  external_parasite_dates: [{ date: '2026-11-01', product_id: 'nexgard_cat_combo_cat', valid_until: '2027-02-01', lot: 'P-001', expiry: '2028-12-31' }],
  rabies_titer_records: [{ date: '2026-10-04', value: '0.2', lab: 'apqa_seoul' }, { date: '2026-10-05', test_date: '2026-10-12', value: '2.35', lab: 'apqa_seoul' }],
} }
const before = JSON.stringify(row)
const specs = []
async function save(name, testRow, options, assertions) {
  const result = await fillPdf('PH_Form1', testRow, options)
  assert(result.ok, result.error)
  const file = path.join(dir, name + '.pdf')
  await writeFile(file, Buffer.from(result.pdf, 'base64'))
  specs.push({ file, ...assertions })
}
process.chdir(admin)
await save('cat', row, {}, { pages: 1, contains: ['Test Owner', '999000000000001', 'Cat', 'F', 'Test Rabies', 'NexGard Cat Combo', '10/05/2026', '10/12/2026', 'APQA Seoul', '2.35 IU/mL', '02/01/2027'], absent: ['0.2 IU/mL', '12/31/2028'] })
await save('dog', { ...row, data: { ...row.data, species: 'dog', sex: 'neutered_male' } }, {}, { pages: 1, contains: ['Dog', 'M'] })
await save('missing', { ...row, data: { species: 'cat' } }, { includeVet: false }, { pages: 1, contains: ['Test Owner'], absent: ['2.35 IU/mL'] })
await save('low-result', { ...row, data: { ...row.data, rabies_titer_records: [row.data.rabies_titer_records[0]] } }, {}, { pages: 1, absent: ['0.2 IU/mL', '2.35 IU/mL'] })
await save('endorsed', { ...row, data: { ...row.data, ph_form1_endorsed_date: '2026-11-11', ph_government_vet_name: 'Test Official Vet', ph_government_office: 'Test Government Office' } }, {}, { pages: 1, contains: ['Test Official Vet', 'Test Government Office', '11/11/2026'] })
const overflow = { ...row, data: { ...row.data, general_vaccine_dates: Array.from({ length: 19 }, (_, i) => ({ date: '2026-10-01', product: `ExtraVaccine${i}`, manufacturer: 'Manufacturer', lot: `EXTRA-${i}` })) } }
await save('overflow', overflow, {}, { pages: 3, contains: ['ExtraVaccine0', 'ExtraVaccine18', 'CONTINUATION SHEET', 'Official veterinarian endorsement'] })
await save('long-address', { ...row, data: { ...row.data, address_overseas: 'Long importer address '.repeat(18) + 'IMPORTER-END', ph_government_office: 'Long government office address '.repeat(18) + 'OFFICE-END' } }, {}, { pages: 2, contains: ['See continuation', 'CONTINUATION OF DETAILS', 'IMPORTER-END', 'OFFICE-END'] })
assert.equal(JSON.stringify(row), before, 'Source records mutated')
await writeFile(path.join(dir, 'specs.json'), JSON.stringify(specs))
execFileSync('python', ['-c', String.raw`
import fitz,json,sys
from pypdf import PdfReader
specs=json.load(open(sys.argv[1],encoding='utf8'))
for s in specs:
 d=fitz.open(s['file']);text='\n'.join(p.get_text() for p in d)
 assert len(d)==s['pages'],(s['file'],len(d))
 assert not any(list(p.widgets() or []) for p in d)
 assert not (PdfReader(s['file']).get_fields() or {}),'Flattened field tree left behind'
 for value in s.get('contains',[]):assert value in text,(s['file'],value)
 for value in s.get('absent',[]):assert value not in text,(s['file'],value)
 if s['file'].endswith('endorsed.pdf'):
  assert d[0].search_for('Test Government Office')[0].y1 < 794,'Government office text overlaps the table border'
 if s['file'].endswith('cat.pdf'):
  d[0].get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(s['file']+'.png')
print('PASS: 7 actual Form 1 PDFs; species, report selection, missing/low results, actual endorsement, all overflow records, complete long addresses, no mutation/widgets')
`, path.join(dir, 'specs.json')], { stdio: 'inherit' })
process.chdir(root)
