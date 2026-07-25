import {
  APP_SUPPORTED_DESTINATION_KEYS,
  JOURNEY_STEP_CATALOG,
  resolveStepForDestination,
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
 *      ·태국 수입허가(출국 14일 전)·필리핀 수입허가(출국 7일 전)·대만 수입허가(도착 127·120일 전).
 *      **신청을 마쳤으면(신청일 입력 = in_progress) 더 보내지 않는다** — 문구가 전부
 *      '신청하세요/준비하세요'라 신청 후엔 목적이 끝났고, 허가증이 늦게 나오는 건 관청
 *      사정이라 보호자가 할 게 없다. 마감 배지도 같은 시점에 사라진다(scenario.ts 의
 *      '액션-완료 두 단계 step' 처리) — 화면과 알림 기준을 맞춘 것(2026-07-19).
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
  { keys: ['external_parasite_dates'], label: '외부 기생충 치료' },
  { keys: ['internal_parasite_dates'], label: '내부 기생충 치료' },
]

/** GLOBAL 단일 date 필드 → 항목 라벨. */
const GLOBAL_DATE_FIELDS: Array<{ keys: string[]; label: string }> = [
  { keys: ['microchip_implant_date', 'microchip_implant_date_scheduled'], label: '마이크로칩 삽입' },
]

/**
 * 목적지별(by_dest) + top-level 단일 date 필드 → 항목 라벨.
 * timeKey 가 있으면 같은 스코프의 예약 시간을 문구에 포함(일본 수출 검역).
 *
 * ── 두 갈래로 나뉜다 ──────────────────────────────────────────────────
 * 1) FIXED — `quarantine:` 완료 모델을 쓰지 않는 예약 일정. 카드에서 파생할 수 없어 여기 적는다.
 *    (임상검사·한국 수출/수입 검역·일본 검역 — 각자 다른 완료 시그널을 쓰는 옛 구조)
 * 2) 파생 — 카드가 `done: 'quarantine:<필드>'` 로 **스스로 '예정일→도래→완료확인' 모델임을
 *    선언**한 것들. 목적지 카탈로그에서 자동으로 뽑는다.
 *
 * 왜 파생인가: 예전엔 전부 손 명단이라 새 목적지 카드를 만들고 여기 한 줄 안 넣으면 알림이
 * 조용히 빠졌다. 실제로 중국은 수입·수출 둘 다, 대만은 수출이 누락돼 있었다(2026-07-19 전수조사).
 * 이제 카드만 만들면 알림이 따라온다 — 명단 관리가 필요 없다.
 */
const FIXED_SCOPED_DATE_FIELDS: Array<{ key: string; label: string; timeKey?: string }> = [
  { key: 'vet_visit_date', label: '출국 전 임상검사' },
  { key: 'vet_visit_date_scheduled', label: '출국 전 임상검사' },
  { key: 'kr_export_quarantine_date', label: '한국 수출 검역' },
  { key: 'kr_import_quarantine_date', label: '한국 수입 검역' },
  { key: 'jp_export_quarantine_date', label: '일본 수출 검역', timeKey: 'jp_export_quarantine_time' },
  { key: 'jp_import_quarantine_date', label: '일본 수입 검역' },
]

/**
 * 알림에서 제외하는 파생 필드 — 카드는 `quarantine:` 모델이지만 전날 알림이 부적절한 것.
 * 여기 넣을 땐 **이유를 함께** 적는다(그냥 이름만 추가해 넘어가면 이 구조가 무의미해진다).
 */
const DERIVED_REMINDER_EXCLUDE: Record<string, string> = {
  // EU 패밀리 8개국 공용 '입국 검사' — 도착하면 국경에서 자동으로 이뤄지는 서류 확인이라
  // 보호자가 전날 준비할 것이 없다(일본·대만 수입검역은 공항 검역소를 찾아가는 행동이라 다름).
  // 2026-07-19 사용자 판단으로 제외.
  eu_import_quarantine_date: 'EU 입국 검사는 도착 시 자동 — 전날 알림 불필요',
}

