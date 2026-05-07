/**
 * 공유 — 카테고리별 필드 좌표의 단일 진실 공급원.
 *
 * 평탄 descriptor 배열을 만드는 buildShareFieldDescriptors 가 좌표(category·subgroup·groupOrder·order)
 * 의 유일한 권위. 그 위에 얇은 헬퍼 둘:
 *   - groupShareDescriptorsByCategory : 다이얼로그·프리셋·수신자 폼 UI 의 카테고리 × 블록 구조
 *   - buildShareFieldLayout            : 위 두 함수의 합성 wrapper (호환용)
 *
 * 사용처:
 *   1. 공유 다이얼로그          (caseScoped: { allowedFields, vaccineApplies, speciesValue })
 *   2. 설정 > 공유 프리셋 편집기 (caseScoped: null — 모든 필터 비활성)
 *   3. 수신자 폼 (server action) (caseScoped: null — fieldKeys 화이트리스트만 적용)
 *      buildShareFieldDescriptors 의 descriptor.source 메타로 ShareFieldSpec 변환.
 *   4. 케이스 상세 추가정보 영역 (caseScoped: { allowedFields, vaccineApplies, speciesValue })
 *      추가정보 카테고리만 추출해 ExtraSegment 변환.
 *
 * 좌표는 DB 에 저장하지 않음 — fieldKeys 만 저장하고 매번 같은 입력으로 같은 좌표를 재계산.
 * 따라서 destination/필드 정의가 바뀌어도 모든 화면이 자동으로 함께 따라간다.
 */
import {
  EXTRA_FIELD_DEFS,
  extraFieldMatchesSpecies,
  type DestinationExtraFieldEntry,
  type ExtraFieldDef,
} from '@petmove/domain'
import { buildFieldSpecs as buildAllFieldSpecs } from '@/lib/fields'
import type { FieldDefinition } from '@/lib/supabase/types'
import {
  SHARE_COLUMN_META,
  SHARE_EXCLUDED_KEYS,
  SHARE_HIDDEN_BY_VACCINE_GROUPS,
  SHARE_RECIPIENT_LABEL_OVERRIDE,
  SHARE_VACCINE_GROUPS,
  type ShareColumnFieldMeta,
  type ShareVaccineGroup,
} from '@/lib/share-links-types'

export const SHARE_CATEGORIES = ['고객정보', '동물정보', '절차정보', '추가정보'] as const
export type ShareCategory = typeof SHARE_CATEGORIES[number]

/** field_definitions.group_name → 4-카테고리. 메모/할일 등은 매핑 없음(자동 제외). */
export const SHARE_FIELD_DEF_CATEGORY: Record<string, ShareCategory> = {
  '기본정보': '고객정보',
  '동물정보': '동물정보',
  '절차/식별': '절차정보',
  '절차/예방접종': '절차정보',
  '절차/검사': '절차정보',
  '절차/구충': '절차정보',
}

/** 정규 컬럼 키 → 카테고리. (destination 은 외부 수신자 입력 대상 아님이라 매핑 없음.) */
export const SHARE_COLUMN_CATEGORY: Record<string, ShareCategory> = {
  customer_name:    '고객정보',
  customer_name_en: '고객정보',
  pet_name:         '동물정보',
  pet_name_en:      '동물정보',
  microchip:        '동물정보',
  departure_date:   '절차정보',
}

/** fields.ts buildFieldSpecs 의 그룹명 → 카테고리. (기타정보=메모는 매핑 없음 → 다이얼로그에서 미노출.) */
export const SHARE_SPEC_GROUP_TO_CATEGORY: Record<string, ShareCategory> = {
  '고객정보': '고객정보',
  '동물정보': '동물정보',
  '절차정보': '절차정보',
}

/** 합성 백신 그룹 키 → vaccine entry 키 (vaccineApplies 의 입력). */
const SYNTHETIC_VACCINE_KEY: Record<string, string> = {
  __rabies: 'rabies',
  __comprehensive: 'general',
  __civ: 'civ',
  __kennel_cough: 'kennel',
  __external_parasite: 'external_parasite',
  __internal_parasite: 'internal_parasite',
}

/** jsonb 필드 키 → vaccine entry 키 — 합성 그룹이 흡수하지 않은 키도 백신 필터로 가려야 할 때. */
const FIELD_TO_VACCINE_KEY: Record<string, string> = {
  rabies_1: 'rabies', rabies_2: 'rabies', rabies_3: 'rabies', rabies_dates: 'rabies',
  rabies_titer_date: 'rabies_titer', rabies_titer_value: 'rabies_titer',
  rabies_titer_test_date: 'rabies_titer', rabies_titer: 'rabies_titer',
  comprehensive: 'general', comprehensive_2: 'general',
  general_vaccine: 'general', general_vaccine_dates: 'general',
  civ: 'civ', civ_dates: 'civ', civ_2: 'civ',
  kennel_cough_dates: 'kennel',
  heartworm: 'heartworm', heartworm_test: 'heartworm', heartworm_dates: 'heartworm',
  infectious_disease: 'infectious_disease',
  infectious_disease_test: 'infectious_disease',
  external_parasite_1: 'external_parasite',
  external_parasite_2: 'external_parasite',
  external_parasite_3: 'external_parasite',
  internal_parasite_1: 'internal_parasite',
  internal_parasite_2: 'internal_parasite',
}

