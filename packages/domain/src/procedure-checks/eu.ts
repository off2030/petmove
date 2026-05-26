import type { ProcedureCheck } from './types'
import {
  addMonths,
  daysBetween,
  readInternalParasiteEntries,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
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
 *  ③ 항체검사 ≥ 직전 접종 + 30일
 *  ④ 출국 ≥ 항체검사 + 3개월 (캘린더 기준, 90일 아님)
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
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      '마이크로칩이 광견병 1차 접종일보다 먼저 시술되어 있어야 함. 칩 시술 후의 접종만 인정. (EU Reg 576/2013)',
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow }) => {
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
        message: `마이크로칩(${microchip})이 광견병 1차 접종(${first.date})보다 늦습니다.`,
        fixHint: '시술 후 광견병 1차 접종부터 다시 시작해야 합니다.',
        offendingPaths: ['microchip_implant_date'],
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
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow }) => {
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
          message: `1차 접종일(${first.date})이 생후 ${age}일령입니다. 최소 84일령(12주) 이상이어야 합니다.`,
          fixHint: `${birth} 기준 84일 이후로 1차 접종일을 조정하세요.`,
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
    title: '항체검사는 광견병 접종 30일 후',
    description:
      'RNATT 채혈일은 직전 광견병 접종(1차 또는 부스터)으로부터 30일 이후여야 함. (EU Reg 576/2013 Annex IV)',
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      const titers = readTiterEntries(caseRow)
      if (rabies.length === 0 || titers.length === 0) return SKIP

      const offendingPaths: string[] = []
      const problems: string[] = []
      for (const t of titers) {
        const priorDoses = rabies.filter((r) => r.date <= t.date)
        if (priorDoses.length === 0) {
          offendingPaths.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push(`채혈일(${t.date}) 이전의 광견병 접종 기록이 없습니다.`)
          continue
        }
        const latest = priorDoses[priorDoses.length - 1]
        const gap = daysBetween(latest.date, t.date)
        if (gap === null || gap < 30) {
          offendingPaths.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push(`채혈일(${t.date})과 직전 접종일(${latest.date})의 간격이 ${gap ?? '?'}일로 30일 미만입니다.`)
        }
      }
      if (offendingPaths.length > 0) {
        return {
          ok: false,
          message: problems.join(' / '),
          fixHint: '채혈일을 직전 광견병 접종일로부터 30일 이후로 조정하세요.',
          offendingPaths,
        }
      }
      return { ok: true, message: '항체검사 시기 적합 (30일 경과).' }
    },
  },
  {
    id: 'eu.departure-min-3months-after-titer',
    country: EU_REGIME,
    category: '광견병',
    title: '출국일은 항체검사일 3개월(캘린더) 이후',
    description:
      'RNATT 채혈일로부터 출국일까지 최소 3개월 경과 필요. 캘린더 기준 — 달에 따라 89~92일이 될 수 있음. (EU Reg 576/2013 Article 12 — "at least three months before")',
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
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
          message: `항체검사(${valid.date}) + 3개월(${earliestDep}) ≤ 출국일(${dep}). 차이 ${days}일.`,
        }
      }

      // 모두 실패 — 가장 최신 titer 기준 메시지
      const newest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const days = daysBetween(newest.date, dep)
      const earliestDep = addMonths(newest.date, 3)
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      const message =
        days === null
          ? '항체검사일과 출국일을 확인할 수 없습니다.'
          : days < 0
            ? `항체검사일(${newest.date})이 출국일(${dep})보다 이후입니다. 채혈은 출국 전에 완료되어야 합니다.`
            : `항체검사(${newest.date}) + 3개월(${earliestDep})이 출국일(${dep})보다 늦습니다. 출국까지 ${days}일로 3개월에 미달합니다.`
      return {
        ok: false,
        message,
        fixHint: `출국일을 ${earliestDep} 이후로 조정하거나 더 이른 항체검사가 필요합니다.`,
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
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP

      if (validUntil < dep) {
        return {
          ok: false,
          message: `최근 접종(${latest.date})의 유효기간(${validUntil})이 출국일(${dep}) 이전에 만료됩니다.`,
          fixHint: '출국 전 추가 접종이 필요합니다. 부스터 chain이 끊기면 RNATT 재검사가 필요합니다.',
          offendingPaths: [
            'departure_date',
            `rabies_dates[${latest.originalIndex}].date`,
          ],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── 일정 ──
  {
    id: 'eu.vet-visit-within-10days-of-departure',
    country: EU_REGIME,
    category: '일정',
    title: '내원일은 출국일 10일 이내',
    description:
      '동물 건강증명서 발급 검진은 EU 입국 10일 이내 시점이어야 함. (EU Reg 577/2013 Annex IV)',
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const visit = typeof data.vet_visit_date === 'string' ? data.vet_visit_date : ''
      if (!dep || !visit) return SKIP

      const diff = daysBetween(visit, dep)
      if (diff === null) {
        return { ok: false, message: '날짜 형식이 올바르지 않습니다.', offendingPaths: ['vet_visit_date'] }
      }
      if (diff < 0) {
        return {
          ok: false,
          message: `내원일(${visit})이 출국일(${dep})보다 늦습니다.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      if (diff > 9) {
        return {
          ok: false,
          message: `내원일(${visit})부터 출국일(${dep})까지 ${diff}일입니다. 출국일 포함 10일 이내(9일 전 이후)여야 합니다.`,
          fixHint: `내원일을 ${dep} 기준 9일 전 이후로 조정하세요.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      return { ok: true, message: `내원일(${visit}) → 출국일(${dep}): ${diff}일.` }
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
    severity: 'info',
    addedAt: '2026-05-05',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const entries = readInternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const diff = daysBetween(latest.date, dep)
      if (diff === null) return SKIP
      if (diff < 1 || diff > 3) {
        return {
          ok: false,
          message: `촌충구충(${latest.date})부터 출국일(${dep})까지 ${diff}일입니다. 1~3일 범위여야 합니다 (24-120시간 보수 적용).`,
          fixHint: `촌충구충일을 ${dep} 기준 1~3일 전 사이로 조정하세요.`,
          offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `촌충구충(${latest.date}) → 출국일(${dep}): ${diff}일.` }
    },
  },
]
