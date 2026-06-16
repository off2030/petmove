import type { ProcedureCheck } from './types'
import {
  daysBetween,
  evaluateRabiesAgeConservative,
  readExternalParasiteEntries,
  readInternalParasiteEntries,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
  readVetVisitDate,
} from './utils'

/**
 * 브라질 (MAPA / VIGIAGRO — Ministério da Agricultura, Pecuária e Abastecimento) 절차 검증.
 *
 * 출처:
 *  - MAPA "Entrar no Brasil" — https://www.gov.br/agricultura/pt-br/assuntos/vigilancia-agropecuaria/animais-estimacao/entrar-no-brasil
 *  - MAPA "Travelers and Pets" (영문) — https://www.gov.br/agricultura/pt-br/internacional/english/travelers-and-pets
 *
 * 한국 = 광견병 비청정국 분류 (WOAH 기준).
 *
 * 핵심 룰:
 *  - 마이크로칩: MAPA 명시 의무 부재. 식별 필수, 한국 수출검역에서 사실상 필수
 *  - 광견병: 90일 이상 (보수 91일 AND 캘린더 3개월) + 1차 후 21일 대기 (보수 30일 적용) + 면역 유효
 *  - 구충 (외부·내부): CVI 발급일 전 15일 이내 (MAPA "submitted within fifteen (15) days")
 *  - 건강증명서: CVI 발급일 전 10일 이내 임상검사 (보수 ≤9). CVI 자체는 발급 후 60일 유효
 *  - 한국 APQA 정부 수의관 인증 필수
 *
 * 별도 (시스템 검증 제외):
 *  - RNATT: MAPA 의무 아님 (권장만)
 *  - 종합백신: MAPA 의무 아님 (광견병만 강제)
 *  - 수입허가: 개·고양이 불요 (토끼·페럿 등은 MAPA Import Authorization 필요)
 *  - 격리: 없음
 *
 * 컨벤션 (MX/MA/RU 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - 유효기간 1년 = 접종일 + 364일까지 인정
 */

const COUNTRY = 'brazil'

export const BR_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'br.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      'ISO 표준 마이크로칩이 광견병 1차 접종일과 같거나 이전이어야 함. (브라질 입국 면제, 한국 수출검역 사실상 필수)',
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
        fixHint: '시술 후 광견병 1차 접종부터 다시 시작해야 해요.',
        offendingPaths: ['microchip_implant_date'],
      }
    },
  },

  // ── 광견병 ──
  {
    id: 'br.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'MAPA: "Animals 90 (ninety) days older must have a rabies vaccination" — 안전 기준으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요.',
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
              ? `${first.date}이 캘린더 3개월(${ev.calendar3mThreshold})보다 빨라요`
              : `생후 ${ev.ageInDays}일령이며 ${first.date}이 캘린더 3개월(${ev.calendar3mThreshold})보다 빨라요`
        return {
          ok: false,
          message: `1차 접종일(${first.date})이 보수적 기준을 충족하지 못해요. ${reason}.`,
          fixHint: `생후 91일 AND ${ev.calendar3mThreshold}(캘린더 3개월)을 모두 충족한 이후로 1차 접종일을 조정하세요.`,
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${ev.ageInDays}일령 + 캘린더 3개월(${ev.calendar3mThreshold}) 충족.` }
    },
  },
  {
    id: 'br.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 30일 이상 전',
    description:
      '광견병 접종일로부터 출국일까지 최소 30일 경과 필요. (MAPA: 1차 후 21일 대기 의무 — 보수적으로 30일 적용)',
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
          fixHint: `광견병 접종을 출국일 ${dep} 기준 30일 이전에 완료하세요.`,
          offendingPaths: [`rabies_dates[${earliest.originalIndex}].date`, 'departure_date'],
        }
      }
      return { ok: true, message: `광견병 접종(${earliest.date}) → 출국일(${dep}): ${days}일.` }
    },
  },
  {
    id: 'br.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함. (MAPA: CVI 60일 유효 단 백신이 유효한 경우)',
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
          fixHint: '출국 전 부스터 접종이 필요해요.',
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── 구충 ──
  {
    id: 'br.external-parasite-within-15days',
    country: COUNTRY,
    category: '구충',
    title: '외부구충은 출국 포함 15일 이내 (14일 전 이후)',
    description:
      '외부구충(벼룩·진드기) 처치는 출국 포함 15일 이내 = 출국일 기준 14일 전 이후. (MAPA: "submitted within fifteen (15) days prior to the issue date of the International Veterinary Certificate ... to a broad-spectrum treatment against internal and external parasites")',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readExternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const diff = daysBetween(latest.date, dep)
      if (diff === null) return SKIP
      if (diff < 0) {
        return {
          ok: false,
          message: `외부구충(${latest.date})이 출국일(${dep})보다 늦어요.`,
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      if (diff > 14) {
        return {
          ok: false,
          message: `외부구충(${latest.date})부터 출국일(${dep})까지 ${diff}일이에요. 출국 포함 15일 이내(14일 전 이후)여야 해요.`,
          fixHint: `외부구충일을 ${dep} 기준 14일 전 이후로 조정하세요.`,
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `외부구충(${latest.date}) → 출국일(${dep}): ${diff}일.` }
    },
  },
  {
    id: 'br.internal-parasite-within-15days',
    country: COUNTRY,
    category: '구충',
    title: '내부구충은 출국 포함 15일 이내 (14일 전 이후)',
    description:
      '내부구충(선충·조충) 처치는 출국 포함 15일 이내 = 출국일 기준 14일 전 이후. (MAPA: "submitted within fifteen (15) days prior to the issue date of the International Veterinary Certificate")',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readInternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const diff = daysBetween(latest.date, dep)
      if (diff === null) return SKIP
      if (diff < 0) {
        return {
          ok: false,
          message: `내부구충(${latest.date})이 출국일(${dep})보다 늦어요.`,
          offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      if (diff > 14) {
        return {
          ok: false,
          message: `내부구충(${latest.date})부터 출국일(${dep})까지 ${diff}일이에요. 출국 포함 15일 이내(14일 전 이후)여야 해요.`,
          fixHint: `내부구충일을 ${dep} 기준 14일 전 이후로 조정하세요.`,
          offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `내부구충(${latest.date}) → 출국일(${dep}): ${diff}일.` }
    },
  },
]
