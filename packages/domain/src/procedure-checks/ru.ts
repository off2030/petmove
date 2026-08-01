import {
  buildDateRuleContext,
  calendarAgeThreshold,
  meetsCalendarAge,
  violatesRabiesEntryWait,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  addMonths,
  daysBetween,
  findRabiesValidityBreaks,
  readGeneralVaccineEntries,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
  todayKst,
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
 * 러시아 (Rosselkhoznadzor / EAEU) 절차 검증.
 *
 * ⚠️ **카자흐스탄(kz.ts) 한 벌 복제 (2026-07-22)** — 룰 구조·수치(달력 3개월·20일·12개월)가
 *   전부 카자흐스탄 것이다. 나라별 규정 확정 후 수정 예정(사용자 지정 — "카자흐스탄 복사").
 *
 * 근거가 겹치는 부분 — 러시아도 **EAEU 정회원**이라 관세동맹위원회 결정 제317호 부속서 4
 *   제15장(개·고양이)이 동일하게 적용된다. 그래서 종합백신 20일/12개월 구조는 러시아에도 맞다.
 *
 * ⚠️ **알려진 충돌 — 세부 수정 1순위**
 *   러시아는 자국 안내(Rosselkhoznadzor)에서 광견병 접종을 **출국 30일 이상 ~ 12개월 이내**로
 *   공표한다. 복제값 20일(EAEU 조문)보다 엄격하므로, 지금 값은 규정 미달을 통과시킬 수 있다.
 *   구세대 조사값(교체 전 ru.ts, git 이력): 생후 12주(3개월), 출국 30일~12개월,
 *   다년 백신도 최종 접종일 기준 12개월 이내, 임상검진 선적 5일 이내(EAEU 명시 —
 *   프로파일 vetVisitWindowDays: 5 로 유지 중), 개인 1인 2마리 한도, RNATT 입국 면제.
 *   1차 출처: fsvps.gov.ru 반려동물 반입 안내 + EAEU 결정 317 제15장.
 *
 * 컨벤션: 필수 입력 누락 시 SKIP. 유효기간 1년 = 접종일의 1주년 당일까지.
 */

const COUNTRY = 'russia'

export const RU_CHECKS: ProcedureCheck[] = [
  {
    id: 'ru.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 접종 이전 시술',
    description:
      '마이크로칩이 광견병 첫 접종일과 같거나 이전이어야 함. ⚠️ 카자흐스탄 복제값(2026-07-22). 러시아도 EAEU 회원이라 제15장엔 칩 조항이 없다 — 근거는 한국 귀국 요건 쪽이다. 러시아 국내 등록법 확인 필요.',
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
    id: 'ru.rabies-prime-after-3months-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종은 생후 3개월 이후',
    description:
      '달력 3개월 기준(사용자 확정값). ⚠️ 카자흐스탄 복제값(2026-07-22). 러시아 구세대 조사는 생후 12주(3개월)로 같은 값이다. 입력 차단(step.earliest.monthsAfter)과 같은 판정 함수(meetsCalendarAge)를 쓴다.',
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
    id: 'ru.rabies-min-20days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 20일 이상 전',
    description:
      'EAEU 제15장 "Не позднее чем за 20 дней до отправки" — 최근 12개월 내 접종 이력이 있으면 재접종 면제. 저장 거부(validateRabiesEntryWait)와 같은 판정 함수(violatesRabiesEntryWait)를 쓴다. ⚠️ 카자흐스탄 복제값(2026-07-22) — **러시아 자국 안내(Rosselkhoznadzor)는 30일**이다. 20일은 EAEU 조문값이라 러시아 기준보다 느슨하다. 세부 수정 1순위.',
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
        message: '광견병 접종 후 20일이 지나야 러시아에 입국할 수 있어요. 입국일을 미뤄야 해요.',
        offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
      }
    },
  },
  {
    id: 'ru.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      'EAEU 제15장 "любая последующая вакцинация против бешенства проводилась в период действия предшествующей вакцинации" — 만료 후 접종은 chain 이 끊겨 새 1차로 간주된다. ⚠️ 러시아도 EAEU 회원이라 이 조문이 그대로 적용된다(복제됐지만 근거는 유효).',
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
    id: 'ru.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description: '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함.',
    // warning 승격(2026-08-01) — "카드가 있으면 만료는 전부 주의"(common.ts 2026-07-30 확정 원칙).
    // 카드 미매핑 룰이라 배너 중복은 ADVISORY_DEFERRED_CHECKS(scenario.ts) 등록으로 막는다.
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      // 이미 만료(오늘 기준)는 common.rabies-validity-expired '주의'가 담당 — 여기선 아직
      // 유효한데 출국 시점에 만료 예정인 경우만 남긴다(만료 재구성 B, 2026-07-25).
      if (validUntil < todayKst()) return SKIP
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
  //   입력을 아무도 잡지 않았다(2026-07-22 사용자 지적). 러시아은 종합백신에도 광견병과
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
    id: 'ru.general-vaccine-min-20days-before-departure',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신은 출국 20일 이상 전',
    description:
      'EAEU 제15장 "Не позднее чем за 20 дней до отправки" — 광견병과 같은 문장에서 종합백신도 함께 규정한다. 12개월 이내 접종 이력이 있으면 재접종 면제(그 판정은 만료 룰이 담당). ⚠️ 러시아도 EAEU 회원이라 이 조문이 그대로 적용된다(복제됐지만 근거는 유효).',
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
    id: 'ru.general-vaccine-not-expired-on-arrival',
    country: COUNTRY,
    category: '종합백신',
    title: '출국일에 종합백신 12개월 이내',
    description:
      'EAEU 제15장 "если они не были привиты в течение последних 12 месяцев" — 출국 시점에 접종 후 12개월이 지나지 않아야 함. 포털에선 종합백신 카드의 만료 안내가 같은 말을 하므로 배지를 숨기고, 펫무브워크에는 표시된다. ⚠️ 러시아도 EAEU 회원이라 이 조문이 그대로 적용된다(복제됐지만 근거는 유효).',
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
      // 이미 만료(오늘 기준)는 common.general-vaccine-validity-expired '주의'가 담당 —
      // 여기선 아직 유효한데 출국 시점에 12개월 창을 벗어나는 경우만 남긴다(만료 재구성 B,
      // 2026-07-25). 종합백신은 1년 제품뿐이라 12개월 창과 면역 유효기간이 사실상 같다.
      const latestLimit = addMonths(latest.date, 12)
      if (latestLimit && latestLimit < todayKst()) return SKIP
      return {
        ok: false,
        message: msgGeneralVaccineExpiredBefore('출국'),
        offendingPaths: [`general_vaccine_dates[${latest.originalIndex}].date`],
      }
    },
  },

  // ── 도착 수입 검역 / 현지 수출 검역 (베트남 골격 복제 2026-07-20) ──
  {
    id: 'ru.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '러시아 수입 검역일',
    description: '러시아 수입 검역일은 러시아 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.ru_import_quarantine_date === 'string'
          ? data.ru_import_quarantine_date.slice(0, 10)
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
          message: '러시아 수입 검역일은 러시아 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['ru_import_quarantine_date'],
        }
      }
      return { ok: true, message: `러시아 수입검역일(${raw}) 입국 이후.` }
    },
  },
]
