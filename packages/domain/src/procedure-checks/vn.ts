import {
  buildDateRuleContext,
  calendarAgeThreshold,
  meetsCalendarAge,
  violatesVnRabiesWait,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  exceedsValidityYears,
  findRabiesValidityBreaks,
  findSameGuardianCases,
  matchBannedBreed,
  readBreed,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
} from './utils'
import { msgRabiesExpiredBefore, msgRabiesPrimeMinAge } from './messages'

/**
 * 베트남 (DAH — Department of Animal Health, Cục Thú y) 절차 검증.
 *
 * 출처:
 *  - **Thông tư 01/2026/TT-BNNMT 제14조** (2026-01-01 시행). 정부 원문 PDF 확인:
 *    https://datafiles.chinhphu.vn/cpp/files/vbpq/2026/01/01-bnnmt.pdf
 *    ⚠️ 이 규칙이 **Circular 25/2016/TT-BNNPTNT 를 대체**했다(제30조 제2항 a호). 함께 대체된 것:
 *    35/2018, 09/2022, **28/2025/TT-BNNMT**. 구서식 사용 유예는 2026-06-30 로 종료.
 *    2026-07-20 이전 주석은 전부 폐지된 25/2016 을 인용하고 있었다 — 실질 내용은 그대로라
 *    코드 동작은 바뀌지 않았고 근거 표기만 갱신했다.
 *  - 미 대사관 베트남 안내 — https://vn.usembassy.gov/wp-content/uploads/sites/124/2024/08/Bring-Pets-to-or-from-Vietnam.pdf
 *  - USDA APHIS Vietnam — https://www.aphis.usda.gov/pet-travel/us-to-another-country-export/pet-travel-us-vietnam
 *  - MOIT 무역포털 — https://vntr.moit.gov.vn/procedures/detail/25
 *
 * 핵심 룰:
 *  - 마이크로칩: ISO 11784/11785 15자리 (DAH/APHIS), 광견병 백신 이전 이식
 *  - 광견병: **생후 3개월 이상(달력)**, 출국 30일 이상~12개월 이내 접종, 출국일 면역 유효
 *    ※ 규정 문구가 "at least 3 months of age" — 일수(90/91일)로 환산하지 않는다.
 *      달력 3개월은 생월에 따라 89~92일이라, 고정 일수 기준이면 11·12·1·2월생이 규정대로
 *      접종해도 입력이 막힌다(2026-07-19 수정). 판정은 date-rules 의 meetsCalendarAge 단일 함수.
 *  - **3년 라이선스 백신 불인정** (DAH 운용 + USDA APHIS + 미 대사관 일치 — 시행규칙 본문엔 없음.
 *    01/2026 은 절차규정이라 백신 종류를 다루지 않는다)
 *  - 건강증명서 ≤ 출국 10일 이내 (보수 ≤9). 한국 APQA 정부수의관 발급
 *  - 동반 최대 2마리 (제14조 제1항)
 *
 * ⚠️ **사전 신고·수입허가 없음** (2026-07-19 확인 → 2026-07-20 신 규칙 원문으로 재확인)
 *   예전 헤더는 "DAH Form 19 Import Permit: 출국 7-10일 전 신청"이라 적혀 있었고 그에 따라
 *   '검역 신청' 카드까지 만들었으나, 원문은 그 반대다. Thông tư 01/2026 제14조 제1항:
 *     "mang theo người **không quá 02 con** động vật … a) Chủ hàng khai báo kiểm dịch nhập khẩu
 *      **trực tiếp tại Cơ quan kiểm dịch động vật cửa khẩu**"
 *     (동반 2마리 이하 — 화주는 **국경 검역기관에 직접** 수입 검역을 신고한다)
 *   → 출국 전 제출이 아니라 **도착 공항 검역소에서 현장 신고**. 구 25/2016 제10조와 같은 취지다.
 *   Form 19 는 정식(상업·임시수입) 절차용 서식이라 여행 동반에는 해당 없음.
 *   사용자 실무 관찰("검역 신청하고 가는 사람을 본 적 없다")과도 일치.
 *   → vn-advance-notice 카드·룰·서류·필드 전부 제거. 도착 검역(departure)이 이 절차를 담당.
 *
 * 서식 번호 (부록 V) — 2026-07-20 원문 확인:
 *   Mẫu 2a  수출 동물검역 신청서 / Mẫu 13a 수출 동물검역증명서
 *   Mẫu 15a 수입 동물검역증명서 (15b 는 축산물용 — 혼동 주의)
 *   제14조 제1항 c호: 검체검사가 없으면 검역일로부터 **1영업일** 이내 Mẫu 15a 발급,
 *   d호: 검체검사가 필요하면 **5영업일** 이내 발급.
 *  - Pit Bull, Tosa, Dogo Argentino 등 견종 제한
 *
 * 별도 (시스템 검증 제외):
 *  - RNATT: DAH 의무 아님 (APHIS 명기). 한국 귀국용은 별도 흐름
 *  - 도착 후 14일 격리 (요건 미충족 시 또는 입국 거부)
 *
 * 컨벤션: 필수 입력 누락 시 SKIP. 유효기간 1년 = 접종일의 1주년 당일까지.
 */

