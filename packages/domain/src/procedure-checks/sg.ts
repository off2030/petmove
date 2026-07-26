import {
  buildDateRuleContext,
  validateAeImportPermitWithin90Days,
  validateImportPermitNotAfterDeparture,
  validateSgImportPermitAfterDogLicence,
  validateSgBorderInspectionDate,
  validateSgDepartureVsQuarantineReservation,
  validateSgGstPermitDate,
  validateSgParasiteWindow,
  validateSgQuarantineReservationDate,
  validateSgQuarantineReservationFiled,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import { readByDestValue } from '../destination-scoped-fields'
import {
  addYears,
  daysBetween,
  findRabiesValidityBreaks,
  matchBannedBreed,
  readBreed,
  readExternalParasiteEntries,
  readGeneralVaccineEntries,
  readInternalParasiteEntries,
  readRabiesEntries,
  readScopedImportPermitFiled,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
  todayKst,
  readDepartureDate,
  readVetVisitDate,
} from './utils'
import { msgMicrochipBeforeGeneralVaccine, msgMicrochipBeforeRabies, msgRabiesPrimeMinAge } from './messages'

/**
 * 싱가포르 (NParks/AVS Schedule III) 절차 검증.
 *
 * 출처: NParks/AVS "Veterinary Certificate for Import of Dogs and Cats — Schedule III",
 * Section IV (Veterinary Certification).
 * Schedule III = Schedule I/II 국가 발 (한국 포함).
 *
 * 컨벤션: jp.ts 와 동일.
 *  - 필수 입력 누락 시 SKIP (ok: true, 색상·알림 없음)
 *  - 유효기간은 `addYears(d, 1)` (1주년 당일까지 유효) → "유효기간 1년" 해석
 *  - offendingPaths 로 문제 필드 경로를 알려주면 상세페이지에서 색상·툴팁 표시
 */

/** 강아지 라이선스 신청일 — by_dest 우선, 명시적 비움은 fallback 금지(readScopedImportPermitFiled 와 동형). */
function readScopedSgDogLicenceApplied(
  data: Record<string, unknown>,
  destination?: string | null,
): string {
  const scoped = readByDestValue(data, destination ?? null, 'sg_dog_licence_application_date')
  if (typeof scoped === 'string') return scoped.slice(0, 10)
  if (scoped === null) return ''
  return typeof data.sg_dog_licence_application_date === 'string'
    ? data.sg_dog_licence_application_date.slice(0, 10)
    : ''
}

export const SG_CHECKS: ProcedureCheck[] = [
  // ── 광견병 ──
  {
    id: 'sg.rabies-prime-after-12weeks',
    country: 'singapore',
    category: '광견병',
    title: '광견병 1차 접종 생후 12주(84일) 이상',
    description:
      '광견병 1차 접종은 생후 최소 12주(84일) 이후. NParks Schedule III 조건 PDF — 광견병은 "제조사 권장"(라벨 통상 12주) + 유일한 연령 요건 "animal must be at least 12 weeks of age at the time of export". 태국·필리핀과 동일 기준(구 91일 AND 3개월 과보수값 정정, 2026-07-24).',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
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
          message: msgRabiesPrimeMinAge('84일(12주)'),
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${age}일령.` }
    },
  },
  {
    id: 'sg.titer-min-28days-after-vaccine',
    country: 'singapore',
    category: '광견병',
    title: '항체 검사는 광견병 접종 28일 후',
    description:
      'RNATT 채혈일은 직전 광견병 접종(1차 또는 부스터)으로부터 28일 이후여야 함. (Schedule III IV(a)(iii) "At least 28 days after the primary rabies vaccination or rabies booster")',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const rabies = readRabiesEntries(caseRow)
      const titers = readTiterEntries(caseRow)
      if (rabies.length === 0 || titers.length === 0) return SKIP

      const offendingPaths: string[] = []
      const problems: string[] = []
      for (const t of titers) {
        // 채혈일 이전(또는 같은 날) 가장 최근 접종 찾기
        const priorDoses = rabies.filter((r) => r.date <= t.date)
        if (priorDoses.length === 0) {
          offendingPaths.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push('채혈일 이전의 광견병 접종 기록이 없어요.')
          continue
        }
        const latest = priorDoses[priorDoses.length - 1]
        const gap = daysBetween(latest.date, t.date)
        if (gap === null || gap < 28) {
          offendingPaths.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push('광견병 항체 검사는 직전 접종 28일 후에 채혈해야 해요.')
        }
      }
      if (offendingPaths.length > 0) {
        return {
          ok: false,
          message: problems.join(' / '),
          offendingPaths,
        }
      }
      return { ok: true, message: '항체 검사 시기 적합 (28일 경과).' }
    },
  },
  {
    // 출국일 ↔ 계류장 예약일 정합 — 예약일을 먼저 잡고 항공권을 맞추는 흐름(2026-07-25).
    // 저장 거부(validateSgDepartureVsQuarantineReservation)의 짝 — 정상 입력은 client 가 막고,
    // 예약일을 나중에 수정해 어긋난 경우만 여기 주의가 뜬다.
    id: 'sg.departure-matches-quarantine-reservation',
    country: 'singapore',
    category: '검역',
    title: '출국일은 계류장 예약일 당일 또는 하루 전',
    description:
      '계류 시작(예약일) = 싱가포르 도착일 — 한국발은 당일(자정 넘김 +1일) 도착이므로 출국일은 예약일 당일 또는 하루 전이어야 함. 예약일 미입력이면 검사 안 함.',
    severity: 'warning',
    addedAt: '2026-07-25',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const reservation =
        typeof data.sg_quarantine_reservation_date === 'string'
          ? data.sg_quarantine_reservation_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(reservation)) return SKIP
      const dep = readDepartureDate(caseRow, destination)
      if (!dep) return SKIP
      const err = validateSgDepartureVsQuarantineReservation(dep, reservation)
      if (err) {
        return {
          ok: false,
          message: err,
          offendingPaths: ['departure_date', 'sg_quarantine_reservation_date'],
        }
      }
      return { ok: true, message: `출국일(${dep}) = 계류장 예약일(${reservation}) 당일/하루 전.` }
    },
  },
  {
    id: 'sg.departure-min-90days-after-titer',
    country: 'singapore',
    category: '광견병',
    title: '출국일은 항체 검사일 90일 이후',
    description:
      'RNATT 채혈일로부터 출국일까지 최소 90일 경과 필요. 저장 거부(validateEuEntryDate, titer.entryWaitAfterTiter.days=90)와 같은 정확한 일수 기준. (Schedule III IV(a)(iii) "not less than 90 days ... prior to export")',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      let best: { entry: (typeof titers)[number]; days: number } | null = null
      for (const t of titers) {
        const days = daysBetween(t.date, dep)
        if (days === null) continue
        if (!best || days > best.days) best = { entry: t, days }
      }
      if (best && best.days >= 90) {
        return { ok: true, message: `항체 검사(${best.entry.date}) → 출국일(${dep}): ${best.days}일.` }
      }
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return {
        ok: false,
        message: '광견병 항체 검사 채혈일로부터 90일이 지난 후에 출국할 수 있어요.',
        offendingPaths: offending,
      }
    },
  },
  {
    id: 'sg.departure-within-12months-of-titer',
    country: 'singapore',
    category: '광견병',
    title: '출국일은 항체 검사일 12개월 이내',
    description:
      'RNATT 유효기간 12개월 — 출국일이 채혈일 + 1년을 넘으면 재검사 필요. 1주년 당일까지 인정. (Schedule III IV(a)(iii) "not more than 12 months prior to export")',
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      const valid = titers.find((t) => addYears(t.date, 1) >= dep)
      if (valid) {
        return {
          ok: true,
          message: `항체 검사(${valid.date}) 유효(${addYears(valid.date, 1)}) ≥ 출국일(${dep}).`,
        }
      }
      const newest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const newestValidUntil = addYears(newest.date, 1)
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return {
        ok: false,
        message: '광견병 항체 검사 결과는 12개월간 유효해요. 유효기간이 지나기 전에 출국해야 해요.',
        offendingPaths: offending,
      }
    },
  },
  {
    id: 'sg.rabies-valid-until-on-departure',
    country: 'singapore',
    category: '광견병',
    title: '출국일 시점 광견병 면역 유효',
    description:
      '출국일에 가장 최근 광견병 접종의 면역 유효기간이 만료되지 않아야 함. (Schedule III IV(a)(iii) "valid ... in accordance with the recommendations of the vaccine manufacturer")',
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      // 이미 만료(오늘 기준)는 common.rabies-validity-expired '주의'가 담당 — 여기선 아직
      // 유효한데 출국 시점에 만료 예정인 경우만 남긴다(만료 재구성 B, 2026-07-25).
      if (validUntil < todayKst()) return SKIP

      if (validUntil < dep) {
        return {
          ok: false,
          message: '출국일에 광견병 백신 면역 유효기간이 남아있어야 해요.',
          offendingPaths: [
            'departure_date',
            `rabies_dates[${latest.originalIndex}].date`,
          ],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── 종합백신 ──
  {
    id: 'sg.comprehensive-vaccine-14days-before-departure',
    country: 'singapore',
    category: '종합백신',
    title: '종합백신은 출국일 14일 이전 접종',
    description:
      '종합백신(개: distemper/adeno1/parvo2, 고양이: calici/herpes-1/panleuk)은 출국 최소 14일 전 접종 필요. (Schedule III IV(a)(iv)(v) "not less than two (2) weeks prior to export")',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const diff = daysBetween(latest.date, dep)
      if (diff === null) return SKIP
      if (diff < 14) {
        return {
          ok: false,
          message: '종합백신은 출국 14일 전까지 접종해야 해요.',
          offendingPaths: [`general_vaccine_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 종합백신(${latest.date}) → 출국일(${dep}): ${diff}일.` }
    },
  },
  {
    id: 'sg.comprehensive-vaccine-valid-on-departure',
    country: 'singapore',
    category: '종합백신',
    title: '출국일 시점 종합백신 면역 유효',
    description:
      '출국일에 가장 최근 종합백신의 면역 유효기간이 만료되지 않아야 함. valid_until 미입력 시 디폴트 1년(addOneYear = 1주년 당일까지) 적용. (Schedule III IV(a)(iv)(v) "according to the vaccine manufacturer\'s recommendations")',
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      // 이미 만료(오늘 기준)는 common.general-vaccine-validity-expired '주의'가 담당 —
      // 여기선 아직 유효한데 출국 시점에 만료 예정인 경우만 남긴다(만료 재구성 B, 2026-07-25).
      if (validUntil < todayKst()) return SKIP
      if (validUntil < dep) {
        return {
          ok: false,
          message: '출국일에 종합백신 면역 유효기간이 남아있어야 해요.',
          offendingPaths: [
            'departure_date',
            `general_vaccine_dates[${latest.originalIndex}].date`,
          ],
        }
      }
      return { ok: true, message: `최근 종합백신(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── 구충 ──
  {
    id: 'sg.external-parasite-2to7days-before-departure',
    country: 'singapore',
    category: '구충',
    title: '외부구충은 출국일 2~7일 전',
    description:
      '외부구충(벼룩·진드기) 처치는 출국일 기준 2~7일 사이에 실시. (Schedule III IV(a)(vi) "between 2 and 7 days of export")',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readExternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      // 판정·문구 = 저장 거부(validateSgParasiteWindow)와 단일 출처 — 정상 입력은 client 가
      // 막고, 출국일을 나중에 수정해 어긋난 경우만 여기 안내가 뜬다(2026-07-25 차단 격상).
      const err = validateSgParasiteWindow(latest.date, dep, '외부 기생충 치료')
      if (err) {
        return {
          ok: false,
          message: err,
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      const diff = daysBetween(latest.date, dep)
      return { ok: true, message: `외부구충(${latest.date}) → 출국일(${dep}): ${diff}일.` }
    },
  },
  {
    id: 'sg.internal-parasite-2to7days-before-departure',
    country: 'singapore',
    category: '구충',
    title: '내부구충은 출국일 2~7일 전',
    description:
      '내부구충(선충·조충) 처치는 출국일 기준 2~7일 사이에 실시. (Schedule III IV(a)(vi) "between 2 and 7 days of export")',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readInternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      // 판정·문구 = 저장 거부(validateSgParasiteWindow)와 단일 출처(외부구충과 동일).
      const err = validateSgParasiteWindow(latest.date, dep, '내부 기생충 치료')
      if (err) {
        return {
          ok: false,
          message: err,
          offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      const diff = daysBetween(latest.date, dep)
      return { ok: true, message: `내부구충(${latest.date}) → 출국일(${dep}): ${diff}일.` }
    },
  },

  // ── 수입 금지 견종 ──
  {
    id: 'sg.banned-breeds',
    country: 'singapore',
    category: '서류',
    title: '수입 금지 견종 (NParks First Schedule Part 1)',
    description:
      'NParks First Schedule Part 1 (수입·판매·방문·거주 전면 금지): Pit Bull 계열(American Pit Bull Terrier, American Staffordshire Terrier, Staffordshire Bull Terrier, American Bulldog), Neapolitan Mastiff, Tosa, Akita, Dogo Argentino, Boerboel, Fila Brasileiro, Perro de Presa Canario 및 교잡. (Animals and Birds (Licensing and Control of Cats and Dogs) Rules 2024)',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const species = typeof data.species === 'string' ? data.species : ''
      if (species && species !== 'dog') return SKIP
      const breed = readBreed(caseRow)
      if (!breed.ko && !breed.en) return SKIP
      const match = matchBannedBreed(breed, [
        'pit bull', 'pitbull', '핏불',
        'american staffordshire terrier', '아메리칸 스태퍼드셔',
        'staffordshire bull terrier', '스태퍼드셔 불 테리어',
        'american bulldog', '아메리칸 불독',
        'neapolitan mastiff', '네아폴리탄 마스티프',
        'tosa', '도사', '도사 이누',
        'akita', '아키타',
        'dogo argentino', '도고 아르헨티노',
        'boerboel', '보어보엘',
        'fila brasileiro', '필라 브라질레이로',
        'perro de presa canario', '프레사 카나리오',
      ])
      if (match) {
        return {
          ok: false,
          message: `견종 "${breed.ko || breed.en}"은 NParks 수입 금지 대상이에요 (매치: ${match}).`,
          offendingPaths: ['breed', 'breed_en'],
        }
      }
      return { ok: true, message: `견종 "${breed.ko || breed.en}" 통과.` }
    },
  },

  // ── 광견병 chain (말레이시아 my.ts 복제) ──
  {
    id: 'sg.rabies-booster-within-prime-validity',
    country: 'singapore',
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간 이내에 해야 함. 만료 후 접종은 chain 이 끊겨 새 1차로 간주된다. 저장 거부(findRabiesChainBreak)의 짝이 되는 주의 — 펫무브워크는 저장을 막지 않고 절차검증만 보므로 이 룰이 없으면 운영자 화면에서 끊긴 chain 이 안 보인다.',
    severity: 'warning',
    addedAt: '2026-07-24',
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

  // ── 마이크로칩 (my.ts 복제) ──
  {
    id: 'sg.microchip-before-rabies',
    country: 'singapore',
    category: '마이크로칩',
    title: '마이크로칩, 백신 타이밍',
    description:
      '마이크로칩(ISO 11784/11785)이 광견병 접종일과 같거나 이전이어야 함. 입국 시 칩 번호와 서류 일치 검증. 백신 입력 시 client 차단(validateMicrochipBeforeBooster)과 짝.',
    severity: 'warning',
    addedAt: '2026-07-24',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const microchip = typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!microchip || rabies.length === 0) return SKIP
      const first = rabies[0]
      if (microchip <= first.date) {
        return { ok: true, message: `마이크로칩(${microchip}) ≤ 접종(${first.date}).` }
      }
      return {
        ok: false,
        message: msgMicrochipBeforeRabies(),
        offendingPaths: ['microchip_implant_date', `rabies_dates[${first.originalIndex}].date`],
      }
    },
  },
  {
    id: 'sg.microchip-before-general-vaccine',
    country: 'singapore',
    category: '마이크로칩',
    title: '마이크로칩, 종합백신 타이밍',
    description:
      '마이크로칩(ISO 11784/11785)이 종합백신 접종일과 같거나 이전이어야 함. 칩으로 식별된 동물의 접종만 인정.',
    severity: 'warning',
    addedAt: '2026-07-24',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const microchip = typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      const entries = readGeneralVaccineEntries(caseRow)
      if (!microchip || entries.length === 0) return SKIP
      const first = entries[0]
      if (microchip <= first.date) {
        return { ok: true, message: `마이크로칩(${microchip}) ≤ 종합백신(${first.date}).` }
      }
      return {
        ok: false,
        message: msgMicrochipBeforeGeneralVaccine(),
        offendingPaths: ['microchip_implant_date', `general_vaccine_dates[${first.originalIndex}].date`],
      }
    },
  },

  // ── 수입 허가 / 검역 (my.ts 복제) ──
  // ── 수입 허가(GoBusiness) — 90일 유효 (2026-07-25 신설, UAE 패턴) ──
  // 입력 차단(validateImportPermitFiledDate case 'singapore')과 같은 함수를 본다.
  {
    id: 'sg.import-permit-within-90days',
    country: 'singapore',
    category: '수입허가',
    title: '수입 허가는 도착 90일 이내 신청',
    description:
      '싱가포르 수입 허가(Licence to Import)는 발급일로부터 90일 유효 — 너무 일찍 신청하면 도착 전에 만료된다. 입력 차단과 같은 함수(validateAeImportPermitWithin90Days — 목적지 중립 90일 로직 재사용).',
    severity: 'warning',
    addedAt: '2026-07-25',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const filed = readScopedImportPermitFiled(data, destination)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(filed)) return SKIP
      const dep = readDepartureDate(caseRow, destination)
      if (!dep) return SKIP
      const msg = validateAeImportPermitWithin90Days(filed, dep)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['import_permit_application_date'] }
      }
      return { ok: true, message: `신청일(${filed}) 출국일(${dep}) 기준 90일 이내.` }
    },
  },
  {
    id: 'sg.import-permit-not-after-departure',
    country: 'singapore',
    category: '수입허가',
    title: '수입 허가 신청일, 출국일 순서',
    description:
      '수입 허가 신청일은 출국일 이전이어야 함(출국 당일·이후엔 신청 불가). 입력 차단(validateImportPermitNotAfterDeparture)과 같은 함수.',
    severity: 'warning',
    addedAt: '2026-07-24',
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
  // ── 강아지 라이선스 → 수입 허가 선행 순서 (2026-07-25 신설) ──
  // AVS/GoBusiness: 강아지 라이선스(PALS)가 있어야 수입 허가를 신청할 수 있다.
  // 두 신청일이 모두 입력된 경우에만 순서를 비교한다 — 라이선스 날짜 미입력을 미보유로
  // 단정하지 않는다(추측 단정 금지). 고양이는 라이선스 불요라 SKIP.
  // 저장 거부(validateImportPermitFiledDate 싱가포르 분기)와 같은 함수 — 수입 허가 신청일
  // 입력은 저장이 막히고, 라이선스 날짜를 나중에 고쳐 어긋난 경우를 이 주의가 잡는다.
  {
    id: 'sg.dog-licence-before-import-permit',
    country: 'singapore',
    category: '수입허가',
    title: '강아지 라이선스 → 수입 허가 순서',
    description:
      '수입 허가(Licence to Import)는 강아지 라이선스를 먼저 받아야 신청 가능. 라이선스 신청일과 수입 허가 신청일이 둘 다 입력된 경우에만 순서 비교(미입력은 SKIP). 입력 차단과 같은 함수(validateSgImportPermitAfterDogLicence).',
    severity: 'warning',
    addedAt: '2026-07-25',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const species = typeof data.species === 'string' ? data.species : ''
      const filed = readScopedImportPermitFiled(data, destination)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(filed)) return SKIP
      const licence = readScopedSgDogLicenceApplied(data, destination)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(licence)) return SKIP
      const msg = validateSgImportPermitAfterDogLicence(filed, licence, species)
      if (msg) {
        return {
          ok: false,
          message: msg,
          offendingPaths: ['import_permit_application_date', 'sg_dog_licence_application_date'],
        }
      }
      return { ok: true, message: `라이선스 신청(${licence}) → 수입 허가 신청(${filed}) 순서 정상.` }
    },
  },
  {
    id: 'sg.import-quarantine-date-valid',
    country: 'singapore',
    category: '검역',
    title: '싱가포르 수입 검역일',
    description: '싱가포르 수입 검역일은 싱가포르 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-24',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.sg_import_quarantine_date === 'string'
          ? data.sg_import_quarantine_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      if (entry && raw < entry) {
        return {
          ok: false,
          message: '싱가포르 수입 검역일은 싱가포르 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['sg_import_quarantine_date'],
        }
      }
      return { ok: true, message: `싱가포르 수입검역일(${raw}) 입국 이후.` }
    },
  },

  // ── 관세·GST 납부 허가 — 도착 전 + 14일 창 (2026-07-25 신설) ──
  // 입력 차단(validateSgGstPermitDate)과 같은 함수 — 출국일을 나중에 수정해 어긋난 경우 주의.
  {
    id: 'sg.gst-permit-within-14days',
    country: 'singapore',
    category: '수입허가',
    title: 'GST 납부 허가는 도착 전 14일 이내',
    description:
      '관세청 GST 납부 허가(Customs In-Payment permit)는 도착 전 + 도착일 기준 14일 이내 창. (NParks "Within 14 days of arrival, obtain a Customs In-Payment permit" — before-arrival 창 해석.)',
    severity: 'warning',
    addedAt: '2026-07-25',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const issued =
        typeof data.sg_gst_permit_date === 'string' ? data.sg_gst_permit_date.slice(0, 10) : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(issued)) return SKIP
      const dep = (readDepartureDate(caseRow, destination) ?? '').slice(0, 10)
      if (!dep) return SKIP
      const msg = validateSgGstPermitDate(issued, dep)
      if (msg) {
        return {
          ok: false,
          message: msg,
          offendingPaths: ['sg_gst_permit_date', 'departure_date'],
        }
      }
      return { ok: true, message: `발급일(${issued}) 출국일(${dep}) 기준 도착 전 14일 이내.` }
    },
  },

  // ── 국경 검사(CAPQ) 예약 — 도착 최소 5일 전 (2026-07-25 신설) ──
  // 입력 차단(validateSgBorderInspectionDate)과 같은 함수 — 출국일 수정으로 어긋난 경우 주의.
  {
    id: 'sg.border-inspection-5days-before',
    country: 'singapore',
    category: '검역',
    title: '국경 검사는 도착 최소 5일 전 예약',
    description:
      'CAPQ 도착 검사 예약은 도착 최소 5일 전. (NParks "Book an inspection ... five days before the animal\'s arrival, or earlier." 예약 없이 도착하면 시간당 S$133.)',
    severity: 'warning',
    addedAt: '2026-07-25',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const booked =
        typeof data.sg_border_inspection_date === 'string'
          ? data.sg_border_inspection_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(booked)) return SKIP
      const dep = (readDepartureDate(caseRow, destination) ?? '').slice(0, 10)
      if (!dep) return SKIP
      const msg = validateSgBorderInspectionDate(booked, dep)
      if (msg) {
        return {
          ok: false,
          message: msg,
          offendingPaths: ['sg_border_inspection_date', 'departure_date'],
        }
      }
      return { ok: true, message: `예약일(${booked}) 도착(${dep}) 5일 이상 전.` }
    },
  },

  // ── 계류장 예약 ──
  {
    id: 'sg.quarantine-reservation-after-titer',
    country: 'singapore',
    category: '검역',
    title: '계류장 예약은 항체 검사 채혈 이후',
    description:
      'AQC 계류장 예약(QMS)은 광견병 항체 검사 결과가 나온 뒤에 하므로, 예약일은 채혈일 이후여야 함. (NParks "Reserve quarantine space when the serology test result is ready")',
    severity: 'warning',
    addedAt: '2026-07-24',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      // 신청 → 발급 모델로 전환(2026-07-24) — 예약 신청일 필드를 본다.
      const reservation =
        typeof data.sg_quarantine_reservation_application_date === 'string'
          ? data.sg_quarantine_reservation_application_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(reservation)) return SKIP
      const titers = readTiterEntries(caseRow)
      if (titers.length === 0) return SKIP
      const earliest = [...titers].sort((a, b) => a.date.localeCompare(b.date))[0]
      // 판정·문구 = 저장 거부(validateSgQuarantineReservationFiled)와 단일 출처 —
      // 정상 입력은 client 가 막고, 채혈일을 나중에 수정해 어긋난 경우만 여기 주의가 뜬다.
      const err = validateSgQuarantineReservationFiled(
        reservation,
        titers.map((t) => t.date),
      )
      if (err) {
        return {
          ok: false,
          message: err,
          offendingPaths: [
            'sg_quarantine_reservation_application_date',
            `rabies_titer_records[${earliest.originalIndex}].date`,
          ],
        }
      }
      return { ok: true, message: `계류장 예약 신청일(${reservation}) 채혈(${earliest.date}) 이후.` }
    },
  },

  // ── 계류장 예약 날짜(정보성, 선택 입력) — 항체 창 ──
  {
    id: 'sg.quarantine-reservation-date-within-titer-window',
    country: 'singapore',
    category: '검역',
    title: '계류장 예약 날짜는 항체 검사 90일 후·12개월 이내',
    description:
      '계류장(AQC) 예약 날짜(정보성·선택 입력)는 격리 시작 = 입국 시점이므로, RNATT 채혈일 + 90일 이후 ~ + 12개월 이내여야 함. 출국일 창(sg.departure-min-90days-after-titer / -within-12months-of-titer)과 같은 기준. 미입력이면 검사 안 함. (Schedule III IV(a)(iii))',
    severity: 'warning',
    addedAt: '2026-07-24',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const reservation =
        typeof data.sg_quarantine_reservation_date === 'string'
          ? data.sg_quarantine_reservation_date.slice(0, 10)
          : ''
      // 선택 입력 — 비어 있으면 검사하지 않는다.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(reservation)) return SKIP
      const titers = readTiterEntries(caseRow)
      if (titers.length === 0) return SKIP
      // 판정·문구 = 저장 거부(validateSgQuarantineReservationDate)와 단일 출처 —
      // 정상 입력은 client 가 막고, 채혈일을 나중에 수정해 어긋난 경우만 여기 주의가 뜬다.
      const err = validateSgQuarantineReservationDate(
        reservation,
        titers.map((t) => t.date),
      )
      if (!err) {
        return { ok: true, message: `계류장 예약 날짜(${reservation}) 항체 검사 창(90일~12개월) 내.` }
      }
      const offending: string[] = ['sg_quarantine_reservation_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return { ok: false, message: err, offendingPaths: offending }
    },
  },
]
