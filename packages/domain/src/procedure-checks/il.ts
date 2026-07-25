import type { ProcedureCheck } from './types'
import {
  addMonths,
  daysBetween,
  evaluateRabiesAgeConservative,
  findRabiesValidityBreaks,
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
import { msgMicrochipBeforeRabies, msgRabiesExpiredBefore, msgRabiesPrimeMinAge } from './messages'
import {
  validateIlAdvanceNoticeDate,
  violatesRabiesEntryWait,
} from '../journey-steps/date-rules'

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
 *  - 유효기간 1년 = 접종일의 1주년 당일까지 인정
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
    severity: 'warning',
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
        message: msgMicrochipBeforeRabies(),
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
    severity: 'warning',
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
          message: msgRabiesPrimeMinAge('91일'),
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
    title: '광견병 접종은 출국일 30일 이상 전',
    description:
      'gov.il: 1차 접종 후 30일 경과해야 함(gov.il 은 연속 부스터 14일 단축 여지를 두지만, 유효 부스터는 대기 면제로 통일 처리한다). 최근 접종 기준. 저장 거부(validateRabiesEntryWait)와 **같은 판정 함수**(violatesRabiesEntryWait — 프로파일 entryWaitDaysAfterVaccine=30 파생)를 쓴다 — 예전엔 자체 30/15 계산이라 저장 거부와 갈려 만료 후 재접종을 놓쳤다(2026-07-23 통일).',
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const latest = rabies[rabies.length - 1]
      if (!violatesRabiesEntryWait(data, dep, destination)) {
        return { ok: true, message: `최근 접종(${latest.date}) → 출국일(${dep}): 30일 충족(또는 유효 부스터).` }
      }
      return {
        ok: false,
        message: '광견병 접종 후 30일이 지나야 이스라엘에 입국할 수 있어요. 입국일을 미뤄야 해요.',
        offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
      }
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
          message: msgRabiesExpiredBefore('출국'),
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },
  {
    id: 'il.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간 이내에 해야 함. 만료 후 접종은 chain 이 끊겨 새 1차로 간주된다. 저장 거부(findRabiesChainBreak)의 짝이 되는 주의 — 펫무브워크는 저장을 막지 않고 절차검증만 보므로 이 룰이 없으면 운영자 화면에서 끊긴 chain 이 안 보인다. (EU 패밀리 eu.rabies-booster-within-prime-validity 를 이스라엘 전용으로 복제 — 이스라엘은 EU 광견병 룰에서 제외되므로 짝 룰을 여기 둔다.)',
    severity: 'warning',
    addedAt: '2026-07-23',
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

  // ── RNATT (이스라엘 입국 필수) ──
  {
    id: 'il.rnatt-min-30days-after-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '항체 검사는 광견병 접종 30일 이후',
    description:
      'RNATT 채혈일은 직전 광견병 접종으로부터 30일 이후. (gov.il: "rabies neutralizing antibody titer ... taken at least 30 days after vaccination")',
    severity: 'warning',
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
          // 고객 노출 문구 — 날짜 미보간(lint:checks). 날짜는 offendingPaths 가 칸을 지목한다.
          problems.push('채혈일 이전의 광견병 접종 기록이 없어요.')
          continue
        }
        const latest = priorDoses[priorDoses.length - 1]
        const gap = daysBetween(latest.date, t.date)
        if (gap === null || gap < 30) {
          offending.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push('광견병 항체 검사는 직전 접종일로부터 30일이 지난 후에 받아야 해요.')
        }
      }
      if (offending.length > 0) {
        return {
          ok: false,
          // titer 여러 건이 같은 문장이 될 수 있어 중복 제거 후 결합(EU 룰과 동일).
          message: [...new Set(problems)].join(' / '),
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
    severity: 'warning',
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
      return {
        ok: false,
        // 고객 노출 문구 — 날짜 미보간(lint:checks). 날짜는 offendingPaths 가 칸을 지목한다.
        message: '출국일에 반려동물이 만 4개월(약 17주) 이상이어야 해요.',
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
    // relatedCases 는 펫무브워크(운영자)만 전달 — 보호자 이름·건수가 필요한 운영자용 룰.
    audience: 'staff',
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

  // ── 사전 통보 (적재/출국 2영업일 전) ──
  // 공식 안내 섹션 P·Q: 적재(출국) 최소 2영업일 전 통보. 앵커는 출국(departure).
  // 입력차단(validateIlAdvanceNoticeDate)은 2캘린더일로 근사, 주말 버퍼는 마감 알림 D-11·D-4.
  {
    id: 'il.advance-notice-2days-before-departure',
    country: COUNTRY,
    category: '사전통지',
    title: '사전 통보 마감 (출국 2영업일 전)',
    description:
      '이스라엘은 출국(적재) 2영업일 전까지 사전 통보를 해야 함. 입력 차단(validateIlAdvanceNoticeDate)과 같은 함수 — 항공편 수정 후 어긋난 케이스를 주의로 표면화. (이스라엘 수의국 공식 안내 섹션 P·Q)',
    severity: 'warning',
    addedAt: '2026-07-23',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const notice =
        typeof data.il_advance_notice_date === 'string'
          ? data.il_advance_notice_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(notice)) return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const msg = validateIlAdvanceNoticeDate(notice, dep ?? '')
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['il_advance_notice_date', 'departure_date'] }
      }
      return {
        ok: true,
        message: dep ? `통보일(${notice}) 출국(${dep}) 2일 이전.` : `통보일(${notice}) 입력됨 (출국일 미입력).`,
      }
    },
  },
]
