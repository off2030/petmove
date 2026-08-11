/**
 * 광견병 항체 검사·전염병검사 기관 설정. client-safe 상수/타입.
 * 실제 load/save 는 @/lib/inspection-config 에서 (서버 전용).
 */

export interface InspectionLabRule {
  /** 이 규칙이 적용되는 목적지 국가(1개 이상). */
  countries: string[]
  /** 검사기관(1개 이상). 여러 개면 해당 국가 케이스에 검사기관별로 기록이 하나씩 생성됨. */
  labs: string[]
}

export interface InspectionLabOption {
  value: string
  label: string
}

export interface InspectionConfig {
  /** 광견병 항체 검사 기본 검사기관. 규칙 매칭 없을 때 사용. */
  titerDefault: string
  /** 광견병 항체 검사 국가별 규칙. */
  titerRules: InspectionLabRule[]
  /** 전염병검사 국가별 규칙. 기본 검사기관 개념 없음 — 매칭되지 않으면 lab 미지정. */
  infectiousRules: InspectionLabRule[]
  /** 광견병 항체 검사 사용자 정의 기관(`TITER_LABS` 에 없는 기관). 없으면 빈 배열/undef. */
  customTiterLabs?: InspectionLabOption[]
  /** 전염병검사 사용자 정의 기관(`INFECTIOUS_LABS` 에 없는 기관). 없으면 빈 배열/undef. */
  customInfectiousLabs?: InspectionLabOption[]
  /**
   * 설정에서 "삭제"한 내장 기관(식별자 목록) — 선택지에서만 빠지고,
   * 과거 케이스에 저장된 값의 표시는 유지된다 (2026-08-06 기관 전체 CRUD).
   */
  hiddenTiterLabs?: string[]
  hiddenInfectiousLabs?: string[]
  /** 내장 기관 표시명 수정(식별자 → 새 표시명). 식별자는 불변 — 서식·규칙 연결 보존. */
  titerLabelOverrides?: Record<string, string>
  infectiousLabelOverrides?: Record<string, string>
}

export const TITER_LABS: { value: string; label: string }[] = [
  { value: 'krsl', label: 'KRSL' },
  { value: 'apqa_seoul', label: 'APQA Seoul' },
  { value: 'apqa_hq', label: 'APQA HQ' },
  { value: 'apqa_eu', label: 'APQA EU' },
  { value: 'ksvdl_r', label: 'KSVDL-R' },
]

export const INFECTIOUS_LABS: { value: string; label: string }[] = [
  { value: 'ksvdl', label: 'KSVDL' },
  { value: 'vbddl', label: 'VBDDL' },
  { value: 'apqa_hq', label: 'APQA HQ' },
  { value: 'arc_ovi', label: 'ARC-OVI' },
]

/** 유럽연합(EU) 27개 회원국 — 기본 매핑 구성용 목록. */
export const EU_COUNTRIES = [
  '독일', '프랑스', '이탈리아', '스페인', '네덜란드', '벨기에', '오스트리아',
  '스웨덴', '덴마크', '핀란드', '폴란드', '체코', '헝가리', '포르투갈',
  '그리스', '루마니아', '불가리아', '크로아티아', '슬로바키아', '슬로베니아',
  '리투아니아', '라트비아', '에스토니아', '룩셈부르크', '몰타', '키프로스',
  '아일랜드',
]

/**
 * 기본 설정 = 로잔 운영 상태 스냅샷 (2026-08-06 사용자 지시 — "기본값을 지금 상태로").
 * - 광견병: EU 27개국 + 영국·스위스·노르웨이가 한 행(별도 행 없음). 튀르키예 매핑 없음
 *   — 튀르키예행은 기본 검사기관(krsl)으로 떨어진다.
 * - 전염병: 호주·뉴질랜드·남아공. 뉴질랜드는 labs 여러 개(이중 검사) — VBDDL 먼저.
 */
export const DEFAULT_INSPECTION_CONFIG: InspectionConfig = {
  titerDefault: 'krsl',
  titerRules: [
    { countries: ['싱가포르'], labs: ['ksvdl_r'] },
    { countries: ['일본'], labs: ['apqa_seoul'] },
    { countries: ['하와이'], labs: ['apqa_seoul'] },
    { countries: [...EU_COUNTRIES, '영국', '스위스', '노르웨이'], labs: ['apqa_eu'] },
  ],
  infectiousRules: [
    { countries: ['호주'], labs: ['ksvdl'] },
    { countries: ['뉴질랜드'], labs: ['vbddl', 'apqa_hq'] },
    { countries: ['남아프리카공화국'], labs: ['arc_ovi'] },
  ],
}

