import {
  buildDateRuleContext,
  violatesRabiesEntryWait,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  addYears,
  classifyExportQuarantineDate,
  daysBetween,
  findRabiesValidityBreaks,
  readExternalParasiteEntries,
  readInternalParasiteEntries,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
} from './utils'
import {
  msgMicrochipBeforeRabies,
  msgRabiesExpiredBefore,
  msgRabiesPrimeMinAge,
} from './messages'

/**
 * 튀르키예 (Tarım ve Orman Bakanlığı — 농림부) 절차 검증.
 *
 * **출처 = 펫무브 튀르키예 가이드**(apps/www/content/docs/turkey-pet-travel-guide.json,
 * 최종 갱신 2025-11-16). 사용자 지정(2026-07-22): "펫무브 웹사이트 참고".
 * 가이드 스스로 "공식 자료나 관련 기관 웹사이트가 없어 실제 입국 사례를 바탕으로 최소한의
 * 요건을 추린 것"이라 밝힌다 — 정부 1차 출처가 아니라 **실무 사례 기반**임을 전제로 읽을 것.
 *
 * 가이드가 정한 값(이 파일의 근거):
 *  - 마이크로칩 ISO 표준, "모든 절차 중 가장 먼저" + "마이크로칩 삽입 후 접종"
 *  - 광견병: **생후 12주 이후 접종**, **출국일 기준 30일 이전**, **1년을 넘지 않아야**
 *  - 광견병 항체검사(RNATT): **튀르키예 입국 요건**. 0.5 IU/ml 이상.
 *    · 접종~채혈 간격 "명확한 규정 없음 / 일반적으로 유럽 기준처럼 최소 30일 이후 권장"
 *      → 규정이 아니라 권고라 **룰을 만들지 않고 카드 문구로만** 안내한다(대만과 같은 처리).
 *    · 결과지 유효기간도 "명확한 규정 없음 / 일반적으로 1년" → 1년 룰만 둔다.
 *  - 내·외부 기생충: **여행 30일 이내**(진드기용 외부 + 촌충 Echinococcus 용 내부)
 *  - 출국 전 임상검사: 출국 직전, **48시간 이내 권장** → 프로파일 vetVisitWindowDays: 2
 *  - 1인 2마리 한도(룰 미구현 — 보호자 단위 조건이라 별도 판단)
 *
 * ⚠️ **2026-07-22 재작성.** 직전엔 카자흐스탄 복제본(EAEU 20일·종합백신)이었고 그 전엔 EU
 *   규정을 차용한 구세대 파일이었다. 구세대에서 **의도적으로 되살리지 않은 것**:
 *   ① `tr.departure-min-3months-after-titer`(채혈 후 3개월 대기) — 근거가 "EU Reg 576/2013
 *      차용 / unlisted 제3국"이라는 **추론**이었고 가이드엔 그런 대기가 없다. 되살리려면
 *      튀르키예 원문 근거부터 확보할 것(사용자 보고 대상).
 *   ② `tr.banned-breeds`(핏불·도사·도고·필라 blocker) — 사용자 지정 2026-07-22 "없어도 돼".
 *   ③ 기생충 시점을 '출국 전날'로 보던 룰 — 가이드는 **30일 이내**다. 가이드를 따랐다.
 *   ④ 종합백신 20일/12개월(카자흐스탄 복제 잔재) — 가이드에 종합백신 항목 자체가 없다.
 *
 * 컨벤션: 필수 입력 누락 시 SKIP. 유효기간 1년 = 접종일의 1주년 당일까지.
 * 고객 노출 문구엔 날짜를 넣지 않는다(lint:checks) — 문제 입력은 offendingPaths 가 짚는다.
 */

const COUNTRY = 'turkey'

