import type { CaseRow } from '../types'
import type { ProcedureCheck } from './types'
import {
  addYears,
  daysBetween,
  findRabiesValidityBreaks,
  readAustraliaExtra,
  readCivEntries,
  readExternalParasiteEntries,
  readGeneralVaccineEntries,
  readInfectiousDiseaseEntries,
  readBreed,
  readInternalParasiteEntries,
  matchBannedBreed,
  readRabiesEntries,
  readScopedImportPermitFiled,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
} from './utils'
import { readByDestValue } from '../destination-scoped-fields'
import { validateImportPermitNotAfterDeparture } from '../journey-steps/date-rules'
import {
  msgExportQuarantineAfterReturn,
  msgExportQuarantineBeforeEntry,
  msgMicrochipBeforeRabies,
  msgRabiesPrimeMinAge,
  msgTiterBeforeVaccine,
} from './messages'

/**
 * 호주 (DAFF — Department of Agriculture, Fisheries and Forestry) 절차 검증.
 *
 * 한국 = **Group 3**(광견병이 있으나 잘 관리되는 나라). 1차 출처 전문 확인(2026-07-27):
 *  - "How to bring your dog to Australia from a Group 3 country" (단계 1~9)
 *  - "Rabies vaccination and tests for cats and dogs coming to Australia"
 *
 * ⚠️ 2026-07-27 전면 개정 — 구세대 룰의 다음 오류를 규정 원문 기준으로 정정했다.
 *   ① **광견병 최소 연령 84일이 빠져 있었다.** 구 헤더는 "DAFF 미명시 — 의도적 제외"라고
 *      적혀 있었지만 원문 4.2 에 "given when the dog was at least 84 days old" 가 있다.
 *   ② **면역 유효 기준이 '출국 + 계류 10일'이었다.** 규정은 계류까지가 아니라
 *      "valid continuously **from the RNATT up to and including the date of export**" 다.
 *      종합백신도 "valid ... **at the time of export**". 계류 기간 유효는 *권장* 백신
 *      (DHPP 등)에 붙은 문장이라 요건이 아니다.
 *   ③ **CIV 를 '2회 정확히 14일 간격'으로 강제**했다. 규정에 간격·횟수 요건은 없고
 *      "제조사 지침대로 기초 접종 완료 + 마지막 접종 출국 14일 전 이상"뿐이다.
 *   ④ **45일·5일 경계가 하루씩 엄격**했다(≤44·≤4). DAFF 자체 예제가 45·5 를 허용한다
 *      (출국 1/30 → 1차 구충 12/16, 2차·최종검진·배서 1/25).
 *
 * 컨벤션: sg/gu 와 동일.
 *  - 필수 입력 누락 시 SKIP
 *  - 호주는 **DAFF 워크드 예제**를 따른다 — "45일 이내" = `dep - date ≤ 45`(경계 포함),
 *    "5일 이내" = `≤ 5`. 다른 나라의 '경계일 제외' 관례를 여기 적용하지 말 것.
 *  - 종 필터는 run() 안에서 caseRow.data.species 로 가드
 *
 * 종별 차이 (Group 3 cat guide 전문 확인, 2026-07-27) — **고양이가 더 단순하다**:
 *   같음 — 마이크로칩·마이크로칩 인증(10일/30일)·광견병 84일·RNATT 180일/12개월·수입허가·
 *          Mickleham 계류·화물 운송·내부구충(45일 2회·14일 간격·5일 이내)·최종검진 5일
 *   다름 — CIV **없음** / 렙토 Canicola **없음** / 리슈만편모충·브루셀라 **없음** /
 *          종합백신(FVRCP)은 "optional, not mandatory" / 외부구충 시작이 **21일 전**(개 30일)
 *   → 개 전용 룰은 run() 안 species 가드로, 카드 노출은 catalog 의 speciesByDestination 으로
 *     갈린다. 두 곳이 짝이므로 한쪽만 고치지 말 것.
 */

const COUNTRY = 'australia'

function species(caseRow: CaseRow): string {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  return typeof data.species === 'string' ? data.species : ''
}

function isIntact(caseRow: CaseRow): boolean {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const sex = typeof data.sex === 'string' ? data.sex : ''
  return sex === 'male' || sex === 'female'
}

/**
 * 마이크로칩 인증일(Identity Declaration) — 여정 카드(au-identity-check)가 저장하는 `id_date`.
 * by_dest(목적지별) → top-level → legacy `australia_extra.id_date` 순.
 *
 * readAustraliaExtra 는 legacy 중첩 경로만 읽어서, 앱에서 새로 입력한 값을 못 본다
 * (구 룰이 legacy 만 보고 있어 신규 케이스에서 통째로 SKIP 되던 자리).
 */
