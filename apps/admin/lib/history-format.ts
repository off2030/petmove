/**
 * 변경 이력(case_history) 을 사람이 읽을 수 있는 형태로 바꾸는 순수 헬퍼.
 *
 * DB 에 쌓이는 이력은 저장 형식 그대로다 — 필드는 `address_sigungu` 같은 원본 키,
 * 값은 data storage 면 JSON.stringify 결과(`"2026-09-03"`)다. 그대로 보여주면
 * 사용자가 무슨 변경인지 알아볼 수 없어서, 여기서 라벨·값·묶음을 모두 번역한다.
 */
import {
  DESTINATION_SPEC,
  EXTRA_FIELD_DEFS,
  REGULAR_COLUMN_SPECS,
  fieldDefToSpec,
  type FieldDefinition,
  type FieldSpec,
} from '@petmove/domain'

export interface HistoryEntry {
  id: string
  field_key: string
  field_storage: 'column' | 'data'
  old_value: string | null
  new_value: string | null
  changed_at: string
}

/**
 * field_definitions 에도 EXTRA_FIELD_DEFS 에도 없는 키들 — 주소 검색이 파생 저장하는
 * 컴포넌트, 상세페이지의 반복 접종 필드처럼 UI 가 라벨 없이 data 로만 쓰는 키.
 */
const FALLBACK_KEY_LABELS: Record<string, string> = {
  address_zipcode: '우편번호',
  address_detail_kr: '상세주소',
  address_sido: '주소 시·도',
  address_sigungu: '주소 시·군·구',
  address_city: '영문주소 도시',
  address_province: '영문주소 도·주',
  address_country: '영문주소 국가',
  rabies_dates: '광견병 접종',
  general_vaccine_dates: '종합백신 접종',
  general_vaccine: '종합백신 접종',
  civ_dates: '독감 접종',
  kennel_cough_dates: '켄넬코프 접종',
  covid_dates: '코로나 접종',
  external_parasite_dates: '외부구충',
  internal_parasite_dates: '내부구충',
  heartworm_dates: '심장사상충',
}

export interface FieldMeta {
  /** 사람이 읽는 이름. 어느 소스에서도 못 찾으면 원본 키. */
  label: string
  /** by_dest 이력이면 그 여행지, 아니면 null. */
  destination: string | null
  /** select 필드면 저장값 → 한글 라벨. */
  optionLabels: Record<string, string> | null
  /** 원본 저장 키 (툴팁용). */
  rawKey: string
  /** 라벨을 못 찾아 원본 키를 그대로 쓴 경우. */
  unknown: boolean
}

/** `by_dest:{여행지}:{키}` 인코딩 해제. 형식이 아니면 null. */
function parseByDestKey(fieldKey: string): { destination: string; key: string } | null {
  if (!fieldKey.startsWith('by_dest:')) return null
  const rest = fieldKey.slice('by_dest:'.length)
  const sep = rest.indexOf(':')
  if (sep <= 0 || sep >= rest.length - 1) return null
  return { destination: rest.slice(0, sep), key: rest.slice(sep + 1) }
}

function optionsOf(spec: FieldSpec): Record<string, string> | null {
  if (!spec.options || spec.options.length === 0) return null
  return Object.fromEntries(spec.options.map((o) => [o.value, o.label_ko]))
}

/**
 * fieldDefs 로 키 → 라벨 해석기를 만든다.
 * buildFieldSpecs 대신 직접 조립하는 이유: 비활성(is_active=false) 필드도 과거 이력에는
 * 남아 있어서, 필터링하면 그 항목만 원본 키로 떨어진다.
 */
