import type { ProcedureCheck } from './types'
import {
  daysBetween,
  readRabiesEntries,
  readInfectiousDiseaseEntries,
  SKIP,
  readDepartureDate,
} from './utils'

/**
 * 남아프리카공화국 (DALRRD — Department of Agriculture, Land Reform & Rural Development)
 * 절차 검증.
 *
 * 한국 = 광견병 위험국. 입국에 광견병 접종 + 전염병검사(ARC-OVI 발송) 필요.
 * (항체검사·마이크로칩·내원일 검증은 공통 룰 / 다른 파일에서 다룸.)
 *
 * 핵심 룰:
 *  - 광견병: 최근 접종이 출국 30일 전 ~ 364일 전 (대기 30일 + 1년 유효).
 *  - 전염병검사: 출국 30일 이내(≤29, 29일 전부터). ARC-OVI 발송 검사.
 *
 * 컨벤션 (IL/RU/MX 와 동일):
 *  - 필수 입력 누락 시 SKIP.
 *  - "N일 이내" = 출국일 포함 ≤N-1 (한국 공통 컨벤션).
 */

const COUNTRY = 'south_africa'

export const ZA_CHECKS: ProcedureCheck[] = [
  // ── 광견병 ──
  {
    id: 'za.rabies-30to364days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국 30일 전 ~ 364일 전',
    description:
      '최근 광견병 접종일이 출국일 기준 30일 전(대기 기간) 이상, 364일 전(1년 유효) 이내여야 함. (DALRRD: 접종 후 30일 경과 + 유효한 광견병 백신)',
    severity: 'info',
    addedAt: '2026-07-01',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 30) {
        return {
          ok: false,
          message: `최근 접종(${latest.date})부터 출국일(${dep})까지 ${days}일이에요. 출국 30일 전 이상이어야 해요.`,
          offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
        }
      }
      if (days > 364) {
        return {
          ok: false,
          message: `최근 접종(${latest.date})부터 출국일(${dep})까지 ${days}일이에요. 유효기간(364일)을 넘겨 만료돼요.`,
          offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) → 출국일(${dep}): ${days}일 (30~364일).` }
    },
  },

  // ── 전염병검사 (ARC-OVI 발송) ──
  {
    id: 'za.infectious-disease-within-29days',
    country: COUNTRY,
    category: '검사',
    title: '전염병검사는 출국 30일 이내 (29일 전부터)',
    description:
      '전염병검사(ARC-OVI 발송 — Brucella/Babesia/Ehrlichia/Trypanosoma 등) 채혈일이 출국 30일 이내(≤29, 29일 전부터 출국일까지)여야 함.',
    severity: 'info',
    addedAt: '2026-07-01',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readInfectiousDiseaseEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 0) {
        return {
          ok: false,
          message: `검사일(${latest.date})이 출국일(${dep})보다 늦어요.`,
          offendingPaths: [`infectious_disease_records[${latest.originalIndex}].date`],
        }
      }
      if (days > 29) {
        return {
          ok: false,
          message: `최근 전염병검사(${latest.date})부터 출국일(${dep})까지 ${days}일이에요. 출국 30일 이내(29일 전 이후)여야 해요.`,
          offendingPaths: [`infectious_disease_records[${latest.originalIndex}].date`, 'departure_date'],
        }
      }
      return { ok: true, message: `최근 전염병검사(${latest.date}) → 출국일(${dep}): ${days}일 (≤29일).` }
    },
  },
]