const COUNTRY = 'vietnam'

// ⚠️ 마이크로칩 — **룰을 두지 않는다** (2026-07-20 사용자 지정. 다시 "빠졌다"고 올리지 말 것)
//   Thông tư 01/2026 제14조(및 구 25/2016 제10조)에 칩 조항이 없고, 펫무브 베트남 가이드도 "베트남은 마이크로칩
//   삽입이 필수가 아니지만, 한국 동물검역소에서 수출동물검역을 받기 위해서는 강아지는
//   마이크로칩 번호가 있고 동물등록이 되어 있어야 합니다"라고 쓴다. 베트남 국영지(Việt Nam
//   News)도 "microchipping is not mandatory under Việt Nam's law".
//   → 칩이 입국 요건이 아니므로 **광견병 접종과의 순서를 따질 이유가 없다.**
//   예전엔 vn.microchip-before-rabies(주의) + 카드 문구 + 저장 거부 세 층이 다 걸려 있어,
//   칩을 접종보다 늦게 넣으면 저장 자체가 막혔다. 세 층 모두 제거했다.
//   칩은 한국 수출검역(강아지 동물등록)·귀국 항체검사 때문에 실무상 넣지만 그건 한국 절차다.
export const VN_CHECKS: ProcedureCheck[] = [
  {
    id: 'vn.rabies-prime-after-3months-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종은 생후 3개월 이후',
    description:
      'DAH/APHIS: "at least 3 months of age" — 달력 3개월 기준. 입력 차단(step.earliest.monthsAfter)과 같은 판정 함수(meetsCalendarAge)를 쓴다.',
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!birth || rabies.length === 0) return SKIP

      const first = rabies[0]
      // 일수(91일)로 환산하지 않는다 — 달력 3개월은 생월에 따라 89~92일이라, 고정 일수로
      // 보면 11·12·1·2월생이 규정대로 접종해도 위반으로 뜬다(2026-07-19 수정).
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
    id: 'vn.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 30일 이상 전',
    description:
      '최근 광견병 접종일로부터 출국일까지 최소 30일 경과 필요(유효 부스터는 면제). 저장 거부(validateVnEntryDate)와 같은 판정 함수(violatesVnRabiesWait)를 쓴다. (DAH: "at least 30 days ... before the intended date of entry")',
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const data = (caseRow.data ?? {}) as Record<string, unknown>
      // 판정은 도메인 함수 하나 — 저장 거부(항공권 카드)와 이 주의가 어긋나면 안 된다.
      // 기준은 **최근** 접종이고 유효 부스터는 면제. 예전엔 여기서 가장 이른 접종(rabies[0])을
      // 봐서 만료 후 재접종 케이스를 통째로 놓쳤다(2026-07-20 수정).
      if (!violatesVnRabiesWait(data, dep)) {
        const latest = rabies[rabies.length - 1]
        return { ok: true, message: `최근 접종(${latest.date}) → 출국일(${dep}): 30일 충족(또는 유효 부스터).` }
      }
      const latest = rabies[rabies.length - 1]
      // 접종일은 과거 사실이라 조치는 '입국일을 미루는 것'뿐 — 출국일을 입력하는 시점은
      // 저장 거부가 막고(날짜를 고칠 수 있는 시점), 접종일을 넣는 이 경로는 안내만 한다
      // (사용자 지정 2026-07-20). 날짜는 넣지 않는다(고객 노출 문구 규칙 — lint:checks).
      return {
        ok: false,
        message: '광견병 접종 후 30일이 지나야 베트남에 입국할 수 있어요. 입국일을 미뤄야 해요.',
        offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
      }
    },
  },
  {
    id: 'vn.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간(1년) 이내에 해야 함. 만료 후 접종은 chain 이 끊겨 새 1차로 간주된다. 저장 거부(findRabiesChainBreak)의 짝이 되는 주의 — 펫무브워크는 저장을 막지 않고 절차검증만 보므로 이 룰이 없으면 운영자 화면에서 끊긴 chain 이 안 보인다(2026-07-20 추가).',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length < 2) return SKIP
      const offending = findRabiesValidityBreaks(rabies)
      if (offending.length > 0) {
        // 문구는 한 번만 — 끊긴 구간마다 날짜를 나열하면 고객 문구에 날짜가 샌다.
        // 어느 기록이 문제인지는 offendingPaths 가 그 입력칸을 짚는다(중국과 같은 문형).
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
    id: 'vn.rabies-only-1year-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '1년 라이선스 광견병 백신만 인정 (3년 거부)',
    description:
      '광견병 백신 면역 유효기간 1년만 인정. valid_until 이 접종일 + 1년(달력, 그날 포함) 초과면 거부. (DAH 운용 지침: "Vietnam does not recognize the 3-year rabies vaccine" — USDA APHIS, 미 대사관 일치. 검역 시행규칙 Thông tư 01/2026 은 절차규정이라 백신 종류를 다루지 않는다)',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return SKIP

      const violations: Array<{ entry: typeof rabies[number]; validUntil: string }> = []
      for (const r of rabies) {
        if (exceedsValidityYears(r.date, r.valid_until)) {
          violations.push({ entry: r, validUntil: resolveValidUntil(r.date, r.valid_until) })
        }
      }
      if (violations.length > 0) {
        const offending: string[] = []
        const msgs: string[] = []
        for (const v of violations) {
          offending.push(`rabies_dates[${v.entry.originalIndex}].valid_until`)
          msgs.push('광견병 백신은 면역 유효기간 1년짜리만 인정돼요. 3년 백신은 사용할 수 없어요.')
        }
        return {
          ok: false,
          message: msgs.join(' / '),
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '모든 광견병 백신이 1년 라이선스 (또는 미입력 = 디폴트 1년).' }
    },
  },
  {
    id: 'vn.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함.',
    // ⚠️ 이 'info' 는 **표시 억제를 겸한다.** 이 룰은 어느 카드에도 매핑되지 않아서, warning 이면
    // scenario.ts 의 case-level 배너로 올라가 광견병 카드 문구("베트남 입국 때 면역 유효기간이
    // 남아있어야 해요")와 중복된다. 같은 성격의 태국·필리핀·EU 룰은 warning 이라 대신
    // ADVISORY_DEFERRED_CHECKS(scenario.ts)에 명시 등록해 억제한다.
    // → severity 를 올리려면 그 목록에도 함께 등록할 것. (중국 cn.rabies-not-expired-on-arrival
    //   도 같은 구조.) 2026-07-20 전수 감사에서 확인.
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
  // ── 수입 금지 견종 ──
  {
    id: 'vn.banned-breeds',
    country: COUNTRY,
    category: '서류',
    title: '수입 금지 견종 (Pit Bull, Tosa, Dogo Argentino 등)',
    description:
      '베트남은 Pit Bull Terrier, Japanese Tosa, Dogo Argentino 등 견종 수입 제한. (수출입 금지 동물 목록 — Thông tư 01/2026 제14조가 참조하는 Danh mục 동물 + USDA APHIS Vietnam)',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const species = typeof data.species === 'string' ? data.species : ''
      if (species && species !== 'dog') return SKIP
      const breed = readBreed(caseRow)
      if (!breed.ko && !breed.en) return SKIP
      const match = matchBannedBreed(breed, [
        'pit bull', 'pitbull', '핏불',
        'tosa', '도사',
        'dogo argentino', '도고 아르헨티노',
      ])
      if (match) {
        return {
          ok: false,
          message: `견종 "${breed.ko || breed.en}"은(는) 베트남 수입 제한 견종이에요 (매치: ${match}).`,
          offendingPaths: ['breed', 'breed_en'],
        }
      }
      return { ok: true, message: `견종 "${breed.ko || breed.en}" 통과.` }
    },
  },

  // ── 보호자 한도 (외국인 최대 2마리) ──
  {
    id: 'vn.max-2pets-per-guardian',
    country: COUNTRY,
    category: '서류',
    title: '동반 최대 2마리 한도 (Thông tư 01/2026 제14조)',
    description:
      'Thông tư 01/2026/TT-BNNMT 제14조 제1항(구 25/2016 제10조): 반려 목적으로 최대 2마리까지 동반 가능. 동일 보호자(이름·영문이름·전화·국내주소 일치)가 베트남 목적 케이스 3건 이상 등록 시 경고.',
    severity: 'warning',
    // relatedCases 는 펫무브워크(운영자)만 전달 — 보호자 이름·건수가 필요한 운영자용 룰.
    audience: 'staff',
    addedAt: '2026-05-07',
    run: ({ caseRow, relatedCases }) => {
      if (relatedCases === undefined) return SKIP
      const others = findSameGuardianCases(caseRow, relatedCases, { sameDestination: true })
      if (others.length + 1 > 2) {
        return {
          ok: false,
          message: `같은 보호자(${caseRow.customer_name})가 베트남 목적 케이스를 ${others.length + 1}건 등록하여 2마리 한도를 초과했어요.`,
          offendingPaths: ['customer_name'],
        }
      }
      return { ok: true, message: '보호자 케이스 ≤ 2건.' }
    },
  },
  // ── 도착 수입 검역 ──
  {
    id: 'vn.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '베트남 수입 검역일',
    description: '베트남 수입 검역일은 베트남 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-19',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.vn_import_quarantine_date === 'string'
          ? data.vn_import_quarantine_date.slice(0, 10)
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
          message: '베트남 수입 검역일은 베트남 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['vn_import_quarantine_date'],
        }
      }
      return { ok: true, message: `베트남 수입검역일(${raw}) 입국 이후.` }
    },
  },
  // ── 귀국 전 현지 수출 검역 ──
  {
    id: 'vn.export-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '베트남 수출 검역일',
    description:
      '베트남 수출 검역일은 베트남 입국일 이후·한국 귀국일 이전이어야 함. 태국·필리핀·중국 룰과 같은 모양 — "베트남에 있는 동안 받았는가"라는 물리적 제약이라 나라별 규정 조사가 필요 없다.',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.vn_export_quarantine_date === 'string'
          ? data.vn_export_quarantine_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      const ret =
        typeof ctx.data.return_date === 'string' && ctx.data.return_date.length >= 10
          ? ctx.data.return_date.slice(0, 10)
          : ''
      if (entry && raw < entry) {
        return {
          ok: false,
          message: '베트남 수출 검역일은 베트남 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['vn_export_quarantine_date'],
        }
      }
      if (ret && raw > ret) {
        return {
          ok: false,
          message: '베트남 수출 검역일은 한국 귀국일보다 늦을 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['vn_export_quarantine_date'],
        }
      }
      return { ok: true, message: `베트남 수출검역일(${raw}) 체류 기간 내.` }
    },
  },

]
