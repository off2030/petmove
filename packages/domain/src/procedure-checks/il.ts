import type { ProcedureCheck } from './types'
import {
  addMonths,
  daysBetween,
  evaluateRabiesAgeConservative,
  findSameGuardianCases,
  matchBannedBreed,
  readBreed,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
  readVetVisitDate,
} from './utils'

/**
 * 이스라엘 (Veterinary Services & Animal Health, Ministry of Agriculture) 절차 검증.
 *
 * 출처:
 *  - gov.il "Importing Dogs" — https://www.gov.il/en/pages/importdogs
 *  - gov.il "Import Dogs Policy" — https://www.gov.il/en/Departments/General/importdogs
 *  - gov.il MOAG Pro 126 — https://www.gov.il/en/departments/policies/moag-pro-126
 *  - gov.il "Rabies Lab" — https://www.gov.il/en/pages/rabies-lab-meda
 *
 * 한국 = 광견병 위험국가 (이스라엘 분류). RNATT 의무.
 *
 * 핵심 룰:
 *  - 마이크로칩 (ISO 11784/11785) ≤ 광견병 1차
 *  - 광견병: 1차 12주 이상(보수 91일 AND 캘린더 3개월) + 출국 30일 전 + 출국일 면역 유효
 *  - **RNATT 필수**: 채혈 ≥ 광견병 + 30일, 0.5 IU/ml 이상, EU/WOAH 인증 lab
 *  - **입국 시 만 4개월(약 17주) 이상**, 동물 소유 90일 이상 (trafficking 방지)
 *  - 건강증명서: 출국 10일 이내 (보수 ≤9). 민간 수의사 검진 + 정부 수의관 배서
 *  - 출국 48시간 전 Ben Gurion 검역소 사전 통보
 *  - 3마리 이상 동반 시 사전 Import License 필수 (1974 동물질병규칙)
 *  - Pitbull, Argentine Dogo, Fila Brasileiro, Tosa, Staffordshire, Rottweiler 등 견종 수입 금지
 *
 * 별도 (시스템 검증 제외):
 *  - 종합백신/구충: gov.il 의무 명문 부재
 *  - 부스터 chain 유지 시 wait period 15일 단축: 정확한 chain 추적 불가 → 보수적으로 30일 단일 적용
 *  - RNATT 입국 후 추가 대기 없음 (EU/일본과 다름)
 *
 * 컨벤션 (UA/RU/MX 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - 유효기간 1년 = 접종일 + 364일까지 인정
 */

const COUNTRY = 'israel'

