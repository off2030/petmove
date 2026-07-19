import type { ProcedureCheck } from './types'
import {
  addYears,
  daysBetween,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
  readVetVisitDate,
} from './utils'
import {
  msgMicrochipBeforeRabies,
  msgRabiesExpiredBefore,
  msgRabiesPrimeMinAge,
  msgTiterBeforeVaccine,
} from './messages'
import { isTwTiterChainMaintained } from '../journey-steps/date-rules'

/**
 * 대만 (APHIA — Animal and Plant Health Inspection Agency, 2023년 BAPHIQ에서 개칭) 절차 검증.
 *
 * 출처:
 *  - APHIA "Quarantine for Dogs & Cats" — https://www.aphia.gov.tw/en/ws.php?id=14261
 *  - APHIA "Procedure for Importation of Dogs/Cats" PDF —
 *    https://pet-epermit.aphia.gov.tw/files/other/information_80asfiledownload1_4d09f517-bcfe-4c98-83d9-4e1cd9df61a1.pdf
 *  - APHIA "Importation of Dogs or Cats FAQ" — https://www.aphia.gov.tw/office/khaphia/en/ws.php?id=738
 *
 * ⚠️ 핵심 (한국 = 광견병 발생국 분류):
 *  - 마이크로칩: ISO 11784/11785 (15자리) ≤ 광견병 1차. AVID 등 비ISO 칩은 보조 ISO 칩 추가 식재 권고
 *  - 광견병: 생후 90일령 이상, 불활화 백신만 인정, 1차는 선적 90일~1년 / 부스터는 30일~1년
 *  - **RNATT**: 채혈일부터 **180일 경과 후** 도착, ≥0.5 IU/ml, APHIA 채신 명단 lab
 *  - 한국 APQA 검역: 출국 10일 이내(보수 ≤9)
 *  - 격리 기본 7일 (수입 허가증 20일 전 신청 + RNATT 180일 충족 시 면제 가능)
 *  - 개·고양이 동일 요건
 *
 * 컨벤션 (NZ/HI/CN/TH/PH 와 동일):
 *  - "X일 이내" → `dep - X ≤ N-1`
 *  - "X일 이상/이전/후" → `dep - X ≥ N` (이상 inclusive)
 */

const COUNTRY = 'taiwan'

