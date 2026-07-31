import {
  buildDateRuleContext,
  validateChImportPermitDate,
  validateCyAdvanceNoticeDate,
  validateIeAdvanceNoticeDate,
  validateMtAdvanceNoticeDate,
  validateNoAdvanceNoticeDate,
  EU_ENTRY_FAMILY,
} from '../journey-steps/date-rules'
import { TAPEWORM_DESTINATIONS } from '../destination-config'
import type { ProcedureCheck } from './types'
import {
  addMonths,
  daysBetween,
  formatKoreanDate,
  readInternalParasiteEntries,
  readRabiesEntries,
  readScopedImportPermitFiled,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
  todayKst,
  readDepartureDate,
  readVetVisitDate,
  findRabiesValidityBreaks,
} from './utils'
import { msgMicrochipBeforeRabies, msgRabiesPrimeMinAge , msgTiterBeforeVaccine } from './messages'

/**
 * 유럽연합·영국·스위스·EFTA(노르웨이)·키프로스 절차 검증.
 *
 * 출처:
 *  - EU Reg 576/2013 (Pet Travel Scheme), 577/2013 (Annex IV — 한국 등 list 외 제3국)
 *  - EU Reg 2018/772 (촌충 — 영국·아일랜드·몰타·노르웨이·핀란드)
 *  - 영국: EU 탈퇴 후에도 동일 규제 유지 (Pet Travel from listed third country)
 *  - 스위스: EU 와 동일 규칙 + 별도 BLV 신청서
 *  - 사전 통지(도착 전 관할 당국에 알리기): 아일랜드(1영업일 전, gov.ie)·노르웨이(48시간 전,
 *    mattilsynet.no)·키프로스(48시간 전, moa.gov.cy)·몰타(3영업일 전, servizz.gov.mt) — 4국
 *    모두 승인서가 나오지 않는 단순 통지형. 핀란드는 법적 의무 아님(권장만), 영국은 별도
 *    사전통지 확인 안 됨 — 둘 다 카드 없음.
 *
 * 한국 (Annex II Part 2 — listed third country) → EU/UK/CH 입국 공통 요건:
 *  ① 마이크로칩 ≤ 광견병 1차 접종
 *  ② 1차 접종 ≥ 생후 12주 (84일)
 *  ③ 항체 검사 ≥ 직전 접종 + 30일
 *  ④ 출국 ≥ 항체 검사 + 3개월 (캘린더 기준, 90일 아님)
 *  ⑤ 출국 시 광견병 면역 유효
 *  ⑥ 내원·증명서 ≤ 출국 전 10일 이내
 *  ⑦ (촌충국가 한정) 촌충구충 24-120시간 (1-5일) 전
 *
 * 부스터 chain 만 유지되면 RNATT 결과는 무기한 유효 — 별도 만료 룰 없음.
 */

/** EU 규제 패밀리 — 같은 규칙 적용. archetype 'eu-family' 파생(date-rules 와 단일 출처). */
const EU_REGIME: string[] = EU_ENTRY_FAMILY

/**
 * 광견병·마이크로칩·항체 검증에서 **이스라엘을 제외한** EU 패밀리.
 *
 * 이스라엘은 카드 골격 재사용을 위해 archetype 'eu-family' 로 묶여 있지만(EU 라는 뜻이 아님),
 * 광견병·마이크로칩·항체 절차검증은 전용 procedure-checks/il.ts(gov.il 출처)가 담당한다.
 * EU 규칙까지 적용하면 두 가지 문제가 생긴다:
 *  ① 마이크로칩 순서·1차 접종 연령·항체 30일 등이 il.ts 와 **이중으로 표시**된다(주의+안내).
 *  ② EU 의 '항체 검사 후 3개월 대기'(entry-min-3months-after-titer)는 **이스라엘 규정에 없다**
 *     — il.ts 헤더: "RNATT 입국 후 추가 대기 없음(EU/일본과 다름)". 적용하면 틀린 안내가 된다.
 *  ③ 연령 기준도 EU=84일(12주) vs il.ts=91일+캘린더 3개월로 서로 다르다.
 * 반면 입국 검사일·귀국 서류 준비일 **날짜 정합성 검증**(import/export-quarantine-date-valid)은
 * 이스라엘도 EU 패밀리 카드(eu_import/export_quarantine_date)를 그대로 쓰므로 EU_REGIME 유지.
 * (client 입력차단·flight-purchase 3개월 카드도 date-rules.ts 와 destination-overrides.ts 에서
 *  같은 이유로 이스라엘을 제외한다 — 세 층을 함께 봐야 함.)
 */