function readIdentityCheckDate(caseRow: CaseRow, destination?: string | null): string {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const scoped = readByDestValue(data, destination ?? null, 'id_date')
  if (typeof scoped === 'string') return scoped.slice(0, 10)
  // null = 그 목적지에서 **명시적으로 비움**. top-level·legacy 로 폴백하면 지운 값이 되살아난다
  //   (clearExtraValueWithLegacy 가 막으려는 것과 같은 부활 버그).
  if (scoped === null) return ''
  if (typeof data.id_date === 'string') return data.id_date.slice(0, 10)
  const legacy = readAustraliaExtra(caseRow).id_date
  return legacy ? legacy.slice(0, 10) : ''
}

/** 계류시설 예약(계류 시작일) — by_dest 우선, 없으면 top-level. */
function readQuarantineReservationDate(caseRow: CaseRow, destination?: string | null): string {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const scoped = readByDestValue(data, destination ?? null, 'au_quarantine_reservation_date')
  if (typeof scoped === 'string') return scoped.slice(0, 10)
  if (scoped === null) return ''
  return typeof data.au_quarantine_reservation_date === 'string'
    ? data.au_quarantine_reservation_date.slice(0, 10)
    : ''
}

/** 호주 도착일(entry_date) — by_dest 우선. */
function readEntryDate(caseRow: CaseRow, destination?: string | null): string {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const scoped = readByDestValue(data, destination ?? null, 'entry_date')
  if (typeof scoped === 'string') return scoped.slice(0, 10)
  if (scoped === null) return ''
  return typeof data.entry_date === 'string' ? data.entry_date.slice(0, 10) : ''
}

