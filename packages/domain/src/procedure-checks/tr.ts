import {
  buildDateRuleContext,
  calendarAgeThreshold,
  meetsCalendarAge,
  violatesRabiesEntryWait,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  addMonths,
  classifyExportQuarantineDate,
  daysBetween,
  findRabiesValidityBreaks,
  readGeneralVaccineEntries,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
} from './utils'
import {
  msgGeneralVaccineExpiredBefore,
  msgGeneralVaccineMinDaysBeforeDeparture,
  msgMicrochipBeforeRabies,
  msgRabiesExpiredBefore,
  msgRabiesPrimeMinAge,
} from './messages'

/**
 * 튀르키예 (Tarım ve Orman Bakanlığı — 농림부) 절차 검증.
 *
 * ⚠️ **카자흐스탄(kz.ts) 한 벌 복제 (2026-07-22)** — 룰 구조·수치(달력 3개월·20일·12개월)가
 *   전부 카자흐스탄 것이다. 나라별 규정 확정 후 수정 예정(사용자 지정 — "카자흐스탄 복사").
 *   ⚠️ 튀르키예는 EAEU 회원이 **아니다** — 카자흐스탄 룰의 근거(EAEU 결정 317 제15장)가
 *   튀르키예엔 적용되지 않는다. 러시아와 달리 근거가 겹치는 부분이 없으므로 전면 재조사 대상.
 *
 * ⚠️ **알려진 충돌 3건 — 세부 수정 1순위** (구세대 조사값, 교체 전 tr.ts / git 이력)
 *   ①**항체검사(RNATT)가 입국 요건이다.** 튀르키예는 한국을 EU 분류상 unlisted third
 *     country 로 보아 RNATT 를 요구한다(채혈 ≥ 접종+30일, 0.5 IU/ml, 출국 ≤ 채혈+1년).
 *     복제본은 '한국 귀국용'(titer.need:'return-only')이라 **사실과 반대**로 안내한다.
 *   ②최소 접종 연령 **생후 12주(84일)** — EU Reg 576/2013 일치. 복제값은 달력 3개월.
 *   ③접종 후 대기 **30일** — 복제값은 20일.
 *   그 외: 구충(외부 진드기·내부 촌충) 출국 전날, 임상검사 출국 24시간 이내(TK.pdf 각주 6 —
 *   프로파일 vetVisitWindowDays: 2 로 유지 중), 핏불·도사·도고 아르헨티노·필라 수입 금지,
 *   종합백신은 권고(의무 명문 부재)라 복제된 20일/12개월 룰의 근거가 없다.
 *   1차 출처: tarimorman.gov.tr, 튀르키예 공관 안내(LA·NY), CFIA 튀르키예 수출 페이지.
 *
 * 컨벤션: 필수 입력 누락 시 SKIP. 유효기간 1년 = 접종일의 1주년 당일까지.
 */

const COUNTRY = 'turkey'

