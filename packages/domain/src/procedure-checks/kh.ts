import {
  buildDateRuleContext,
  violatesRabiesEntryWait,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  addDays,
  exceedsValidityYears,
  findRabiesValidityBreaks,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
} from './utils'
import { msgRabiesExpiredBefore, msgRabiesPrimeMinAge } from './messages'

/**
 * 캄보디아 (GDAHP — General Directorate of Animal Health and Production, MAFF) 절차 검증.
 *
 * ⚠️ **베트남 룰 한 벌을 복제한 것이다** (2026-07-20 사용자 지정). 카드 구성·검증 구조가
 *   베트남과 동일해야 한다는 전제로 옮겼고, 사용자가 확인해 준 델타만 다르다:
 *     - 마이크로칩 **필수 아님** → 베트남처럼 `kh.microchip-before-rabies` 를 두지 않는다
 *       (구버전엔 있었으나 칩이 입국 요건이 아니면 접종과의 순서를 따질 이유가 없다)
 *     - 광견병 최소 일령 **고정 91일** (몽골·우즈벡·캐나다의 달력 3개월과 다름)
 *     - 접종 후 입국 대기 30일
 *   3년 백신 불인정 같은 나머지 값은 베트남에서 복제된 상태다. 나라별 개별 검토에서 정정한다.
 *
 * 출처(구버전에서 이어받음 — 개별 검토 때 재확인 대상):
 *  - Law on Animal Health and Production (NS/RKM/0116/003, 2016-01-28) — FAOLEX/Ecolex
 *    https://www.ecolex.org/details/legislation/law-on-animal-health-and-production-no-nsrkm0116003-lex-faoc173984/
 *  - WTO Import Licensing — Cambodia live animals
 *    https://importlicensing.wto.org/content/live-animals-animal-products-meat-products
 *  - WOAH Asia Rabies — Cambodia — https://rr-asia.woah.org/en/projects/rabies/
 *
 * 별도 (시스템 검증 제외):
 *  - RNATT: GDAHP 의무 아님 — 한국 귀국용만(titer.need = 'return-only')
 *
 * 컨벤션: 필수 입력 누락 시 SKIP. 유효기간 1년 = 접종일의 1주년 당일까지.
 */

const COUNTRY = 'cambodia'

/** 최소 일령 — 고정 91일(사용자 지정). 달력 3개월인 몽골·우즈벡·캐나다와 다르다. */
const MIN_AGE_DAYS = 91

export const KH_CHECKS: ProcedureCheck[] = [
  {
    id: 'kh.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종은 생후 91일 이후',
    description:
      '광견병 1차 접종은 생후 91일 이후. 입력 차단(step.earliest.daysAfter)과 같은 기준을 쓴다.',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!birth || rabies.length === 0) return SKIP

      const first = rabies[0]
      const threshold = addDays(birth, MIN_AGE_DAYS)
      if (!threshold) return SKIP
      if (first.date < threshold) {
        return {
          ok: false,
          message: msgRabiesPrimeMinAge('91일'),
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 91일(${threshold}) 이후.` }
    },
  },
  {
    id: 'kh.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 30일 이상 전',
    description:
      '최근 광견병 접종일로부터 출국일까지 최소 30일 경과 필요(유효 부스터는 면제). 저장 거부(validateRabiesEntryWait)와 같은 판정 함수(violatesRabiesEntryWait)를 쓴다.',
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
      // 접종일은 과거 사실이라 조치는 '입국일을 미루는 것'뿐 — 출국일을 입력하는 시점은
      // 저장 거부가 막고, 접종일을 넣는 이 경로는 안내만 한다.
      return {
        ok: false,
        message: '광견병 접종 후 30일이 지나야 캄보디아에 입국할 수 있어요. 입국일을 미뤄야 해요.',
        offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
      }
    },
  },
  {
    id: 'kh.rabies-booster-within-prime-validity',
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
  // ⚠️ **'1년 백신만 인정'(3년 거부) 룰을 두지 않는다** — 2026-07-20 사용자 결정. 되살리지 말 것.
  //   베트남 복제 때 딸려온 blocker 였는데 근거가 어디에도 없다:
  //     · 캄보디아 정부 자료 자체가 없다(GDAHP 사이트 DNS 실패, APHIS·APQA 목록에도 부재)
  //     · 펫무브 www 가이드에 백신 유효기간 언급 없음
  //     · 상업 사이트는 오히려 "다년 백신도 접종 후 12개월 이내면 유효"라는 **다른** 주장
  //   blocker 는 저장 자체를 거부해 사용자가 우회할 수 없다 — 근거 없이 재접종을 강요하고
  //   있었다. 프로파일의 oneYearVaccineOnly 선언도 함께 제거했다(포털 YearSelect 비활성 해제).
  {
    id: 'kh.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description: '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함.',
    // ⚠️ 'info' 는 **표시 억제를 겸한다** — 베트남 vn.rabies-valid-on-departure 와 같은 구조.
    // 어느 카드에도 매핑되지 않아서 warning 이면 case-level 배너로 올라가 광견병 카드 문구
    // ("캄보디아 입국 때 면역 유효기간이 남아있어야 해요")와 중복된다.
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
    id: 'kh.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '캄보디아 수입 검역일',
    description: '캄보디아 수입 검역일은 캄보디아 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.kh_import_quarantine_date === 'string'
          ? data.kh_import_quarantine_date.slice(0, 10)
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
          message: '캄보디아 수입 검역일은 캄보디아 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['kh_import_quarantine_date'],
        }
      }
      return { ok: true, message: `캄보디아 수입검역일(${raw}) 입국 이후.` }
    },
  },
]
