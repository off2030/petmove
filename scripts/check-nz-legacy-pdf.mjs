// Offline regression checks against the real PDF generator and templates.
// No customer records, credentials, network requests, or database writes.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const admin = path.join(root, 'apps/admin')
const cache = path.join(root, 'node_modules/.cache')
await mkdir(cache, { recursive: true })
const temp = await mkdtemp(path.join(cache, 'nz-pdf-'))
try {
  const runtime = path.join(temp, 'runtime.mjs')
  await build({
    stdin: { contents: `export {fillPdf, fillPdfMulti} from './lib/pdf-fill'; export {getEffectiveVaccineEntries, vaccineMatchesSpecies} from '@petmove/domain'`, resolveDir: admin, loader: 'ts' },
    outfile: runtime, bundle: true, platform: 'node', format: 'esm',
    tsconfig: path.join(admin, 'tsconfig.json'), external: ['pdf-lib', '@pdf-lib/fontkit', 'react'],
    plugins: [{ name: 'offline-lookups', setup(b) {
      b.onResolve({ filter: /^(@\/lib\/vaccine-data|server-only|@petmove\/auth\/server|@\/lib\/supabase\/active-org)$/ }, a => ({ path: a.path, namespace: 'offline' }))
      b.onLoad({ filter: /.*/, namespace: 'offline' }, a => ({
        contents: a.path === '@/lib/vaccine-data'
          ? `import {createVaccineLookups, emptyVaccineProductsData} from '@petmove/domain'; export async function getOrgVaccineLookups(){return createVaccineLookups(emptyVaccineProductsData())}`
          : a.path === 'server-only' ? '' : a.path === '@petmove/auth/server'
            ? `export function createClient(){throw Error('Offline test attempted DB access')}`
            : `export function getActiveOrgId(){throw Error('Offline test attempted org lookup')}`,
        loader: 'ts', resolveDir: admin,
      }))
    } }],
  })
  const { fillPdf, fillPdfMulti, getEffectiveVaccineEntries, vaccineMatchesSpecies } = await import(pathToFileURL(runtime).href)
  process.chdir(admin)
  const makeCase = (name, value, species = 'cat', date = '2026-04-27') => ({
    id: name, pet_name: name, pet_name_en: name, customer_name: 'Test Owner', microchip: `99900000000000${name.length}`, destination: '뉴질랜드(구)', departure_date: '2026-11-03',
    data: { species, sex: species === 'cat' ? 'spayed_female' : 'neutered_male', birth_date: '2024-01-01', breed_en: 'Test breed',
      rabies_dates: [{ date: '2026-03-23' }], rabies_titer_records: [{ date, ...(value === null ? {} : { value }) }],
      internal_parasite_dates: [{ date: '2026-10-05' }, { date: '2026-11-02' }], external_parasite_dates: [{ date: '2026-10-05' }, { date: '2026-11-02' }],
      heartworm_dates: [{ date: '2026-11-01' }], infectious_disease_records: [{ date: species === 'cat' ? '2026-10-19' : '2026-10-20' }], vet_visit_date: '2026-11-02',
    },
  })
  const cats = [makeCase('Alpha', '23.93'), makeCase('Beta', '125.59'), makeCase('Gamma', '23.93')]
  const before = JSON.stringify(cats)
  const specs = []
  const save = async (name, result, assertions) => {
    assert.equal(result.ok, true, result.error)
    const file = path.join(temp, `${name}.pdf`)
    await writeFile(file, Buffer.from(result.pdf, 'base64'))
    specs.push({ file, ...assertions })
  }
  for (const form of ['NZ', 'NZ_2']) {
    await save(`${form}-single-cat`, await fillPdf(form, cats[0]), { cat: true, contains: ['23.93'], absent: ['19/Oct/2026', '20/Oct/2026', '01/Nov/2026'] })
    const result = await fillPdfMulti(form, cats)
    assert.equal(result.length, 1)
    await save(`${form}-three-cats`, result[0], { cat: true, contains: ['Alpha: 23.93', 'Beta: 125.59', 'Gamma: 23.93'], absent: ['19/Oct/2026', '01/Nov/2026'] })
    const dog = makeCase('Delta', '9.87', 'dog')
    await save(`${form}-dog`, await fillPdf(form, dog), { cat: false, contains: ['20/Oct/2026', '01/Nov/2026'] })
    await save(`${form}-mixed`, (await fillPdfMulti(form, [cats[0], dog]))[0], { cat: false, contains: ['Delta: 9.87', '20/Oct/2026'], absent: ['19/Oct/2026'] })
    await save(`${form}-missing-result`, (await fillPdfMulti(form, [cats[0], makeCase('Missing', null, 'cat', '2026-05-01')]))[0], { cat: true, contains: ['Missing: [not recorded]', 'Alpha: 27/Apr/2026', 'Missing: 01/May/2026'] })
    await save(`${form}-five-cats`, (await fillPdfMulti(form, [...cats, makeCase('Fourth', '8.76'), makeCase('Fifth', '5.43')]))[0], { cat: true, contains: ['Alpha: 23.93', 'Beta: 125.59', 'Gamma: 23.93', 'Fourth: 8.76', 'Fifth: 5.43'] })
  }
  assert.equal(JSON.stringify(cats), before, 'PDF generation mutated source data')
  for (const destination of ['뉴질랜드', '뉴질랜드(구)']) {
    const entries = getEffectiveVaccineEntries(destination, undefined, null)
    assert(!entries.some(e => e.key === 'heartworm' && vaccineMatchesSpecies(e, 'cat')))
    assert(entries.some(e => e.key === 'heartworm' && vaccineMatchesSpecies(e, 'dog')))
  }
  await writeFile(path.join(temp, 'checks.json'), JSON.stringify(specs))
  const python = String.raw`
import fitz,json,sys
specs=json.load(open(sys.argv[1],encoding='utf8'))
for s in specs:
 p=fitz.open(s['file']);text='\n'.join(x.get_text() for x in p)
 assert len(p)==5
 assert not any(list(x.widgets() or []) for x in p),'Dangling form widgets'
 for value in s.get('contains',[]): assert value in text,(s['file'],value)
 for value in s.get('absent',[]): assert value not in text,(s['file'],value)
 def struck(page,phrase):
  rects=page.search_for(phrase);assert rects,phrase
  rect=rects[0]
  return any(item[0]=='l' and abs(item[1].y-item[2].y)<.1 and rect.y0 < item[1].y < rect.y1 and min(item[1].x,item[2].x) <= rect.x0+2 and max(item[1].x,item[2].x) >= rect.x1-2 for d in page.get_drawings() for item in d['items'])
 assert struck(p[1],'Ivermectin at 6 mcg/kg')==s['cat'],s['file']
 assert struck(p[4],'was fastened with an official seal'),s['file']
 assert not struck(p[4],'The animal was placed in a container'),s['file']
 assert not struck(p[4],'container was clean, dry, and free of pests'),s['file']
 assert not struck(p[3],'has not shown clinical signs of infectious respiratory disease'),s['file']
print('PASS: %d actual PDFs; RNATT identity, missing data, cat/dog/mixed fields, seal-only strikes, no widgets'%len(specs))
`
  process.stdout.write(execFileSync('python', ['-c', python, path.join(temp, 'checks.json')], { encoding: 'utf8' }))
} finally {
  process.chdir(root)
  assert(temp.startsWith(path.join(cache, 'nz-pdf-')))
  await rm(temp, { recursive: true, force: true })
}
