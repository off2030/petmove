import { buildDateRuleContext, violatesRabiesEntryWait } from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  classifyExportQuarantineDate,
  daysBetween,
  evaluateRabiesAgeConservative,
  findSameGuardianCases,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
  readVetVisitDate,
} from './utils'
import { msgMicrochipBeforeRabies, msgRabiesExpiredBefore, msgRabiesPrimeMinAge } from './messages'

/**
 * 모로코 (ONSSA — Office National de Sécurité Sanitaire des Produits Alimentaires) 절차 검증.
 *
 * ✅ **양식 원본을 직접 판독했다**(2026-07-20). 한국 전용 수입 양식은 없고 "Other Countries"
 *   양식이 적용된다 — **I.CT.CN.JUIL.2025**(2025년 7월판).
 *   https://www.onssa.gov.ma/wp-content/uploads/2025/07/Certificat-sanitaire-valide.pdf
 *   한국행 **수출** 양식은 따로 있다 — E.CARNI.CoréeSud.Juin.2015
 *   https://www.onssa.gov.ma/wp-content/uploads/2021/11/Exportation-chats-et-chiens-vers-la-Coree-du-Sud.PDF
 *   금지 견종 통지 N°590(2021-02-09) — https://www.onssa.gov.ma/wp-content/uploads/2022/08/avis-au-public-chiens-dangereux-.pdf
 *
 * 수입 양식 조항(원문):
 *  - 3항 식별표는 **광견병 접종 이전**에 — 단 "tattoo **or** microchip"이라 칩이 유일 수단은 아니다
 *  - 4항 **불활화 백신** + "at least **21 days** have elapsed after the primary rabies vaccination"
 *  - 5항 항체검사는 **12개월 미만 임시 체류에만** 요구(영구 이주면 조항 삭제).
 *        채혈은 "at least **30 days** after the previous rabies vaccination", **0.5 IU/ml** 이상
 *  - 관용 수의사 서명 + 공인(Cachet officiel) → 정부 배서 필수
 *
 * ⚠️ 대기일이 **21일**이다(30일 아님). 구 룰의 30일은 근거가 "EU 양식 운용 표준"이라고만
 *   적혀 있었고 양식엔 21일뿐이다. 30일은 **항체 채혈 시점**(5항) 조건이 흘러든 것으로 보인다.
 * ⚠️ 항체검사는 문서상 조건부지만 우리는 **무조건 필수**로 둔다 — 왕복이면 모로코 출국 양식이
 *   무조건 요구하고 한국 귀국에도 필요해서 안 받는 선택지가 없다(destination-config 주석 참고).
 *
 * 별도 (시스템 검증 제외):
 *  - 종합백신: ONSSA 명시 의무 부재
 *  - 비상업 1인 5두 이하
 *  - 금지 견종: pitbull(Staffordshire·American Staffordshire Bull Terrier)·boerbull(Mastiff)·Tosa
 *    → 아직 룰로 만들지 않았다(말레이시아 my.banned-breeds 와 같은 모양으로 추가 가능)
 *  - 도착 검사 수수료 10 디르함/두. 격리는 **규정 미발견**('없음'을 명시한 문구도 없다)
 *
 * 확인 실패: 입국 방향 최소 접종 연령(수입 양식에 연령 규정 자체가 없다 — 3개월은 수출 양식
 *   제목 근거), 접종 후 상한, 다년 백신 인정 여부, 입국용 항체 유효기간, 수입허가 필요 여부.
 *
 * 컨벤션 (MX/RU/MY 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - 유효기간 1년 = 접종일의 1주년 당일까지 인정
 */

const COUNTRY = 'morocco'

