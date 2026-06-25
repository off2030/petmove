import type { CaseRow } from '@petmove/domain'

/**
 * 로컬(기기) 알림용 일정 수집 — 순수 함수(Capacitor 의존 X, 테스트 가능).
 *
 * 여기서는 "무엇을 언제 알릴지"만 계산하고, 실제 기기 예약은
 * `@/lib/native/local-reminders` 가 담당한다(네이티브 전용).
 *
 * v1 = 예약 리마인더만: 예정 날짜가 있는 카드(접종·검사·구충·임상검사·검역)에 대해
 *   - 하루 전(D-1) 오전 9시
 *   - 당일 오전 9시
 * 두 건씩 예약. 일본 수출 동물검역은 예약 시간(있으면)을 문구에 포함.
 *
 * 유효기간 만료 알림(백신·항체검사)·목적지별 신청 마감 알림은 후속 단계(reminders-deadline).
 */

export interface AppReminder {
  /** 안정 식별자 — 같은 일정은 항상 같은 id (재예약 시 중복 방지용). */
  id: string
  /** 알림이 울릴 로컬 시각 'YYYY-MM-DDTHH:mm:ss' (기기 로컬 타임존 기준). */
  fireAtIso: string
  title: string
  body: string
}

const FIRE_HOUR = 9 // 오전 9시
const APP_TITLE = '펫무브'

/** GLOBAL(목적지 무관) date_array 필드 → 항목 라벨. 실제+예정 키를 함께 본다. */
const GLOBAL_ARRAY_FIELDS: Array<{ keys: string[]; label: string }> = [
  { keys: ['rabies_dates', 'rabies_dates_scheduled'], label: '광견병 접종' },
  { keys: ['general_vaccine_dates', 'general_vaccine_dates_scheduled'], label: '종합백신 접종' },
  { keys: ['civ_dates'], label: '독감(CIV) 접종' },
  { keys: ['rabies_titer_records', 'rabies_titer_scheduled'], label: '광견병 항체 검사' },
  { keys: ['infectious_disease_records'], label: '전염병 검사' },
  { keys: ['external_parasite_dates'], label: '외부구충' },
  { keys: ['internal_parasite_dates'], label: '내부구충' },
]

/** GLOBAL 단일 date 필드 → 항목 라벨. */
const GLOBAL_DATE_FIELDS: Array<{ keys: string[]; label: string }> = [
  { keys: ['microchip_implant_date', 'microchip_implant_date_scheduled'], label: '마이크로칩 삽입' },
]

/**
 * 목적지별(by_dest) + top-level 단일 date 필드 → 항목 라벨.
 * timeKey 가 있으면 같은 스코프의 예약 시간을 문구에 포함(일본 수출 동물검역).
 */
const SCOPED_DATE_FIELDS: Array<{ key: string; label: string; timeKey?: string }> = [
  { key: 'vet_visit_date', label: '출국 전 임상검사' },
  { key: 'vet_visit_date_scheduled', label: '출국 전 임상검사' },
  { key: 'kr_export_quarantine_date', label: '한국 수출 동물검역' },
  { key: 'kr_import_quarantine_date', label: '한국 수입 동물검역' },
  { key: 'jp_export_quarantine_date', label: '일본 수출 동물검역', timeKey: 'jp_export_quarantine_time' },
  { key: 'jp_import_quarantine_date', label: '일본 수입 동물검역' },
  { key: 'th_export_quarantine_date', label: '태국 수출 동물검역' },
  { key: 'th_import_quarantine_date', label: '태국 수입 동물검역' },
  { key: 'ph_export_quarantine_date', label: '필리핀 수출 동물검역' },
  { key: 'ph_import_quarantine_date', label: '필리핀 수입 동물검역' },
  { key: 'ph_local_vet_visit_date', label: '필리핀 현지 동물병원 방문' },
  { key: 'eu_export_quarantine_date', label: '현지 검역증명서 발급' },
]

interface RawEvent {
  date: string // YYYY-MM-DD
  label: string
  time?: string // 한국식 표기(예: '오전 10시')
}

function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)
}

/** 반려동물 이름 표기: 받침 있으면 '콩이', 없으면 '마루'. 비었으면 '반려동물'. */
export function petLabel(petName: string | null | undefined): string {
  const n = (petName ?? '').trim()
  if (!n) return '반려동물'
  const code = n.charCodeAt(n.length - 1)
  if (code >= 0xac00 && code <= 0xd7a3) {
    const hasBatchim = (code - 0xac00) % 28 !== 0
    return hasBatchim ? `${n}이` : n
  }
  return n // 비한글 이름은 그대로
}

