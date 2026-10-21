#!/usr/bin/env node
/**
 * PETMOVE 검사신청 대조용 읽기 전용 조회.
 * 사용: node scripts/inspection-lookup.mjs <동물이름> [동물이름...]
 *
 * 안전 원칙: 이 파일은 Supabase select만 수행한다. insert/update/upsert/delete/rpc 금지.
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv(file) {
  if (!existsSync(file)) return {}
  const out = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (match) out[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
  return out
}

const env = {
  ...loadEnv(path.join(ROOT, 'apps/admin/.env.local')),
  ...loadEnv(path.join(ROOT, 'apps/portal/.env.local')),
  ...process.env,
}

const names = [...new Set(process.argv.slice(2).map((v) => v.trim()).filter(Boolean))]
if (names.length === 0) {
  console.error('사용: node scripts/inspection-lookup.mjs <동물이름> [동물이름...]')
  process.exit(1)
}
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('PETMOVE Supabase 환경변수를 찾을 수 없습니다.')
  process.exit(1)
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const select = [
  'id', 'org_id', 'microchip', 'microchip_extra',
  'customer_name', 'customer_name_en',
  'pet_name', 'pet_name_en', 'destination', 'departure_date',
  'data', 'created_at', 'updated_at', 'deleted_at',
].join(',')

async function fetchBy(column) {
  const { data, error } = await supabase
    .from('cases')
    .select(select)
    .in(column, names)
    .is('deleted_at', null)
  if (error) throw new Error(`${column} 조회 실패: ${error.message}`)
  return data ?? []
}

const [byKo, byEn] = await Promise.all([fetchBy('pet_name'), fetchBy('pet_name_en')])
const rows = [...new Map([...byKo, ...byEn].map((row) => [row.id, row])).values()]

const LAB_LABELS = {
  krsl: 'KRSL',
  apqa_seoul: 'APQA SEOUL',
  apqa_hq: 'APQA HQ',
  apqa_eu: 'APQA EU',
  ksvdl_r: 'KSVDL-R',
  ksvdl: 'KSVDL',
  vbddl: 'VBDDL',
  arc_ovi: 'ARC-OVI',
}
const EU = new Set([
  '독일', '프랑스', '이탈리아', '스페인', '네덜란드', '벨기에', '오스트리아',
  '스웨덴', '덴마크', '핀란드', '폴란드', '체코', '헝가리', '포르투갈',
  '그리스', '루마니아', '불가리아', '크로아티아', '슬로바키아', '슬로베니아',
  '리투아니아', '라트비아', '에스토니아', '룩셈부르크', '몰타', '키프로스',
  '아일랜드', '영국', '스위스', '노르웨이',
])

function inferredLab(destination) {
  const destinations = String(destination ?? '').split(',').map((v) => v.trim())
  if (destinations.some((v) => v === '싱가포르')) return 'ksvdl_r'
  if (destinations.some((v) => v === '일본' || v === '하와이')) return 'apqa_seoul'
  if (destinations.some((v) => EU.has(v))) return 'apqa_eu'
  return 'krsl'
}

function value(data, ...keys) {
  for (const key of keys) {
    const v = data[key]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return null
}

function inspectionStatus(data, index) {
  return value(
    data,
    `inspection_status_titer_${index}`,
    ...(index === 0 ? ['inspection_status_titer', 'inspection_status'] : []),
  ) ?? 'waiting'
}

function normalize(row) {
  const data = row.data && typeof row.data === 'object' ? row.data : {}
  const records = Array.isArray(data.rabies_titer_records)
    ? data.rabies_titer_records
    : (data.rabies_titer_test_date ? [{ date: data.rabies_titer_test_date, value: data.rabies_titer, lab: data.rabies_titer_lab }] : [])
  const caseLab = value(data, 'inspection_lab')

  return {
    caseId: row.id,
    matchedNames: names.filter((name) => name === row.pet_name || name === row.pet_name_en),
    animal: {
      nameKo: row.pet_name,
      nameEn: row.pet_name_en,
      species: value(data, 'species'),
      breedKo: value(data, 'breed'),
      breedEn: value(data, 'breed_en'),
      sex: value(data, 'sex'),
      birthDate: value(data, 'birth_date'),
      colorKo: value(data, 'color'),
      colorEn: value(data, 'color_en'),
      microchips: [
        row.microchip,
        ...(Array.isArray(row.microchip_extra) ? row.microchip_extra : []),
        value(data, 'microchip_secondary'),
        value(data, 'microchip_tertiary'),
      ].filter(Boolean),
    },
    guardian: {
      nameKo: row.customer_name,
      nameEn: row.customer_name_en,
      phone: value(data, 'phone'),
      email: value(data, 'email'),
      addressKo: value(data, 'address_kr'),
      addressEn: value(data, 'address_en'),
      postalCode: value(data, 'address_zipcode'),
    },
    destination: row.destination,
    departureDate: row.departure_date,
    inspectionApplications: records.flatMap((record, index) => {
      if (!record || typeof record !== 'object' || !record.date) return []
      const labCode = record.lab || caseLab || inferredLab(row.destination)
      return [{
        recordIndex: index,
        collectionDate: record.date,
        result: record.value ?? record.result ?? null,
        labCode,
        lab: LAB_LABELS[labCode] ?? labCode,
        status: inspectionStatus(data, index),
      }]
    }),
    rabiesVaccinations: Array.isArray(data.rabies_dates) ? data.rabies_dates : [],
    updatedAt: row.updated_at,
  }
}

const matches = rows.map(normalize)
const foundNames = new Set(matches.flatMap((row) => row.matchedNames))
console.log(JSON.stringify({
  requested: names,
  notFound: names.filter((name) => !foundNames.has(name)),
  matches,
}, null, 2))
