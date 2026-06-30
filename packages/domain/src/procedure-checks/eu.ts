import {
  buildDateRuleContext,
  validateChImportPermitDate,
  validateIeAdvanceNoticeDate,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  addMonths,
  daysBetween,
  readInternalParasiteEntries,
  readRabiesEntries,
  readScopedImportPermitFiled,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
  readVetVisitDate,
} from './utils'

/**
 * 유럽연합·영국·스위스·EFTA(노르웨이) 절차 검증.
 *
 * 출처:
 *  - EU Reg 576/2013 (Pet Travel Scheme), 577/2013 (Annex IV — 한국 등 list 외 제3국)
 *  - EU Reg 2018/772 (촌충 — 영국·아일랜드·몰타·노르웨이·핀란드)
 *  - 영국: EU 탈퇴 후에도 동일 규제 유지 (Pet Travel from listed third country)
 *  - 스위스: EU 와 동일 규칙 + 별도 BLV 신청서
 *
 * 한국 (Annex II Part 2 — listed third country) → EU/UK/CH 입국 공통 요건:
 *  ① 마이크로칩 ≤ 광견병 1차 접종
 *  ② 1차 접종 ≥ 생후 12주 (84일)
 *  ③ 항체 검사 ≥ 직전 접종 + 30일
 *  ④ 출국 ≥ 항체 검사 + 3개월 (캘린더 기준, 90일 아님)
 *  ⑤ 출국 시 광견병 면역 유효
 *  ⑥ 내원·증명서 ≤ 출국 10일 이내
 *  ⑦ (촌충국가 한정) 촌충구충 24-120시간 (1-5일) 전
 *
 * 부스터 chain 만 유지되면 RNATT 결과는 무기한 유효 — 별도 만료 룰 없음.
 */

/** EU 규제 패밀리 — 같은 규칙 적용. */
const EU_REGIME: string[] = [
  'eu',
  'ireland',
  'malta',
  'norway',
  'finland',
  'uk',
  'switzerland',
]

/** 촌충 의무국가 — Reg 2018/772. */
const TAPEWORM_DESTINATIONS: string[] = ['ireland', 'malta', 'norway', 'finland', 'uk']