export function buildFieldMetaResolver(fieldDefs: FieldDefinition[]) {
  const specByKey = new Map<string, FieldSpec>()
  for (const s of [...REGULAR_COLUMN_SPECS, DESTINATION_SPEC, ...fieldDefs.map(fieldDefToSpec)]) {
    if (!specByKey.has(s.key)) specByKey.set(s.key, s)
  }

  return function resolve(fieldKey: string): FieldMeta {
    const byDest = parseByDestKey(fieldKey)
    const key = byDest ? byDest.key : fieldKey
    const destination = byDest ? byDest.destination : null

    const spec = specByKey.get(key)
    if (spec) {
      return { label: spec.label, destination, optionLabels: optionsOf(spec), rawKey: key, unknown: false }
    }
    const extra = EXTRA_FIELD_DEFS[key]
    if (extra) {
      const optionLabels = extra.options
        ? Object.fromEntries(extra.options.map((o) => [o.value, o.label]))
        : null
      return { label: extra.label, destination, optionLabels, rawKey: key, unknown: false }
    }
    const fallback = FALLBACK_KEY_LABELS[key]
    if (fallback) {
      return { label: fallback, destination, optionLabels: null, rawKey: key, unknown: false }
    }
    return { label: key, destination, optionLabels: null, rawKey: key, unknown: true }
  }
}

/** 저장된 이력 문자열을 원래 값으로. data storage 는 JSON.stringify 된 상태다. */
function parseStored(storage: 'column' | 'data', raw: string | null): unknown {
  if (raw === null || raw === '') return null
  if (storage === 'column') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function renderValue(v: unknown, meta: FieldMeta | null): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'boolean') return v ? '예' : '아니오'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return meta?.optionLabels?.[v] ?? v
  if (Array.isArray(v)) {
    if (v.length === 0) return null
    // 접종 이력처럼 [{date, ...}] 인 배열은 날짜만 뽑아 나열.
    const parts = v
      .map((item) => {
        if (item && typeof item === 'object') {
          const d = (item as Record<string, unknown>).date
          return typeof d === 'string' && d ? d : null
        }
        return renderValue(item, null)
      })
      .filter((s): s is string => !!s)
    return parts.length > 0 ? parts.join(', ') : `${v.length}개 항목`
  }
  if (typeof v === 'object') {
    const n = Object.keys(v as Record<string, unknown>).length
    return n > 0 ? `${n}개 항목` : null
  }
  return String(v)
}

/** 이력 값 한 칸을 표시 문자열로. 빈 값이면 null (호출부가 '없음' 등으로 렌더). */
export function formatHistoryValue(
  storage: 'column' | 'data',
  raw: string | null,
  meta: FieldMeta,
): string | null {
  return renderValue(parseStored(storage, raw), meta)
}

export type ChangeKind = 'added' | 'removed' | 'changed'

export function changeKindOf(entry: HistoryEntry): ChangeKind {
  if (entry.old_value === null || entry.old_value === '') return 'added'
  if (entry.new_value === null || entry.new_value === '') return 'removed'
  return 'changed'
}

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  added: '입력',
  removed: '지움',
  changed: '수정',
}

export interface HistoryGroup {
  /** 묶음 식별자 (분 단위). */
  bucket: string
  /** 대표 시각 = 묶음에서 가장 최근 변경. */
  changedAt: string
  /**
   * 묶음에서 가장 오래된 항목. '여기로 되돌리기' 는 이 항목을 기준으로 호출해야
   * 묶음 전체(+ 그 이후)가 함께 되돌아간다 — restoreToHistoryPoint 는 gte 범위다.
   */
  anchor: HistoryEntry
  entries: HistoryEntry[]
}

function minuteBucket(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`
}

/**
 * 같은 분에 일어난 변경을 한 묶음으로. 주소 한 번 입력이 6개 키를 각각 저장해서
 * 목록이 같은 내용으로 도배되던 걸 '한 번의 변경'으로 읽히게 한다.
 * 입력은 최신순(내림차순) 정렬을 전제로 한다.
 */
export function groupHistoryEntries(entries: HistoryEntry[]): HistoryGroup[] {
  const groups: HistoryGroup[] = []
  for (const e of entries) {
    const bucket = minuteBucket(e.changed_at)
    const last = groups[groups.length - 1]
    if (last && last.bucket === bucket) {
      last.entries.push(e)
      last.anchor = e
    } else {
      groups.push({ bucket, changedAt: e.changed_at, anchor: e, entries: [e] })
    }
  }
  return groups
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}

export function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** '오늘' · '어제' · '8월 24일 (일)'. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (sameDay(d, now)) return '오늘'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(d, yesterday)) return '어제'
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`
  return d.getFullYear() === now.getFullYear() ? base : `${d.getFullYear()}년 ${base}`
}

/** '18:33'. */
export function timeLabel(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