export const IL_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'il.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      'ISO 11784/11785 마이크로칩이 광견병 1차 접종일과 같거나 이전이어야 함. (gov.il 수의국 — 비ISO 칩 시 자체 리더기 동반)',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
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
        message: `마이크로칩(${microchip})이 광견병 1차 접종(${first.date})보다 늦어요.`,
        offendingPaths: ['microchip_implant_date'],
      }
    },
  },

  // ── 광견병 ──
  {
    id: 'il.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'gov.il 수의국: "12주 이상 접종" — 안전 기준으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요.',
    severity: 'info',
    addedAt: '2026-05-07',
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
              ? `1차 접종일(${first.date})이 캘린더 3개월(${ev.calendar3mThreshold})보다 빨라요`
              : `생후 ${ev.ageInDays}일령이며 1차 접종일(${first.date})이 캘린더 3개월(${ev.calendar3mThreshold})보다 빨라요`
        return {
          ok: false,
          message: `1차 접종일(${first.date})이 보수적 기준을 충족하지 않아요. ${reason}.`,
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${ev.ageInDays}일령 + 캘린더 3개월(${ev.calendar3mThreshold}) 충족.` }
    },
  },
  {
    id: 'il.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종 후 대기 (1차/chain끊김 30일, chain 유효 부스터 15일)',
    description:
      '최근 광견병 접종 후 출국까지 대기 — chain 유효한 부스터 = 15일, 1차 또는 chain 끊김 후 재접종 = 30일. (gov.il: 1차 후 30일, 연속 부스터 14일 단축 가능). chain 유효성 = 직전 접종 valid_until 이내 후속 접종.',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      // chain 유효 = 직전 접종이 있고 그 valid_until 이내에 latest 접종됨
      let isBoosterWithChain = false
      if (rabies.length >= 2) {
        const prev = rabies[rabies.length - 2]
        const prevValidUntil = resolveValidUntil(prev.date, prev.valid_until)
        isBoosterWithChain = !!prevValidUntil && latest.date <= prevValidUntil
      }
      const requiredDays = isBoosterWithChain ? 15 : 30
      const label = isBoosterWithChain ? 'chain 유효 부스터' : '1차 또는 chain 끊김'

      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < requiredDays) {
        return {
          ok: false,
          message: `최근 접종(${latest.date}, ${label})부터 출국일(${dep})까지 ${days}일이에요. ${requiredDays}일 이상이어야 해요.`,
          offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}, ${label}) → 출국일(${dep}): ${days}일 (≥${requiredDays}일).` }
    },
  },
  {
    id: 'il.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간(1년)이 출국일 이전에 만료되지 않아야 함. (gov.il 수의국: 백신 in-force 상태 필수)',
    severity: 'info',
    addedAt: '2026-05-07',
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
          message: `최근 접종(${latest.date})의 유효기간(${validUntil})이 출국일(${dep}) 전에 만료돼요.`,
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── RNATT (이스라엘 입국 필수) ──
  {
    id: 'il.rnatt-min-30days-after-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '항체 검사는 광견병 접종 30일 이후',
    description:
      'RNATT 채혈일은 직전 광견병 접종으로부터 30일 이후. (gov.il: "rabies neutralizing antibody titer ... taken at least 30 days after vaccination")',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const rabies = readRabiesEntries(caseRow)
      const titers = readTiterEntries(caseRow)
      if (rabies.length === 0 || titers.length === 0) return SKIP

      const offending: string[] = []
      const problems: string[] = []
      for (const t of titers) {
        const priorDoses = rabies.filter((r) => r.date <= t.date)
        if (priorDoses.length === 0) {
          offending.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push(`채혈일(${t.date}) 이전의 광견병 접종 기록이 없어요.`)
          continue
        }
        const latest = priorDoses[priorDoses.length - 1]
        const gap = daysBetween(latest.date, t.date)
        if (gap === null || gap < 30) {
          offending.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push(`채혈일(${t.date})과 직전 접종일(${latest.date}) 간격이 ${gap ?? '?'}일로 30일 미만이에요.`)
        }
      }
      if (offending.length > 0) {
        return {
          ok: false,
          message: problems.join(' / '),
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '항체 검사 시기 적합 (30일 경과).' }
    },
  },

  // ── 수입 금지 견종 ──
  {
    id: 'il.banned-breeds',
    country: COUNTRY,
    category: '서류',
    title: '수입 금지 견종 (Pitbull, Tosa, Rottweiler 등)',
    description:
      'gov.il 수입 금지: Pitbull, Argentine Dogo, Fila Brasileiro, Tosa, Staffordshire Bull Terrier, American Staffordshire Terrier, Bull Terrier, Rottweiler 및 교잡.',
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
        'dogo argentino', '도고 아르헨티노',
        'fila brasileiro', '필라 브라질레이로',
        'tosa', '도사',
        'staffordshire bull terrier', '스태퍼드셔 불 테리어',
        'american staffordshire terrier', '아메리칸 스태퍼드셔',
        'bull terrier', '불 테리어',
        'rottweiler', '로트와일러',
      ])
      if (match) {
        return {
          ok: false,
          message: `견종 "${breed.ko || breed.en}"은(는) 이스라엘 수입 금지 견종이에요 (매치: ${match}).`,
          offendingPaths: ['breed', 'breed_en'],
        }
      }
      return { ok: true, message: `견종 "${breed.ko || breed.en}" 통과.` }
    },
  },

  // ── 입국 연령 ──
  {
    id: 'il.min-4months-on-departure',
    country: COUNTRY,
    category: '일정',
    title: '출국일 시점 만 4개월령(약 17주) 이상',
    description:
      'gov.il 수의국: 이스라엘 입국 시 만 4개월(약 17주) 이상이어야 함. 출국일 기준 생후 ≥ 4개월(`addMonths(birth, 4) ≤ dep`).',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      if (!dep || !birth) return SKIP

      const earliestDep = addMonths(birth, 4)
      if (!earliestDep) return SKIP
      if (earliestDep <= dep) {
        const ageDays = daysBetween(birth, dep)
        return { ok: true, message: `생년월일(${birth}) + 4개월(${earliestDep}) ≤ 출국일(${dep}). 생후 ${ageDays}일.` }
      }
      const ageDays = daysBetween(birth, dep)
      return {
        ok: false,
        message: `생년월일(${birth}) + 4개월(${earliestDep})이 출국일(${dep})보다 늦어 4개월령에 미달해요 (생후 ${ageDays ?? '?'}일).`,
        offendingPaths: ['departure_date', 'birth_date'],
      }
    },
  },

  // ── 보호자 한도 (3마리+ 시 Import License 필요) ──
  {
    id: 'il.import-license-3plus-pets',
    country: COUNTRY,
    category: '서류',
    title: '3마리 이상 시 Import License 필수',
    description:
      'gov.il 수의국 / 1974 동물질병규칙: 동반 입국 3마리 미만은 License 면제. 동일 보호자(이름·영문이름·전화·국내주소 일치)가 이스라엘 목적 케이스 3건 이상 등록 시 사전 Import License 필요.',
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow, relatedCases, destination }) => {
      if (relatedCases === undefined) return SKIP
      const others = findSameGuardianCases(caseRow, relatedCases, { sameDestination: true })
      if (others.length + 1 >= 3) {
        return {
          ok: false,
          message: `같은 보호자(${caseRow.customer_name})가 이스라엘 목적 케이스를 ${others.length + 1}건 등록하여 Import License가 필요해요.`,
          offendingPaths: ['customer_name'],
        }
      }
      return { ok: true, message: '보호자 케이스 < 3건 (License 면제).' }
    },
  },
]