export const TW_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'tw.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      '마이크로칩이 광견병 1차 접종일과 같거나 이전이어야 함. ISO 11784/11785 (15자리) 표준. AVID 등 비ISO 칩은 보조 ISO 칩 추가 식재 권고. (APHIA)',
    severity: 'warning',
    addedAt: '2026-05-06',
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
    id: 'tw.rabies-prime-after-90days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 생후 90일령 이상',
    description:
      '광견병 1차 접종은 생후 최소 90일 이후. 불활화(사독) 백신만 인정. (APHIA 공식)',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!birth || rabies.length === 0) return SKIP

      const first = rabies[0]
      const age = daysBetween(birth, first.date)
      if (age === null) return SKIP
      if (age < 90) {
        return {
          ok: false,
          message: msgRabiesPrimeMinAge('90일'),
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${age}일령.` }
    },
  },
  {
    id: 'tw.rabies-not-expired-on-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '도착일에 광견병 면역 유효 (1년 = 1주년 당일까지)',
    description:
      '최근 광견병 접종 면역 유효기간이 도착일 이전 만료되지 않아야 함. **1년 = 1주년 당일까지** 허용. valid_until 명시 시 그 값 사용, 미명시 시 디폴트 1년 (`addOneYear`).',
    severity: 'warning',
    addedAt: '2026-05-06',
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

  // ── RNATT (광견병 항체 검사) ──
  {
    id: 'tw.rnatt-after-rabies-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '항체 검사는 광견병 접종 이후',
    description:
      'RNATT 채혈일은 직전 광견병 접종 이후여야 함. (APHIA Procedure)',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const rabies = readRabiesEntries(caseRow)
      const titers = readTiterEntries(caseRow)
      if (rabies.length === 0 || titers.length === 0) return SKIP

      const offending: string[] = []
      for (const t of titers) {
        const priorDoses = rabies.filter((r) => r.date <= t.date)
        if (priorDoses.length === 0) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      }
      if (offending.length > 0) {
        // 문구는 한 번만 — 채혈 건마다 날짜를 나열하면 고객 문구에 날짜가 새고 길어진다.
        // 어느 채혈 기록이 문제인지는 offendingPaths 가 그 입력칸을 짚는다.
        return {
          ok: false,
          message: msgTiterBeforeVaccine(),
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '모든 RNATT 채혈이 광견병 접종 이후.' }
    },
  },
  {
    id: 'tw.rnatt-180days-to-1year-before-arrival',
    country: COUNTRY,
    category: '광견병',
    title: 'RNATT 채혈일부터 180일 ~ 1년 사이 도착',
    description:
      'RNATT 채혈일로부터 180일 경과 ~ 1년 이내에 대만 도착 (격리 면제 핵심 조건). 미충족 시 추가 격리 또는 재검사. (APHIA: "the blood sampling date should be no less than 180 days and no more than one year prior to shipment")',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      // 체인 유지(직전 합격 검사 + 180일~1년 내 재검사) — 새 검사가 입국 180일 이내여도 인정.
      // 입력불가(validateTwEntryDate)와 같은 도메인 함수를 써서 두 층의 기준을 하나로 둔다.
      if (isTwTiterChainMaintained(titers.map((t) => t.date))) {
        return { ok: true, message: '재검사 체인 유지 — 180일 대기 면제.' }
      }

      // 180일 ≤ 출국 ≤ 1년 (addYears: 1주년 당일까지) 윈도우 안에 들어가는 채혈 1개 이상이면 OK.
      const valid = titers.find((t) => {
        const days = daysBetween(t.date, dep)
        if (days === null) return false
        const upper = addYears(t.date, 1)
        return days >= 180 && upper >= dep
      })
      if (valid) {
        const days = daysBetween(valid.date, dep)
        return { ok: true, message: `RNATT(${valid.date}) → 출국(${dep}): ${days}일 (180일 이상, 1년 이내).` }
      }

      // 모두 실패 — 가장 최신 채혈일 기준 메시지
      const newest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const days = daysBetween(newest.date, dep)
      const upper = addYears(newest.date, 1)
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      // 고객 문구엔 날짜를 넣지 않는다 — 어느 칸이 문제인지는 offendingPaths 가 짚는다.
      // 180일 미달(더 기다리면 해결)과 1년 초과(재검사 필요)는 조치가 달라 문구를 나눈다.
      const reason =
        days === null
          ? '날짜 형식이 올바르지 않아요.'
          : days < 0
            ? '채혈일이 출국일보다 늦어요. 날짜를 확인하세요.'
            : days < 180
              ? '대만 입국은 광견병 항체 검사 채혈일로부터 180일이 지나야 해요.'
              : '광견병 항체 검사 결과가 채혈일로부터 1년이 지나 만료됐어요. 다시 검사해야 해요.'
      return {
        ok: false,
        message: reason,
        offendingPaths: offending,
      }
    },
  },

  // ── 수입허가증 ──
  {
    id: 'tw.import-permit-120days-before-entry',
    country: COUNTRY,
    category: '수입허가증',
    title: '수입허가증 신청은 도착 120일 전까지 (격리 면제 조건)',
    description:
      '수입허가증을 도착 120일 전까지 신청해야 무격리 입국 가능. 20일 전까지 신청도 가능하나 이 경우 7일 격리. (APHIA — 격리 면제 요건)',
    severity: 'warning',
    addedAt: '2026-07-18',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const filed =
        typeof data.import_permit_application_date === 'string'
          ? data.import_permit_application_date
          : ''
      const dep = readDepartureDate(caseRow, destination)
      if (!filed || !dep) return SKIP

      const gap = daysBetween(filed, dep)
      if (gap === null) return SKIP
      if (gap < 0) {
        return {
          ok: false,
          message: '수입허가증 신청일이 도착일보다 늦어요. 날짜를 확인하세요.',
          offendingPaths: ['import_permit_application_date', 'departure_date'],
        }
      }
      if (gap < 120) {
        return {
          ok: false,
          message: '수입허가증은 도착 120일 전까지 신청해야 격리 없이 입국할 수 있어요.',
          offendingPaths: ['import_permit_application_date', 'departure_date'],
        }
      }
      return { ok: true, message: `수입허가증 신청(${filed}) → 도착(${dep}): ${gap}일 (120일 이상).` }
    },
  },
]
