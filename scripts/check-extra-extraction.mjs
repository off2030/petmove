// Offline regression: real country routing, image/text action requests and unified storage keys.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const admin = path.join(root, 'apps/admin'), cache = path.join(root, 'node_modules/.cache')
await mkdir(cache, { recursive: true })
const dir = await mkdtemp(path.join(cache, 'extra-extraction-'))
const previousKey = process.env.OPENAI_API_KEY
try {
  const runtime = path.join(dir, 'runtime.cjs')
  await build({
    stdin: { contents: `export * from './lib/extra-extraction';export {extractExtra} from './lib/actions/extract-extra';export {isDestinationScopedKey,flattenCaseForDestination} from '@petmove/domain'`, resolveDir: admin, loader: 'ts' },
    outfile: runtime, bundle: true, platform: 'node', format: 'cjs', tsconfig: path.join(admin, 'tsconfig.json'),
    plugins: [{ name: 'offline', setup(b) {
      b.onResolve({ filter: /^(openai|\.\/_report-error)$/ }, a => ({ path: a.path, namespace: 'offline' }))
      b.onLoad({ filter: /.*/, namespace: 'offline' }, a => ({
        contents: a.path === 'openai'
          ? `export default class OpenAI {chat={completions:{create:async(request)=>{globalThis.__extraRequest=request;return {choices:[{message:{content:JSON.stringify(globalThis.__extraResponse)}}]}}}}}`
          : `export function reportActionError(){return 'Offline extraction error'}`,
        loader: 'ts',
      }))
    } }],
  })
  const require = createRequire(import.meta.url)
  const { destinationToCountry, mapExtractResultToUnified, extraExtractionDepartureDate, extractExtra, isDestinationScopedKey, flattenCaseForDestination } = require(runtime)
  for (const dest of ['대만', '대만(2차)', 'Taiwan']) assert.equal(destinationToCountry(dest), 'taiwan', 'Taiwan UI must activate the paste/drop/upload extraction path')
  assert.equal(destinationToCountry('일본'), 'japan')
  assert.equal(destinationToCountry('뉴질랜드'), 'new-zealand')
  assert.equal(destinationToCountry('캐나다'), null)
  assert.equal(destinationToCountry(null), null)
  process.env.OPENAI_API_KEY = 'offline-not-a-real-key'
  const flight = { date: '2026-12-10', time: '23:10', departure_airport: 'ICN', arrival_airport: 'TPE', transport: null, flight_number: 'TEST123' }
  globalThis.__extraResponse = {
    permit_no: 'TEST-PERMIT-123', tw_permit_rabies_date: '2026-07-08', address_overseas: '10 Test Road, Taipei, Taiwan',
    postal_code: '00123', overseas_phone: '+886-2-1234-5678', email: 'test@example.com', passport_number: 'M00000000',
    korea_to_taiwan: flight, entry_date: '2026-12-11',
  }
  const image = { base64: 'aW1hZ2U=', mediaType: 'image/png' }
  const result = await extractExtra({ country: 'taiwan', images: [image], target: { microchip: '900000000000001', petName: 'Test' } })
  assert(result.ok)
  const request = globalThis.__extraRequest
  assert.equal(request.response_format.json_schema.name, 'taiwan_extract')
  assert.equal(request.response_format.json_schema.strict, true)
  assert.equal(request.response_format.json_schema.schema.additionalProperties, false)
  assert.deepEqual(request.response_format.json_schema.schema.required.sort(), Object.keys(globalThis.__extraResponse).sort())
  const content = request.messages[1].content
  assert(content.some(c => c.type === 'image_url' && c.image_url.url === 'data:image/png;base64,aW1hZ2U='), 'Pasted/uploaded image must reach the real extraction action')
  assert(content.some(c => c.text?.includes('900000000000001')), 'Permit vaccination must identify the current animal')
  assert(request.messages[0].content.includes("allowed arrival date RANGE"), 'Permit validity is not a booked departure/arrival')
  const unified = mapExtractResultToUnified('taiwan', result.data)
  assert.deepEqual(unified, {
    permit_no: 'TEST-PERMIT-123', tw_permit_rabies_date: '2026-07-08', address_overseas: '10 Test Road, Taipei, Taiwan',
    postal_code: '00123', overseas_phone: '+886-2-1234-5678', email: 'test@example.com', passport_number: 'M00000000',
    departure_flight_date: '2026-12-10', entry_departure_airport: 'ICN', entry_airport: 'TPE', entry_flight_number: 'TEST123', entry_date: '2026-12-11',
  })
  assert.equal(extraExtractionDepartureDate('taiwan', unified), '2026-12-10', 'Overnight Taiwan arrival must not overwrite Korean departure date')
  assert.equal(extraExtractionDepartureDate('taiwan', { entry_date: '2026-12-11' }), null)
  assert.equal(extraExtractionDepartureDate('philippines', { entry_date: '2026-12-11' }), '2026-12-11', 'Existing countries retain their behavior')
  for (const key of ['permit_no', 'tw_permit_rabies_date', 'address_overseas', 'entry_date', 'departure_flight_date']) assert(isDestinationScopedKey(key))
  const row = { destination: '大灣, 대만(2차)', data: { permit_no: 'STALE', by_dest: { '대만(2차)': unified } } }
  assert.equal(flattenCaseForDestination(row, '대만(2차)').data.tw_permit_rabies_date, '2026-07-08')
  assert(!('certificate_no' in unified) && !('rabies_dates' in unified), 'Additional info must not fabricate official certificate numbers or rewrite clinical records')
  await extractExtra({ country: 'taiwan', text: 'Fictional permit details' })
  assert(globalThis.__extraRequest.messages[1].content.some(c => c.text?.includes('Fictional permit details')))
  globalThis.__extraResponse = { permit_no: 'null', address_overseas: '-', korea_to_taiwan: { date: 'N/A' } }
  assert.equal((await extractExtra({ country: 'taiwan', text: 'No relevant information here' })).ok, false)
  assert.deepEqual(mapExtractResultToUnified('taiwan', { permit_no: null }), {}, 'Absent data must not clear stored fields')
  assert.deepEqual(mapExtractResultToUnified('new-zealand', { nz_importer_name: 'Test Importer', permit_no: 'NZ-TEST' }), { nz_importer_name: 'Test Importer', permit_no: 'NZ-TEST' })
  assert.equal(mapExtractResultToUnified('japan', { export_quarantine_time: '1300' }).jp_export_quarantine_time, '13:00')
  console.log('✓ Taiwan additional info: country activation, image/text requests, strict schema, target identity, unified fields, absent values, trip scope and overnight flight dates; existing NZ/Japan mapping preserved')
} finally {
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = previousKey
  delete globalThis.__extraRequest; delete globalThis.__extraResponse
  assert(dir.startsWith(path.join(cache, 'extra-extraction-')))
  await rm(dir, { recursive: true, force: true })
}
