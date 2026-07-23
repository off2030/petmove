import {
  buildDateRuleContext,
  validateImportPermitNotAfterDeparture,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  addMonths,
  addYears,
  daysBetween,
  evaluateRabiesAgeConservative,
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

export const SG_CHECKS: ProcedureCheck[] = [
  // ── 광견병 ──
  {
    id: 'sg.rabies-prime-after-91days-old',
    country: 'singapore',
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'NParks/AVS 는 "제조사 권장"으로만 표기되어 정량 기준 미명시 — 안전 기준으로 생후 91일 AND 캘린더 3개월(`addMonths(birth, 3)`) 둘 다 충족 필요. 출생일에 따라 어느 쪽이 더 엄격한지 달라지므로 AND 결합.',
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!birth || rabies.length === 0) return SKIP

      const first = rabies[0]
      const ev = evaluateRabiesAgeConservative(birth, first.date)
      if (ev.ageInDays === null) return SKIP
      if (!ev.ok) {
        const reason =
          ev.failedRule === '91days'
            ? `생후 ${ev.ageInDays}일령으로 91일에 미달해요`
            : ev.failedRule === 'calendar3m'
              ? `접종일(${first.date})이 캘린더 3개월(${ev.calendar3mThreshold})보다 빨라요`
              : `생후 ${ev.ageInDays}일령이며 접종일(${first.date})이 캘린더 3개월(${ev.calendar3mThreshold})보다 빨라요`
        return {
          ok: false,
          message: msgRabiesPrimeMinAge('91일'),
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${ev.ageInDays}일령 + 캘린더 3개월(${ev.calendar3mThreshold}) 충족.` }
    },
  },
  {
    id: 'sg.titer-min-28days-after-vaccine',
    country: 'singapore',
    category: '광견병',
    title: '항체 검사는 광견병 접종 28일 후',
    description:
      'RNATT 채혈일은 직전 광견병 접종(1차 또는 부스터)으로부터 28일 이후여야 함. (Schedule III IV(a)(iii) "At least 28 days after the primary rabies vaccination or rabies booster")',
    severity: 'info',
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
    id: 'sg.departure-min-3months-after-titer',
    country: 'singapore',
    category: '광견병',
    title: '출국일은 항체 검사일 3개월 이후',
    description:
      'RNATT 채혈일로부터 출국까지 최소 3개월(캘린더) 경과 필요. NParks 원문은 "90일"이나, 저장 거부(validateEuEntryDate, titer.entryWaitAfterTiter.months=3)와 기준을 맞추려 캘린더 3개월(≈89~92일)로 판정한다. (Schedule III IV(a)(iii) "not less than 90 days ... prior to export")',
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      const valid = titers.find((t) => {
        const earliest = addMonths(t.date, 3)
        return !!earliest && earliest <= dep
      })
      if (valid) {
        return { ok: true, message: `항체 검사(${valid.date}) + 3개월(${addMonths(valid.date, 3)}) ≤ 출국일(${dep}).` }
      }
      const earliestTiter = [...titers].sort((a, b) => a.date.localeCompare(b.date))[0]
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return {
        ok: false,
        message: '광견병 항체 검사 채혈일로부터 3개월이 지난 후에 출국할 수 있어요.',
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
    severity: 'info',
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
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readExternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const diff = daysBetween(latest.date, dep)
      if (diff === null) return SKIP
      if (diff < 2 || diff > 7) {
        return {
          ok: false,
          message: '외부 기생충 치료는 출국 2~7일 전에 해야 해요.',
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
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
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readInternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const diff = daysBetween(latest.date, dep)
      if (diff === null) return SKIP
      if (diff < 2 || diff > 7) {
        return {
          ok: false,
          message: '내부 기생충 치료는 출국 2~7일 전에 해야 해요.',
          offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`],
        }
      }
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
  // ⏳ 귀국(싱가포르→한국) 수출 검역 룰(sg.export-quarantine-date-valid)은 귀국 수출검역
  //   카드(sg-export-quarantine step)와 함께 후속 작업에서 추가한다. 카드 없이 룰만 두면
  //   orphan 으로 lint 가 실패한다.
]
