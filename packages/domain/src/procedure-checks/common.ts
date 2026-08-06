import {
  DESTINATION_OVERRIDES,
  destinationsWithVaccine,
  getTripType,
  isRabiesFreeOrigin,
  matchesDestinationKey,
} from '../destination-config'
import {
  GENERAL_VACCINE_CARD_DESTINATIONS,
  TWO_DOSE_RABIES_DESTINATIONS,
} from '../journey-steps/applicability'
import {
  buildDateRuleContext,
  validateKrExportDate,
  validateKrImportDate,
  validateVetVisitDate,
} from '../journey-steps/date-rules'
import { titerEntryValidUntil, TITER_EXTRA_CARD_DESTINATIONS } from '../journey-steps/titer-validity'
import type { CaseRow } from '../types'
import type { ProcedureCheck } from './types'
import {
  addYears,
  formatKoreanDate,
  readGeneralVaccineEntries,
  readKennelCoughEntries,
  readRabiesEntries,
  readTiterEntries,
  readVetVisitDate,
  resolveValidUntil,
  todayKst,
  SKIP,
} from './utils'

/**
 * 목적지 무관 — 한국 출입국 측 공통 절차 검증.
 *
 * 출국 전 임상검사·한국 수출 검역·한국 수입 검역(왕복 귀국)은 어느 목적지든 한국발
 * 케이스가 거치는 한국 측 단계라 모든 목적지에 적용된다. 이는 메모리의 "공통룰 금지(country: 'all' 누수)"가 막는 *특정국
 * 룰 누수*가 아니라, 진짜로 전 목적지가 대상인 절차다. 그래서 'all' 같은 매직 토큰 대신
 * 실제 지원 목적지 키 전체를 명시 배열로 선언한다 — `findDestinationKey` 가 돌려줄 수 있는
 * destinationKey 집합과 정확히 일치하며(그 외 토큰은 destinationKey=null 이라 어차피 검사
 * 자체가 안 돈다), 새 국가가 추가돼도 누락 없이 자동 포함된다.
 */
const ALL_DESTINATION_KEYS: string[] = Object.keys(DESTINATION_OVERRIDES)

/**
 * 2회 프라임국(일본·중국·하와이 — rabies.doses=2 파생)을 뺀 나머지 전 목적지.
 * '이미 만료' 주의 배지를 어느 광견병 카드에 붙일지 가르는 목록 — 2회국은 별도
 * '추가 백신' 카드(rabies-vaccine-extra)가 있어 그 카드에, 나머지는 광견병 백신
 * 카드(rabies-vaccine-1)에 붙는다. check-mapping 이 check id → step 을 전역 1:1 로
 * 매핑하므로 같은 조건이라도 카드가 다르면 룰을 나눠야 한다.
 */
const NON_TWO_DOSE_DESTINATION_KEYS: string[] = ALL_DESTINATION_KEYS.filter(
  (k) => !TWO_DOSE_RABIES_DESTINATIONS.includes(k),
)