export const TR_CHECKS: ProcedureCheck[] = [
  {
    id: 'tr.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 접종 이전 시술',
    description:
      '마이크로칩이 광견병 첫 접종일과 같거나 이전이어야 함. ⚠️ 카자흐스탄 복제값(2026-07-22). 튀르키예는 EAEU 비회원이라 제15장 근거가 적용되지 않는다 — 구세대 조사는 ISO 칩을 입국 요건으로 봤다. 재확인 필요.',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const microchip =
        typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!microchip || rabies.length === 0) return SKIP

      const first = rabies[0]
      if (microchip <= first.date) {
        return { ok: true, message: `마이크로칩(${microchip}) ≤ 첫 접종(${first.date}).` }
      }
      return {
        ok: false,
        message: msgMicrochipBeforeRabies(),
        offendingPaths: ['microchip_implant_date'],
      }
    },
  },
  {
    id: 'tr.rabies-prime-after-3months-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종은 생후 3개월 이후',
    description:
      '달력 3개월 기준(사용자 확정값). ⚠️ 카자흐스탄 복제값(2026-07-22) — **튀르키예 실제 기준은 생후 12주(84일, EU Reg 576/2013)**. 세부 수정 대상. 입력 차단(step.earliest.monthsAfter)과 같은 판정 함수(meetsCalendarAge)를 쓴다.',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!birth || rabies.length === 0) return SKIP

      const first = rabies[0]
      if (!meetsCalendarAge(birth, first.date, 3)) {
        return {
          ok: false,
          message: msgRabiesPrimeMinAge('3개월'),
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return {
        ok: true,
        message: `1차 접종일(${first.date}) 생후 3개월(${calendarAgeThreshold(birth, 3)}) 이후.`,
      }
    },
  },
  {
    id: 'tr.rabies-min-20days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 20일 이상 전',
    description:
      'EAEU 제15장 "Не позднее чем за 20 дней до отправки" — 최근 12개월 내 접종 이력이 있으면 재접종 면제. 저장 거부(validateRabiesEntryWait)와 같은 판정 함수(violatesRabiesEntryWait)를 쓴다. ⚠️ 카자흐스탄 복제값(2026-07-22) — **튀르키예 실제 기준은 30일**. 세부 수정 1순위.',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (!violatesRabiesEntryWait(data, dep, destination)) {
        const latest = rabies[rabies.length - 1]
        return { ok: true, message: `최근 접종(${latest.date}) → 출국일(${dep}): 20일 충족(또는 유효 부스터).` }
      }
      const latest = rabies[rabies.length - 1]
      return {
        ok: false,
        message: '광견병 접종 후 20일이 지나야 튀르키예에 입국할 수 있어요. 입국일을 미뤄야 해요.',
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
      'EAEU 제15장 "любая последующая вакцинация против бешенства проводилась в период действия предшествующей вакцинации" — 만료 후 접종은 chain 이 끊겨 새 1차로 간주된다. ⚠️ 카자흐스탄에서 복제된 EAEU 근거다 — **튀르키예는 EAEU 비회원이라 이 조문이 적용되지 않는다.** 종합백신은 구세대 조사에서 권고(의무 명문 부재)였다. 전면 재조사 대상.',
    severity: 'warning',
    addedAt: '2026-07-20',
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
    id: 'tr.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description: '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함.',
    // ⚠️ 'info' 는 표시 억제를 겸한다 — 베트남 vn.rabies-valid-on-departure 와 같은 구조.
    severity: 'info',
    addedAt: '2026-07-20',
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
  // ── 종합백신 — 광견병과 **같은** 20일/12개월 창 (제15장) ──
  // ⚠️ 룰이 없어서 카드가 '출국 20일 전까지'·'최근 12개월'이라고 안내하면서 그 창을 벗어난
  //   입력을 아무도 잡지 않았다(2026-07-22 사용자 지적). 튀르키예은 종합백신에도 광견병과
  //   똑같은 기한이 걸리는 구조라(태국·필리핀은 별도 기한) 특히 놓치기 쉽다.
  //
  // **두 룰로 나눈 이유**(2026-07-22): 만료(12개월) 쪽은 종합백신 카드의 situational 안내가
  //   이미 "직전 종합백신의 면역 유효기간이 …에 만료되었어요. 추가 접종 기록을 입력하세요."
  //   로 같은 말을 한다. 한 룰로 묶으면 그 중복을 포털에서 숨길 수 없어(20일 주의까지 함께
  //   사라진다) 태국·필리핀과 같은 구조로 분리했다 —
  //   `*-not-expired-on-arrival` 접미사는 scenario.ts ADVISORY_DEFERRED_CHECKS 와
  //   lint 의 ADVISORY_SUFFIXES 가 알아보는 이름이라, 포털에선 자동으로 숨고 펫무브워크
  //   (운영자)에는 그대로 남는다. 이름을 바꾸면 그 처리가 깨진다.
  //
  // 두 룰 공통 — 창을 만족하는 접종이 하나라도 있으면 통과. 여러 번 접종한 경우를 벌하지
  //   않는다(부스터를 출국 직전에 한 번 더 맞아도, 그 전 접종이 창 안이면 요건은 충족).
  // 문구는 **공통 헬퍼**를 쓴다 — 태국·필리핀과 같은 문장이 된다. 직접 문자열 금지.
  //   12개월 초과에도 '면역 유효기간 만료' 문구가 맞는 이유: 종합백신은 1년 제품뿐이라
  //   입국 요건 12개월과 백신 유효기간이 사실상 같다(광견병의 3년 백신 같은 어긋남이 없다).
  {
    id: 'tr.general-vaccine-min-20days-before-departure',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신은 출국 20일 이상 전',
    description:
      'EAEU 제15장 "Не позднее чем за 20 дней до отправки" — 광견병과 같은 문장에서 종합백신도 함께 규정한다. 12개월 이내 접종 이력이 있으면 재접종 면제(그 판정은 만료 룰이 담당). ⚠️ 카자흐스탄에서 복제된 EAEU 근거다 — **튀르키예는 EAEU 비회원이라 이 조문이 적용되지 않는다.** 종합백신은 구세대 조사에서 권고(의무 명문 부재)였다. 전면 재조사 대상.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      // 20일을 만족하는 접종이 하나라도 있으면 통과(만료 여부는 별도 룰).
      const ok = entries.find((e) => {
        const gap = daysBetween(e.date, dep)
        return gap !== null && gap >= 20
      })
      if (ok) return { ok: true, message: `종합백신(${ok.date}) → 출국(${dep}): 20일 충족.` }

      const latest = entries[entries.length - 1]
      return {
        ok: false,
        message: msgGeneralVaccineMinDaysBeforeDeparture(20),
        offendingPaths: ['departure_date', `general_vaccine_dates[${latest.originalIndex}].date`],
      }
    },
  },
  {
    // ⚠️ 이름 끝의 `-not-expired-on-arrival` 은 포털 표시 억제 마커다(위 주석 참고).
    id: 'tr.general-vaccine-not-expired-on-arrival',
    country: COUNTRY,
    category: '종합백신',
    title: '출국일에 종합백신 12개월 이내',
    description:
      'EAEU 제15장 "если они не были привиты в течение последних 12 месяцев" — 출국 시점에 접종 후 12개월이 지나지 않아야 함. 포털에선 종합백신 카드의 만료 안내가 같은 말을 하므로 배지를 숨기고, 펫무브워크에는 표시된다. ⚠️ 카자흐스탄에서 복제된 EAEU 근거다 — **튀르키예는 EAEU 비회원이라 이 조문이 적용되지 않는다.** 종합백신은 구세대 조사에서 권고(의무 명문 부재)였다. 전면 재조사 대상.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const ok = entries.find((e) => {
        const limit = addMonths(e.date, 12)
        return !!limit && dep <= limit
      })
      if (ok) return { ok: true, message: `종합백신(${ok.date}) 출국일(${dep}) 기준 12개월 이내.` }

      const latest = entries[entries.length - 1]
      return {
        ok: false,
        message: msgGeneralVaccineExpiredBefore('출국'),
        offendingPaths: [`general_vaccine_dates[${latest.originalIndex}].date`],
      }
    },
  },

  // ── 도착 수입 검역 / 현지 수출 검역 (베트남 골격 복제 2026-07-20) ──
  {
    id: 'tr.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '튀르키예 수입 검역일',
    description: '튀르키예 수입 검역일은 튀르키예 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-20',
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
      return { ok: true, message: `튀르키예 수출검역일 체류 기간 내.` }
    },
  },
]
