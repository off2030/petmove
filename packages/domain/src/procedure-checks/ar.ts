import type { ProcedureCheck } from './types'
import {
  daysBetween,
  evaluateRabiesAgeConservative,
  readExternalParasiteEntries,
  readInternalParasiteEntries,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
} from './utils'

/**
 * 아르헨티나 (SENASA — Servicio Nacional de Sanidad y Calidad Agroalimentaria) 절차 검증.
 *
 * 출처:
 *  - SENASA "Ingresos con perros y/o gatos" — https://www.argentina.gob.ar/senasa/informacion-al-viajero/ingresar-o-regresar-al-pais/ingresos-con-perros-yo-gatos
 *  - SENASA "Requisitos por destino: Corea" — https://www.argentina.gob.ar/senasa/informacion-al-viajero/viajar-al-exterior/envios-al-exterior-perros-yo-gatos/requisitos-particulares-por-destino/asia/corea
 *
 * 핵심 룰 (SENASA — 모든 출발국 동일 기본 요건):
 *  - 마이크로칩: SENASA 명시 의무 부재 (식별 권장). 한국 수출검역에서 사실상 필수
 *  - 광견병: 3개월(90일) 이상 (SENASA: "edad mínima ... 3 meses"), 1차 후 21일 권장 (보수 30일 적용)
 *  - 광견병 면역 유효 (제조사 라벨, 통상 1년)
 *  - 건강증명서: CVI 발급일 전 10일 이내 (SENASA: "Certificado de Salud emitido dentro de los 10 días previos")
 *  - CVI 자체는 발급·합법화일로부터 60일 유효
 *  - APQA 영사확인 또는 아포스티유 합법화 권장
 *
 * 별도 (시스템 검증 제외 또는 추가 권고):
 *  - RNATT: SENASA 입국 의무 아님 (한국 귀국용 별도)
 *  - 종합백신: SENASA 의무 아님
 *  - 내·외부 구충: CVI 발급일 전 15일 이내 (SENASA 명시 — 신규 룰 추가 권고)
 *  - 수입허가: 개·고양이 불요. 격리 없음
 *
 * 컨벤션: 필수 입력 누락 시 SKIP. 유효기간 1년 = 접종일 + 364일까지.
 */

const COUNTRY = 'argentina'