export const COMMON_CHECKS: ProcedureCheck[] = [
  // ── 검역·검사 일정 자기 검증 (전 목적지 공통) ──────────────────────────
  // 입력 시점 client 입력 차단(step-detail-view)과 같은 함수를 매 렌더 재실행 — 앞 단계
  // (항공편 등)를 수정해 이미 입력된 일정이 어긋났을 때 '주의'로 표면화한다. (jp.*-date-valid
  // 와 동일 패턴 — vet-visit / certificate-issue 는 base catalog 의 공통 step 이라 여기 둔다.)
  {
    id: 'common.vet-visit-date-valid',
    country: ALL_DESTINATION_KEYS,
    category: '검사',
    title: '출국 전 임상검사일',
    description: '출국 전 임상검사일은 출국일 이전·여행지별 검진 가능 윈도우 이내여야 함.',
    severity: 'warning',
    addedAt: '2026-06-11',
    run: ({ caseRow, destination }) => {
      // 활성 목적지 기준 내원일(scoped 우선) — buildDateRuleContext 와 동일 출처.
      const raw = (readVetVisitDate(caseRow, destination) ?? '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const msg = validateVetVisitDate(raw, ctx)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['vet_visit_date'] }
      }
      return { ok: true, message: `임상검사일(${raw}) 출국 전 윈도우 내.` }
    },
  },
  {
    id: 'common.kr-export-quarantine-date-valid',
    country: ALL_DESTINATION_KEYS,
    category: '검역',
    title: '한국 수출 검역일',
    description:
      '한국 수출 검역일은 출국 전 임상검사 이후·출국일 이전이며 출국일 기준 윈도우 이내여야 함.',
    severity: 'warning',
    addedAt: '2026-06-11',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.kr_export_quarantine_date === 'string'
          ? data.kr_export_quarantine_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const msg = validateKrExportDate(raw, ctx)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['kr_export_quarantine_date'] }
      }
      return { ok: true, message: `한국 수출검역일(${raw}) 출국 전 윈도우 내.` }
    },
  },
  // 한국 수입 검역(왕복 마지막) — 귀국 후 한국 공항 검역. 검역일 ≥ 귀국일.
  // 전 목적지 왕복 공통이라 국가별(jp/th/ph/eu) 분리 대신 common 1개로 통합(kr-export 와 동일).
  {
    id: 'common.kr-import-quarantine-date-valid',
    country: ALL_DESTINATION_KEYS,
    category: '검역',
    title: '한국 수입 검역일',
    description: '한국 수입 검역일은 한국 귀국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-06-17',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.kr_import_quarantine_date === 'string'
          ? data.kr_import_quarantine_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const msg = validateKrImportDate(raw, ctx)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['kr_import_quarantine_date'] }
      }
      return { ok: true, message: `한국 수입검역일(${raw}) 귀국 이후.` }
    },
  },
  // 한국 귀국 광견병 항체검사 유효기간(2년) — 왕복 귀국 시 한국은 채혈일 2년 이내 검사만
  // 인정(채혈 + 2년 ≥ 귀국일). EU 처럼 입국용 항체는 부스터 chain 유지 시 무기한이라도,
  // 귀국엔 2년 룰이 별도로 걸린다. 단 광견병 비발생 지역(일본·호주·영국 등)산은 한국이
  // 항체검사 자체를 면제 → isRabiesFreeOrigin 이면 SKIP. 편도(귀국일 없음)도 SKIP.
  // 비발생 지정은 수시 변동(APQA 정적 미공표)이라 입력불가·강한 주의가 아닌 info(안내) +
  // 검역본부 확인 권고로 둔다. (isRabiesFreeOrigin 주석의 변동성·면책 참고.)
  {
    id: 'common.kr-return-titer-within-2years',
    country: ALL_DESTINATION_KEYS,
    category: '광견병',
    title: '한국 귀국 광견병 항체 검사 유효기간(2년)',
    description:
      '왕복 귀국 시 한국은 광견병 항체검사를 채혈일 2년 이내로만 인정(채혈 + 2년 ≥ 귀국일). 광견병 비발생 지역산은 면제 — 비발생 지정은 수시 변동하므로 검역본부 확인 안내.',
    severity: 'info',
    addedAt: '2026-06-30',
    run: ({ caseRow, destination }) => {
      // 비발생국 = 한국 귀국 시 항체검사 면제 → 적용 안 함.
      if (isRabiesFreeOrigin(destination)) return SKIP
      // 편도 → 적용 안 함. 귀국일 존재만 보면 편도 전환 후 잔존 귀국일에 걸리므로
      // 카드 필터와 같은 tripType 기준을 먼저 본다(2026-08-01, 편도 전용국 강제 포함).
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (getTripType(data, destination) === 'one_way') return SKIP
      // 귀국일 없음(미정 왕복 등) → 판정 불가라 적용 안 함. (caseRow.data 는 활성 목적지로 flatten 된 상태.)
      const ret =
        typeof data.return_date === 'string' ? data.return_date.slice(0, 10) : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ret)) return SKIP
      const titers = readTiterEntries(caseRow)
      if (titers.length === 0) return SKIP
      // 귀국일 이전 채혈 중 채혈 + 2년 ≥ 귀국일 인 검사가 하나라도 있으면 유효.
      const valid = titers.find((t) => t.date <= ret && addYears(t.date, 2) >= ret)
      if (valid) {
        return {
          ok: true,
          message: `항체 검사(${valid.date}) 유효기간(${addYears(valid.date, 2)}) ≥ 귀국일(${ret}).`,
        }
      }
      const prior = titers.filter((t) => t.date <= ret)
      const newest = [...(prior.length ? prior : titers)].sort((a, b) =>
        b.date.localeCompare(a.date),
      )[0]
      const expireKr = formatKoreanDate(addYears(newest.date, 2))
      return {
        ok: false,
        message: `광견병 항체 검사 유효기간(2년)이 ${expireKr}에 만료돼요. 한국 귀국 전 재검사가 필요할 수 있어요. (광견병 비발생 지역은 면제)`,
        offendingPaths: titers.map((t) => `rabies_titer_records[${t.originalIndex}].date`),
      }
    },
  },

  // ── '이미 만료' 주의 배지 (만료 재구성 B, 2026-07-25) ─────────────────────
  // 유효기간 상태 3분류의 단일 설계:
  //  ① 이미 만료(validUntil < 오늘)        → 여기 common '주의(warning)' 룰이 담당.
  //  ② 만료 임박(오늘+30일 내)             → *-expires-soon '안내(info)' + 카드 situational.
  //  ③ 도착 시 만료 예정(오늘 ≤ 만료 < 출국) → 각 나라 유효기간 룰 '안내(info)'가 담당.
  // 각 나라 유효기간 룰은 ①이면 SKIP 해 여기와 중복되지 않고, 카드 situational 의
  // '만료되었어요' 문구도 걷어내 정적 기본 문구로 돌아간다(주의 배지와 3중 중복 방지).
  // 문구는 걷어낸 situational 의 사용자 검수 문구를 글자 그대로 가져왔다.
  {
    id: 'common.rabies-validity-expired',
    country: NON_TWO_DOSE_DESTINATION_KEYS,
    category: '광견병',
    title: '광견병 백신 면역 유효기간 만료',
    description:
      '가장 최근 광견병 접종의 면역 유효기간이 오늘 기준 이미 만료됨 — 추가 접종 기록 입력 요청. (2회 프라임국은 common.rabies-extra-validity-expired 가 추가 백신 카드에서 담당)',
    // 만료 안내는 **날짜가 정보 자체**다(언제 만료됐는지 모르면 안내가 성립 안 함).
    allowDate: true,
    severity: 'warning',
    addedAt: '2026-07-25',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return SKIP
      const latest = [...rabies].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
      // 미래(예정) 접종이 이미 잡혀 있으면 만료 경고 대상 아님 — 도래하면 그 접종이 최신이 된다.
      // (고객 절차검증은 *_scheduled 병합 뷰라 예정 부스터도 여기에 온다.)
      if (latest.date > todayKst()) return SKIP
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      if (validUntil >= todayKst()) {
        return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 오늘.` }
      }
      return {
        ok: false,
        message: `직전 광견병 백신의 면역 유효기간이 ${formatKoreanDate(validUntil)}에 만료되었어요. 추가 접종 기록을 입력하세요.`,
        offendingPaths: [`rabies_dates[${latest.originalIndex}].date`],
      }
    },
  },
  {
    id: 'common.rabies-extra-validity-expired',
    country: TWO_DOSE_RABIES_DESTINATIONS,
    category: '광견병',
    title: '광견병 백신 면역 유효기간 만료',
    description:
      '가장 최근 광견병 접종의 면역 유효기간이 오늘 기준 이미 만료됨 — 2회 프라임국(일본·중국·하와이)은 추가 백신 카드에서 안내. 만료 후 접종은 chain 단절이라 1차부터 재시작.',
    allowDate: true,
    severity: 'warning',
    addedAt: '2026-07-25',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return SKIP
      const latest = [...rabies].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
      if (latest.date > todayKst()) return SKIP
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      if (validUntil >= todayKst()) {
        return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 오늘.` }
      }
      return {
        ok: false,
        message: `직전 광견병 백신의 면역 유효기간이 ${formatKoreanDate(validUntil)}에 만료되었어요. 추가 접종 기록을 입력하세요. 추가 접종을 하지 못한 경우, 1차 접종부터 다시 준비하세요.`,
        offendingPaths: [`rabies_dates[${latest.originalIndex}].date`],
      }
    },
  },
  {
    id: 'common.titer-extra-validity-expired',
    country: [...TITER_EXTRA_CARD_DESTINATIONS],
    category: '광견병',
    title: '광견병 항체 검사 유효기간 만료',
    description:
      '여행지 입국용 항체 검사(일본 24·대만 12·하와이 36개월)의 유효기간이 오늘 기준 이미 만료됨 — 추가 검사 카드에서 안내. 대만은 만료 후 재검사면 채혈일로부터 180일 재대기.',
    allowDate: true,
    severity: 'warning',
    addedAt: '2026-07-25',
    run: ({ caseRow, destination }) => {
      const titers = readTiterEntries(caseRow)
      if (titers.length === 0) return SKIP
      const latest = [...titers].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
      // 미래(예정) 채혈이 잡혀 있으면 만료 경고 대상 아님(scheduled 병합 뷰).
      if (latest.date > todayKst()) return SKIP
      const token = destination ?? caseRow.destination ?? ''
      // 유효기간은 목적지별 선언 파생(titerEntryValidUntil) — 카드·알림과 같은 단일 출처.
      const validUntil = titerEntryValidUntil(token, latest.date)
      if (!validUntil) return SKIP
      if (validUntil >= todayKst()) {
        return { ok: true, message: `최근 채혈(${latest.date}) 유효기간(${validUntil}) ≥ 오늘.` }
      }
      // 대만은 만료의 의미가 다르다 — 만료 후 재검사는 체인이 끊겨 180일 재대기(APHIA 情形 2).
      // 일본·하와이는 재검사 기록 입력만 안내(접종 체인 유지 시 추가 대기 없음).
      const message = matchesDestinationKey(token, 'taiwan')
        ? `직전 검사의 유효기간이 ${formatKoreanDate(validUntil)}에 만료되었어요. 추가 검사를 받은 날로부터 180일이 지나야 격리 없이 입국할 수 있어요.`
        : `직전 검사의 유효기간이 ${formatKoreanDate(validUntil)}에 만료되었어요. 추가 검사 기록을 입력하세요.`
      return {
        ok: false,
        message,
        offendingPaths: [`rabies_titer_records[${latest.originalIndex}].date`],
      }
    },
  },
  buildVaccineValidityRule({
    id: 'common.general-vaccine-validity-expired',
    country: GENERAL_VACCINE_CARD_DESTINATIONS,
    category: '종합백신',
    label: '종합백신',
    dataKey: 'general_vaccine_dates',
    reader: readGeneralVaccineEntries,
  }),
  buildVaccineValidityRule({
    id: 'common.kennel-cough-validity-expired',
    country: destinationsWithVaccine('kennel'),
    category: '종합백신',
    label: '켄넬코프 백신',
    dataKey: 'kennel_cough_dates',
    reader: readKennelCoughEntries,
  }),
]

