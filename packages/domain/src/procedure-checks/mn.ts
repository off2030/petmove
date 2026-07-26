import {
  buildDateRuleContext,
  calendarAgeThreshold,
  meetsCalendarAge,
  violatesRabiesEntryWait,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  findRabiesValidityBreaks,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
  todayKst,
  readDepartureDate,
} from './utils'
import {
  msgMicrochipBeforeRabies,
  msgRabiesExpiredBefore,
  msgRabiesPrimeMinAge,
} from './messages'

/**
 * 몽골 (GASI — General Agency for Specialized Inspection) 절차 검증.
 *
 * ✅ **한국 APQA 공식 안내문을 1차 근거로 확보했다** (2026-07-20 개별 조사 완료).
 *   「개·고양이 국가별 검역조건 — 몽골」 2024-04-30 개정판. 파일명에 개정일이 박혀 있어
 *   최신본임이 확인된다. 베트남 복제 상태에서 벗어났다.
 *     목록   https://www.qia.go.kr/livestock/qua/list93webQiaCom.do (몽골 = id 60618)
 *     안내문 https://www.qia.go.kr/livestock/qua/downloadwebQiaCom.do?id=47407
 *     서식   https://www.qia.go.kr/livestock/qua/downloadwebQiaCom.do?id=45138
 *
 * §1.2 검역조건 표 원문값 (우리 코드에 반영된 것):
 *   검역증명서 필수(출국 10일 이내) / 마이크로칩 **필수**(ISO 호환) /
 *   광견병 **필수** — 최소 12주령 이상, 입국 30일 이전 / 기타 백신 불필요 /
 *   **광견병 항체가 검사 불필요** → titer.need='return-only' 가 옳다 /
 *   사전수입허가 불필요 / **입국 후 계류 불필요** → 도착 카드에 '격리'를 쓰지 않는다 /
 *   기생충 처치 불필요 / **기타: 반드시 Chinggis Khaan 국제공항으로 입국**
 *
 * §3.1 상대국 담당기관: GASI 국경검사국 — http://www.ssia.gov.mn / +976 51 263-975
 *
 * 조사로 정리된 것:
 *  - **3년 백신 불인정 blocker 는 근거가 없어 삭제했다**(아래 주석). APQA 표에 최대 유효기간
 *    행 자체가 없고, 별지 제25호서식의 면역유효기간 란이 ☐1Y ☐2Y ☐3Y 체크박스다.
 *  - **에키노코쿠스 구충은 입국 요건이 아니다.** APQA '기생충 처치: 불필요'. WHO 자료의
 *    분기별 프라지콴텔 사업은 몽골 **국내** 개 대상 공중보건 프로그램이지 수입 요건이 아니다.
 *    → 카드를 만들지 않는다. (별지 25호에 기재란은 있어 기재 자체는 권장)
 *  - **최소 일령 = 달력 3개월**(사용자 결정 2026-07-20). APQA 안내문은 '최소 12주령'(84일)
 *    이지만 www 가이드('생후 3개월령')와 사례를 따라 3개월을 유지한다. 이 값은 저장 거부까지
 *    파생하므로, APQA 값이 맞다면 84~90일 접종 케이스가 입력을 거부당한다 — 알고 택한
 *    트레이드오프다. 근거 충돌 상태는 destination-config 몽골 프로파일 주석 참고.
 *
 * 확인 실패(추측으로 채우지 않은 것):
 *  - GASI(ssia.gov.mn) 원문 규정 접근 실패. APQA 안내문 자체가 "해당 국가의 검증을 받은
 *    공식 정보가 아니며 정확하지 않을 수 있음"이라 밝힌다 — 최상위 근거는 아니다.
 *  - USDA APHIS Mongolia 3회 시도 모두 타임아웃(존재는 확인, 내용 미확인).
 *  - 동반 마리수 제한 — 어느 출처에도 없다. 금지 견종도 APQA 는 빈칸이다.
 *  - 12개월 백신 상한·ISO 11784/11785 규격번호·늑대 하이브리드 금지는 **상업 사이트 단독**
 *    근거라 룰·카드에 넣지 않았다.
 *
 * 컨벤션: 필수 입력 누락 시 SKIP. 유효기간 1년 = 접종일의 1주년 당일까지.
 */

const COUNTRY = 'mongolia'

