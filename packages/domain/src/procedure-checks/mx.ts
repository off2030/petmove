import { buildDateRuleContext } from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  classifyExportQuarantineDate,
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
import { msgMicrochipBeforeRabies, msgRabiesExpiredBefore, msgRabiesPrimeMinAge } from './messages'

/**
 * 멕시코 (SENASICA — Servicio Nacional de Sanidad, Inocuidad y Calidad Agroalimentaria) 절차 검증.
 *
 * 출처:
 *  - SENASICA Pet Travel — https://www.gob.mx/senasica/documentos/requirements-and-procedures-for-traveling-to-mexico-with-your-pet
 *  - SENASICA Travel with your pet PDF —
 *    https://www.gob.mx/cms/uploads/attachment/file/938779/ENG.Viajas_con_tu_mascota_a_M_xico-Requisitos_y_procedimientos_para_viajar_a_M_xico_con_tu_mascota.pdf
 *
 * 핵심 룰 (SENASICA — 모든 출발국 단일 통합 요건):
 *  - 마이크로칩: SENASICA 의무 아님 (식별·안전 권장). 한국 수출검역에서 사실상 필수
 *  - 광견병: 3개월 이상 (보수 91일 AND 캘린더 3개월), 출국 ≥ 15일 (보수 30일 적용), 출국일 면역 유효
 *  - 구충 (외부·내부): "발급일 전 6개월 이내" 처치 (SENASICA 명시)
 *  - 건강증명서: 출국일(항공기 탑승) 15일 이내 (한국 APQA 10일 + 사용자 N-1 보수 ≤9 적용)
 *  - SENASICA Zoosanitary Certificate, 양식 FF-SENASICA-003
 *
 * 별도 (시스템 검증 제외):
 *  - RNATT: SENASICA 의무 아님
 *  - 종합백신: SENASICA 의무 아님 (광견병만 강제)
 *  - 수입허가: 개·고양이 불요. 도착 시 OISA 검역
 *  - 격리: 없음 (서류·임상검사 통과 시 즉시 통관)
 *
 * 컨벤션 (RU/MY 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - 유효기간 1년 = 접종일의 1주년 당일까지 인정
 */

const COUNTRY = 'mexico'

export const MX_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  // ⚠️ `mx.microchip-before-rabies` 를 **삭제했다**(2026-07-20 조사).
  //   SENASICA 문서에 마이크로칩 조항 자체가 없다 — 마이크로칩은 멕시코 **입국 요건이 아니다**.
  //   다만 멕시코→**한국 귀국** 때는 ISO 칩이 필수라 방향이 정반대다. 입국 요건인 것처럼
  //   룰을 두면 고객이 순서를 잘못 이해한다(귀국 요건은 공통 룰이 담당).

  // ── 광견병 ──
  {
    id: 'mx.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'SENASICA: "Pets under three months of age are exempt" → 3개월 이상 광견병 의무. 안전 기준으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요.',
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
          message: msgRabiesPrimeMinAge('91일'),
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${ev.ageInDays}일령 + 캘린더 3개월(${ev.calendar3mThreshold}) 충족.` }
    },
  },
  {
    id: 'mx.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 30일 이상 전',
    description:
      '광견병 접종일로부터 출국일까지 최소 30일 경과 필요. (SENASICA: 도착 전 ≥15일 명시 — 보수적으로 30일 적용)',
    severity: 'info',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      // 가장 이른(=출국까지 가장 오래 경과한) 접종으로 충족 여부 판단.
      const earliest = rabies[0]
      const days = daysBetween(earliest.date, dep)
      if (days === null) return SKIP
      if (days < 30) {
        return {
          ok: false,
          message: `광견병 접종일(${earliest.date})부터 출국일(${dep})까지 ${days}일이에요. 30일 이상이어야 해요.`,
          offendingPaths: [`rabies_dates[${earliest.originalIndex}].date`, 'departure_date'],
        }
      }
      return { ok: true, message: `광견병 접종(${earliest.date}) → 출국일(${dep}): ${days}일.` }
    },
  },
  {
    id: 'mx.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함. (SENASICA: 유효기간 내 백신 라벨 기준)',
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

  // ── 구충 ──
  {
    id: 'mx.external-parasite-within-6months',
    country: COUNTRY,
    category: '구충',
    title: '외부구충은 도착 6개월 이내',
    description:
      '외부구충(벼룩·진드기) 처치는 멕시코 도착 6개월(180일) 이내 실시. (SENASICA: "preventive treatment for internal and external parasites within the previous six months")',
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
          message: `외부구충(${latest.date})이 출국일(${dep})보다 늦어요. 날짜를 확인하세요.`,
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      if (diff > 180) {
        return {
          ok: false,
          message: `외부구충(${latest.date})부터 출국일(${dep})까지 ${diff}일이에요. 6개월(180일) 이내여야 해요.`,
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `외부구충(${latest.date}) → 출국일(${dep}): ${diff}일.` }
    },
  },
  {
    id: 'mx.internal-parasite-within-6months',
    country: COUNTRY,
    category: '구충',
    title: '내부구충은 도착 6개월 이내',
    description:
      '내부구충(선충·조충) 처치는 멕시코 도착 6개월(180일) 이내 실시. (SENASICA: "preventive treatment for internal and external parasites within the previous six months")',
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
          message: `내부구충(${latest.date})이 출국일(${dep})보다 늦어요. 날짜를 확인하세요.`,
          offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      if (diff > 180) {
        return {
          ok: false,
          message: `내부구충(${latest.date})부터 출국일(${dep})까지 ${diff}일이에요. 6개월(180일) 이내여야 해요.`,
          offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `내부구충(${latest.date}) → 출국일(${dep}): ${diff}일.` }
    },
  },
  // ── 도착 수입 검역 / 현지 수출 검역 (베트남 골격 복제 2026-07-20) ──
  {
    id: 'mx.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '멕시코 수입 검역일',
    description: '멕시코 수입 검역일은 멕시코 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.mx_import_quarantine_date === 'string'
          ? data.mx_import_quarantine_date.slice(0, 10)
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
          message: '멕시코 수입 검역일은 멕시코 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['mx_import_quarantine_date'],
        }
      }
      return { ok: true, message: `멕시코 수입검역일(${raw}) 입국 이후.` }
    },
  },
  {
    id: 'mx.export-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '멕시코 수출 검역일',
    description:
      '멕시코 수출 검역일은 멕시코 입국일 이후·한국 귀국일 이전이어야 함. "그 나라에 있는 동안 받았는가"라는 물리적 제약이라 나라별 규정 조사가 필요 없다(판정은 classifyExportQuarantineDate 공용).',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      const ret =
        typeof ctx.data.return_date === 'string' && ctx.data.return_date.length >= 10
          ? ctx.data.return_date.slice(0, 10)
          : ''
      const verdict = classifyExportQuarantineDate(data.mx_export_quarantine_date, entry, ret)
      if (verdict === 'skip') return SKIP
      if (verdict === 'before-entry') {
        return {
          ok: false,
          message: '멕시코 수출 검역일은 멕시코 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['mx_export_quarantine_date'],
        }
      }
      if (verdict === 'after-return') {
        return {
          ok: false,
          message: '멕시코 수출 검역일은 한국 귀국일보다 늦을 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['mx_export_quarantine_date'],
        }
      }
      return { ok: true, message: `멕시코 수출검역일 체류 기간 내.` }
    },
  },
]
