import {
  buildCaseJourneyContext,
  deriveAdvanceNotificationStatus,
  deriveImportPermitStatus,
  deriveJpExportQuarantineStatus,
  findDestinationKey,
  flattenCaseForDestination,
  rabiesBoosterChainEnd,
  readCivEntries,
  readGeneralVaccineEntries,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  titerReminderTargets,
  type CaseRow,
} from '@petmove/domain'

/**
 * 로컬(기기) 알림용 일정 수집 — 순수 함수(Capacitor 의존 X, 테스트 가능).
 *
 * 실제 기기 예약은 `@/lib/native/local-reminders` 가 담당한다(네이티브 전용·웹 no-op).
 *
 * 세 종류:
 *   A. 예약 리마인더 — 예정일 있는 카드(접종·검사·구충·임상검사·검역) D-1·당일 오전 9시.
 *      일본 수출 검역은 예약 시간(있으면) 문구 포함.
 *   B. 유효기간 만료 — 광견병 백신·종합백신·CIV·광견병 항체검사(=titer)만. 만료 30일 전,
 *      그리고 출국 전 만료 시 경고. (도메인 계산 재활용)
 *   C. 목적지별 신청 마감 — 일본 사전신고(입국 40·47일 전)·일본 수출검역 신청(귀국 10·17일 전)
 *      ·태국 수입허가(출국 14일 전)·필리핀 수입허가(출국 7일 전). 이미 완료면 제외.
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

// ── A. 예약 리마인더 필드 ────────────────────────────────────────────────

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
 * timeKey 가 있으면 같은 스코프의 예약 시간을 문구에 포함(일본 수출 검역).
 */
const SCOPED_DATE_FIELDS: Array<{ key: string; label: string; timeKey?: string }> = [
  { key: 'vet_visit_date', label: '출국 전 임상검사' },
  { key: 'vet_visit_date_scheduled', label: '출국 전 임상검사' },
  { key: 'kr_export_quarantine_date', label: '한국 수출 검역' },
  { key: 'kr_import_quarantine_date', label: '한국 수입 검역' },
  { key: 'jp_export_quarantine_date', label: '일본 수출 검역', timeKey: 'jp_export_quarantine_time' },
  { key: 'jp_import_quarantine_date', label: '일본 수입 검역' },
  { key: 'th_export_quarantine_date', label: '태국 수출 검역' },
  { key: 'th_import_quarantine_date', label: '태국 수입 검역' },
  { key: 'ph_export_quarantine_date', label: '필리핀 수출 검역' },
  { key: 'ph_import_quarantine_date', label: '필리핀 수입 검역' },
  { key: 'ph_local_vet_visit_date', label: '필리핀 현지 동물병원 방문' },
  { key: 'eu_export_quarantine_date', label: '귀국 서류 준비' },
]

interface RawEvent {
  date: string // YYYY-MM-DD
  label: string
  time?: string // 한국식 표기(예: '오전 10시')
}

// ── 공통 헬퍼 ────────────────────────────────────────────────────────────

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