export const MA_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'ma.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      'ISO 11784/11785 마이크로칩이 광견병 1차 접종일과 같거나 이전이어야 함. ONSSA 수입 양식 3항 "identified with permanent mark, prior to their vaccination against rabies" — 다만 양식은 "tattoo or microchip"이라 칩이 유일 수단은 아니다. 저장 차단(validateMicrochipBeforeBooster)의 짝.',
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
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
        message: msgMicrochipBeforeRabies(),
        offendingPaths: ['microchip_implant_date'],
      }
    },
  },

  // ── 광견병 ──
  {
    id: 'ma.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      '펫무브 www 가이드 "광견병 예방접종은 생후 3개월령 이후에 해야 합니다" — ONSSA 수입 양식엔 연령 규정이 없어 가이드가 근거다. 안전 기준으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요.',
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
    id: 'ma.rabies-min-21days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 21일 이상 전',
    description:
      'ONSSA 수입 양식 I.CT.CN.JUIL.2025 4항 — "at least 21 days have elapsed after the primary rabies vaccination". 저장 거부(validateRabiesEntryWait)와 같은 판정 함수(violatesRabiesEntryWait)를 쓴다.',
    // ⚠️ 예전엔 30일이었다. 근거가 "ONSSA EU 양식 운용 표준"이라고만 적혀 있었는데 양식
    //   원문에는 **21일뿐**이다(2026-07-20 원본 판독). 30일은 **항체검사 채혈 시점**(접종 후
    //   30일, 5항) 조건이 대기일로 흘러든 것으로 보인다 — 서로 다른 조항이다.
    //   구버전은 **가장 이른 접종**(rabies[0]) 기준이라 만료 후 재접종 케이스도 놓쳤다.
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (!violatesRabiesEntryWait(data, dep, destination)) {
        const latest = rabies[rabies.length - 1]
        return { ok: true, message: `최근 접종(${latest.date}) → 출국일(${dep}): 21일 충족(또는 유효 부스터).` }
      }
      const latest = rabies[rabies.length - 1]
      return {
        ok: false,
        message: '광견병 접종 후 21일이 지나야 모로코에 입국할 수 있어요. 입국일을 미뤄야 해요.',
        offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
      }
    },
  },
  {
    id: 'ma.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함. (ONSSA: 제조사 라벨 유효기간 내)',
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

  // ── 보호자 한도 (비상업 5두 이하) ──
  {
    id: 'ma.max-5pets-non-commercial',
    country: COUNTRY,
    category: '서류',
    title: '비상업 1인 5마리 이하 (ONSSA)',
    description:
      'ONSSA: 비상업 목적 1인당 5두 이하 통상 인정. 동일 보호자(이름·영문이름·전화·국내주소 일치)가 모로코 목적 케이스 6건 이상 등록 시 경고.',
    severity: 'warning',
    // relatedCases 는 펫무브워크(운영자)만 전달 — 보호자 이름·건수가 필요한 운영자용 룰.
    audience: 'staff',
    addedAt: '2026-05-07',
    run: ({ caseRow, relatedCases, destination }) => {
      if (relatedCases === undefined) return SKIP
      const others = findSameGuardianCases(caseRow, relatedCases, { sameDestination: true })
      if (others.length + 1 > 5) {
        return {
          ok: false,
          message: `같은 보호자(${caseRow.customer_name})가 모로코 목적 케이스를 ${others.length + 1}건 등록하여 비상업 5두 한도를 초과했어요.`,
          offendingPaths: ['customer_name'],
        }
      }
      return { ok: true, message: '보호자 케이스 ≤ 5건.' }
    },
  },
  // ── RNATT (모로코 입국 요건) ──
  {
    id: 'ma.rnatt-min-30days-after-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '항체 검사는 광견병 접종 30일 이후',
    description:
      'ONSSA 수입 양식 I.CT.CN.JUIL.2025 5항 — 채혈은 "at least 30 days after the previous rabies vaccination". 채혈 후 대기는 없다(우크라이나 3개월과 다른 지점).',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      const titers = readTiterEntries(caseRow)
      if (rabies.length === 0 || titers.length === 0) return SKIP

      const offending: string[] = []
      for (const t of titers) {
        const prior = rabies.filter((r) => r.date <= t.date)
        if (prior.length === 0) {
          offending.push(`rabies_titer_records[${t.originalIndex}].date`)
          continue
        }
        const latest = prior[prior.length - 1]
        const gap = daysBetween(latest.date, t.date)
        if (gap === null || gap < 30) {
          offending.push(`rabies_titer_records[${t.originalIndex}].date`)
        }
      }
      if (offending.length > 0) {
        return {
          ok: false,
          message: '광견병 항체 검사는 접종일로부터 30일이 지난 뒤에 받아야 해요.',
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '항체 검사 시기 적합 (접종 후 30일 경과).' }
    },
  },
  // ── 도착 수입 검역 / 현지 수출 검역 (베트남 골격 복제 2026-07-20) ──
  {
    id: 'ma.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '모로코 수입 검역일',
    description: '모로코 수입 검역일은 모로코 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.ma_import_quarantine_date === 'string'
          ? data.ma_import_quarantine_date.slice(0, 10)
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
          message: '모로코 수입 검역일은 모로코 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['ma_import_quarantine_date'],
        }
      }
      return { ok: true, message: `모로코 수입검역일(${raw}) 입국 이후.` }
    },
  },
  {
    id: 'ma.export-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '모로코 수출 검역일',
    description:
      '모로코 수출 검역일은 모로코 입국일 이후·한국 귀국일 이전이어야 함. "그 나라에 있는 동안 받았는가"라는 물리적 제약이라 나라별 규정 조사가 필요 없다(판정은 classifyExportQuarantineDate 공용).',
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
      const verdict = classifyExportQuarantineDate(data.ma_export_quarantine_date, entry, ret)
      if (verdict === 'skip') return SKIP
      if (verdict === 'before-entry') {
        return {
          ok: false,
          message: '모로코 수출 검역일은 모로코 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['ma_export_quarantine_date'],
        }
      }
      if (verdict === 'after-return') {
        return {
          ok: false,
          message: '모로코 수출 검역일은 한국 귀국일보다 늦을 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['ma_export_quarantine_date'],
        }
      }
      return { ok: true, message: `모로코 수출검역일 체류 기간 내.` }
    },
  },
]