/**
 * 백신 면역 유효기간 만료 **주의** — 카드가 뜨는 목적지 전체 공통.
 *
 * 왜 '주의'인가(2026-07-30 사용자 확정 "카드가 있으면 모두 주의가 맞아"): 카드가 떠 있다는
 * 건 그 목적지가 그 백신을 **요구한다**는 뜻이다(입국 요건이든 계류시설 제출 요건이든).
 * 만료된 접종은 어느 쪽으로도 쓸 수 없으므로 톤을 나눌 이유가 없다.
 *
 * ⚠️ 이전에는 '이미 만료'(오늘 기준)만 주의였고 **출국 전 만료**(미래 만료)는 카드
 *   situational 의 '안내'로만 떴다. 그래서 같은 케이스에서 광견병·CIV 는 '주의', 종합백신·
 *   켄넬코프는 '안내'로 갈렸고(2026-07-30 사용자 지적), 뉴질랜드 종합백신은 카드
 *   validationIds 가 비어 있어 아무것도 안 떴다. 두 경우를 한 룰로 합친다.
 *
 * 기준일 = 입국일(entry_date) 있으면 그 값, 없으면 출국일(departure_date). 둘 다 없으면
 * 오늘 기준 만료만 본다 — 여행 날짜가 안 정해졌는데 미래 만료를 단정할 수 없다.
 */
