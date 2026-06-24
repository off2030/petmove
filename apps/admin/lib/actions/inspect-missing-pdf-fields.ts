'use server'

import { createClient } from '@petmove/auth/server'
import type { CaseRow } from '@petmove/domain'
import { flattenCaseForDestination, getEffectiveVaccineList } from '@petmove/domain'
import mappingsRaw from '@/data/pdf-field-mappings.json'
import {
  groupSourceKey,
  labelForSource,
  shouldSkipSourceForMissingCheck,
} from '@/lib/pdf-field-labels'

interface FieldMapping {
  source?: string | null
  transform?: string
  default?: string | number | boolean
  speciesOnly?: 'dog' | 'cat'
}
interface FormMapping {
  fields?: Record<string, FieldMapping>
}
const mappings = mappingsRaw as Record<string, FormMapping>

export interface CaseMissingFields {
  caseId: string
  petName: string | null
  missingLabels: string[]
}

export type InspectMissingPdfFieldsResult =
  | { ok: true; cases: CaseMissingFields[] }
  | { ok: false; error: string }

/** vaccine key (보여주기 설정) → case data 배열 키. */
const VACCINE_KEY_TO_DATA_KEY: Record<string, string> = {
  rabies: 'rabies_dates',
  rabies_titer: 'rabies_titer_records',
  general: 'general_vaccine_dates',
  civ: 'civ_dates',
  kennel: 'kennel_cough_dates',
  infectious_disease: 'infectious_disease_records',
  external_parasite: 'external_parasite_dates',
  internal_parasite: 'internal_parasite_dates',
  heartworm: 'heartworm_dates',
}
const DATA_KEY_TO_VACCINE_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(VACCINE_KEY_TO_DATA_KEY).map(([k, v]) => [v, k]),
)

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v).length === 0
  return false
}

const TITER_DATE_LABEL = '광견병 항체검사 검사일'
const TITER_LAB_LABEL = '광견병 항체검사 검사기관'

/**
 * 이 폼이 항체검사(rabies_titer_records) 의 어떤 서브칸을 실제로 출력하는지.
 * PDF 는 검사일·검사기관을 레코드별 칸으로 따로 찍으므로, 폼이 그 칸을 가질 때만
 * 해당 누락을 알린다. (검사일만 찍는 NZ·SGP·AnnexIII 등에서 검사기관 오탐 방지.)
 */
function renderedTiterProps(fields: Record<string, FieldMapping>): { date: boolean; lab: boolean } {
  let date = false
  let lab = false
  for (const fm of Object.values(fields)) {
    if (fm.source !== 'rabies_titer_records') continue
    const t = fm.transform ?? ''
    if (/\.lab$/.test(t)) lab = true // array[i].lab / if_multi[i].lab (lab_country 는 제외)
    else if (/\.date$/.test(t) || /^titer_date_asc\[/.test(t) || /^titer_part\[\d+\]:date_/.test(t)) date = true
  }
  return { date, lab }
}

/**
 * 항체검사 기록의 누락 라벨.
 *  - 기록(내용 있는 레코드)이 하나도 없으면 "광견병 항체 검사 기록" 전체 누락 1건.
 *  - 기록은 있는데 검사일/검사기관이 빈 레코드가 하나라도 있으면 각각 안내.
 *    값(value)만 입력하고 검사일·기관을 비워두면 배열 자체는 비어있지 않아
 *    기존 isEmpty(배열) 검사로는 놓쳤다 — 그래서 레코드 서브칸까지 본다.
 */
function missingTiterLabels(fields: Record<string, FieldMapping>, raw: unknown): string[] {
  const rendered = renderedTiterProps(fields)
  if (!rendered.date && !rendered.lab) return [] // 항체검사 칸이 없는 폼
  const records = Array.isArray(raw)
    ? raw.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r))
    : []
  // 검사를 했다고 볼 만한(어느 칸이든 입력된) 레코드만 완결성 검사.
  const meaningful = records.filter((r) =>
    ['date', 'lab', 'value', 'lab_country'].some((k) => !isEmpty(r[k])),
  )
  if (meaningful.length === 0) return [labelForSource('rabies_titer_records')]
  const out: string[] = []
  if (rendered.date && meaningful.some((r) => isEmpty(r.date))) out.push(TITER_DATE_LABEL)
  if (rendered.lab && meaningful.some((r) => isEmpty(r.lab))) out.push(TITER_LAB_LABEL)
  return out
}

/**
 * groupKey 가 가리키는 base 데이터를 caseRow/data 에서 읽는다.
 * pdf-fill.ts 의 readSource 와 동일한 polarity 의 단순화 버전 — empty 판정만 필요하므로
 * transform·composite·fallback 처리는 최소만. (정확히 폼에 출력되는 값을 알 필요 X.)
 */