export const AR_CHECKS: ProcedureCheck[] = [
  {
    id: 'ar.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      'ISO 표준 마이크로칩이 광견병 1차 접종일과 같거나 이전이어야 함. (아르헨티나 입국 면제, 한국 수출검역 사실상 필수)',
    severity: 'info',
    addedAt: '2026-05-07',
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
        message: `마이크로칩(${microchip})이 광견병 1차 접종(${first.date})보다 늦습니다.`,
        fixHint: '시술 후 광견병 1차 접종부터 다시 시작해야 합니다.',
        offendingPaths: ['microchip_implant_date'],
      }
    },
  },
  {
    id: 'ar.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'SENASA: "La edad mínima para la vacunación antirrábica en Argentina es de tres (3) meses" — 안전 기준으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요.',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
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
            ? `생후 ${ev.ageInDays}일령으로 91일에 미달합니다`
            : ev.failedRule === 'calendar3m'
              ? `1차 접종일(${first.date})이 캘린더 3개월(${ev.calendar3mThreshold})보다 빠릅니다`
              : `생후 ${ev.ageInDays}일령이며 1차 접종일(${first.date})이 캘린더 3개월(${ev.calendar3mThreshold})보다 빠릅니다`
        return {
          ok: false,
          message: `1차 접종일(${first.date})이 보수적 기준을 충족하지 않습니다. ${reason}.`,
          fixHint: `생후 91일 AND ${ev.calendar3mThreshold}(캘린더 3개월)을 둘 다 충족한 이후로 1차 접종일을 조정하세요.`,
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${ev.ageInDays}일령 + 캘린더 3개월(${ev.calendar3mThreshold}) 충족.` }
    },
  },
  {
    id: 'ar.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 30일 이상 전',
    description:
      '광견병 접종일로부터 출국일까지 최소 30일 경과 필요. (SENASA: "inmunidad vigente" — 1차 후 21일 권장, 보수적으로 30일 적용)',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const earliest = rabies[0]
      const days = daysBetween(earliest.date, dep)
      if (days === null) return SKIP
      if (days < 30) {
        return {
          ok: false,
          message: `광견병 접종(${earliest.date})부터 출국일(${dep})까지 ${days}일입니다. 30일 이상이어야 합니다.`,
          fixHint: `광견병 접종을 출국일 ${dep} 기준 30일 이전에 완료하세요.`,
          offendingPaths: [`rabies_dates[${earliest.originalIndex}].date`, 'departure_date'],
        }
      }
      return { ok: true, message: `광견병 접종(${earliest.date}) → 출국일(${dep}): ${days}일.` }
    },
  },
  {
    id: 'ar.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함.',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      if (validUntil < dep) {
        return {
          ok: false,
          message: `최근 접종(${latest.date})의 유효기간(${validUntil})이 출국일(${dep}) 전에 만료됩니다.`,
          fixHint: '출국 전 부스터 접종이 필요합니다.',
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },
  {
    id: 'ar.vet-visit-within-10days',
    country: COUNTRY,
    category: '일정',
    title: '건강증명서(내원일)는 출국 10일 이내 (보수: 9일 전부터)',
    description:
      'SENASA: "Certificado de Salud ... emitido dentro de los 10 (diez) días previos a la fecha de emisión del CVI" — 사용자 보수 N-1 → ≤9 적용.',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const visit = typeof data.vet_visit_date === 'string' ? data.vet_visit_date : ''
      if (!dep || !visit) return SKIP

      const diff = daysBetween(visit, dep)
      if (diff === null) {
        return { ok: false, message: '날짜 형식이 올바르지 않습니다.', offendingPaths: ['vet_visit_date'] }
      }
      if (diff < 0) {
        return {
          ok: false,
          message: `내원일(${visit})이 출국일(${dep})보다 늦습니다.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      if (diff > 9) {
        return {
          ok: false,
          message: `내원일(${visit})부터 출국일(${dep})까지 ${diff}일입니다. 출국일 포함 10일 이내(9일 전부터)여야 합니다.`,
          fixHint: `내원일을 ${dep} 기준 9일 전 이후로 조정하세요.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      return { ok: true, message: `내원일(${visit}) → 출국일(${dep}): ${diff}일.` }
    },
  },

  // ── 구충 (출국 포함 15일 이내 = 출국일 기준 14일 전 이후) ──
  {
    id: 'ar.external-parasite-within-15days',
    country: COUNTRY,
    category: '구충',
    title: '외부구충은 출국 15일 이내 (보수: 14일 전부터)',
    description:
      '외부구충(벼룩·진드기) 처치는 출국 포함 15일 이내 = 출국일 기준 14일 전 이후. (SENASA + MERCOSUR GMC 17/2015: "Tratamiento contra parásitos externos dentro de los 15 (quince) días previos a la fecha de emisión del CVI")',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const entries = readExternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 0) {
        return {
          ok: false,
          message: `외부구충(${latest.date})이 출국일(${dep})보다 늦습니다.`,
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      if (days > 14) {
        return {
          ok: false,
          message: `최근 외부구충(${latest.date})부터 출국(${dep})까지 ${days}일입니다. 출국 포함 15일 이내(14일 전부터)여야 합니다.`,
          fixHint: `처치일을 ${dep} 기준 14일 전 이후로 조정하세요.`,
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 외부구충(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },
  {
    id: 'ar.internal-parasite-within-15days',
    country: COUNTRY,
    category: '구충',
    title: '내부구충은 출국 15일 이내 (보수: 14일 전부터)',
    description:
      '내부구충(선충·조충) 처치는 출국 포함 15일 이내 = 출국일 기준 14일 전 이후. (SENASA + MERCOSUR GMC 17/2015: "Tratamiento contra parásitos internos dentro de los 15 (quince) días previos a la fecha de emisión del CVI")',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const entries = readInternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 0) {
        return {
          ok: false,
          message: `내부구충(${latest.date})이 출국일(${dep})보다 늦습니다.`,
          offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      if (days > 14) {
        return {
          ok: false,
          message: `최근 내부구충(${latest.date})부터 출국(${dep})까지 ${days}일입니다. 출국 포함 15일 이내(14일 전부터)여야 합니다.`,
          fixHint: `처치일을 ${dep} 기준 14일 전 이후로 조정하세요.`,
          offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 내부구충(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },
]