export const EU_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'eu.microchip-before-rabies',
    country: EU_REGIME,
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
        message: '접종일은 마이크로칩 삽입일 이후여야 해요.',
        offendingPaths: ['microchip_implant_date', `rabies_dates[${first.originalIndex}].date`],
      }
    },
  },

  // ── 광견병 ──
  {
    id: 'eu.rabies-prime-after-12weeks',
    country: EU_REGIME,
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
          message: '광견병 접종은 생후 84일(12주)이 지나서 할 수 있어요',
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${age}일령.` }
    },
  },
  {
    id: 'eu.titer-min-30days-after-vaccine',
    country: EU_REGIME,
    category: '광견병',
    title: '항체 검사는 광견병 접종 30일 후',
    description:
      'RNATT 채혈일은 직전(가장 최근) 광견병 접종으로부터 30일 이후여야 함. 직전 접종 이전의 접종은 무관 — 부스터 chain(연속 재접종)은 이미 합격한 검사를 재검사 면제할 뿐, 새 채혈의 30일 기산점을 더 이른 접종으로 당기지 않는다. (EU Reg 576/2013 Annex IV)',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const rabies = readRabiesEntries(caseRow)
      const titers = readTiterEntries(caseRow)
      if (rabies.length === 0 || titers.length === 0) return SKIP

      const offendingPaths: string[] = []
      const problems: string[] = []
      for (const t of titers) {
        // 채혈일 이전(당일 포함) 접종만 날짜순 정렬
        const priorDoses = rabies
          .filter((r) => r.date <= t.date)
          .sort((a, b) => a.date.localeCompare(b.date))
        if (priorDoses.length === 0) {
          offendingPaths.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push(`채혈일(${t.date}) 이전의 광견병 접종 기록이 없어요.`)
          continue
        }
        // 30일 기산점 = 채혈 직전(가장 최근) 접종. 그 이전 접종은 무관 — chain 거슬러가기 X.
        // (chain 은 합격 검사 재검사 면제 조항일 뿐 30일 기산을 더 이른 접종으로 당기지 않는다.)
        const latest = priorDoses[priorDoses.length - 1]
        const gap = daysBetween(latest.date, t.date)
        if (gap === null || gap < 30) {
          offendingPaths.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push(`채혈일(${t.date})과 직전 접종(${latest.date})의 간격이 ${gap ?? '?'}일로 30일 미만이에요.`)
        }
      }
      if (offendingPaths.length > 0) {
        return {
          ok: false,
          message: problems.join(' / '),
          offendingPaths,
        }
      }
      return { ok: true, message: '항체 검사 시기 적합 (30일 경과).' }
    },
  },
  {
    id: 'eu.departure-min-3months-after-titer',
    country: EU_REGIME,
    category: '광견병',
    title: '출국일은 항체 검사일 3개월(캘린더) 이후',
    description:
      'RNATT 채혈일로부터 출국일까지 최소 3개월 경과 필요. 캘린더 기준 — 달에 따라 89~92일이 될 수 있음. (EU Reg 576/2013 Article 12 — "at least three months before")',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      // 가장 오래된 titer 부터 검사 — 채혈+3개월 ≤ 출국 이면 통과
      const sorted = [...titers].sort((a, b) => a.date.localeCompare(b.date))
      const valid = sorted.find((t) => addMonths(t.date, 3) <= dep)
      if (valid) {
        const days = daysBetween(valid.date, dep)
        const earliestDep = addMonths(valid.date, 3)
        return {
          ok: true,
          message: `항체 검사(${valid.date}) + 3개월(${earliestDep}) ≤ 출국일(${dep}). 차이 ${days}일.`,
        }
      }

      // 모두 실패 — 가장 최신 titer 기준 메시지
      const newest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const days = daysBetween(newest.date, dep)
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      const message =
        days === null
          ? '항체 검사일과 출국일을 확인할 수 없어요.'
          : days < 0
            ? `출국일(${dep})이 광견병 항체 검사일(${newest.date}) 보다 빨라요. 날짜를 확인하세요.`
            : `광견병 항체 검사(${newest.date}) 후 3개월 이상 지나야 해요.`
      return {
        ok: false,
        message,
        offendingPaths: offending,
      }
    },
  },
  {
    id: 'eu.rabies-valid-until-on-departure',
    country: EU_REGIME,
    category: '광견병',
    title: '출국일 시점 광견병 면역 유효',
    description:
      '출국일에 가장 최근 광견병 접종의 면역 유효기간이 만료되지 않아야 함. EU 는 부스터 chain 유지 시 RNATT 결과는 무기한 유효 (재검사 불필요), chain 끊기면 1차부터 재시작.',
    severity: 'warning',
    addedAt: '2026-05-05',
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
          message: '광견병 백신 면역 유효기간이 출국 전에 만료돼요. 만료 전에 추가 접종을 하세요.',
          offendingPaths: [
            'departure_date',
            `rabies_dates[${latest.originalIndex}].date`,
          ],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── 촌충 (UK·아일랜드·몰타·노르웨이·핀란드 한정) ──
  {
    id: 'eu.tapeworm-1to3days-before-departure',
    country: TAPEWORM_DESTINATIONS,
    category: '구충',
    title: '촌충구충은 출국일 1~3일 전 (보수: 24-120시간 범위)',
    description:
      'Praziquantel(촌충구충)은 입국 24시간 ~ 120시간(1~5일) 사이 투여 (EU Reg 2018/772 — 영국·아일랜드·몰타·노르웨이·핀란드). 사용자 보수 적용: 일 단위 검증 시 24h/120h 경계의 시간 정밀도 손실 위험으로 1~3일까지로 강화.',
    severity: 'warning',
    addedAt: '2026-05-05',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readInternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const diff = daysBetween(latest.date, dep)
      if (diff === null) return SKIP
      if (diff < 1 || diff > 3) {
        return {
          ok: false,
          message: `촌충구충(${latest.date})부터 출국일(${dep})까지 ${diff}일이에요. 1~3일 범위여야 해요 (24-120시간 보수 적용).`,
          offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `촌충구충(${latest.date}) → 출국일(${dep}): ${diff}일.` }
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
  {
    id: 'eu.export-cert-date-valid',
    country: EU_REGIME,
    category: '검역',
    title: '귀국 서류 준비 완료일',
    description: '귀국 서류 준비 완료일은 도착(입국)일 이후·한국 귀국일 이전이어야 함.',
    severity: 'warning',
    addedAt: '2026-06-12',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.eu_export_quarantine_date === 'string'
          ? data.eu_export_quarantine_date.slice(0, 10)
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
          message: '귀국 서류 준비 완료일은 도착(입국)일보다 빠를 수 없어요.',
          offendingPaths: ['eu_export_quarantine_date'],
        }
      }
      if (ret && raw > ret) {
        return {
          ok: false,
          message: '귀국 서류 준비 완료일은 한국 귀국일보다 늦을 수 없어요.',
          offendingPaths: ['eu_export_quarantine_date'],
        }
      }
      return { ok: true, message: `준비 완료일(${raw}) 체류 구간 내.` }
    },
  },
]