function readGroupValue(
  groupKey: string,
  caseRow: CaseRow,
  data: Record<string, unknown>,
): unknown {
  switch (groupKey) {
    case 'customer_name':
      return caseRow.customer_name ?? data.customer_name ?? ''
    case 'customer_name_en': {
      // split 저장(data) 우선, legacy column fallback
      const first = ((data.customer_first_name_en as string | undefined) ?? '').trim()
      const last = ((data.customer_last_name_en as string | undefined) ?? '').trim()
      if (first || last) return `${first} ${last}`.trim()
      return (caseRow.customer_name_en ?? '') as string
    }
    case 'pet_name_en':
      return caseRow.pet_name_en ?? data.pet_name_en ?? ''
    case 'departure_date':
      return caseRow.departure_date ?? data.departure_date ?? ''
    case 'microchip':
      // microchip_combined 도 같은 base — primary 만 있으면 OK
      return caseRow.microchip ?? data.microchip ?? ''
    case 'address_zipcode': {
      const stored = String(data.address_zipcode ?? '').trim()
      if (stored) return stored
      // address_kr 의 (XXXXX) prefix fallback
      const krAddr = String(data.address_kr ?? '')
      const km = krAddr.match(/^\s*[([]?\s*(\d{5,6})\s*[)\]]?/)
      if (km) return km[1]
      return ''
    }
    case 'address_city': {
      const stored = String(data.address_city ?? '').trim()
      if (stored && !/^republic of korea$/i.test(stored)) return stored
      return ''
    }
    default:
      return data[groupKey]
  }
}

/**
 * formKey 와 caseIds 를 받아, 각 케이스마다 그 PDF 에 들어가야 하는 칸 중 비어있는
 * 항목의 한국어 라벨 목록을 반환한다. 발급 직전 사전 안내 다이얼로그용.
 *
 * 검사 룰:
 *  - mapping.source 없으면 검사 X (checkbox/default-only 등)
 *  - shouldSkipSourceForMissingCheck (standalone·lab-specific) → 검사 X
 *  - speciesOnly 미스매치 (강아지 vs 고양이) → 검사 X
 *  - 백신 source 가 보여주기 설정(extra_visible_fields)에서 OFF → 검사 X
 *  - 그 외 source 의 값이 빈 문자열·null·undefined·빈 배열·빈 객체 → 빈 필드
 *
 * default 값이 있어도 source 가 비어 있으면 알린다 (사용자 선택 ③B — default 도 알림).
 */
export async function inspectMissingPdfFields(
  formKey: string,
  caseIds: string[],
  destination: string | null,
): Promise<InspectMissingPdfFieldsResult> {
  const mapping = mappings[formKey]
  if (!mapping?.fields) return { ok: true, cases: [] }
  if (caseIds.length === 0) return { ok: true, cases: [] }

  const supabase = await createClient()
  const { data: rows, error } = await supabase
    .from('cases')
    .select('*')
    .in('id', caseIds)
  if (error) return { ok: false, error: error.message }

  // 입력 caseIds 순서 보존
  const byId = new Map((rows ?? []).map((r) => [(r as CaseRow).id, r as CaseRow]))
  const ordered = caseIds
    .map((id) => byId.get(id))
    .filter((c): c is CaseRow => !!c)

  const result: CaseMissingFields[] = []
  for (const raw of ordered) {
    // by_dest 평탄화 — generate-pdf.ts 와 동일
    const caseRow = flattenCaseForDestination(raw, destination)
    const data = (caseRow.data ?? {}) as Record<string, unknown>
    const species = String(data.species ?? '').toLowerCase()
    const extraFields = (data.extra_visible_fields as string[] | undefined) ?? []
    const allowedVaccines = new Set(
      getEffectiveVaccineList(destination ?? caseRow.destination, extraFields),
    )

    const missingLabels = new Set<string>()

    // 항체검사 기록은 배열 전체 유무가 아니라 폼이 출력하는 검사일·검사기관 칸 기준으로
    // 레코드별 누락까지 본다 (값만 입력하고 검사일·기관을 비운 레코드 포함).
    if (allowedVaccines.has('rabies_titer')) {
      for (const label of missingTiterLabels(mapping.fields, data.rabies_titer_records)) {
        missingLabels.add(label)
      }
    }

    for (const fm of Object.values(mapping.fields)) {
      if (!fm.source) continue
      if (fm.source === 'rabies_titer_records') continue // 위에서 별도 처리
      if (shouldSkipSourceForMissingCheck(fm.source)) continue
      if (fm.speciesOnly && fm.speciesOnly !== species) continue

      // 백신 source 가 보여주기 설정 OFF → PDF 에 안 들어가니 검사도 X
      const vaccineKey = DATA_KEY_TO_VACCINE_KEY[fm.source]
      if (vaccineKey && !allowedVaccines.has(vaccineKey)) continue

      const groupKey = groupSourceKey(fm.source)
      const rawValue = readGroupValue(groupKey, caseRow, data)
      if (!isEmpty(rawValue)) continue

      missingLabels.add(labelForSource(fm.source))
    }

    result.push({
      caseId: caseRow.id,
      petName: caseRow.pet_name ?? caseRow.pet_name_en ?? caseRow.customer_name ?? null,
      missingLabels: [...missingLabels].sort((a, b) => a.localeCompare(b, 'ko')),
    })
  }

  return { ok: true, cases: result }
}
