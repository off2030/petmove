import type { ProcedureCheck } from './types'
import {
  addMonths,
  daysBetween,
  readExternalParasiteEntries,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
  todayKst,
  type TiterEntry,
  readDepartureDate,
  readVetVisitDate,
} from './utils'
import { msgMicrochipBeforeRabies, msgRabiesExpiredBefore } from './messages'
import {
  buildDateRuleContext,
  validateParasiteDateForDestination,
  validateRabiesPrimeAgeForDestination,
} from '../journey-steps/date-rules'
import { buildCaseJourneyContext } from '../journey-steps/applicability'

/**
 * 하와이 (HDOA — Hawaii Department of Agriculture, Animal Quarantine Station) 절차 검증.
 *
 * 적용 프로그램: **Direct Airport Release (DAR) & 5-Day-Or-Less** (HNL/Honolulu).
 * 출처: dab.hawaii.gov — Checklist 1 (2018-08-31 갱신, 2026 현재 유효).
 *
 * ⚠️ Hawaii 는 미국 본토 검역 통과 후 별도 검역. 한국발 직항/경유 모두 동일 룰.
 *  → 개·고양이 동일 절차. 종 분기 거의 없음.
 *  → 광견병 백신 = 2회 평생 (1차+부스터). 부스터는 1년 또는 3년 라이선스.
 *  → FAVN 검체 lab 수령일 기준 (AU 와 동일 컨셉, 단 hawaii_extra.sample_received_date 미구현).
 *    → 현재는 채혈일(`rabies_titer_records[].date`) 을 보수 proxy 로 사용.
 *
 * 컨벤션 (NZ 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - "X일 이내" = 출국일 포함 X distinct days → `dep - X ≤ N-1`
 *    (예: 14일 이내 → ≤13)
 *  - "more than X days" = strict > X → ≥ X+1
 *    (예: more than 30 days → ≥31)
 *  - "not less than X days" = inclusive → ≥ X
 *  - departure_date = HI 도착일 proxy (시간대 차 ±1일 무시)
 */

const COUNTRY = 'hawaii'