/** 'HH:mm' → '오전/오후 N시[ N분]'. 형식 아니면 null. */
function koreanTime(hhmm: unknown): string | null {
  if (typeof hhmm !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  const period = h < 12 ? '오전' : '오후'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return min === 0 ? `${period} ${h12}시` : `${period} ${h12}시 ${min}분`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 'YYYY-MM-DD' + dayOffset 일 + hour 시 → 로컬 'YYYY-MM-DDTHH:mm:ss'. */
function localDateTime(isoDate: string, hour: number, dayOffset: number): string {
  const [y, mo, d] = isoDate.slice(0, 10).split('-').map(Number)
  const dt = new Date(y, mo - 1, d + dayOffset, hour, 0, 0, 0)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}:00`
}

/** now 기준 로컬 오늘 'YYYY-MM-DD'. */
function localToday(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** 한 케이스에서 미래(>= 오늘) 예정 이벤트 수집(라벨+날짜 단위 dedup). */
function collectEventsForCase(caseRow: CaseRow, today: string): RawEvent[] {
  const data = asRecord(caseRow.data) ?? {}
  const out = new Map<string, RawEvent>() // key: label|date

  const add = (date: string, label: string, time?: string | null) => {
    if (!isIsoDate(date)) return
    const d = date.slice(0, 10)
    if (d < today) return // 지난 일정은 제외
    const key = `${label}|${d}`
    const prev = out.get(key)
    // 시간 정보가 있는 쪽을 우선 보존.
    if (!prev || (!prev.time && time)) out.set(key, { date: d, label, time: time ?? undefined })
  }

  // GLOBAL date_array
  for (const field of GLOBAL_ARRAY_FIELDS) {
    for (const key of field.keys) {
      const arr = data[key]
      if (!Array.isArray(arr)) continue
      for (const el of arr) {
        const rec = asRecord(el)
        if (rec && isIsoDate(rec.date)) add(rec.date as string, field.label)
      }
    }
  }

  // GLOBAL 단일 date
  for (const field of GLOBAL_DATE_FIELDS) {
    for (const key of field.keys) {
      if (isIsoDate(data[key])) add(data[key] as string, field.label)
    }
  }

  // 목적지별(by_dest) + top-level 스코프 스캔
  const byDest = asRecord(data.by_dest)
  const scopes: Array<Record<string, unknown>> = [data]
  if (byDest) {
    for (const v of Object.values(byDest)) {
      const rec = asRecord(v)
      if (rec) scopes.push(rec)
    }
  }
  for (const scope of scopes) {
    for (const field of SCOPED_DATE_FIELDS) {
      const val = scope[field.key]
      if (!isIsoDate(val)) continue
      const time = field.timeKey ? koreanTime(scope[field.timeKey]) : null
      add(val as string, field.label, time)
    }
  }

  return [...out.values()]
}

/** 예정 이벤트 → 알림 2건(D-1 9시, 당일 9시). now 이전 발사 시각은 제외. */
function eventToReminders(caseRow: CaseRow, ev: RawEvent, pet: string, now: Date): AppReminder[] {
  const nowMs = now.getTime()
  const timeClause = ev.time ? ` 예약 시간은 ${ev.time}예요.` : ''
  const out: AppReminder[] = []

  const d1Fire = localDateTime(ev.date, FIRE_HOUR, -1)
  if (new Date(d1Fire).getTime() > nowMs) {
    out.push({
      id: `${caseRow.id}|${ev.label}|${ev.date}|d1`,
      fireAtIso: d1Fire,
      title: APP_TITLE,
      body: `내일은 ${pet} ${ev.label} 예정일이에요 🐾${timeClause}`,
    })
  }

  const dayFire = localDateTime(ev.date, FIRE_HOUR, 0)
  if (new Date(dayFire).getTime() > nowMs) {
    out.push({
      id: `${caseRow.id}|${ev.label}|${ev.date}|day`,
      fireAtIso: dayFire,
      title: APP_TITLE,
      body: `오늘은 ${pet} ${ev.label} 예정일이에요${timeClause}`,
    })
  }

  return out
}

/** 모든 케이스에서 예약 리마인더 수집. fireAt 오름차순 정렬. */
export function collectReminders(cases: CaseRow[], now: Date): AppReminder[] {
  const today = localToday(now)
  const all: AppReminder[] = []
  for (const c of cases) {
    const pet = petLabel(c.pet_name)
    for (const ev of collectEventsForCase(c, today)) {
      all.push(...eventToReminders(c, ev, pet, now))
    }
  }
  all.sort((a, b) => a.fireAtIso.localeCompare(b.fireAtIso))
  return all
}