export const MN_CHECKS: ProcedureCheck[] = [
  {
    id: 'mn.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 접종 이전 시술',
    description:
      '마이크로칩이 광견병 첫 접종일과 같거나 이전이어야 함. 몽골은 칩이 입국 요건이라 접종과의 선후를 따진다(칩이 요건이 아닌 베트남·캄보디아엔 이 룰이 없다).',
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
    id: 'mn.rabies-prime-after-3months-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종은 생후 3개월 이후',
    description:
      '달력 3개월 기준(사용자 결정 2026-07-20 — APQA 안내문은 "최소 12주령"이나 www 가이드·사례를 따라 3개월 유지). 입력 차단(step.earliest.monthsAfter)과 같은 판정 함수(meetsCalendarAge)를 쓴다. 일수(91일)로 환산하면 생월에 따라 89~92일로 흔들려 규정을 지킨 사람을 막는다.',
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
    id: 'mn.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 30일 이상 전',
    description:
      '최근 광견병 접종일로부터 출국일까지 최소 30일 경과 필요(유효 부스터는 면제). 저장 거부(validateRabiesEntryWait)와 같은 판정 함수(violatesRabiesEntryWait)를 쓴다. (USDA APHIS: "between 30 days and 12 months prior to entering Mongolia")',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const data = (caseRow.data ?? {}) as Record<string, unknown>
      // 기준은 **최근** 접종이고 유효 부스터는 면제. 구버전은 가장 이른 접종(rabies[0])을 봐서
      // 만료 후 재접종한 케이스를 통째로 놓쳤다(베트남에서 2026-07-20 수정한 것과 같은 버그).
      if (!violatesRabiesEntryWait(data, dep, destination)) {
        const latest = rabies[rabies.length - 1]
        return { ok: true, message: `최근 접종(${latest.date}) → 출국일(${dep}): 30일 충족(또는 유효 부스터).` }
      }
      const latest = rabies[rabies.length - 1]
      return {
        ok: false,
        message: '광견병 접종 후 30일이 지나야 몽골에 입국할 수 있어요. 입국일을 미뤄야 해요.',
        offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
      }
    },
  },
  {
    id: 'mn.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간(1년) 이내에 해야 함. 만료 후 접종은 chain 이 끊겨 새 1차로 간주된다. 저장 거부(findRabiesChainBreak)의 짝이 되는 주의 — 펫무브워크는 저장을 막지 않고 절차검증만 보므로 이 룰이 없으면 운영자 화면에서 끊긴 chain 이 안 보인다.',
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
  // ⚠️ `mn.rabies-only-1year-vaccine`(3년 백신 거부 blocker)을 **삭제했다** (2026-07-20 조사).
  //   APQA 안내문 §1.2 표의 광견병 조건은 '최소 12주령'·'입국 30일 이전' 두 줄뿐이고 **최대
  //   유효기간 행 자체가 없다**. 12개월 상한의 유일한 출처는 PetTravel.com(상업)이다.
  //   결정적으로 **몽골 제출용 별지 제25호서식의 '면역유효기간(Validity)' 란이 ☐1Y ☐2Y ☐3Y
  //   체크박스**라 3년 백신 기재가 서식 차원에서 정상 지원된다. blocker 는 저장을 거부해
  //   우회가 불가능하므로 근거 없이 재접종을 강요하는 상태였다. 프로파일의 oneYearVaccineOnly
  //   선언도 함께 제거했다(포털 YearSelect 비활성 해제). 캄보디아·우즈베키스탄과 같은 조치.
  {
    id: 'mn.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description: '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함.',
    // ⚠️ 'info' 는 **표시 억제를 겸한다** — 베트남 vn.rabies-valid-on-departure 와 같은 구조.
    // severity 를 올리려면 ADVISORY_DEFERRED_CHECKS(scenario.ts)에도 함께 등록할 것.
    severity: 'info',
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
  // ── 도착 수입 검역 ──
  {
    id: 'mn.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '몽골 수입 검역일',
    description: '몽골 수입 검역일은 몽골 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.mn_import_quarantine_date === 'string'
          ? data.mn_import_quarantine_date.slice(0, 10)
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
          message: '몽골 수입 검역일은 몽골 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['mn_import_quarantine_date'],
        }
      }
      return { ok: true, message: `몽골 수입검역일(${raw}) 입국 이후.` }
    },
  },
]