/** 'YYYY-MM-DD' → 'M월 D일'. */
function koreanDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${Number(m)}월 ${Number(d)}일`
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

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** fireAtIso 가 now 이후면 알림 1건 생성, 아니면 null. */
function reminderAt(id: string, fireAtIso: string, body: string, now: Date): AppReminder | null {
  if (new Date(fireAtIso).getTime() <= now.getTime()) return null
  return { id, fireAtIso, title: APP_TITLE, body }
}

// ── A. 예약 리마인더 ──────────────────────────────────────────────────────

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
    if (!prev || (!prev.time && time)) out.set(key, { date: d, label, time: time ?? undefined })
  }

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

  for (const field of GLOBAL_DATE_FIELDS) {
    for (const key of field.keys) {
      if (isIsoDate(data[key])) add(data[key] as string, field.label)
    }
  }

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

/** 예정 이벤트 → 알림 2건(D-1 9시, 당일 9시). */
function eventReminders(caseRow: CaseRow, ev: RawEvent, pet: string, now: Date): AppReminder[] {
  const timeClause = ev.time ? ` 예약 시간은 ${ev.time}예요.` : ''
  const out: AppReminder[] = []
  const d1 = reminderAt(
    `${caseRow.id}|${ev.label}|${ev.date}|d1`,
    localDateTime(ev.date, FIRE_HOUR, -1),
    `내일은 ${pet} ${ev.label} 예정일이에요 🐾${timeClause}`,
    now,
  )
  if (d1) out.push(d1)
  const day = reminderAt(
    `${caseRow.id}|${ev.label}|${ev.date}|day`,
    localDateTime(ev.date, FIRE_HOUR, 0),
    `오늘은 ${pet} ${ev.label} 예정일이에요${timeClause}`,
    now,
  )
  if (day) out.push(day)
  return out
}

// ── B. 유효기간 만료 알림 ─────────────────────────────────────────────────

/** 케이스의 가장 이른 여행 앵커(입국/출국/출국편) — 유효기간 '출국 전 만료' 비교용. */
function earliestTripDate(caseRow: CaseRow): string {
  const data = asRecord(caseRow.data) ?? {}
  const cands: string[] = []
  const push = (v: unknown) => {
    if (isIsoDate(v)) cands.push((v as string).slice(0, 10))
  }
  const tripKeys = ['entry_date', 'departure_date', 'departure_flight_date']
  push(caseRow.departure_date)
  for (const k of tripKeys) push(data[k])
  const byDest = asRecord(data.by_dest)
  if (byDest) {
    for (const v of Object.values(byDest)) {
      const rec = asRecord(v)
      if (rec) for (const k of tripKeys) push(rec[k])
    }
  }
  return cands.length ? cands.slice().sort()[0] : ''
}

/** 한 항목(백신/검사)의 유효기간 만료 알림: 30일 전 + (해당 시) 출국 전 만료 경고. */
function validityRemindersForItem(
  caseRow: CaseRow,
  pet: string,
  label: string,
  validEnd: string,
  action: { prepare: string; act: string },
  trip: string,
  today: string,
  now: Date,
  // anchorLabel: '출국 전 만료' / '귀국 전 만료' 구분(기본 출국). idTag: ID 고유화(목적지별 titer 등).
  opts?: { anchorLabel?: string; idTag?: string },
): AppReminder[] {
  if (!isIsoDate(validEnd)) return []
  const out: AppReminder[] = []
  const end = validEnd.slice(0, 10)
  const expiresBeforeTrip = !!trip && end < trip
  const anchor = opts?.anchorLabel ?? '출국'
  const idBase = opts?.idTag ?? label

  // 1) 만료 30일 전
  const fire30 = localDateTime(end, FIRE_HOUR, -30)
  const body30 = expiresBeforeTrip
    ? `${pet} ${label} 유효기간이 ${anchor} 전(${koreanDate(end)})에 만료돼요. ${koreanDate(end)}까지 ${action.act}.`
    : `${pet} ${label} 유효기간이 한 달 뒤(${koreanDate(end)}) 만료돼요. ${action.prepare}.`
  const r30 = reminderAt(`${caseRow.id}|validity|${idBase}|${end}|d30`, fire30, body30, now)
  if (r30) out.push(r30)
  else if (expiresBeforeTrip && trip > today) {
    // 30일 알림 시점이 이미 지났는데 기준일 전 만료 + 기준일이 미래 — 다음 오전 9시에 즉시 경고.
    const nine = localDateTime(today, FIRE_HOUR, 0)
    const urgentFire =
      new Date(nine).getTime() > now.getTime() ? nine : localDateTime(today, FIRE_HOUR, 1)
    if (new Date(urgentFire).getTime() < new Date(localDateTime(trip, FIRE_HOUR, 0)).getTime()) {
      const r = reminderAt(
        `${caseRow.id}|validity|${idBase}|${end}|trip`,
        urgentFire,
        `${pet} ${label} 유효기간이 ${anchor} 전에 만료돼요. ${koreanDate(end)}까지 ${action.act}.`,
        now,
      )
      if (r) out.push(r)
    }
  }
  return out
}

const VACCINE_ACTION = { prepare: '추가 접종을 준비하세요', act: '추가 접종을 하세요' }
const TITER_ACTION = { prepare: '추가 검사를 준비하세요', act: '추가 검사를 받으세요' }

function collectValidityReminders(caseRow: CaseRow, pet: string, today: string, now: Date): AppReminder[] {
  const trip = earliestTripDate(caseRow)
  const out: AppReminder[] = []

  // 광견병 백신 — 부스터 chain 의 면역 최종 만료일(도메인 계산 재활용).
  const rabies = readRabiesEntries(caseRow)
  if (rabies.length) {
    const end = rabiesBoosterChainEnd(rabies.map((e) => ({ date: e.date, valid_until: e.valid_until })))
    out.push(...validityRemindersForItem(caseRow, pet, '광견병 백신', end, VACCINE_ACTION, trip, today, now))
  }

  // 종합백신 / CIV — 최근 접종의 유효기간.
  for (const [label, entries] of [
    ['종합백신', readGeneralVaccineEntries(caseRow)],
    ['독감(CIV) 백신', readCivEntries(caseRow)],
  ] as const) {
    if (!entries.length) continue
    const latest = entries[entries.length - 1] // reader 가 날짜 오름차순 정렬
    const end = resolveValidUntil(latest.date, latest.valid_until)
    out.push(...validityRemindersForItem(caseRow, pet, label, end, VACCINE_ACTION, trip, today, now))
  }

  // 광견병 항체 검사(titer) — 목적지별 유효기간(입국용 + 귀국용). 목적지마다 기준일·유효기간이
  // 달라(일본 입국 2년 / 태국·필리핀·EU 귀국 2년 / EU 입국 무기한) 케이스 1개가 아니라
  // 목적지별로 만료 알림을 만든다. 유효기간 산정·적용여부는 도메인(titerReminderTargets) 단일 출처.
  const titers = readTiterEntries(caseRow)
  if (titers.length) {
    const latestTiter = titers.map((t) => t.date).sort().slice(-1)[0]
    for (const token of destinationTokens(caseRow)) {
      let flat: CaseRow
      try {
        flat = flattenCaseForDestination(caseRow, token)
      } catch {
        continue
      }
      const d = asRecord(flat.data) ?? {}
      const entryDate = str(d.entry_date) || str(flat.departure_date)
      const returnDate = str(d.return_date)
      const targets = titerReminderTargets({
        destinationToken: token,
        latestTiterDate: latestTiter,
        entryDate,
        returnDate,
      })
      for (const tg of targets) {
        out.push(
          ...validityRemindersForItem(
            caseRow,
            pet,
            '광견병 항체 검사',
            tg.validUntil,
            TITER_ACTION,
            tg.anchorDate,
            today,
            now,
            { anchorLabel: tg.anchorLabel, idTag: `titer-${tg.kind}-${token}` },
          ),
        )
      }
    }
  }

  return out
}

// ── C. 목적지별 신청 마감 알림 ─────────────────────────────────────────────

/** 케이스의 목적지 토큰들(by_dest 키 + 활성 토큰). */
export function destinationTokens(caseRow: CaseRow): string[] {
  const set = new Set<string>()
  const byDest = asRecord(asRecord(caseRow.data)?.by_dest)
  if (byDest) Object.keys(byDest).forEach((k) => set.add(k))
  try {
    const t = buildCaseJourneyContext(caseRow).destinationToken
    if (t) set.add(t)
  } catch {
    /* 컨텍스트 산출 실패 — by_dest 키만 사용 */
  }
  return [...set]
}

/** 앵커 N일 전 오전 9시 알림(미래일 때만). */
function leadReminder(
  caseRow: CaseRow,
  idTag: string,
  anchor: string,
  daysBefore: number,
  body: string,
  now: Date,
): AppReminder | null {
  if (!isIsoDate(anchor)) return null
  return reminderAt(
    `${caseRow.id}|deadline|${idTag}`,
    localDateTime(anchor.slice(0, 10), FIRE_HOUR, -daysBefore),
    body,
    now,
  )
}

function collectDeadlineReminders(caseRow: CaseRow, now: Date): AppReminder[] {
  const out: AppReminder[] = []
  for (const token of destinationTokens(caseRow)) {
    let flat: CaseRow
    try {
      flat = flattenCaseForDestination(caseRow, token)
    } catch {
      continue
    }
    const data = asRecord(flat.data) ?? {}
    const entry = str(data.entry_date) || str(flat.departure_date)
    const departure = str(flat.departure_date) || str(data.departure_date) || str(data.departure_flight_date)
    const ret = str(data.return_date)
    const key = findDestinationKey(token) // 목적지 토큰이 한글('일본')이라 영어 키로 정규화

    if (key === 'japan') {
      // 사전 신고 — 입국 40일 전 마감. 완료 전에만.
      if (entry && deriveAdvanceNotificationStatus(flat) !== 'done') {
        const r47 = leadReminder(
          flat,
          `${token}|jp-advance-47`,
          entry,
          47,
          '일본 사전 신고 마감이 일주일 남았어요. 입국 40일 전까지 NACCS에서 사전 신고를 하세요.',
          now,
        )
        if (r47) out.push(r47)
        const r40 = leadReminder(
          flat,
          `${token}|jp-advance-40`,
          entry,
          40,
          '오늘까지 일본 사전 신고가 필요해요(입국 40일 전). NACCS에서 신고하세요.',
          now,
        )
        if (r40) out.push(r40)
      }
      // 일본 수출 검역 신청 — 귀국 10일 전. 왕복(귀국일 있음) + 완료 전에만.
      if (ret && deriveJpExportQuarantineStatus(flat) !== 'done') {
        const r17 = leadReminder(
          flat,
          `${token}|jp-export-17`,
          ret,
          17,
          '일본 수출 검역 신청 마감이 일주일 남았어요. 귀국 10일 전까지 신청·예약하세요.',
          now,
        )
        if (r17) out.push(r17)
        const r10 = leadReminder(
          flat,
          `${token}|jp-export-10`,
          ret,
          10,
          '오늘까지 일본 수출 검역 신청이 필요해요(귀국 10일 전).',
          now,
        )
        if (r10) out.push(r10)
      }
    } else if (key === 'thailand') {
      // 태국 수입 허가증 — 영업일 기준이라 여유 있게 출국 2주 전 안내.
      if (departure && deriveImportPermitStatus(flat) !== 'done') {
        const r = leadReminder(
          flat,
          `${token}|th-permit`,
          departure,
          14,
          '태국 수입 허가증 신청을 준비하세요. 출국 7영업일 전까지 신청해야 해요(영업일 기준이라 여유 있게 하세요).',
          now,
        )
        if (r) out.push(r)
      }
    } else if (key === 'philippines') {
      // 필리핀 수입 허가증 — 정해진 기한 없어 출국 1주 전 안내.
      if (departure && deriveImportPermitStatus(flat) !== 'done') {
        const r = leadReminder(
          flat,
          `${token}|ph-permit`,
          departure,
          7,
          '필리핀 수입 허가증 신청을 준비하세요. 출국 1주일 전쯤 신청하세요.',
          now,
        )
        if (r) out.push(r)
      }
    }
  }
  return out
}

// ── 진입점 ────────────────────────────────────────────────────────────────

/** 모든 케이스에서 알림(A 예약 + B 유효기간 + C 신청마감) 수집. fireAt 오름차순. */
export function collectReminders(cases: CaseRow[], now: Date): AppReminder[] {
  const today = localToday(now)
  const all: AppReminder[] = []
  for (const c of cases) {
    const pet = petLabel(c.pet_name)
    for (const ev of collectEventsForCase(c, today)) {
      all.push(...eventReminders(c, ev, pet, now))
    }
    all.push(...collectValidityReminders(c, pet, today, now))
    all.push(...collectDeadlineReminders(c, now))
  }
  all.sort((a, b) => a.fireAtIso.localeCompare(b.fireAtIso))
  return all
}