export const HI_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'hi.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      '마이크로칩(ISO 11784/11785)이 광견병 1차 접종일과 같거나 이전이어야 함. 칩 없거나 스캔 불가 시 120일 검역 강제. (HDOA Step 2 + JP/SG/AU/EU/NZ 와 일관)',
    severity: 'warning',
    addedAt: '2026-05-06',
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

  // ── 광견병 (보수적 연령 + 2회 평생 + 31일 간격 + 31일 이전 + 미만료) ──
  {
    id: 'hi.rabies-prime-after-12weeks',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 최소 연령 (생후 3개월)',
    description:
      'HDOA 는 최소 연령을 고정하지 않고 백신 라벨을 따른다(HAR §4-29-8.1) — 라벨이 제품마다 12주(래비신)/3개월(디펜서)로 갈려 더 보수적인 달력 3개월을 택했다(프로파일 minAgeMonths, 2026-07-25 사용자 확정 — 카드 문구와 통일). 저장 거부(카탈로그 earliest 파생)와 같은 함수(validateRabiesPrimeAgeForDestination). (id 는 호환성을 위해 12weeks 유지)',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!birth || rabies.length === 0) return SKIP

      const first = rabies[0]
      const msg = validateRabiesPrimeAgeForDestination(birth, first.date, 'hawaii')
      if (msg) {
        return {
          ok: false,
          message: msg,
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 최소 연령(프로파일 파생) 충족.` }
    },
  },
  {
    id: 'hi.rabies-2-doses-required',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 평생 2회 이상 접종',
    description:
      '광견병 백신은 평생 최소 2회. 1차 + 부스터 모두 필수. (HDOA: "vaccinated at least twice for rabies in its lifetime")',
    severity: 'info',
    addedAt: '2026-05-06',
    // 접종일이 정보 자체라 날짜 표기 허용(jp.ts 선례).
    allowDate: true,
    run: ({ caseRow, destination }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return SKIP
      if (rabies.length < 2) {
        return {
          ok: false,
          message: `광견병 접종이 1회(${rabies[0].date})만 기록되어 있어요. 2회가 필요해요.`,
          offendingPaths: [`rabies_dates[${rabies[0].originalIndex}].date`],
        }
      }
      return { ok: true, message: `광견병 ${rabies.length}회 기록됨.` }
    },
  },
  {
    id: 'hi.rabies-doses-31days-apart',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 도즈 간 31일 이상 간격 (more than 30 days)',
    description:
      '연속된 광견병 접종 간 간격 ≥31일. (HDOA: "must have been administered more than 30 days apart" → strict >30 = ≥31)',
    severity: 'warning',
    addedAt: '2026-05-06',
    // 접종일·간격 일수가 정보 자체라 날짜 표기 허용(jp.ts 선례).
    allowDate: true,
    run: ({ caseRow, destination }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length < 2) return SKIP

      const violations: Array<{ prev: typeof rabies[number]; curr: typeof rabies[number]; gap: number }> = []
      for (let i = 1; i < rabies.length; i++) {
        const prev = rabies[i - 1]
        const curr = rabies[i]
        const gap = daysBetween(prev.date, curr.date)
        if (gap !== null && gap < 31) {
          violations.push({ prev, curr, gap })
        }
      }
      if (violations.length > 0) {
        const offending: string[] = []
        const msgs: string[] = []
        for (const v of violations) {
          offending.push(
            `rabies_dates[${v.prev.originalIndex}].date`,
            `rabies_dates[${v.curr.originalIndex}].date`,
          )
          msgs.push(`${v.prev.date}부터 ${v.curr.date}까지 ${v.gap}일이에요. 31일 이상이어야 해요. 날짜를 확인하세요.`)
        }
        return {
          ok: false,
          message: msgs.join(' / '),
          offendingPaths: Array.from(new Set(offending)),
        }
      }
      return { ok: true, message: '모든 인접 광견병 도즈 간 간격 ≥31일.' }
    },
  },
  {
    id: 'hi.rabies-latest-31days-before-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '최근 광견병 접종은 출국(=도착) 31일 이전',
    description:
      '가장 최근 광견병 접종일이 도착일 기준 31일 이전(more than 30 days). 31일 미만 시 도착 후 추가 검역 강제. (HDOA Step 3)',
    severity: 'warning',
    addedAt: '2026-05-06',
    // 접종일→출국 경과 일수가 정보 자체라 날짜 표기 허용(jp.ts 선례).
    allowDate: true,
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP
      // 항체(FAVN) 검사가 입력돼 있으면 이 룰은 안내하지 않는다 — 채혈은 접종 이후이고 검체
      // 수령 후 30일을 더 기다리므로, 접종+31일은 FAVN 30일 대기에 완전히 포함된다(중복 안내).
      // 항체 미입력 케이스에서만 단독 안전망으로 남는다.
      if (readTiterEntries(caseRow).length > 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 31) {
        return {
          ok: false,
          message: '최근 광견병 접종일로부터 31일이 지나야 입국할 수 있어요.',
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },
  {
    id: 'hi.rabies-not-expired-on-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '도착일에 광견병 면역 유효 (1년/3년 라이선스 모두 cover)',
    description:
      '최근 광견병 접종의 라이선스 booster interval 이 도착일 이전 만료되지 않아야 함. 1년·3년 라이선스 모두 **N주년 당일까지** 유효. valid_until 명시 시 그 값 사용 — 3년 백신은 valid_until 직접 입력 필수. 미명시 시 디폴트 1년 (`addOneYear`). (HDOA: "must not be expired when your pet arrives")',
    severity: 'info',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      // 이미 만료(오늘 기준)는 common.rabies-extra-validity-expired(2회국) '주의'가 담당 —
      // 여기선 아직 유효한데 도착 시점에 만료 예정인 경우만 남긴다(만료 재구성 B, 2026-07-25).
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

  // ── FAVN (OIE-FAVN) ──
  // (≥0.5 IU/ml 결과치 룰은 의도적 제외 — 검사기관에서 이미 fail 결과 나옴, 시스템 검증 불필요)
  {
    id: 'hi.favn-sample-30days-to-36months-before-arrival',
    country: COUNTRY,
    category: '광견병',
    title: 'FAVN 검체 접수일은 출국 30일 ~ 36개월 전',
    description:
      'HDOA: lab 수령일 다음날부터 30일 이상, 36개월 이내. `rabies_titer_records[].received_date` 우선, 미입력 시 채혈일 fallback (실제 lab 수령일은 며칠 늦으므로 채혈일 proxy 는 less strict — 보수 마진 검토 권고).',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      // received_date 우선, 없으면 채혈일 fallback
      const basisOf = (t: TiterEntry) => t.received_date || t.date
      const valid = titers.find((t) => {
        const basis = basisOf(t)
        const days = daysBetween(basis, dep)
        if (days === null) return false
        const upper = addMonths(basis, 36)
        return days >= 30 && upper >= dep
      })
      if (valid) {
        const basis = basisOf(valid)
        const label = valid.received_date ? '검체 접수일' : 'FAVN 채혈일'
        const days = daysBetween(basis, dep)
        return { ok: true, message: `${label}(${basis}) → 출국(${dep}): ${days}일 (30일 이상, 36개월 이내).` }
      }

      // 모두 실패 — 가장 최신 기준 메시지
      const newest = [...titers].sort((a, b) => basisOf(b).localeCompare(basisOf(a)))[0]
      const newestBasis = basisOf(newest)
      const days = daysBetween(newestBasis, dep)
      const offending: string[] = ['departure_date']
      for (const t of titers) {
        if (t.received_date) offending.push(`rabies_titer_records[${t.originalIndex}].received_date`)
        else offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      }
      // 하와이 기준일은 '검체가 검사기관에 접수된 날'이고, 앱은 그 날짜를 입력받지 않아
      // 채혈일을 proxy 로만 쓴다 — 계산된 특정 날짜를 단정하지 않고 요건만 forward-looking 으로
      // 안내한다(검사일 기준 아님·2026-07-25 사용자 지정). 상한(36개월)은 재검사 안내.
      const reason =
        days === null
          ? '광견병 항체 검사 날짜를 확인하세요.'
          : days < 0
            ? '광견병 항체 검사일이 입국일보다 늦어요. 날짜를 확인하세요.'
            : days < 30
              ? '광견병 항체 검사 검체가 검사기관에 접수된 날로부터 30일이 지나야 입국할 수 있어요.'
              : '광견병 항체 검사 후 36개월이 지나 재검사가 필요해요.'
      return {
        ok: false,
        message: reason,
        offendingPaths: offending,
      }
    },
  },

  // ── 진드기 ──
  {
    id: 'hi.tick-treatment-within-14days',
    country: COUNTRY,
    category: '구충',
    title: '외부구충은 출국 전 14일 이내 (13일 전 이후)',
    // 고객 메시지는 멕시코·브라질·UAE 문형 통일(특정 기생충·제품 미지목). 상세(장시간 작용
    // 진드기 제품·Revolution 불가·건강증명서 기재)는 staff 설명에 보존(사용자 지정 2026-07-23).
    description:
      '외부구충(벼룩·진드기) 처치는 도착일 기준 14일 이내(`≤13`). 장시간 작용 진드기 제품(Revolution 불가, Frontline/Bravecto 등 tick label) + 제품명·날짜를 건강증명서에 기재. (HDOA Checklist 1 Step 6 #4: "within 14 days of arrival")',
    severity: 'warning',
    addedAt: '2026-05-06',
    // 처치일→출국 경과 일수가 정보 자체라 날짜 표기 허용(jp.ts 4개 룰과 같은 판단).
    allowDate: true,
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readExternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      // 저장 거부(client)와 같은 dispatch 로 판정 — 검증 단일 출처. 처치일을 나중에 어긋나게
      // 만든 경우를 여기서 '주의'로 재노출.
      const err = validateParasiteDateForDestination(latest.date, {
        destinationKey: destination,
        kind: 'external',
        departureDate: dep,
      })
      if (err) {
        return {
          ok: false,
          message: err,
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      const days = daysBetween(latest.date, dep)
      return { ok: true, message: `외부 기생충 치료(${latest.date}) → 출국일(${dep}): ${days}일.` }
    },
  },

  // ── 도착 검역 일정 재검증 (jp.*-date-valid / th.import-quarantine-date-valid 와 동일 모델) ──
  {
    id: 'hi.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '하와이 수입 검역일',
    description: '하와이 수입 검역일은 하와이 도착일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-24',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.hi_import_quarantine_date === 'string'
          ? data.hi_import_quarantine_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      // departure_date = 하와이 도착일 proxy (hi.ts 컨벤션).
      const dep = readDepartureDate(caseRow, destination)
      if (dep && raw < dep) {
        return {
          ok: false,
          message: '하와이 수입 검역일은 도착일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['hi_import_quarantine_date'],
        }
      }
      return { ok: true, message: `하와이 수입검역일(${raw}) 도착 이후.` }
    },
  },

  // ── 하와이 입국 신청(AQS 서류 사전 제출) ──
  // 2026-07-26 제거: 하와이 입국 신청은 접수하면 끝나는 절차라 카드가 버튼 완료 모델로
  //   바뀌었다(catalog hi-import-declaration). 기록되는 날짜가 '버튼 누른 날'이라 실제
  //   신청일과 달라, 10일 판정을 돌리면 거짓 주의가 난다. 마감 안내는 reminders.ts 의
  //   하와이 알림 2회(마감 일주일 전 D-17 · 마감일 D-10)가 계속 담당한다.


  // 광견병 항체가 — 한국 검역본부는 하와이를 비발생 지역으로 분류(항체 면제·당일 개방)하지만,
  // USDA 한국 전용 서식(korea-dog-cat.pdf)에는 항체가 기재란이 필수라 서로 충돌한다. 면제를
  // 확정 안내하지 않고 보수 기준으로 '주의'만 둔다(2026-07-26 사용자 결정): 결과가 없거나
  // 귀국일 기준 채혈 24개월 초과면 안내. 입국용 FAVN(36개월 유효)을 재사용할 수 있는 경우가
  // 대부분이라 실제로는 드물게 뜬다.
  {
    id: 'hi.return-titer-within-24months',
    country: COUNTRY,
    category: '귀국 서류',
    title: '귀국 건강증명서의 항체가 기재 (채혈 24개월 이내)',
    description:
      'USDA 한국 전용 건강증명서에 광견병 항체가(0.5 IU/㎖ 이상, 채혈 24개월 이내) 기재란이 있음. 한국 검역본부의 하와이 비발생 면제와 충돌하므로 보수적으로 결과 보유를 권고(주의만, 차단 없음).',
    severity: 'warning',
    addedAt: '2026-07-26',
    run: ({ caseRow, destination }) => {
      if (buildCaseJourneyContext(caseRow, destination).tripType !== 'round') return SKIP
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const ret = typeof data.return_date === 'string' ? data.return_date.slice(0, 10) : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ret)) return SKIP
      const titers = readTiterEntries(caseRow)
      const valid = titers.find((t) => t.date <= ret && addMonths(t.date, 24) >= ret)
      if (valid) {
        return { ok: true, message: `항체 채혈(${valid.date}) + 24개월 ≥ 귀국일(${ret}).` }
      }
      return {
        ok: false,
        message:
          '광견병 항체 검사 결과가 없거나 채혈 후 24개월이 지났어요. 한국 입국용 건강증명서에 항체가 기재가 필요할 수 있어요 — 검사 결과를 확인하세요.',
        offendingPaths: titers.length
          ? titers.map((t) => `rabies_titer_records[${t.originalIndex}].date`)
          : ['hi_export_quarantine_date'],
      }
    },
  },
  // 항공사 자체 요구사항 — 규정 검증이 아니라 준비 환기용 '안내'. 증명서 발급·승인일이
  // 저장되면 내린다(준비를 마친 보호자에게 반복 노출하지 않기 위해).
  {
    id: 'hi.airline-health-cert-note',
    country: COUNTRY,
    category: '귀국 서류',
    title: '항공사 자체 건강증명서 요구사항',
    description:
      '항공사에 따라 자체 건강증명서(발급 시한 등) 요구가 있을 수 있어 별도 확인 안내. 규정 검증이 아닌 환기용 안내(info).',
    severity: 'info',
    addedAt: '2026-07-26',
    run: ({ caseRow, destination }) => {
      if (buildCaseJourneyContext(caseRow, destination).tripType !== 'round') return SKIP
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const ret = typeof data.return_date === 'string' ? data.return_date.slice(0, 10) : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ret)) return SKIP
      const cert =
        typeof data.hi_export_quarantine_date === 'string' ? data.hi_export_quarantine_date : ''
      if (cert) return { ok: true, message: '건강증명서 준비 완료 — 안내 내림.' }
      return {
        ok: false,
        message: '항공사 자체 건강증명서 요구사항은 별도로 확인하세요.',
        offendingPaths: ['hi_export_quarantine_date'],
      }
    },
  },

]