/** 추가정보(EXTRA) 카테고리에서 제외할 키 — 다른 카테고리 전용. */
const EXTRA_EXCLUDED_FROM_EXTRA = new Set(['email'])

/**
 * descriptor 의 source — ShareFieldSpec 변환 시 storage·type·options·current_value 의 단일 근거.
 * server action 이 fieldDefs / EXTRA_FIELD_DEFS / VACCINE_GROUPS 를 다시 lookup 하지 않아도 되도록.
 */
export type ShareDescriptorSource =
  | { kind: 'column'; meta: ShareColumnFieldMeta }
  | { kind: 'data'; def: FieldDefinition }
  | { kind: 'synthetic-vaccine'; group: ShareVaccineGroup }
  | { kind: 'extra'; def: ExtraFieldDef; useShortLabel: boolean }

/** 평탄 descriptor — 좌표가 박힌 단일 권위 단위. 출력은 (groupOrder, order) 사전식 정렬. */
export interface ShareFieldDescriptor {
  id: string
  key: string
  label: string
  category: ShareCategory
  subgroup?: string
  groupOrder: number
  order: number
  source: ShareDescriptorSource
}

export interface ShareFieldLayoutBlock {
  subgroup?: string
  fields: { id: string; key: string; label: string }[]
}

export interface ShareFieldLayoutCategory {
  category: ShareCategory
  blocks: ShareFieldLayoutBlock[]
}

export interface ShareFieldLayoutOptions {
  fieldDefs: FieldDefinition[]
  /** Destination tab/scope used to resolve destination-dependent fields. */
  destinationScope?: string | null
  /** 추가정보 영역에 표시할 destination 별 entries (조직 override 적용된 effective). */
  extraFieldEntries: DestinationExtraFieldEntry[]
  /**
   * 케이스 단위 빌드 vs 조직 단위 빌드 분기.
   *  - 있음: 절차정보 destination filter, vaccine 필터, species 필터 모두 적용.
   *  - null: 모든 필터 비활성 — 프리셋 편집기·서버 측 ShareFieldSpec 변환 등 fieldKeys
   *    화이트리스트만 쓰는 경우. 케이스 species 가 발급 후 변경돼도 fieldKeys 슬롯이 사라지지 않게.
   */
  caseScoped: {
    allowedFields: Set<string>
    vaccineApplies: (vaccineKey: string) => boolean
    speciesValue: string
  } | null
}

/**
 * 좌표가 박힌 평탄 descriptor[] — 모든 화면이 같은 좌표를 공유하는 단일 진실 공급원.
 * 결과는 (groupOrder, order) 사전식으로 정렬되어 있어 그대로 순회하면 카테고리·서브그룹이 자연 인접.
 */