const EU_RABIES_REGIME: string[] = EU_REGIME.filter((k) => k !== 'israel')

// 촌충 의무국가(Reg 2018/772)는 destination-config 의 TAPEWORM_DESTINATIONS(개 전용
// 내부구충 vaccines 선언 파생)를 그대로 사용 — 촌충 치료 카드와 단일 출처.

export const EU_CHECKS: ProcedureCheck[] = [
  {
    id: 'eu.rabies-booster-within-prime-validity',
    country: EU_RABIES_REGIME,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간 이내에 해야 함. 만료 후 접종은 chain 이 끊겨 새 1차로 간주된다. 저장 거부(findRabiesChainBreak)의 짝이 되는 주의 — 펫무브워크는 저장을 막지 않고 절차검증만 보므로 이 룰이 없으면 운영자 화면에서 끊긴 chain 이 안 보인다.',
    severity: 'warning',
    addedAt: '2026-07-21',
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
  // ── 마이크로칩 ──
  {
    id: 'eu.microchip-before-rabies',
    country: EU_RABIES_REGIME,
    category: '마이크로칩',
    title: '마이크로칩, 백신 타이밍',
    description:
      '마이크로칩이 광견병 접종일보다 먼저 시술되어 있어야 함. 칩 시술 후의 접종만 인정. (EU Reg 576/2013) 백신 입력 시 client 차단(validateMicrochipBeforeBooster)과 짝.',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
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
    id: 'eu.rabies-prime-after-12weeks',
    country: EU_RABIES_REGIME,
    category: '광견병',
    title: '광견병 1차 접종 생후 12주(84일) 이상',
    description:
      '광견병 1차 접종일은 생년월일 기준 12주(84일) 이후여야 함. (EU Reg 576/2013 Annex III)',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
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
    id: 'eu.titer-min-30days-after-vaccine',
    country: EU_RABIES_REGIME,
    category: '광견병',
    title: '항체 검사는 광견병 접종 30일 후',
    description:
      'RNATT 채혈일은 직전(가장 최근) 광견병 접종으로부터 30일 이후여야 함. 직전 접종 이전의 접종은 무관 — 부스터 chain(연속 재접종)은 이미 합격한 검사를 재검사 면제할 뿐, 새 채혈의 30일 기산점을 더 이른 접종으로 당기지 않는다. (EU Reg 576/2013 Annex IV)',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const rabies = readRabiesEntries(caseRow)
      const titers = readTiterEntries(caseRow)
      if (titers.length === 0) return SKIP
      // 항체가 입력됐는데 선행 접종이 아예 없으면 — 접종 먼저 입력. 일본·중국의 chain-consistent
      // 와 문구 통일(EU 는 1회국이라 '2차' 대신 '광견병 백신').
      if (rabies.length === 0) {
        return {
          ok: false,
          message: '광견병 백신 정보가 없어요. 입력하세요.',
          offendingPaths: ['rabies_titer_records'],
        }
      }

      const offendingPaths: string[] = []
      const problems: string[] = []
      for (const t of titers) {
        // 채혈일 이전(당일 포함) 접종만 날짜순 정렬
        const priorDoses = rabies
          .filter((r) => r.date <= t.date)
          .sort((a, b) => a.date.localeCompare(b.date))
        if (priorDoses.length === 0) {
          offendingPaths.push(`rabies_titer_records[${t.originalIndex}].date`)
          // 순서 위반 — 일본·중국(validateTiterAfterBooster)과 동일 문구.
          problems.push(msgTiterBeforeVaccine())
          continue
        }
        // 30일 기산점 = 채혈 직전(가장 최근) 접종. 그 이전 접종은 무관 — chain 거슬러가기 X.
        // (chain 은 합격 검사 재검사 면제 조항일 뿐 30일 기산을 더 이른 접종으로 당기지 않는다.)
        const latest = priorDoses[priorDoses.length - 1]
        const gap = daysBetween(latest.date, t.date)
        if (gap === null || gap < 30) {
          offendingPaths.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push('광견병 항체 검사는 직전 접종일로부터 30일이 지난 후에 받아야 해요.')
        }
      }
      if (offendingPaths.length > 0) {
        return {
          ok: false,
          // 날짜 제거로 titer 여러 건이 같은 문장이 될 수 있어 중복 제거 후 결합.
          message: [...new Set(problems)].join(' / '),
          offendingPaths,
        }
      }
      return { ok: true, message: '항체 검사 시기 적합 (30일 경과).' }
    },
  },
  {
    id: 'eu.entry-min-3months-after-titer',
    country: EU_RABIES_REGIME,
    category: '광견병',
    title: '입국(예정)일은 항체 검사일 3개월(캘린더) 이후',
    description:
      'RNATT 채혈일로부터 입국일까지 최소 3개월 경과 필요. 캘린더 기준 — 달에 따라 89~92일이 될 수 있음. (EU Reg 576/2013 Article 12 — "at least three months before"). 2026-07-16: 입국일(entry_date) 입력 시 그 값, 미입력이면 출국일(departure_date)로 대체 — 대부분 보호자가 입국일까지는 입력하지 않고 두 날짜도 통상 당일·익일 차이라 출국일로도 충분히 근사됨.',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      const dep = readDepartureDate(caseRow, destination)
      const anchor = entry || dep
      const usingEntry = !!entry
      const anchorLabel = usingEntry ? '입국일' : '출국일'
      const titers = readTiterEntries(caseRow)
      if (!anchor || titers.length === 0) return SKIP

      // 가장 오래된 titer 부터 검사 — 채혈+3개월 ≤ 기준일 이면 통과
      const sorted = [...titers].sort((a, b) => a.date.localeCompare(b.date))
      const valid = sorted.find((t) => addMonths(t.date, 3) <= anchor)
      if (valid) {
        const days = daysBetween(valid.date, anchor)
        const earliestAnchorDate = addMonths(valid.date, 3)
        return {
          ok: true,
          message: `항체 검사(${valid.date}) + 3개월(${earliestAnchorDate}) ≤ ${anchorLabel}(${anchor}). 차이 ${days}일.`,
        }
      }

      // 모두 실패 — 가장 최신 titer 기준 메시지
      const newest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const days = daysBetween(newest.date, anchor)
      // 입국 가능일 = 가장 이른 채혈 + 3개월 (일본 180일 룰과 동일한 '날짜 유지' 포맷).
      const earliestEntry = addMonths(
        [...titers].sort((a, b) => a.date.localeCompare(b.date))[0].date,
        3,
      )
      const offending: string[] = [usingEntry ? 'entry_date' : 'departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      const message =
        days === null
          ? `항체 검사일과 ${anchorLabel}을 확인할 수 없어요.`
          : days < 0
            ? `${anchorLabel}이 광견병 항체 검사일보다 빨라요. 날짜를 확인하세요.`
            : earliestEntry
              ? `검사일로부터 3개월 후 ${formatKoreanDate(earliestEntry)}에 입국할 수 있어요.`
              : '광견병 항체 검사일로부터 3개월이 지나야 입국할 수 있어요.'
      return {
        ok: false,
        message,
        offendingPaths: offending,
      }
    },
  },
  {
    id: 'eu.rabies-valid-until-on-entry',
    country: EU_RABIES_REGIME,
    category: '광견병',
    title: '입국(예정)일 시점 광견병 면역 유효',
    description:
      '입국일에 가장 최근 광견병 접종의 면역 유효기간이 만료되지 않아야 함. EU 는 부스터 chain 유지 시 RNATT 결과는 무기한 유효 (재검사 불필요), chain 끊기면 1차부터 재시작. 2026-07-16: 입국일(entry_date) 입력 시 그 값, 미입력이면 출국일(departure_date)로 대체 — 두 날짜가 통상 당일·익일 차이라 출국일로도 충분히 근사됨.',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      const dep = readDepartureDate(caseRow, destination)
      const anchor = entry || dep
      const usingEntry = !!entry
      const rabies = readRabiesEntries(caseRow)
      if (!anchor || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      // 이미 만료(오늘 기준)는 common.rabies-validity-expired '주의'가 담당 — 여기선 아직
      // 유효한데 입국 시점에 만료 예정인 경우만 남긴다(만료 재구성 B, 2026-07-25).
      if (validUntil < todayKst()) return SKIP

      if (validUntil < anchor) {
        return {
          ok: false,
          message: `광견병 백신 면역 유효기간이 ${usingEntry ? '입국' : '출국'} 전에 만료돼요. 만료 전에 추가 접종을 하세요.`,
          offendingPaths: [
            usingEntry ? 'entry_date' : 'departure_date',
            `rabies_dates[${latest.originalIndex}].date`,
          ],
        }
      }
      return {
        ok: true,
        message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ ${usingEntry ? '입국일' : '출국일'}(${anchor}).`,
      }
    },
  },

  // ── 촌충 (UK·아일랜드·몰타·노르웨이·핀란드 한정) ──
  {
    id: 'eu.tapeworm-1to3days-before-entry',
    country: TAPEWORM_DESTINATIONS,
    category: '구충',
    title: '촌충 치료는 입국(예정)일 1~3일 전 (보수: 24-120시간 범위)',
    description:
      'Praziquantel(촌충 치료)은 입국 24시간 ~ 120시간(1~5일) 사이 투여 (EU Reg 2018/772 — 영국·아일랜드·몰타·노르웨이·핀란드). 사용자 보수 적용: 일 단위 검증 시 24h/120h 경계의 시간 정밀도 손실 위험으로 1~3일까지로 강화. 2026-07-16: 입국일(entry_date) 입력 시 그 값, 미입력이면 출국일(departure_date)로 대체 — 두 날짜가 통상 당일·익일 차이라 출국일로도 충분히 근사됨.',
    severity: 'warning',
    // 포털은 1~5일 입력불가(validateEchinococcusWindow)로 대체 — 운영자만 1~3일 보수 주의를 본다.
    audience: 'staff',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      const dep = readDepartureDate(caseRow, destination)
      const anchor = entry || dep
      const anchorLabel = entry ? '입국일' : '출국일'
      const entries = readInternalParasiteEntries(caseRow)
      if (!anchor || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const diff = daysBetween(latest.date, anchor)
      if (diff === null) return SKIP
      if (diff < 1 || diff > 3) {
        return {
          ok: false,
          message: `촌충 치료(${latest.date})부터 ${anchorLabel}(${anchor})까지 ${diff}일이에요. 1~3일 범위여야 해요 (24-120시간 보수 적용).`,
          offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `촌충 치료(${latest.date}) → ${anchorLabel}(${anchor}): ${diff}일.` }
    },
  },

  // ── 아일랜드 — 사전 통지 (Advance Notice, 입국 24시간 전) ──
  {
    id: 'eu.ie-advance-notice-24h-before-entry',
    country: ['ireland'],
    category: '사전통지',
    title: '사전 통지 마감 (입국 24시간 전)',
    description:
      '아일랜드 입국 24시간(1일) 전까지 Advance Notice Portal 로 사전 통지. 입력 차단(validateIeAdvanceNoticeDate)과 같은 함수 — 항공편 수정 후 어긋난 케이스를 주의로 표면화. (gov.ie)',
    severity: 'warning',
    addedAt: '2026-06-12',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const notice =
        typeof data.ie_advance_notice_date === 'string'
          ? data.ie_advance_notice_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(notice)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      const msg = validateIeAdvanceNoticeDate(notice, entry)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['ie_advance_notice_date', 'entry_date'] }
      }
      return { ok: true, message: entry ? `통지일(${notice}) 입국(${entry}) 1일 이전.` : `통지일(${notice}) 입력됨 (입국일 미입력).` }
    },
  },

  // ── 노르웨이 — Mattilsynet 사전 통지 (입국 48시간 전) ──────────────────
  {
    id: 'eu.no-advance-notice-48h-before-entry',
    country: ['norway'],
    category: '사전통지',
    title: '사전 통지 마감 (입국 48시간 전)',
    description:
      '노르웨이 입국 48시간(2일) 전까지 노르웨이 식품안전청(Mattilsynet)에 이메일로 사전 통지. 입력 차단(validateNoAdvanceNoticeDate)과 같은 함수 — 항공편 수정 후 어긋난 케이스를 주의로 표면화. (mattilsynet.no)',
    severity: 'warning',
    addedAt: '2026-07-16',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const notice =
        typeof data.no_advance_notice_date === 'string'
          ? data.no_advance_notice_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(notice)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      const msg = validateNoAdvanceNoticeDate(notice, entry)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['no_advance_notice_date', 'entry_date'] }
      }
      return { ok: true, message: entry ? `통지일(${notice}) 입국(${entry}) 48시간 이전.` : `통지일(${notice}) 입력됨 (입국일 미입력).` }
    },
  },

  // ── 키프로스 — 지구 수의검역국 사전 통지 (입국 48시간 전) ──────────────
  {
    id: 'eu.cy-advance-notice-48h-before-entry',
    country: ['cyprus'],
    category: '사전통지',
    title: '사전 통지 마감 (입국 48시간 전)',
    description:
      '키프로스 입국 48시간(2일) 전까지 관할 지구 수의검역국(라르나카/파포스)에 이메일로 사전 통지. 입력 차단(validateCyAdvanceNoticeDate)과 같은 함수 — 항공편 수정 후 어긋난 케이스를 주의로 표면화. (moa.gov.cy)',
    severity: 'warning',
    addedAt: '2026-07-16',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const notice =
        typeof data.cy_advance_notice_date === 'string'
          ? data.cy_advance_notice_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(notice)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      const msg = validateCyAdvanceNoticeDate(notice, entry)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['cy_advance_notice_date', 'entry_date'] }
      }
      return { ok: true, message: entry ? `통지일(${notice}) 입국(${entry}) 48시간 이전.` : `통지일(${notice}) 입력됨 (입국일 미입력).` }
    },
  },

  // ── 몰타 — 온라인 포털 사전 통지 (입국 3영업일 전) ──────────────────────
  {
    id: 'eu.mt-advance-notice-3days-before-entry',
    country: ['malta'],
    category: '사전통지',
    title: '사전 통지 마감 (입국 3영업일 전)',
    description:
      '몰타 입국 3영업일 전까지 온라인 포털(nldmalta.gov.mt)에 사전 통지 등록. 입력 차단(validateMtAdvanceNoticeDate)과 같은 함수 — 항공편 수정 후 어긋난 케이스를 주의로 표면화. (servizz.gov.mt)',
    severity: 'warning',
    addedAt: '2026-07-16',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const notice =
        typeof data.mt_advance_notice_date === 'string'
          ? data.mt_advance_notice_date.slice(0, 10)
          : ''
      if (!/^\d{4}-\d{2}-\d{2}$/.test(notice)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      const msg = validateMtAdvanceNoticeDate(notice, entry)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['mt_advance_notice_date', 'entry_date'] }
      }
      return { ok: true, message: entry ? `통지일(${notice}) 입국(${entry}) 3영업일 이전.` : `통지일(${notice}) 입력됨 (입국일 미입력).` }
    },
  },

  // ── 스위스 — FSVO 수입허가 (입국 3주 전) ──
  {
    id: 'eu.ch-import-permit-21days-before-entry',
    country: ['switzerland'],
    category: '수입허가',
    title: '수입허가 신청 마감 (입국 3주 전)',
    description:
      '스위스 수입허가(FSVO)는 입국 최소 3주(21일) 전 신청. 입력 차단(validateChImportPermitDate)과 같은 함수. (FSVO + petmove.co.kr 스위스 가이드)',
    severity: 'warning',
    addedAt: '2026-06-12',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const filed = readScopedImportPermitFiled(data, destination)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(filed)) return SKIP
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      const msg = validateChImportPermitDate(filed, entry)
      if (msg) {
        return {
          ok: false,
          message: msg,
          offendingPaths: ['import_permit_application_date', 'entry_date'],
        }
      }
      return { ok: true, message: entry ? `신청일(${filed}) 입국(${entry}) 21일 이전.` : `신청일(${filed}) 입력됨 (입국일 미입력).` }
    },
  },

  // ── 검사·증명서 일정 재검증 — 입력 차단과 같은 규칙을 매 렌더 재실행 (jp/th/ph 동일 모델) ──
  {
    id: 'eu.import-quarantine-date-valid',
    country: EU_REGIME,
    category: '검역',
    title: '입국 검사일',
    description: '입국 검사일은 도착(입국)일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-06-12',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.eu_import_quarantine_date === 'string'
          ? data.eu_import_quarantine_date.slice(0, 10)
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
          message: '입국 검사일은 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['eu_import_quarantine_date'],
        }
      }
      return { ok: true, message: `입국 검사일(${raw}) 도착 이후.` }
    },
  },
]
