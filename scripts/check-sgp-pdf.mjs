// Offline regression: exercise the production PDF filler, never a copied resolver.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const admin = path.join(root, 'apps/admin')
const cache = path.join(root, 'node_modules/.cache')
await mkdir(cache, { recursive: true })
const temp = await mkdtemp(path.join(cache, 'sgp-pdf-'))
try {
  const runtime = path.join(temp, 'runtime.mjs')
  await build({
    stdin: {
      contents: `export {fillPdf} from './lib/pdf-fill'; export {flattenCaseForDestination} from '@petmove/domain'`,
      resolveDir: admin,
      loader: 'ts',
    },
    outfile: runtime, bundle: true, platform: 'node', format: 'esm', tsconfig: path.join(admin, 'tsconfig.json'),
    external: ['pdf-lib', '@pdf-lib/fontkit', 'react'],
    plugins: [{ name: 'offline-only', setup(b) {
      b.onResolve({ filter: /^(@\/lib\/vaccine-data|@\/lib\/vet-info|server-only|@petmove\/auth\/server|@\/lib\/supabase\/active-org)$/ }, a => ({ path: a.path, namespace: 'offline' }))
      b.onLoad({ filter: /.*/, namespace: 'offline' }, a => ({
        contents: a.path === '@/lib/vaccine-data'
          ? `import {createVaccineLookups,emptyVaccineProductsData} from '@petmove/domain';export async function getOrgVaccineLookups(){const d=emptyVaccineProductsData();for(const [key,id,product] of [['parasite_external_dog','frontline_plus_dog','Frontline Plus'],['parasite_external_cat','frontline_spray_cat','Frontline Spray'],['parasite_internal_dog','drontal_plus_dog','Drontal Plus']])d[key]=[{id,product,manufacturer:'TEST',batch:'TEST',expiry:'2028-01-01'}];return createVaccineLookups(d)}`
          : a.path === '@/lib/vet-info' ? `export const VET_INFO={name_en:'TEST VET',clinic_en:'TEST CLINIC',address_en:'TEST ADDRESS',phone_intl:'+82-2-0000-0000',email:'test@example.com'}`
          : a.path === 'server-only' ? '' : a.path === '@petmove/auth/server'
            ? `export function createClient(){throw Error('Offline test attempted DB access')}`
            : `export function getActiveOrgId(){throw Error('Offline test attempted org lookup')}`,
        loader: 'ts', resolveDir: admin,
      }))
    } }],
  })
  const { fillPdf, flattenCaseForDestination } = await import(pathToFileURL(runtime).href)
  process.chdir(admin)
  const specs = []
  for (const [species, sex] of [['dog','male'],['dog','female'],['dog','neutered_male'],['dog','spayed_female'],['cat','female']]) {
    const row = { id: 'offline', pet_name_en: 'TEST ANIMAL', microchip: '999000000000001', destination: '싱가포르', data: {
      species, sex, breed_en: 'TEST BREED', color_en: 'White', birth_date: '2020-07-09', vet_visit_date: '2026-10-28',
      by_dest: { '싱가포르': { permit_no: 'SGP-IMPORT-2026-001' } },
      rabies_dates: [{date:'2026-04-29'}], general_vaccine_dates: [{date:'2026-04-29'}], rabies_titer_records: [{date:'2026-05-28',value:'1.99'}],
      external_parasite_dates: [{date:'2026-10-28'}], internal_parasite_dates: species === 'dog' ? [{date:'2026-10-28'}] : [],
    } }
    const before = JSON.stringify(row)
    const flattened = flattenCaseForDestination(row, '싱가포르')
    assert.equal(flattened.data.permit_no, 'SGP-IMPORT-2026-001', 'Singapore permit number was not flattened')
    const result = await fillPdf('SGP', flattened, {includeSignature:false,includeVet:true})
    assert(result.ok, result.error)
    assert.equal(JSON.stringify(row), before, 'PDF generation changed source records')
    const file = path.join(temp, `${species}-${sex}.pdf`)
    await writeFile(file, Buffer.from(result.pdf,'base64'))
    specs.push({file,species,sex})
  }
  const mapping = JSON.parse(await readFile(path.join(admin,'data/pdf-field-mappings.json'),'utf8')).SGP
  const checks = path.join(temp,'checks.json')
  await writeFile(checks,JSON.stringify({specs,mapping,template:path.join(admin,'data/pdf-templates/SGP.pdf')}))
  const python = String.raw`
import json,sys,pymupdf as pdf
from pypdf import PdfReader
s=json.load(open(sys.argv[1],encoding='utf8'))
reader=PdfReader(s['template']); fields=reader.get_fields()
assert set(fields)==set(s['mapping']['fields']) and len(fields)==32
for spec in s['specs']:
 d=pdf.open(spec['file']); assert len(d)==3
 assert not any(list(p.widgets() or []) for p in d)
 text='\n'.join(p.get_text() for p in d)
 for val in ['SGP-IMPORT-2026-001','TEST ANIMAL','999000000000001','28/05/2026','1.99','28/10/2026','01042026']:
  assert val in text,(spec['file'],val)
 ingredient='Fipronil, (S)-methoprene' if spec['species']=='dog' else 'Fipronil'
 assert ingredient in text
 if spec['species']=='cat': assert '(S)-methoprene' not in text
 def struck(page, phrase, occurrence=0):
  rect=page.search_for(phrase)[occurrence]
  return any(i[0]=='l' and abs(i[1].y-i[2].y)<.1 and rect.y0<i[1].y<rect.y1 and min(i[1].x,i[2].x)<=rect.x0+2 and max(i[1].x,i[2].x)>=rect.x1-2 for dr in page.get_drawings() for i in dr['items'])
 assert struck(d[0],'The cat was vaccinated')==(spec['species']=='dog')
 assert struck(d[0],'The dog was vaccinated')==(spec['species']=='cat')
 assert struck(d[2],'or an official government veterinarian',-1)
 assert not struck(d[2],'Sections I to III may be endorsed')
 assert not struck(d[2],'SECTION IV')
 assert 'TEST VET' in text and not struck(d[2],'TEST VET')
 mk=s['mapping']['markOverlays'][0]['cases'][spec['sex']]
 center=pdf.Point(mk['cx'],d[0].rect.height-mk['cy'])
 assert any(dr['rect'].contains(center) and any(i[0]=='c' for i in dr['items']) for dr in d[0].get_drawings())
 # All data text stays on the page and within the intended form margin.
 for page in d:
  for word in page.get_text('words'):
   assert 0<=word[0]<word[2]<=page.rect.width+1 and 0<=word[1]<word[3]<=page.rect.height+1
print('PASS: 5 production PDFs; 32 canonical fields, current AVS edition, complete dog ingredients, unchanged cat ingredients, sex marks, species strikes, official section preserved')
`
  process.stdout.write(execFileSync(process.env.PETMOVE_PYTHON || 'python', ['-c',python,checks],{encoding:'utf8'}))
} finally {
  process.chdir(root)
  await rm(temp,{recursive:true,force:true})
}