export function buildShareFieldDescriptors(
  opts: ShareFieldLayoutOptions,
): ShareFieldDescriptor[] {
  const { fieldDefs, destinationScope, extraFieldEntries, caseScoped } = opts
  const scope = normalizeShareScope(destinationScope)
  const speciesValue = caseScoped?.speciesValue ?? ''
  const out: ShareFieldDescriptor[] = []

  // 1) 컬럼 + jsonb 필드 — case-detail 과 동일한 좌표계(REGULAR_COLUMN_SPECS + field_definitions).
  const fieldDefByKey = new Map<string, FieldDefinition>()
  for (const d of fieldDefs) fieldDefByKey.set(d.key, d)
  for (const spec of buildAllFieldSpecs(fieldDefs)) {
    if (SHARE_EXCLUDED_KEYS.has(spec.key)) continue
    if (SHARE_HIDDEN_BY_VACCINE_GROUPS.has(spec.key)) continue
    const category = SHARE_SPEC_GROUP_TO_CATEGORY[spec.group]
    if (!category) continue
    if (caseScoped) {
      // 절차정보만 destination filter, 고객·동물 정보는 모든 케이스 공통이라 필터 없음.
      if (category === '절차정보' && !caseScoped.allowedFields.has(spec.key)) continue
      const vaccineKey = FIELD_TO_VACCINE_KEY[spec.key]
      if (vaccineKey && !caseScoped.vaccineApplies(vaccineKey)) continue
    }
    const label = SHARE_RECIPIENT_LABEL_OVERRIDE[spec.key] ?? spec.label
    if (spec.storage === 'column') {
      const meta = SHARE_COLUMN_META[spec.key]
      if (!meta) continue
      out.push({
        id: makeShareFieldId(scope, category, spec.key, dSourceKindForStorage(spec.storage)),
        key: spec.key, label, category,
        groupOrder: spec.groupOrder, order: spec.order,
        source: { kind: 'column', meta },
      })
    } else {
      const def = fieldDefByKey.get(spec.key)
      if (!def) continue
      out.push({
        id: makeShareFieldId(scope, category, spec.key, 'data'),
        key: spec.key, label, category,
        groupOrder: spec.groupOrder, order: spec.order,
        source: { kind: 'data', def },
      })
    }
  }

  // 2) 합성 백신 그룹 — 절차정보에 (groupOrder=2, order=display_order) 좌표.
  for (const g of SHARE_VACCINE_GROUPS) {
    if (caseScoped) {
      const vk = SYNTHETIC_VACCINE_KEY[g.key]
      if (vk && !caseScoped.vaccineApplies(vk)) continue
    }
    out.push({
      id: makeShareFieldId(scope, '절차정보', g.key, 'synthetic-vaccine'),
      key: g.key, label: g.label, category: '절차정보',
      groupOrder: 2, order: g.display_order,
      source: { kind: 'synthetic-vaccine', group: g },
    })
  }

  // 3) destination 별 추가 필드 — 같은 group 메타가 2개 이상이면 subgroup + shortLabel.
  const groupCounts = new Map<string, number>()
  for (const entry of extraFieldEntries) {
    if (caseScoped && !extraFieldMatchesSpecies(entry, speciesValue)) continue
    const def = EXTRA_FIELD_DEFS[entry.key]
    const g = def?.group
    if (g) groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1)
  }
  let extraOrder = 0
  for (const entry of extraFieldEntries) {
    if (EXTRA_EXCLUDED_FROM_EXTRA.has(entry.key)) continue
    if (caseScoped && !extraFieldMatchesSpecies(entry, speciesValue)) continue
    const def = EXTRA_FIELD_DEFS[entry.key]
    if (!def) continue
    const useGroup = !!def.group && (groupCounts.get(def.group) ?? 0) >= 2
    // 일본은 항공편 필드가 많아 shortLabel(날짜/시간/항공편명)이 더 가독성 좋음.
    // 태국/미국 등은 같은 그룹이어도 풀라벨(도착일/도착시간)을 그대로 노출.
    // scope 는 한글('일본') 또는 영문('japan') 둘 다 들어올 수 있어 둘 다 매칭.
    const isJapan = scope === 'japan' || scope.includes('일본')
    const useShortLabel = useGroup && !!def.shortLabel && isJapan
    const label = useShortLabel
      ? (def.shortLabel as string)
      : (SHARE_RECIPIENT_LABEL_OVERRIDE[entry.key] ?? def.label)
    out.push({
      id: makeShareFieldId(scope, '추가정보', entry.key, 'extra'),
      key: entry.key, label,
      category: '추가정보',
      subgroup: useGroup ? def.group : undefined,
      groupOrder: 99,
      order: extraOrder++,
      source: { kind: 'extra', def, useShortLabel },
    })
  }

  // 카테고리 무관 통합 정렬 — 카테고리는 groupOrder 로 자연 분리됨.
  out.sort((a, b) => {
    if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder
    return a.order - b.order
  })
  return out
}

/**
 * descriptor[] 를 카테고리 × 블록(연속 같은 subgroup 묶음) 구조로 그룹화.
 * 다이얼로그·프리셋·수신자 폼의 칩/입력 UI 가 사용.
 */
export function groupShareDescriptorsByCategory(
  descriptors: ShareFieldDescriptor[],
): ShareFieldLayoutCategory[] {
  const buckets = new Map<ShareCategory, ShareFieldDescriptor[]>()
  for (const d of descriptors) {
    const arr = buckets.get(d.category) ?? []
    arr.push(d)
    buckets.set(d.category, arr)
  }
  const result: ShareFieldLayoutCategory[] = []
  for (const c of SHARE_CATEGORIES) {
    const items = buckets.get(c)
    if (!items?.length) continue
    const blocks: ShareFieldLayoutBlock[] = []
    for (const d of items) {
      const last = blocks[blocks.length - 1]
      if (last && last.subgroup === d.subgroup) {
        last.fields.push({ id: d.id, key: d.key, label: d.label })
      } else {
        blocks.push({ subgroup: d.subgroup, fields: [{ id: d.id, key: d.key, label: d.label }] })
      }
    }
    result.push({ category: c, blocks })
  }
  return result
}

/** 호환 wrapper — 다이얼로그·프리셋이 호출하는 진입점. */
export function buildShareFieldLayout(
  opts: ShareFieldLayoutOptions,
): ShareFieldLayoutCategory[] {
  return groupShareDescriptorsByCategory(buildShareFieldDescriptors(opts))
}

function normalizeShareScope(scope: string | null | undefined): string {
  const trimmed = scope?.trim()
  return trimmed ? trimmed.toLowerCase() : 'default'
}

function fieldScope(category: ShareCategory, sourceKind: string, scope: string): string {
  if (category === '고객정보' || category === '동물정보') return 'global'
  if (sourceKind === 'extra' || sourceKind === 'synthetic-vaccine') return scope
  return category === '절차정보' ? scope : 'global'
}

function makeShareFieldId(
  scope: string,
  category: ShareCategory,
  key: string,
  sourceKind: string,
): string {
  return `${fieldScope(category, sourceKind, scope)}:${sourceKind}:${key}`
}

function dSourceKindForStorage(storage: 'column' | 'data'): string {
  return storage
}
