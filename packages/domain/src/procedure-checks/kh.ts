import type { ProcedureCheck } from './types'
import {
  daysBetween,
  evaluateRabiesAgeConservative,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
  readVetVisitDate,
} from './utils'

/**
 * 캄보디아 (GDAHP — General Directorate of Animal Health and Production, MAFF) 절차 검증.
 *
 * 출처:
 *  - Law on Animal Health and Production (NS/RKM/0116/003, 2016-01-28) — FAOLEX/Ecolex
 *    https://www.ecolex.org/details/legislation/law-on-animal-health-and-production-no-nsrkm0116003-lex-faoc173984/
 *  - WTO Import Licensing — Cambodia live animals — https://importlicensing.wto.org/content/live-animals-animal-products-meat-products
 *  - WOAH Asia Rabies — Cambodia — https://rr-asia.woah.org/en/projects/rabies/
 *
 * ⚠️ 캄보디아는 영문 시행령·서식·수치를 별도 공개하지 않음 — 수치는 GDAHP가 사례별로 발급하는 Import Permit 조건과 한국 QIA 안내에 의존하는 운용 룰. 출국 5-7영업일 전 GDAHP 재확인 권장.
 *
 * 핵심 룰:
 *  - 마이크로칩 ≤ 광견병 1차 (GDAHP 운용 표준 — ISO 11784/11785 15자리)
 *  - 광견병: 생후 90일 이상 + 출국 30일 이상~12개월 이내 (GDAHP 운용)
 *  - 1년 라이선스 백신만 인정 (GDAHP 수입허가 발급 시 운용 조건 — 영문 법령 명문 부재)
 *  - 건강증명서 ≤ 출국 10일 이내 (한국 QIA + 보수 ≤9)
 *
 * 별도 (시스템 검증 제외):
 *  - RNATT: GDAHP 의무 아님 (한국 귀국용 별도)
 *  - 화물 운송 시 GDAHP Import Permit 필수, 동반 입국은 통상 면제
 *  - 종합백신/구충: 권장 (GDAHP 명문 의무 아님)
 *
 * 컨벤션: 필수 입력 누락 시 SKIP. 유효기간 1년 = 접종일 + 364일까지.
 */

const COUNTRY = 'cambodia'

export const KH_CHECKS: ProcedureCheck[] = [
  {
    id: 'kh.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      'ISO 표준 마이크로칩이 광견병 1차 접종일과 같거나 이전이어야 함. (캄보디아 입국 면제, 한국 수출검역 사실상 필수)',
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
        message: `마이크로칩(${microchip})이 광견병 1차 접종(${first.date})보다 늦어요. 날짜를 확인하세요.`,
        offendingPaths: ['microchip_implant_date'],
      }
    },
  },
  {
    id: 'kh.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'GDAHP 운용: "3개월(90일) 이상 접종 의무" — 보수적으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요.',
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
    id: 'kh.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 30일 이상 전',
    description:
      '광견병 접종일로부터 출국일까지 최소 30일 경과 필요. (GDAHP 수입허가 발급 시 운용 조건 — 영문 법령 명문 부재)',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const earliest = rabies[0]
      const days = daysBetween(earliest.date, dep)
      if (days === null) return SKIP
      if (days < 30) {
        return {
          ok: false,
          message: `광견병 접종(${earliest.date})부터 출국일(${dep})까지 ${days}일이에요. 30일 이상이어야 해요.`,
          offendingPaths: [`rabies_dates[${earliest.originalIndex}].date`, 'departure_date'],
        }
      }
      return { ok: true, message: `광견병 접종(${earliest.date}) → 출국일(${dep}): ${days}일.` }
    },
  },
  {
    id: 'kh.rabies-only-1year-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '1년 라이선스 광견병 백신만 인정 (3년 거부)',
    description:
      '광견병 백신 면역 유효기간 1년만 인정. valid_until 이 접종일 + 364일 초과면 거부. (GDAHP 수입허가 발급 시 운용 조건 — 영문 법령 명문 부재, 보수 적용)',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return SKIP

      const violations: Array<{ entry: typeof rabies[number]; days: number }> = []
      for (const r of rabies) {
        if (!r.valid_until) continue
        const days = daysBetween(r.date, r.valid_until)
        if (days === null) continue
        if (days > 364) {
          violations.push({ entry: r, days })
        }
      }
      if (violations.length > 0) {
        const offending: string[] = []
        const msgs: string[] = []
        for (const v of violations) {
          offending.push(`rabies_dates[${v.entry.originalIndex}].valid_until`)
          msgs.push(`${v.entry.date} 백신의 면역 유효기간이 ${v.days}일로 364일(1년)을 초과해요. 3년 백신은 인정되지 않아요.`)
        }
        return {
          ok: false,
          message: msgs.join(' / '),
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '모든 광견병 백신이 1년 라이선스 (또는 미입력 = 디폴트 1년).' }
    },
  },
  {
    id: 'kh.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함.',
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
]