/**
 * **신청·신고 계열은 D-1·당일 알림 대상이 아니다** (설계 — 누락 아님).
 *
 * 이 파일 최초 커밋(51d6a474)의 대상이 "마이크로칩·백신·검사·구충·출국 전 임상검사·검역"
 * 이었고 신청·신고는 처음부터 선 밖이었다. 근거가 코드에 없어서 "왜 수입 허가 신청일엔
 * 알림이 없지? 빠뜨린 건가?"를 두 번 조사하게 됐다(2026-07-19). 판단을 여기 남긴다:
 *
 *   검역·검진 — 그날 **어딘가에 가야** 하는 일 → 전날 알림이 실질적으로 유용
 *   신청·신고 — 그날 **온라인으로 넣겠다**는 계획 → 하루 밀려도 무방
 *
 * 대신 **마감 알림(scope C)**이 이 계열을 담당한다 — 정말 놓치면 안 되는 건 신청 예정일이
 * 아니라 마감이기 때문(대만 수입허가 127·120·27·20일 전, 일본 사전신고 47·40일 전 등).
 *
 * 해당 필드: import_permit_application_date, advance_notification_date,
 *           jp_export_quarantine_application_date
 * (EU 사전 통지 4곳은 `quarantine:` 모델이라 알림이 붙는데, 그건 '통지 시각'이 곧 마감에
 *  붙어 있어 성격이 다르다 — 도착 24·48시간 전이라 예정일 자체가 마감이다.)
 */
const APPLICATION_DATE_FIELDS_NO_REMINDER = [
  'import_permit_application_date',
  'advance_notification_date',
  'jp_export_quarantine_application_date',
] as const

/** 카드가 `done: 'quarantine:<필드>'` 로 선언한 예약 일정 → 필드·라벨 자동 수집. */
function derivedScopedDateFields(): Array<{ key: string; label: string }> {
  const out = new Map<string, string>()
  for (const destKey of APP_SUPPORTED_DESTINATION_KEYS) {
    for (const step of JOURNEY_STEP_CATALOG) {
      const resolved = resolveStepForDestination(step, destKey, null)
      const done = typeof resolved.done === 'string' ? resolved.done : ''
      if (!done.startsWith('quarantine:')) continue
      const field = done.slice('quarantine:'.length)
      if (field in DERIVED_REMINDER_EXCLUDE) continue
      // 신청·신고 날짜는 모델이 바뀌어도 계속 제외 — 위 상수 주석에 근거.
      if ((APPLICATION_DATE_FIELDS_NO_REMINDER as readonly string[]).includes(field)) continue
      if (!out.has(field)) out.set(field, resolved.title)
    }
  }
  return [...out].map(([key, label]) => ({ key, label }))
}

