import { buildDateRuleContext, violatesRabiesEntryWait } from '../journey-steps/date-rules'
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
  findRabiesValidityBreaks,
} from './utils'
import { msgMicrochipBeforeRabies, msgRabiesExpiredBefore, msgRabiesPrimeMinAge } from './messages'

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
 *  - 유효기간 1년 = 접종일의 1주년 당일까지 인정
 */

const COUNTRY = 'brazil'

export const BR_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  // ⚠️ `br.microchip-before-rabies` 를 **삭제했다**(2026-07-20 조사).
  //   MAPA 영문 안내 "A pet microchip is not required to enter Brazil." — 마이크로칩은 브라질 **입국 요건이 아니다**.
  //   다만 브라질→**한국 귀국** 때는 ISO 칩이 필수라 방향이 정반대다. 입국 요건인 것처럼
  //   룰을 두면 고객이 순서를 잘못 이해한다(귀국 요건은 공통 룰이 담당).

  // ── 광견병 ──
  {
    id: 'br.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'MAPA: "Animals 90 (ninety) days older must have a rabies vaccination" — 안전 기준으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요.',
    // severity 승격 info→warning(2026-07-21) — 구세대 파일의 잔재였다. 의료·일정 룰은
    // warning 이 앱 기준이다(다른 목적지와 동일). 이 룰은 카드에 매핑돼 있어 배지가 카드에 붙는다.
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
              ? `${first.date}이 캘린더 3개월(${ev.calendar3mThreshold})보다 빨라요`
              : `생후 ${ev.ageInDays}일령이며 ${first.date}이 캘린더 3개월(${ev.calendar3mThreshold})보다 빨라요`
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
    id: 'br.rabies-min-21days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 21일 이상 전',
    description:
      'Portaria MAPA 741/2024 Art. 10 — 1차 접종("primovacinados")은 21일 경과 후 출발 허용. 유효기간 만료 전 재접종하지 않은 경우도 1차로 간주한다. 저장 거부(validateRabiesEntryWait)와 같은 판정 함수(violatesRabiesEntryWait)를 쓴다.',
    // ⚠️ 예전엔 30일이었다 — 그건 브라질 입국이 아니라 **한국 귀국** 요건("não inferior a
    //   30 dias", MAPA 한국 전용 시트)이 흘러든 값이었다(2026-07-20 조사에서 발견).
    //   방향이 다른 두 규정을 뒤섞으면 브라질 규정을 지킨 사람의 입력을 우리가 막는다.
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const data = (caseRow.data ?? {}) as Record<string, unknown>
      // 기준은 **최근** 접종이고 유효 부스터는 면제 — 구버전은 가장 이른 접종(rabies[0])을
      // 봐서 만료 후 재접종한 케이스를 놓쳤다(구세대 파일 공통 결함).
      if (!violatesRabiesEntryWait(data, dep, destination)) {
        const latest = rabies[rabies.length - 1]
        return { ok: true, message: `최근 접종(${latest.date}) → 출국일(${dep}): 21일 충족(또는 유효 부스터).` }
      }
      const latest = rabies[rabies.length - 1]
      return {
        ok: false,
        message: '광견병 접종 후 21일이 지나야 브라질에 입국할 수 있어요. 입국일을 미뤄야 해요.',
        offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
      }
    },
  },
  {
    id: 'br.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간(1년) 이내에 해야 함. 만료 후 접종은 chain 이 끊겨 새 1차로 간주된다. 저장 거부(findRabiesChainBreak)의 짝이 되는 주의 — 펫무브워크는 저장을 막지 않고 절차검증만 보므로 이 룰이 없으면 운영자 화면에서 끊긴 chain 이 안 보인다.',
    severity: 'warning',
    addedAt: '2026-07-21',
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
          message: msgRabiesExpiredBefore('출국'),
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
    // severity 승격 info→warning(2026-07-21) — 구세대 파일의 잔재였다. 의료·일정 룰은
    // warning 이 앱 기준이다(다른 목적지와 동일). 이 룰은 카드에 매핑돼 있어 배지가 카드에 붙는다.
    severity: 'warning',
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
          message: '외부 기생충 치료일이 출국일보다 늦어요. 날짜를 확인하세요.',
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      if (diff > 14) {
        return {
          ok: false,
          message: '외부 기생충 치료는 출국 15일 이내에 해야 해요.',
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `외부 기생충 치료(${latest.date}) → 출국일(${dep}): ${diff}일.` }
    },
  },
  {
    id: 'br.internal-parasite-within-15days',
    country: COUNTRY,
    category: '구충',
    title: '내부구충은 출국 포함 15일 이내 (14일 전 이후)',
    description:
      '내부구충(선충·조충) 처치는 출국 포함 15일 이내 = 출국일 기준 14일 전 이후. (MAPA: "submitted within fifteen (15) days prior to the issue date of the International Veterinary Certificate")',
    // severity 승격 info→warning(2026-07-21) — 구세대 파일의 잔재였다. 의료·일정 룰은
    // warning 이 앱 기준이다(다른 목적지와 동일). 이 룰은 카드에 매핑돼 있어 배지가 카드에 붙는다.
    severity: 'warning',
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
          message: '내부 기생충 치료일이 출국일보다 늦어요. 날짜를 확인하세요.',
          offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      if (diff > 14) {
        return {
          ok: false,
          message: '내부 기생충 치료는 출국 15일 이내에 해야 해요.',
          offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `내부 기생충 치료(${latest.date}) → 출국일(${dep}): ${diff}일.` }
    },
  },
  // ── 도착 수입 검역 / 현지 수출 검역 (베트남 골격 복제 2026-07-20) ──
  {
    id: 'br.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '브라질 수입 검역일',
    description: '브라질 수입 검역일은 브라질 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.br_import_quarantine_date === 'string'
          ? data.br_import_quarantine_date.slice(0, 10)
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
          message: '브라질 수입 검역일은 브라질 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['br_import_quarantine_date'],
        }
      }
      return { ok: true, message: `브라질 수입검역일(${raw}) 입국 이후.` }
    },
  },
  {
    id: 'br.export-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '브라질 수출 검역일',
    description:
      '브라질 수출 검역일은 브라질 입국일 이후·한국 귀국일 이전이어야 함. "그 나라에 있는 동안 받았는가"라는 물리적 제약이라 나라별 규정 조사가 필요 없다(판정은 classifyExportQuarantineDate 공용).',
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
      const verdict = classifyExportQuarantineDate(data.br_export_quarantine_date, entry, ret)
      if (verdict === 'skip') return SKIP
      if (verdict === 'before-entry') {
        return {
          ok: false,
          message: '브라질 수출 검역일은 브라질 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['br_export_quarantine_date'],
        }
      }
      if (verdict === 'after-return') {
        return {
          ok: false,
          message: '브라질 수출 검역일은 한국 귀국일보다 늦을 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['br_export_quarantine_date'],
        }
      }
      return { ok: true, message: `브라질 수출검역일 체류 기간 내.` }
    },
  },
]