function buildVaccineValidityRule(opts: {
  id: string
  country: string[]
  category: string
  label: string
  dataKey: string
  reader: (caseRow: CaseRow) => Array<{ date: string; valid_until?: string | null; originalIndex: number }>
}): ProcedureCheck {
  return {
    id: opts.id,
    country: opts.country,
    category: opts.category,
    title: `${opts.label} 면역 유효기간 만료`,
    description: `가장 최근 ${opts.label} 접종의 면역 유효기간이 오늘 기준 이미 만료됐거나, 출국(입국)일 전에 만료됨 — 추가 접종 요청. 카드가 뜨는 목적지 전체에 적용한다(카드가 있으면 그 백신을 요구한다는 뜻이므로 만료는 항상 주의, 2026-07-30 사용자 확정).`,
    allowDate: true,
    severity: 'warning',
    addedAt: '2026-07-25',
    run: ({ caseRow }) => {
      const entries = opts.reader(caseRow)
      if (entries.length === 0) return SKIP
      // reader 는 날짜순 정렬을 보장.
      const latest = entries[entries.length - 1]
      const today = todayKst()
      if (latest.date > today) return SKIP
      const validUntil = resolveValidUntil(latest.date, latest.valid_until ?? null)
      if (!validUntil) return SKIP
      const offendingPaths = [`${opts.dataKey}[${latest.originalIndex}].date`]
      if (validUntil < today) {
        return {
          ok: false,
          message: `직전 ${opts.label}의 면역 유효기간이 ${formatKoreanDate(validUntil)}에 만료되었어요. 추가 접종 기록을 입력하세요.`,
          offendingPaths,
        }
      }
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const anchor =
        (typeof data.entry_date === 'string' && data.entry_date.slice(0, 10)) ||
        (typeof caseRow.departure_date === 'string' ? caseRow.departure_date.slice(0, 10) : '')
      if (anchor && validUntil < anchor) {
        return {
          ok: false,
          message: `${opts.label} 면역 유효기간이 출국 전 ${formatKoreanDate(validUntil)}에 만료돼요. 만료 전에 추가 접종을 하세요.`,
          offendingPaths: [...offendingPaths, 'departure_date'],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ ${anchor || '오늘'}.` }
    },
  }
}
