import {
  buildDateRuleContext,
  calendarAgeThreshold,
  meetsCalendarAge,
  violatesRabiesEntryWait,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  classifyExportQuarantineDate,
  findRabiesValidityBreaks,
  readRabiesEntries,
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
 * 우즈베키스탄 (수의·축산개발국가위원회 — Ветеринария ва чорвачиликни ривожлантириш
 * давлат қўмитаси, vetgov.uz) 절차 검증.
 *
 * ✅ **1차 출처를 확보했다** (2026-07-20 개별 조사 완료). 베트남 복제 상태에서 벗어났다.
 *   국가수석수의검사관 결정 제04호(2014-02-28) 「수의(위생) 요건」 55p 원문의 **제15장**
 *   (모피수·토끼·개·고양이 반입 요건)이 근거다.
 *   https://vetgov.uz/upload/docs/vet-trebovanie.pdf
 *
 * 조사로 확정된 것:
 *  - **항체검사를 요구하지 않는다.** 55p 전문 기계 검색에서 титр·нейтрализ·МЕ/мл·FAVN·
 *    RNATT 히트 **0**. антител 유일 1건은 제17장 영장류 조항이라 개·고양이 무관.
 *    → titer.need='return-only' 가 옳다. 구버전의 '입국 필수(유효 1년)'는 근거 없는
 *      오설정이었다. **되돌리지 말 것.**
 *  - **개인동반 2두 이하는 허가·격리 모두 면제.** 원문: "…в количестве не более 2-х голов,
 *    без разрешения на ввоз и карантинирования…" (lex.uz 제148호 2023-04-10 제13조가 재확인
 *    — https://lex.uz/ru/docs/6427764). → 도착 카드에 '격리'를 쓰지 않는다.
 *  - 광견병 접종은 **출발 14일 전**(최근 6개월 내 접종력 있으면 면제). 원문: "Не позднее,
 *    чем за 14 дней до отправки". 우리는 가이드·사용자 델타인 **30일**을 유지한다 —
 *    공식보다 보수적이라 30일을 지키면 14일은 자동 충족된다.
 *  - **백신 유효기간·최소 접종 연령 조항이 공식 문서에 없다.** 3년 백신 불인정 blocker 는
 *    그래서 삭제했다(아래 주석 참고). 최소 일령 달력 3개월은 www 가이드 근거로 유지.
 *  - **마이크로칩 언급이 공식 규정에 0회다.** www 가이드가 '필수'라 해 룰은 유지하되,
 *    '우즈베키스탄 입국 요건'으로 단정하는 문구는 쓰지 않는다.
 *
 * 확인 실패(추측으로 채우지 않은 것):
 *  - USDA APHIS 우즈베키스탄 반려동물 페이지 **없음**(소 정액·양·가금만 다룸 = Unknown
 *    Requirements 분류). 한국 APQA '수출국가별 검역조건' 목록에도 **없다**.
 *  - 지정 입국공항(타슈켄트 단독?)·건강증명서 기한 10일설 — 둘 다 상업 사이트 단독 근거라
 *    카드·룰에 넣지 않았다. 공식은 "출발 전 5일 이내 임상검진 기재"만 요구한다.
 *
 * 컨벤션: 필수 입력 누락 시 SKIP. 유효기간 1년 = 접종일의 1주년 당일까지.
 */

const COUNTRY = 'uzbekistan'

export const UZ_CHECKS: ProcedureCheck[] = [
  {
    id: 'uz.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 접종 이전 시술',
    description:
      '마이크로칩이 광견병 첫 접종일과 같거나 이전이어야 함. 우즈베키스탄은 칩이 입국 요건이라 접종과의 선후를 따진다(칩이 요건이 아닌 베트남·캄보디아엔 이 룰이 없다).',
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
    id: 'uz.rabies-prime-after-3months-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종은 생후 3개월 이후',
    description:
      'USDA APHIS Uzbekistan: "over 3 months of age" — 달력 3개월 기준. 입력 차단(step.earliest.monthsAfter)과 같은 판정 함수(meetsCalendarAge)를 쓴다. 일수(91일)로 환산하면 생월에 따라 89~92일로 흔들려 규정을 지킨 사람을 막는다.',
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
    id: 'uz.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 30일 이상 전',
    description:
      '최근 광견병 접종일로부터 출국일까지 최소 30일 경과 필요(유효 부스터는 면제). 저장 거부(validateRabiesEntryWait)와 같은 판정 함수(violatesRabiesEntryWait)를 쓴다. (USDA APHIS: "between 30 days and 12 months prior to entering Uzbekistan")',
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
        message: '광견병 접종 후 30일이 지나야 우즈베키스탄에 입국할 수 있어요. 입국일을 미뤄야 해요.',
        offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
      }
    },
  },
  {
    id: 'uz.rabies-booster-within-prime-validity',
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
  // ⚠️ `uz.rabies-only-1year-vaccine`(3년 백신 거부 blocker)을 **삭제했다** (2026-07-20 조사).
  //   공식 제15장에 백신 '유효기간' 개념 자체가 없다 — титр·нейтрализ·유효기간 조항 모두 부재.
  //   blocker 의 실제 출처는 상업 사이트의 "30 days ~ 12 months prior" 한 줄뿐이었고, 그건
  //   검증 룰 근거로 쓰지 않는다는 원칙이 있다. blocker 는 저장을 거부해 우회가 불가능하므로
  //   근거 없이 재접종을 강요하는 상태였다. 프로파일의 oneYearVaccineOnly 선언도 함께 제거했다
  //   (포털 YearSelect 비활성 해제). 캄보디아와 같은 조치.
  {
    id: 'uz.rabies-valid-on-departure',
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
    id: 'uz.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '우즈베키스탄 수입 검역일',
    description: '우즈베키스탄 수입 검역일은 우즈베키스탄 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.uz_import_quarantine_date === 'string'
          ? data.uz_import_quarantine_date.slice(0, 10)
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
          message: '우즈베키스탄 수입 검역일은 우즈베키스탄 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['uz_import_quarantine_date'],
        }
      }
      return { ok: true, message: `우즈베키스탄 수입검역일(${raw}) 입국 이후.` }
    },
  },
  // ── 현지 수출 검역 (왕복 귀국 전) ──
  {
    id: 'uz.export-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '우즈베키스탄 수출 검역일',
    description:
      '우즈베키스탄 수출 검역일은 우즈베키스탄 입국일 이후·한국 귀국일 이전이어야 함. 베트남·태국·필리핀·중국 룰과 같은 모양 — "그 나라에 있는 동안 받았는가"라는 물리적 제약이라 나라별 규정 조사가 필요 없다(판정은 classifyExportQuarantineDate 공용).',
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
      const verdict = classifyExportQuarantineDate(data.uz_export_quarantine_date, entry, ret)
      if (verdict === 'skip') return SKIP
      if (verdict === 'before-entry') {
        return {
          ok: false,
          message: '우즈베키스탄 수출 검역일은 우즈베키스탄 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['uz_export_quarantine_date'],
        }
      }
      if (verdict === 'after-return') {
        return {
          ok: false,
          message: '우즈베키스탄 수출 검역일은 한국 귀국일보다 늦을 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['uz_export_quarantine_date'],
        }
      }
      return { ok: true, message: `우즈베키스탄 수출검역일 체류 기간 내.` }
    },
  },
]