export const AU_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'au.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      'ISO 호환 마이크로칩이 광견병 1차 접종일 이전이어야 함. DAFF 3.1 — 승인 수의사가 매 방문·모든 채혈 전에 칩을 스캔하고 모든 서류에 번호를 기재한다. 검사 결과지의 칩 번호 정정은 인정되지 않음.',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const microchip = typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!microchip || rabies.length === 0) return SKIP

      const first = rabies[0]
      if (microchip <= first.date) {
        return { ok: true, message: `마이크로칩(${microchip}) ≤ 1차 접종(${first.date}).` }
      }
      return {
        ok: false,
        message: msgMicrochipBeforeRabies(),
        offendingPaths: ['microchip_implant_date'],
      }
    },
  },

  // ── 마이크로칩 인증 (Identity Declaration) ──
  // 선택 절차지만 계류 10일/30일을 가른다. 순서 위반은 **회복 경로가 없다**(채혈 후 소급 불가).
  {
    id: 'au.identity-check-before-titer',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩 인증은 항체 검사 채혈 이전 · 다른 방문',
    description:
      'DAFF 3.2 — "Do this before having blood taken for the RNATT. An identity check cannot be done at the same **vet visit** as the RNATT." ⚠️ 금지 단위는 **방문**이지 날짜가 아니다(2026-07-27 정정). 오전 검역본부 → 오후 동물병원처럼 하루에 나눠 받는 건 위반이 아니라, 같은 날을 위반으로 단정하면 안 된다. 앱은 날짜만 저장해 순서·방문 분리를 확인할 수 없으므로 두 갈래로 나눈다: 채혈일 < 인증일 = **위반**(소급 불가, 계류 30일 확정) / 같은 날 = **확인 요청**(순서와 별도 방문 여부는 보호자만 안다).',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const idDate = readIdentityCheckDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (!idDate || titers.length === 0) return SKIP

      // ① 채혈이 인증보다 앞선 경우 — 명확한 위반(소급 적용 불가).
      const after = titers.filter((t) => t.date < idDate)
      if (after.length > 0) {
        const offendingPaths = ['id_date']
        for (const t of after) offendingPaths.push(`rabies_titer_records[${t.originalIndex}].date`)
        return {
          ok: false,
          message:
            '마이크로칩 인증은 항체 검사 채혈 전에 받아야 해요. 채혈이 끝난 뒤에는 소급되지 않아 계류가 최소 30일이 돼요.',
          offendingPaths,
        }
      }
      // ② 같은 날 — 규정이 금지하는 건 '같은 방문'이라 날짜만으로는 판정할 수 없다.
      //   위반이라 단정하지 않고 확인만 요청한다(추측 단정 금지).
      const sameDay = titers.filter((t) => t.date === idDate)
      if (sameDay.length > 0) {
        const offendingPaths = ['id_date']
        for (const t of sameDay) offendingPaths.push(`rabies_titer_records[${t.originalIndex}].date`)
        return {
          ok: false,
          message:
            '마이크로칩 인증과 항체 검사 채혈 날짜가 같아요. 두 절차를 같은 방문에서 받으면 인증이 인정되지 않아요. 인증을 먼저, 다른 방문에서 받았는지 확인하세요.',
          offendingPaths,
        }
      }
      return { ok: true, message: `마이크로칩 인증일(${idDate}) < 모든 채혈일.` }
    },
  },

  // ── 광견병 ──
  {
    id: 'au.rabies-prime-after-84days',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 생후 84일 이상',
    description:
      'DAFF 4.2 — 승인 백신을 "given when the dog was at least 84 days old". 3년 백신도 제조사 지침대로 접종했다면 인정된다.',
    severity: 'warning',
    addedAt: '2026-07-27',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!birth || rabies.length === 0) return SKIP

      const first = rabies[0]
      const age = daysBetween(birth, first.date)
      if (age === null) return SKIP
      if (age < 84) {
        return {
          ok: false,
          message: msgRabiesPrimeMinAge('84일'),
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${age}일령.` }
    },
  },
  {
    id: 'au.titer-after-rabies',
    country: COUNTRY,
    category: '광견병',
    title: '항체 검사는 광견병 접종 이후 채혈',
    description:
      'RNATT 는 접종으로 생긴 항체를 확인하는 검사라 접종 이후에만 의미가 있다(DAFF 4.3 "This means it must be completed after rabies vaccination"). **최소 대기 일수는 두지 않는다** — 3~4주는 권장이고 정기 접종견은 더 일찍 채혈할 수 있다("Check with your vet").',
    severity: 'warning',
    addedAt: '2026-07-27',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      const titers = readTiterEntries(caseRow)
      if (rabies.length === 0 || titers.length === 0) return SKIP

      const offendingPaths: string[] = []
      for (const t of titers) {
        const prior = rabies.filter((r) => r.date <= t.date)
        if (prior.length === 0) offendingPaths.push(`rabies_titer_records[${t.originalIndex}].date`)
      }
      if (offendingPaths.length > 0) {
        return { ok: false, message: msgTiterBeforeVaccine(), offendingPaths }
      }
      return { ok: true, message: '모든 채혈일 이전에 광견병 접종 기록이 있어요.' }
    },
  },
  {
    id: 'au.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간 이내여야 함. 만료 후 접종은 chain 이 끊겨 새 1차가 되고, 호주는 그 순간 채혈부터 다시다(180일 재시작). 저장 거부(findRabiesChainBreak)의 짝이 되는 주의 — 펫무브워크는 저장을 막지 않아 이 룰이 없으면 운영자 화면에서 끊긴 chain 이 안 보인다.',
    severity: 'warning',
    addedAt: '2026-07-27',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length < 2) return SKIP
      const offending = findRabiesValidityBreaks(rabies)
      if (offending.length > 0) {
        return {
          ok: false,
          message: '광견병 백신은 직전 접종의 면역 유효기간 안에 다시 접종해야 해요.',
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '모든 인접 광견병 도즈가 직전 접종 유효기간 이내.' }
    },
  },
  {
    id: 'au.rabies-valid-from-titer-to-departure',
    country: COUNTRY,
    category: '광견병',
    title: '채혈일부터 출국일까지 광견병 면역 연속 유효',
    description:
      'DAFF 4.2 — "valid continuously from the RNATT up to and including the date of export". 유효기간이 하루라도 끊기면 수출 자격을 잃고 재접종 → 재채혈 → 180일 대기 재시작이다. 부스터는 만료일 당일까지 접종하면 연속으로 인정(`다음 접종일 ≤ 직전 유효기간`).',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      const titers = readTiterEntries(caseRow)
      if (!dep || rabies.length === 0 || titers.length === 0) return SKIP

      // 기준 채혈 = 출국일에 아직 유효한(채혈 + 12개월) 것 중 가장 이른 것.
      // 유효한 채혈이 없으면 만료는 au.titer-within-12months-of-export 가 다룬다.
      const operative = [...titers]
        .sort((a, b) => a.date.localeCompare(b.date))
        .find((t) => addYears(t.date, 1) >= dep)
      if (!operative) return SKIP

      const sorted = [...rabies].sort((a, b) => a.date.localeCompare(b.date))
      const offending: string[] = ['departure_date']
      for (const r of sorted) offending.push(`rabies_dates[${r.originalIndex}].date`)

      // 채혈 시점에 유효한 접종 찾기
      let coverUntil = ''
      for (const r of sorted) {
        if (r.date > operative.date) break
        const vu = resolveValidUntil(r.date, r.valid_until)
        if (vu && vu >= operative.date && vu > coverUntil) coverUntil = vu
      }
      if (!coverUntil) {
        return {
          ok: false,
          message:
            '항체 검사 채혈일에 유효한 광견병 백신이 없어요. 채혈일부터 출국일까지 면역 유효기간이 이어져야 해요.',
          offendingPaths: offending,
        }
      }

      // 채혈 이후 접종으로 연장 — 직전 유효기간 안(당일 포함)에 맞은 것만 연속으로 인정.
      for (const r of sorted) {
        if (r.date <= operative.date) continue
        if (r.date > coverUntil) break
        const vu = resolveValidUntil(r.date, r.valid_until)
        if (vu && vu > coverUntil) coverUntil = vu
      }

      if (coverUntil < dep) {
        return {
          ok: false,
          message:
            '항체 검사 채혈일부터 출국일까지 광견병 면역 유효기간이 끊기지 않아야 해요. 유효기간이 끝나기 전에 추가 접종을 받고 기록하세요.',
          offendingPaths: offending,
        }
      }
      return { ok: true, message: `채혈(${operative.date}) → 출국(${dep}) 구간 면역 연속(유효 ${coverUntil}).` }
    },
  },
  {
    id: 'au.titer-min-180days-after-sample-received',
    country: COUNTRY,
    category: '광견병',
    title: '출국일은 RNATT 검체 검사실 도착일 180일 이후',
    description:
      'DAFF 4.3 — "cannot be exported to Australia for at least 180 days after the RNATT sample arrives at the laboratory. There are no exceptions." 기준일 우선순위: rabies_titer_records[].received_date → australia_extra.sample_received_date(legacy) → 채혈일(fallback, 검사실 도착은 그 이후라 보수적으로 +7일).',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      const auExtra = readAustraliaExtra(caseRow)
      if (!dep) return SKIP

      let basis: { kind: 'received_record' | 'received_legacy' | 'sample'; date: string; titerIdx?: number } | null = null
      const receivedRecord = titers.find((t) => t.received_date)
      if (receivedRecord && receivedRecord.received_date) {
        basis = { kind: 'received_record', date: receivedRecord.received_date, titerIdx: receivedRecord.originalIndex }
      } else if (auExtra.sample_received_date) {
        basis = { kind: 'received_legacy', date: auExtra.sample_received_date }
      } else if (titers.length > 0) {
        const earliest = titers.reduce((a, b) => (a.date <= b.date ? a : b))
        basis = { kind: 'sample', date: earliest.date, titerIdx: earliest.originalIndex }
      } else {
        return SKIP
      }

      const days = daysBetween(basis.date, dep)
      if (days === null) return SKIP
      // 정확한 검사실 도착일이 있으면 180일, 채혈일 fallback 이면 도착이 며칠 뒤이므로 +7일 마진.
      const required = basis.kind === 'sample' ? 187 : 180
      if (days < required) {
        const offendingPaths = ['departure_date']
        if (basis.kind === 'received_record') {
          offendingPaths.push(`rabies_titer_records[${basis.titerIdx}].received_date`)
        } else if (basis.kind === 'received_legacy') {
          offendingPaths.push('australia_extra.sample_received_date')
        } else {
          offendingPaths.push(`rabies_titer_records[${basis.titerIdx}].date`)
        }
        return {
          ok: false,
          message:
            '항체 검사 검체가 검사기관에 도착한 날부터 180일이 지나야 출국할 수 있어요. 출국일을 다시 확인하세요.',
          offendingPaths,
        }
      }
      const label = basis.kind === 'sample' ? '채혈일' : '검체 도착일'
      return { ok: true, message: `${label}(${basis.date}) → 출국일(${dep}): ${days}일.` }
    },
  },
  {
    id: 'au.titer-within-12months-of-export',
    country: COUNTRY,
    category: '광견병',
    title: '출국일은 RNATT 채혈일 12개월 이내',
    description:
      'DAFF 4.3 — "An RNATT is valid for 12 months or 365 days from the date of blood sampling." 수입 허가 유효기간도 여기에 연동된다. 만료가 가까우면 기존 채혈일부터 12개월 안에 재채혈해야 180일 대기를 다시 하지 않는다.',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      const valid = titers.find((t) => addYears(t.date, 1) >= dep)
      if (valid) {
        return {
          ok: true,
          message: `RNATT(${valid.date}) 유효(${addYears(valid.date, 1)}) ≥ 출국일(${dep}).`,
        }
      }
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return {
        ok: false,
        message:
          '항체 검사 결과는 채혈일부터 12개월간 유효해요. 출국일까지 유효하지 않으니 재채혈이 필요해요.',
        offendingPaths: offending,
      }
    },
  },

  // ── 수입 허가 · 계류 ──
  {
    id: 'au.import-permit-not-after-departure',
    country: COUNTRY,
    category: '수입허가',
    title: '수입 허가 신청일, 출국일 순서',
    description:
      '수입 허가 신청일은 출국일 이전이어야 함(출국 당일·이후엔 신청 불가). 입력 차단(validateImportPermitNotAfterDeparture)과 같은 함수. DAFF 5 — 심사에 보통 20~40영업일, 길면 123영업일이 걸린다.',
    severity: 'warning',
    addedAt: '2026-07-27',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const filed = readScopedImportPermitFiled(data, destination)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(filed)) return SKIP
      const dep = (readDepartureDate(caseRow, destination) ?? '').slice(0, 10)
      const msg = validateImportPermitNotAfterDeparture(filed, dep)
      if (msg) {
        return {
          ok: false,
          message: msg,
          offendingPaths: ['import_permit_application_date', 'departure_date'],
        }
      }
      return { ok: true, message: `신청일(${filed}) < 출국일(${dep || '미입력'}).` }
    },
  },
  {
    id: 'au.quarantine-reservation-matches-entry',
    country: COUNTRY,
    category: '검역',
    title: '계류 시작일과 호주 도착일 일치',
    description:
      'DAFF 9.2 — 도착한 동물은 검역관이 멜버른 공항에서 인수해 그날 Mickleham 계류시설로 옮긴다. 계류 시작일과 도착일이 다르면 예약이나 항공 일정 중 하나가 어긋난 것이다.',
    severity: 'warning',
    addedAt: '2026-07-27',
    run: ({ caseRow, destination }) => {
      const reserved = readQuarantineReservationDate(caseRow, destination)
      const entry = readEntryDate(caseRow, destination)
      if (!reserved || !entry) return SKIP
      if (reserved !== entry) {
        return {
          ok: false,
          message: '계류 시작일과 호주 도착일이 달라요. 예약 날짜와 항공 일정을 다시 확인하세요.',
          offendingPaths: ['au_quarantine_reservation_date', 'entry_date'],
        }
      }
      return { ok: true, message: `계류 시작일(${reserved}) = 도착일(${entry}).` }
    },
  },
  {
    id: 'au.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '호주 수입 검역일',
    description: '호주 수입 검역(계류 시작)일은 호주 도착일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-27',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const scoped = readByDestValue(data, destination ?? null, 'au_import_quarantine_date')
      const raw =
        typeof scoped === 'string'
          ? scoped.slice(0, 10)
          : scoped === null
            ? ''
            : typeof data.au_import_quarantine_date === 'string'
              ? data.au_import_quarantine_date.slice(0, 10)
              : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const entry = readEntryDate(caseRow, destination)
      if (entry && raw < entry) {
        return {
          ok: false,
          message: '호주 수입 검역일은 호주 도착일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['au_import_quarantine_date'],
        }
      }
      return { ok: true, message: `호주 수입검역일(${raw}) 도착 이후.` }
    },
  },

  // ── 수입 금지 품종 ──
  // 생물안전(biosecurity)이 아니라 환경보호·관세 법령이라 DAFF 가 아닌 다른 부처 소관이지만,
  // 걸리면 입국 자체가 안 되므로 준비 착수 전에 걸러야 한다(Group 3 개 2.2 / 고양이 2.2).
  {
    id: 'au.banned-breeds',
    country: COUNTRY,
    category: '서류',
    title: '수입 금지 품종 (개 5종·늑대 교잡 4종 / 고양이 교잡 4종)',
    description:
      '개: 도고 아르헨티노, 필라 브라질레이로, 도사견, 아메리칸 핏불테리어, 프레사 카나리오 + 늑대 교잡(체코슬로바키안 울프독, 사를로스 울프독, 루포 이탈리아노, 쿤밍견). 고양이: 사바나, 사파리, 차우지, 벵갈(2026-03-01부터 금지). 교잡 자손도 포함.',
    severity: 'blocker',
    addedAt: '2026-07-27',
    run: ({ caseRow }) => {
      const sp = species(caseRow)
      const breed = readBreed(caseRow)
      if (!breed.ko && !breed.en) return SKIP
      const dogBanned = [
        'dogo argentino', '도고 아르헨티노',
        'fila brasileiro', '필라 브라질레이로',
        'japanese tosa', 'tosa', '도사',
        'pit bull', 'pitbull', '핏불',
        'presa canario', '프레사 카나리오',
        'czechoslovakian', '체코슬로바키안',
        'saarloos', '사를로스',
        'lupo italiano', '루포 이탈리아노',
        'kunming', '쿤밍',
      ]
      const catBanned = [
        'savannah', '사바나',
        'safari', '사파리',
        'chausie', '차우지',
        'bengal', '벵갈',
      ]
      // 종 미상이면 양쪽 모두로 본다(보수적).
      const keywords = sp === 'dog' ? dogBanned : sp === 'cat' ? catBanned : [...dogBanned, ...catBanned]
      const match = matchBannedBreed(breed, keywords)
      if (match) {
        return {
          ok: false,
          message: `"${breed.ko || breed.en}"은 호주 수입 금지 품종이에요 (매치: ${match}).`,
          offendingPaths: ['breed', 'breed_en'],
        }
      }
      return { ok: true, message: `품종 "${breed.ko || breed.en}" 통과.` }
    },
  },

  // ── 귀국 (왕복) ──
  {
    id: 'au.export-quarantine-before-return',
    country: COUNTRY,
    category: '검역',
    title: '호주 수출 검역일 순서',
    description:
      '호주 수출 검역(수출 허가·건강증명서 발급)일은 호주 입국일 이후, 한국 귀국일 이전이어야 함. DAFF 는 허가 발급 후 **72시간 이내 출국**을 허가 조건으로 둔다.',
    severity: 'warning',
    addedAt: '2026-07-27',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const scoped = readByDestValue(data, destination ?? null, 'au_export_quarantine_date')
      const raw =
        typeof scoped === 'string'
          ? scoped.slice(0, 10)
          : scoped === null
            ? ''
            : typeof data.au_export_quarantine_date === 'string'
              ? data.au_export_quarantine_date.slice(0, 10)
              : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP

      const entry = readEntryDate(caseRow, destination)
      if (entry && raw < entry) {
        return {
          ok: false,
          message: msgExportQuarantineBeforeEntry('호주'),
          offendingPaths: ['au_export_quarantine_date'],
        }
      }
      const ret = typeof data.return_date === 'string' ? data.return_date.slice(0, 10) : ''
      if (ret && raw > ret) {
        return {
          ok: false,
          message: msgExportQuarantineAfterReturn('호주'),
          offendingPaths: ['au_export_quarantine_date', 'return_date'],
        }
      }
      return { ok: true, message: `호주 수출검역일(${raw}) 입국 이후·귀국 이전.` }
    },
  },

  // ── 종합백신 (렙토스피라 Canicola) — 강아지 전용 ──
  {
    id: 'au.general-vaccine-14days-before-departure',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신(렙토 Canicola)은 출국 14일 전까지',
    description:
      'DAFF 7.2 — Leptospira interrogans serovar Canicola 백신은 "administered between 12 months and 14 days before export". 기초 접종의 마지막 회차 또는 연간 추가 접종이 기준이다. 저장 거부(generalVaccineWaitDays: 14)와 같은 값.',
    severity: 'warning',
    addedAt: '2026-07-27',
    run: ({ caseRow, destination }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 14) {
        return {
          ok: false,
          message: '종합백신은 출국 14일 전까지 접종해야 해요.',
          offendingPaths: [`general_vaccine_dates[${latest.originalIndex}].date`, 'departure_date'],
        }
      }
      return { ok: true, message: `최근 종합백신(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },
  {
    id: 'au.general-vaccine-within-12months',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신(렙토 Canicola)은 출국 12개월 이내',
    description:
      'DAFF 7.2 — Canicola 는 "between 12 months and 14 days before export" 로 상한도 있다. 12개월을 넘겼으면 추가 접종이 필요하다. (DHPP 는 권장 항목이라 여기서 판정하지 않는다 — 같은 카드에 기록되지만 요건은 Canicola 다.)',
    severity: 'warning',
    addedAt: '2026-07-27',
    run: ({ caseRow, destination }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const withinYear = entries.find((e) => addYears(e.date, 1) >= dep)
      if (withinYear) {
        return { ok: true, message: `종합백신(${withinYear.date}) 출국 12개월 이내.` }
      }
      const latest = entries[entries.length - 1]
      return {
        ok: false,
        message: '종합백신은 출국일 기준 12개월 이내에 접종한 기록이 있어야 해요. 추가 접종이 필요해요.',
        offendingPaths: [`general_vaccine_dates[${latest.originalIndex}].date`, 'departure_date'],
      }
    },
  },

  // ── 독감(CIV) — 한국 출발 강아지 필수 ──
  {
    id: 'au.civ-14days-before-departure',
    country: COUNTRY,
    category: '종합백신',
    title: '독감(CIV) 백신은 출국 14일 전까지',
    description:
      'DAFF 7.2 "For USA and South Korea only" — 한국 출발 개는 CIV 접종이 **필수**. 기초 접종은 "completed at least 14 days before export", 추가 접종은 "between 12 months and 14 days before export". ⛔ 회차·간격 요건은 규정에 없다(구 룰의 "정확히 14일 간격" 강제는 2026-07-27 삭제).',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const entries = readCivEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 14) {
        return {
          ok: false,
          message: '독감(CIV) 백신은 출국 14일 전까지 접종해야 해요.',
          offendingPaths: [`civ_dates[${latest.originalIndex}].date`, 'departure_date'],
        }
      }
      return { ok: true, message: `최근 CIV(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },
  {
    id: 'au.civ-within-12months',
    country: COUNTRY,
    category: '종합백신',
    title: '독감(CIV) 백신은 출국 12개월 이내',
    description:
      'DAFF 7.2 — 정기 접종견의 추가 접종은 "between 12 months and 14 days before export". 12개월을 넘겼으면 출국 전에 추가 접종이 필요하다.',
    severity: 'warning',
    addedAt: '2026-07-27',
    run: ({ caseRow, destination }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const entries = readCivEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const withinYear = entries.find((e) => addYears(e.date, 1) >= dep)
      if (withinYear) {
        return { ok: true, message: `CIV(${withinYear.date}) 출국 12개월 이내.` }
      }
      const latest = entries[entries.length - 1]
      return {
        ok: false,
        message: '독감(CIV) 백신은 출국일 기준 12개월 이내에 접종한 기록이 있어야 해요. 추가 접종이 필요해요.',
        offendingPaths: [`civ_dates[${latest.originalIndex}].date`, 'departure_date'],
      }
    },
  },

  // ── 전염병 검사 — 강아지 전용 ──
  {
    id: 'au.infectious-disease-test-within-45days',
    country: COUNTRY,
    category: '검사',
    title: '전염병 검사는 출국 45일 이내 (강아지)',
    description:
      'DAFF 7.3~7.5 — 리슈만편모충(전 개체, 정량 IFAT 또는 ELISA) + 브루셀라(중성화 안 한 개체, RSAT·TAT(SAT)·IFAT) + 렙토 MAT(Canicola 백신 미접종 시)가 모두 "within 45 days of the date of export". DAFF 예제(출국 1/30 → 12/16)대로 45일 당일까지 인정한다.',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const entries = readInfectiousDiseaseEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 0) {
        return {
          ok: false,
          message: '전염병 검사일이 출국일보다 늦어요. 날짜를 확인하세요.',
          offendingPaths: [`infectious_disease_records[${latest.originalIndex}].date`],
        }
      }
      if (days > 45) {
        return {
          ok: false,
          message: '전염병 검사는 출국 45일 이내에 받아야 해요. 다시 검사받아야 할 수 있어요.',
          offendingPaths: [`infectious_disease_records[${latest.originalIndex}].date`, 'departure_date'],
        }
      }
      const note = isIntact(caseRow) ? ' (중성화 미실시 — 브루셀라 검사 포함 대상)' : ''
      return { ok: true, message: `최근 전염병검사(${latest.date}) → 출국일(${dep}): ${days}일.${note}` }
    },
  },

  // ── 외부구충 (종 분리) ──
  // ⚠️ 인자를 객체로 받는 이유 — `pnpm lint:journey` 는 procedure-checks 소스에서 `id: '...'`
  //   리터럴을 정규식으로 훑어 룰 목록을 만든다. 위치 인자로 넘기면 id 리터럴이 잡히지 않아
  //   카드가 이 룰을 지목하는 순간 '없는 룰'로 실패한다(2026-07-27).
  ...buildExternalParasiteRule({ id: 'au.external-parasite-protocol-cat', speciesKey: 'cat', maxIntervalDays: 21 }),
  ...buildExternalParasiteRule({ id: 'au.external-parasite-protocol-dog', speciesKey: 'dog', maxIntervalDays: 30 }),

  // ── 내부구충 (양종 동일) ──
  {
    id: 'au.internal-parasite-protocol',
    country: COUNTRY,
    category: '구충',
    title: '내부구충 2회 (45일 이내, 14일 이상 간격, 2차는 5일 이내)',
    description:
      'DAFF 7.7 — "treated twice within 45 days before export. The two treatments must be spaced at least 14 days apart. The second treatment must be given within 5 days before the export date." DAFF 예제(출국 1/30 → 1차 12/16, 2차 1/25)대로 45일·5일 당일까지 인정한다. 선충·조충을 모두 커버하는 약이어야 한다.',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readInternalParasiteEntries(caseRow)
      if (!dep) return SKIP
      if (entries.length === 0) return SKIP
      if (entries.length < 2) {
        return {
          ok: false,
          message: '내부 기생충 치료는 출국 45일 이내에 2회 받아야 해요.',
          offendingPaths: [`internal_parasite_dates[${entries[0].originalIndex}].date`],
        }
      }

      const dose1 = entries[entries.length - 2]
      const dose2 = entries[entries.length - 1]
      const dep1 = daysBetween(dose1.date, dep)
      const dep2 = daysBetween(dose2.date, dep)
      const interval = daysBetween(dose1.date, dose2.date)

      const issues: string[] = []
      const offending: string[] = []
      if (dep1 === null || dep1 < 0 || dep1 > 45) {
        issues.push('1차 치료는 출국 45일 이내여야 해요.')
        offending.push(`internal_parasite_dates[${dose1.originalIndex}].date`)
      }
      if (dep2 === null || dep2 < 0 || dep2 > 5) {
        issues.push('2차 치료는 출국 5일 이내여야 해요.')
        offending.push(`internal_parasite_dates[${dose2.originalIndex}].date`)
      }
      if (interval === null || interval < 14) {
        issues.push('두 번의 치료는 14일 이상 벌어져야 해요.')
        offending.push(
          `internal_parasite_dates[${dose1.originalIndex}].date`,
          `internal_parasite_dates[${dose2.originalIndex}].date`,
        )
      }
      if (issues.length > 0) {
        return { ok: false, message: issues.join(' '), offendingPaths: Array.from(new Set(offending)) }
      }
      return {
        ok: true,
        message: `1차(${dose1.date}) → 2차(${dose2.date}): 간격 ${interval}일, 2차→출국 ${dep2}일.`,
      }
    },
  },
]

/** 외부구충 룰 빌더. species 필터 + 첫 도즈 ≥ N일 전 + 도즈 간격 ≤ N + 마지막→출국 ≤ N. */
function buildExternalParasiteRule({
  id,
  speciesKey,
  maxIntervalDays,
}: {
  id: string
  speciesKey: 'cat' | 'dog'
  maxIntervalDays: number
}): ProcedureCheck[] {
  return [
    {
      id,
      country: COUNTRY,
      category: '구충',
      title:
        speciesKey === 'cat'
          ? '외부구충 (고양이): 첫 처치 21일 전 이상, 출국까지 지속'
          : '외부구충 (강아지): 첫 처치 30일 전 이상, 출국까지 지속',
      description:
        speciesKey === 'cat'
          ? '고양이 가이드 7.3 — "Start at least 21 days before export"(예: 1/1 처치 → 최소 1/22 출국). 개(30일)와 값만 다르고 판정 구조는 같다. 2026-07-27 원문 확인.'
          : 'DAFF 7.6 — "Start at least 30 days before export and repeat according to manufacturer\'s directions." 진드기·벼룩을 접촉 살충하는 제품으로 출국일까지 약효가 끊기지 않아야 한다. DAFF 예제(1/1 처치 → 최소 1/31 출국)대로 30일 전 당일 시작을 인정한다. 연속 보호 판정은 도즈 간격·마지막 처치→출국 간격을 30일 이하로 본다.',
      severity: 'warning',
      addedAt: '2026-05-05',
      run: ({ caseRow, destination }) => {
        if (species(caseRow) !== speciesKey) return SKIP
        const dep = readDepartureDate(caseRow, destination)
        const entries = readExternalParasiteEntries(caseRow)
        if (!dep || entries.length === 0) return SKIP

        const first = entries[0]
        const firstToDep = daysBetween(first.date, dep)
        const issues: string[] = []
        const offending: string[] = []

        if (firstToDep === null || firstToDep < maxIntervalDays) {
          issues.push(`외부 기생충 치료는 출국 ${maxIntervalDays}일 전에 시작해야 해요.`)
          offending.push(`external_parasite_dates[${first.originalIndex}].date`)
        }

        for (let i = 1; i < entries.length; i++) {
          const prev = entries[i - 1]
          const curr = entries[i]
          const gap = daysBetween(prev.date, curr.date)
          if (gap === null) continue
          if (gap > maxIntervalDays) {
            issues.push(`치료 간격이 ${maxIntervalDays}일을 넘으면 약효가 끊길 수 있어요.`)
            offending.push(
              `external_parasite_dates[${prev.originalIndex}].date`,
              `external_parasite_dates[${curr.originalIndex}].date`,
            )
          }
        }

        const last = entries[entries.length - 1]
        const lastToDep = daysBetween(last.date, dep)
        if (lastToDep === null || lastToDep < 0 || lastToDep > maxIntervalDays) {
          issues.push(`마지막 치료부터 출국일까지 약효가 이어져야 해요.`)
          offending.push(`external_parasite_dates[${last.originalIndex}].date`)
        }

        if (issues.length > 0) {
          return {
            ok: false,
            message: Array.from(new Set(issues)).join(' '),
            offendingPaths: Array.from(new Set(offending)),
          }
        }
        return {
          ok: true,
          message: `첫(${first.date}) → 마지막(${last.date}) → 출국(${dep}): 모든 간격 ≤${maxIntervalDays}일.`,
        }
      },
    } satisfies ProcedureCheck,
  ]
}