export const TR_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'tr.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 접종 이전 시술',
    description:
      'ISO 표준 마이크로칩이 광견병 첫 접종일과 같거나 이전이어야 함. 가이드: "마이크로칩 삽입 — 모든 절차 중 가장 먼저 실시" + "마이크로칩 삽입 후 접종". 백신 입력 시 client 차단(validateMicrochipBeforeBooster)과 짝 — 칩 시술일을 나중에 수정해 깨진 경우를 주의로 표면화.',
    severity: 'warning',
    addedAt: '2026-07-22',
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

  // ── 광견병 ──
  {
    id: 'tr.rabies-prime-after-12weeks',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 생후 12주(84일) 이상',
    description:
      '가이드: "광견병 예방접종 — 생후 12주 이후에 접종". EU Reg 576/2013 과 같은 값이다. 입력 차단(step.earliest.daysAfter)과 같은 기준.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!birth || rabies.length === 0) return SKIP

      const first = rabies[0]
      const age = daysBetween(birth, first.date)
      if (age === null) return SKIP
      if (age < 84) {
        return {
          ok: false,
          message: msgRabiesPrimeMinAge('84일(12주)'),
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${age}일령.` }
    },
  },
  {
    id: 'tr.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 30일 이상 전',
    description:
      '가이드: "출국일 기준 30일 이전". 최근 접종 기준이고 유효 부스터는 면제. 저장 거부(validateRabiesEntryWait)와 같은 판정 함수(violatesRabiesEntryWait — 프로파일 entryWaitDaysAfterVaccine 파생)를 쓴다.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (!violatesRabiesEntryWait(data, dep, destination)) {
        const latest = rabies[rabies.length - 1]
        return { ok: true, message: `최근 접종(${latest.date}) → 출국일(${dep}): 30일 충족(또는 유효 부스터).` }
      }
      const latest = rabies[rabies.length - 1]
      return {
        ok: false,
        message: '광견병 접종 후 30일이 지나야 튀르키예에 입국할 수 있어요. 입국일을 미뤄야 해요.',
        offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
      }
    },
  },
  {
    id: 'tr.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간 이내에 해야 함. 만료 후 접종은 chain 이 끊겨 새 1차로 간주된다. 저장 거부(findRabiesChainBreak)의 짝이 되는 주의.',
    severity: 'warning',
    addedAt: '2026-07-22',
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
    id: 'tr.rabies-within-12months-of-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종 후 1년 이내 출국',
    description:
      '가이드: 광견병 접종이 "출국일 기준 30일 이전 그리고 **1년을 넘지 않아야** 합니다" — 최근 접종일로부터 1년이 지나기 전에 출국해야 한다. ⚠️ 이건 **경과 시간** 제한이지 3년 백신 자체를 거부하는 규정이 아니다. 그래서 baseline 이 다르다: 중국·태국·필리핀처럼 입력을 차단(oneYearVaccineOnly)하지 않고, 접종일과 출국일의 간격만 본다. 3년 백신을 맞았어도 1년 안에 출국하면 요건을 충족한다.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      if (addYears(latest.date, 1) >= dep) {
        return { ok: true, message: `최근 접종(${latest.date}) + 1년(${addYears(latest.date, 1)}) ≥ 출국일(${dep}).` }
      }
      return {
        ok: false,
        message: '광견병 접종 후 1년이 지나기 전에 출국해야 해요. 출국 전에 다시 접종하세요.',
        offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
      }
    },
  },
  {
    id: 'tr.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description: '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함.',
    // info — 광견병 카드 문구가 같은 말을 하므로 배지 중복을 피한다(다른 목적지와 동일 처리).
    severity: 'info',
    addedAt: '2026-07-22',
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

  // ── 광견병 항체 검사 (RNATT) — **튀르키예 입국 요건** ──
  // 접종~채혈 30일은 가이드가 "명확한 규정 없음 / 일반적으로 권장"이라 룰을 두지 않는다
  // (카드 문구로만 안내 — 대만과 같은 처리). 유효기간 1년만 룰로 둔다.
  {
    id: 'tr.departure-within-12months-of-titer',
    country: COUNTRY,
    category: '광견병',
    title: '출국일은 항체 검사 12개월 이내',
    description:
      '가이드: "검사 결과지의 유효기간에 대한 명확한 규정이 없습니다. 일반적으로 1년으로 생각합니다." — 출국일이 채혈일의 1주년을 넘으면 재검사가 필요하다(1주년 당일까지 유효).',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      const valid = titers.find((t) => addYears(t.date, 1) >= dep)
      if (valid) {
        return { ok: true, message: `항체 검사(${valid.date}) 유효(${addYears(valid.date, 1)}) ≥ 출국일(${dep}).` }
      }
      return {
        ok: false,
        message: '광견병 항체 검사 결과의 유효기간이 출국 전에 끝나요. 다시 검사해야 해요.',
        offendingPaths: titers.map((t) => `rabies_titer_records[${t.originalIndex}].date`),
      }
    },
  },

  // ── 내·외부 기생충 (여행 30일 이내) ──
  // 가이드: "내외부기생충 치료 — 여행 30일 이내에 실시해야 합니다. 진드기에 효과적인 외부
  // 기생충 치료제와 촌충(Echinococcus)에 효과적인 내부 구충제 치료를 해야 합니다."
  {
    id: 'tr.external-parasite-within-30days',
    country: COUNTRY,
    category: '기생충',
    title: '외부 기생충 치료는 출국 30일 이내',
    description:
      '가이드: 내외부 기생충 치료를 "여행 30일 이내에 실시". 진드기에 효과적인 제제. 가장 최근 처치일이 출국일로부터 30일 이내여야 한다.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readExternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days > 30) {
        return {
          ok: false,
          message: '외부 기생충 치료는 출국 30일 이내에 해야 해요.',
          offendingPaths: ['departure_date', `external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 외부구충(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },
  {
    id: 'tr.internal-parasite-within-30days',
    country: COUNTRY,
    category: '기생충',
    title: '내부 기생충 치료는 출국 30일 이내',
    description:
      '가이드: 내외부 기생충 치료를 "여행 30일 이내에 실시". 촌충(Echinococcus)에 효과적인 구충제. 가장 최근 처치일이 출국일로부터 30일 이내여야 한다.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readInternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days > 30) {
        return {
          ok: false,
          message: '내부 기생충 치료는 출국 30일 이내에 해야 해요.',
          offendingPaths: ['departure_date', `internal_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 내부구충(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },

  // ── 검역 일정 재검증 ──
  {
    id: 'tr.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '튀르키예 수입 검역일',
    description: '튀르키예 수입 검역일은 튀르키예 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.tr_import_quarantine_date === 'string'
          ? data.tr_import_quarantine_date.slice(0, 10)
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
          message: '튀르키예 수입 검역일은 튀르키예 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['tr_import_quarantine_date'],
        }
      }
      return { ok: true, message: `튀르키예 수입검역일(${raw}) 입국 이후.` }
    },
  },
  {
    id: 'tr.export-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '튀르키예 수출 검역일',
    description:
      '튀르키예 수출 검역일은 튀르키예 입국일 이후·한국 귀국일 이전이어야 함. "그 나라에 있는 동안 받았는가"라는 물리적 제약이라 나라별 규정 조사가 필요 없다(판정은 classifyExportQuarantineDate 공용).',
    severity: 'warning',
    addedAt: '2026-07-22',
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
      const verdict = classifyExportQuarantineDate(data.tr_export_quarantine_date, entry, ret)
      if (verdict === 'skip') return SKIP
      if (verdict === 'before-entry') {
        return {
          ok: false,
          message: '튀르키예 수출 검역일은 튀르키예 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['tr_export_quarantine_date'],
        }
      }
      if (verdict === 'after-return') {
        return {
          ok: false,
          message: '튀르키예 수출 검역일은 한국 귀국일보다 늦을 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['tr_export_quarantine_date'],
        }
      }
      return { ok: true, message: '튀르키예 수출검역일 체류 기간 내.' }
    },
  },
]