const SCOPED_DATE_FIELDS: Array<{ key: string; label: string; timeKey?: string }> = [
  ...FIXED_SCOPED_DATE_FIELDS,
  ...derivedScopedDateFields().filter(
    (d) => !FIXED_SCOPED_DATE_FIELDS.some((f) => f.key === d.key),
  ),
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

  // 2) 만료 다음날 — "지났다"는 사실을 한 번 알린다.
  //
  // 예전엔 30일 전 하나뿐이었다. 그 알림을 놓치면 만료가 지나도 아무 신호가 없어,
  // 보호자는 준비가 끝난 줄 알고 있다가 나중에 카드에서야 알게 됐다(2026-07-19 사용자 지시).
  // 만료일 당일이 아니라 **다음날**인 이유는 만료일 당일까지는 아직 유효하기 때문 —
  // 당일에 "만료됐다"고 하면 사실과 다르다.
  const fireAfter = localDateTime(end, FIRE_HOUR, 1)
  const rAfter = reminderAt(
    `${caseRow.id}|validity|${idBase}|${end}|expired`,
    fireAfter,
    `${pet} ${label} 유효기간이 ${koreanDate(end)}에 만료됐어요. ${action.act}.`,
    now,
  )
  if (rAfter) out.push(rAfter)

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

/**
 * 사전 통지(advance notice) 카드 4종 — 아일랜드·노르웨이·키프로스·몰타. 구조가 모두 동일
 * (quarantine:<field>_date, 입국 기준 마감)인데 지금까지 앱 푸시가 하나도 안 나가고 있었다
 * (2026-07-17 발견). 국가별로 다른 건 실제 마감(entry 기준 며칠 전)뿐이라 테이블로 일반화 —
 * 새 나라가 추가되면 여기 한 줄만 더하면 된다. 일본형(마감 1주 전 + 당일) 2단계 패턴 재사용.
 * 몰타는 "3영업일"이라 정확한 영업일 계산 대신 여유 있게 캘린더 5일로 근사(주말 낀 최악의
 * 경우까지 커버) — 태국 수입허가 알림(영업일 → 넉넉한 캘린더일)과 같은 선례.
 */
const ADVANCE_NOTICE_DEADLINES: Array<{
  key: string
  dateField: string
  countryLabel: string
  hardDeadlineDays: number // entry 기준 실제 마감(캘린더 일)
  deadlineLabel: string // 문구용 — 사람이 읽는 마감 표현
  // 기본 문구("마감이 일주일 남았어요"/"오늘까지 필요해요")를 못 쓰는 경우만 지정.
  // 몰타는 실제 5일이 "일주일"도 "오늘"도 아닌 근사값이라 전용 문구 사용.
  leadMessage?: string
  dayMessage?: string
}> = [
  { key: 'ireland', dateField: 'ie_advance_notice_date', countryLabel: '아일랜드', hardDeadlineDays: 1, deadlineLabel: '입국 24시간 전' },
  { key: 'norway', dateField: 'no_advance_notice_date', countryLabel: '노르웨이', hardDeadlineDays: 2, deadlineLabel: '입국 48시간 전' },
  { key: 'cyprus', dateField: 'cy_advance_notice_date', countryLabel: '키프로스', hardDeadlineDays: 2, deadlineLabel: '입국 48시간 전' },
  {
    key: 'malta',
    dateField: 'mt_advance_notice_date',
    countryLabel: '몰타',
    hardDeadlineDays: 5,
    deadlineLabel: '입국 3영업일 전',
    leadMessage: '몰타 사전 통지 마감이 얼마 남지 않았어요. 입국 3영업일 전까지 통지하세요.',
    dayMessage: '몰타 사전 통지 마감이 임박했어요. 입국 3영업일 전까지 통지하세요.',
  },
]

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

    // 사전 통지 4종 — 테이블 기반 일반화(위 ADVANCE_NOTICE_DEADLINES 주석 참고).
    // done 여부는 quarantine:<field>_date 모델이라 필드 저장 자체로 판단(완료 확인 플래그와
    // 무관하게, 이미 통지했으면 '준비하세요' 알림은 더 이상 필요 없음).
    const advanceNotice = ADVANCE_NOTICE_DEADLINES.find((a) => a.key === key)
    if (advanceNotice && entry && !str(data[advanceNotice.dateField])) {
      const rLead = leadReminder(
        flat,
        `${token}|advnotice-lead`,
        entry,
        advanceNotice.hardDeadlineDays + 7,
        advanceNotice.leadMessage ??
          `${advanceNotice.countryLabel} 사전 통지 마감이 일주일 남았어요. ${advanceNotice.deadlineLabel}까지 통지하세요.`,
        now,
      )
      if (rLead) out.push(rLead)
      const rDay = leadReminder(
        flat,
        `${token}|advnotice-day`,
        entry,
        advanceNotice.hardDeadlineDays,
        advanceNotice.dayMessage ??
          `오늘까지 ${advanceNotice.countryLabel} 사전 통지가 필요해요(${advanceNotice.deadlineLabel}).`,
        now,
      )
      if (rDay) out.push(rDay)
    }

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
    } else if (key === 'taiwan') {
      // 대만 수입허가증 — 도착 120일 전 신청이 격리 면제 조건이라 마감이 유난히 이르다.
      // 놓치면 회복이 어려워(20일 전 신청 = 7일 격리) 일주일 전 + 당일 2회 안내.
      if (entry && deriveImportPermitStatus(flat) === 'not_started') {
        const r127 = leadReminder(
          flat,
          `${token}|tw-permit-127`,
          entry,
          127,
          '대만 수입허가증 신청 마감이 일주일 남았어요. 도착 120일 전까지 온라인으로 신청해야 격리 없이 입국할 수 있어요.',
          now,
        )
        if (r127) out.push(r127)
        const r120 = leadReminder(
          flat,
          `${token}|tw-permit-120`,
          entry,
          120,
          '오늘까지 대만 수입허가증 신청이 필요해요(도착 120일 전). 늦으면 도착 후 7일 격리를 거쳐야 해요.',
          now,
        )
        if (r120) out.push(r120)
        // 2단계 — 120일(격리 면제)을 놓쳐도 도착 20일 전까지는 신청할 수 있다(대신 7일 격리).
        // 그게 진짜 마지막 기한이라, 여기서 멈추면 119일째부터 아무 안내 없이 방치된다.
        // 배지도 같은 시점에 20일 마감으로 넘어간다(catalog twImportPermitDeadline).
        const r27 = leadReminder(
          flat,
          `${token}|tw-permit-27`,
          entry,
          27,
          '대만 수입허가증 신청 최종 마감이 일주일 남았어요. 도착 20일 전까지 신청해야 하고, 이 경우 도착 후 7일간 격리돼요.',
          now,
        )
        if (r27) out.push(r27)
        const r20 = leadReminder(
          flat,
          `${token}|tw-permit-20`,
          entry,
          20,
          '오늘이 대만 수입허가증 신청 마지막 기한이에요(도착 20일 전). 도착 후 7일간 격리를 거쳐야 해요.',
          now,
        )
        if (r20) out.push(r20)
      }
    } else if (key === 'thailand') {
      // 태국 수입 허가증 — 영업일 기준이라 여유 있게 출국 2주 전 안내.
      if (departure && deriveImportPermitStatus(flat) === 'not_started') {
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
    // ⛔ **말레이시아는 신청 마감 알림 없음**(사용자 확정 2026-07-23). MAQIS 수입 허가는
    //   정해진 신청 마감일이 없다 — 태국 복제로 딸려온 '출국 7영업일 전' 알림을 제거했다
    //   (아랍에미리트와 같은 판단). 마감이 없는 나라에 '출국 N일 전까지' 알림을 넣지 말 것.
    // ⛔ **인도네시아도 신청 마감 알림 없음**(2026-07-23). '출국 7영업일 전'은 태국 복제
    //   미확인값이었다(구 주석 "규정 확정 후 수정 예정"). 미확인 마감을 알리는 건 없느니만
    //   못해 제거했다 — 말레이시아와 같은 처리. 규정을 확정하면 그때 근거와 함께 되살릴 것.
    // ⛔ **싱가포르도 신청 마감 알림 없음**(사용자 지정, destination-config 싱가포르 주석 참조).
    //   GoBusiness 수입 허가는 '도착 90일 이내 신청·발급 90일 유효'로 확정 마감일이 없다 —
    //   아랍에미리트·말레이시아와 같은 판단. 계류장(QMS) 예약도 고정 마감이 없어 미등록.
    } else if (key === 'philippines') {
      // 필리핀 수입 허가증 — 정해진 기한 없어 출국 1주 전 안내.
      if (departure && deriveImportPermitStatus(flat) === 'not_started') {
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
    } else if (key === 'israel') {
      // 이스라엘 사전 통보 — 적재(출국) 2영업일 전 마감(공식 안내 섹션 P·Q). 입력불가는 캘린더
      // D-2 근사라, 주말·공휴일 버퍼로 D-11·D-4 두 번 안내(사용자 지정 2026-07-23). 사전 통보
      // (il_advance_notice_date 저장) 전에만 — 통보를 마쳤으면 '통보하세요' 알림은 불필요.
      // EU 사전통지 4종(entry 기준 테이블)과 달리 출국(departure) 기준이라 국가 분기로 처리한다.
      if (departure && !str(data.il_advance_notice_date)) {
        const r11 = leadReminder(
          flat,
          `${token}|il-advnotice-11`,
          departure,
          11,
          '이스라엘 사전 통보 마감이 다가와요. 출국 2영업일 전까지 온라인 폼(또는 이메일)으로 통보하세요.',
          now,
        )
        if (r11) out.push(r11)
        const r4 = leadReminder(
          flat,
          `${token}|il-advnotice-4`,
          departure,
          4,
          '이스라엘 사전 통보 마감이 임박했어요. 출국 2영업일 전까지 통보하세요.',
          now,
        )
        if (r4) out.push(r4)
      }
    }
    // ⛔ **아랍에미리트는 여기 넣지 말 것**(사용자 확정 2026-07-22). MOCCAE 수입 허가는
    //   **신청 마감일이 정해져 있지 않다** — 없는 기한으로 "출국 N일 전까지" 알림을 보내면
    //   근거 없는 안내가 된다. 필리핀처럼 '기한 없음 → 관행 일수'로 임의 안내하지도 않는다.
    //   (허가 90일 유효라는 상한만 있고, 그건 카드 문구와 ae.import-permit-within-90days 가
    //    담당한다. 발급 완료 푸시도 만들지 않기로 함 — milestone-pushes.ts 참고.)
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