/**
 * 저장된(persisted) 전염병 규칙 + 아직 등장하지 않은 내장 기본 규칙 병합.
 *
 * DB 에 inspection_config 가 이미 저장된 조직은 DEFAULT_INSPECTION_CONFIG 에 새 국가가
 * 추가돼도 반영되지 않는다(load 시 persisted 우선). 그래서 **읽는 쪽마다** 이 보강을
 * 거쳐야 한다 — 설정 로드(apps/admin/lib/inspection-config.ts)뿐 아니라 자동채움 엔진도
 * 마찬가지다. 엔진이 이걸 빼먹어서 남아공 케이스의 전염병검사가 `lab: null` 로
 * 채워졌다(2026-08-11 수정).
 *
 * persisted 규칙에 한 번도 등장하지 않은 국가의 기본 규칙만 합쳐, 조직이 의도적으로
 * 편집·삭제한 기존 규칙은 건드리지 않는다.
 */
export function mergeMissingInfectiousDefaults(rules: InspectionLabRule[]): InspectionLabRule[] {
  const covered = new Set(rules.flatMap(r => r.countries))
  const missing = DEFAULT_INSPECTION_CONFIG.infectiousRules.filter(
    dr => dr.countries.every(c => !covered.has(c)),
  )
  return missing.length > 0 ? [...rules, ...missing] : rules
}

/**
 * organization_settings.value.infectiousRules 원본(unknown) → 사용 가능한 규칙 배열.
 * 설정 행 자체가 없는 조직(신규 SaaS org)은 기본 규칙 전체를 쓴다.
 */
export function normalizeInfectiousRules(raw: unknown): InspectionLabRule[] {
  const parsed = Array.isArray(raw)
    ? raw.filter(
        (r): r is InspectionLabRule =>
          !!r &&
          typeof r === 'object' &&
          Array.isArray((r as { countries?: unknown }).countries) &&
          Array.isArray((r as { labs?: unknown }).labs),
      )
    : []
  return mergeMissingInfectiousDefaults(parsed)
}

/**
 * 효과 기관 목록 — 내장 기관(숨김 제외, 표시명 override 반영) + 사용자 정의 기관.
 * **선택지의 단일 출처**: 설정 화면·케이스 상세·검사 탭이 모두 이걸 쓴다 (2026-08-06).
 */
function buildEffectiveLabs(
  defaults: InspectionLabOption[],
  hidden: string[] | undefined,
  overrides: Record<string, string> | undefined,
  customs: InspectionLabOption[] | undefined,
): InspectionLabOption[] {
  const hiddenSet = new Set(hidden ?? [])
  const ov = overrides ?? {}
  return [
    ...defaults
      .filter((l) => !hiddenSet.has(l.value))
      .map((l) => ({ value: l.value, label: ov[l.value] ?? l.label })),
    ...(customs ?? []),
  ]
}

/** 광견병 항체 검사 — 선택 가능한 기관 목록. */
export function effectiveTiterLabs(config: InspectionConfig): InspectionLabOption[] {
  return buildEffectiveLabs(TITER_LABS, config.hiddenTiterLabs, config.titerLabelOverrides, config.customTiterLabs)
}

/** 전염병검사 — 선택 가능한 기관 목록. */
export function effectiveInfectiousLabs(config: InspectionConfig): InspectionLabOption[] {
  return buildEffectiveLabs(INFECTIOUS_LABS, config.hiddenInfectiousLabs, config.infectiousLabelOverrides, config.customInfectiousLabs)
}

/**
 * 표시용 전체 기관 목록 — 숨긴 내장 기관까지 포함(override 라벨 반영).
 * 과거 케이스에 저장된 기관 값의 라벨을 잃지 않기 위한 lookup 용. 선택지에는 쓰지 말 것.
 */
export function allLabOptions(config: InspectionConfig): InspectionLabOption[] {
  const ovT = config.titerLabelOverrides ?? {}
  const ovI = config.infectiousLabelOverrides ?? {}
  const out: InspectionLabOption[] = []
  const seen = new Set<string>()
  const push = (value: string, label: string) => {
    if (seen.has(value)) return
    seen.add(value)
    out.push({ value, label })
  }
  for (const l of TITER_LABS) push(l.value, ovT[l.value] ?? l.label)
  for (const l of INFECTIOUS_LABS) push(l.value, ovI[l.value] ?? l.label)
  for (const l of config.customTiterLabs ?? []) push(l.value, l.label)
  for (const l of config.customInfectiousLabs ?? []) push(l.value, l.label)
  return out
}

/**
 * 목적지 문자열(복수 콤마 구분 가능)에서 첫 매칭 규칙의 labs 반환. 매칭 없으면 [].
 */
export function resolveInspectionLabs(
  destination: string | null | undefined,
  rules: InspectionLabRule[],
): string[] {
  if (!destination) return []
  const dests = destination.split(',').map(s => s.trim()).filter(Boolean)
  for (const d of dests) {
    for (const r of rules) {
      if (r.countries.includes(d)) return [...r.labs]
    }
  }
  return []
}

/**
 * 광견병항체 호환 — 단일 lab 반환. 규칙 매칭 없으면 default.
 * (타이터는 관례적으로 국가당 한 기관만 쓰므로 첫 lab 사용.)
 */
export function resolveTiterLab(
  destination: string | null | undefined,
  rules: InspectionLabRule[],
  defaultLab: string,
): string {
  const labs = resolveInspectionLabs(destination, rules)
  return labs[0] ?? defaultLab
}
