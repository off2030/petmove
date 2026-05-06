import type { ProcedureCheck } from './types'
import {
  addMonths,
  daysBetween,
  readExternalParasiteEntries,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
} from './utils'

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
    severity: 'blocker',
    addedAt: '2026-05-06',
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
        message: `마이크로칩(${microchip})이 광견병 1차 접종(${first.date})보다 늦음.`,
        fixHint: '시술 후 광견병 1차 접종부터 다시 시작 필요.',
        offendingPaths: ['microchip_implant_date'],
      }
    },
  },

  // ── 광견병 (생후 12주 + 2회 평생 + 31일 간격 + 31일 이전 + 미만료) ──
  {
    id: 'hi.rabies-prime-after-12weeks',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 생후 12주(84일) 이상',
    description:
      '광견병 1차 접종은 생후 최소 12주(84일) 이후. (petmove 가이드 + EU 동일 기준 — HDOA 본문 미명시이나 안전 표준)',
    severity: 'blocker',
    addedAt: '2026-05-06',
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
          message: `1차 접종일(${first.date})이 생후 ${age}일령 — 최소 84일령(12주) 이상 필요.`,
          fixHint: `${birth} 기준 84일 이후로 1차 접종일을 조정하세요.`,
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${age}일령.` }
    },
  },
  {
    id: 'hi.rabies-2-doses-required',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 평생 2회 이상 접종',
    description:
      '광견병 백신은 평생 최소 2회. 1차 + 부스터 모두 필수. (HDOA: "vaccinated at least twice for rabies in its lifetime")',
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return SKIP
      if (rabies.length < 2) {
        return {
          ok: false,
          message: `광견병 1회만 기록됨(${rabies[0].date}) — 2회 필요.`,
          fixHint: '31일 후 부스터 추가.',
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
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
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
          msgs.push(`${v.prev.date} → ${v.curr.date}: ${v.gap}일 (≥31일 필요)`)
        }
        return {
          ok: false,
          message: msgs.join(' / '),
          fixHint: '도즈 간 최소 31일(more than 30 days) 간격 확보.',
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
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 31) {
        return {
          ok: false,
          message: `최근 접종(${latest.date}) → 출국(${dep}): ${days}일 (≥31일 필요).`,
          fixHint: `출국일을 ${latest.date} 기준 31일 이후로 조정하거나 추가 부스터를 더 일찍 접종.`,
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
      '최근 광견병 접종의 라이선스 booster interval 이 도착일 이전 만료되지 않아야 함. **접종일 포함**: 1년 라이선스 → +364일, 3년 라이선스 → +1094일 (3년-1일). valid_until 명시 시 그 값 사용 — 3년 백신은 valid_until 직접 입력 필수. 미명시 시 디폴트 1년 (`addOneYear`). (HDOA: "must not be expired when your pet arrives")',
    severity: 'blocker',
    addedAt: '2026-05-06',
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
          message: `최근 접종(${latest.date}) 유효기간(${validUntil}) < 출국일(${dep}) — 만료.`,
          fixHint: '출국 전 부스터 접종 (3년 라이선스 백신 사용 시 valid_until 직접 입력).',
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── FAVN (OIE-FAVN) ──
  {
    id: 'hi.favn-sample-30days-to-36months-before-arrival',
    country: COUNTRY,
    category: '광견병',
    title: 'FAVN 채혈은 출국(=도착) 30일 ~ 36개월 전',
    description:
      'FAVN lab 수령일 기준 30일 ≤ 도착일 ≤ 36개월. 시스템에 수령일 필드 없어 채혈일(`rabies_titer_records[].date`) 을 보수 proxy 로 사용 (실제 수령일은 며칠 늦어 더 strict 함). (HDOA Step 4 + Step 5)',
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      // 가장 유리한 채혈 = 30일~36개월 범위 안에 들어가는 것. 하나라도 통과하면 OK.
      const valid = titers.find((t) => {
        const days = daysBetween(t.date, dep)
        if (days === null) return false
        const upper = addMonths(t.date, 36)
        return days >= 30 && upper >= dep
      })
      if (valid) {
        const days = daysBetween(valid.date, dep)
        return { ok: true, message: `FAVN(${valid.date}) → 출국(${dep}): ${days}일 (30일 이상, 36개월 이내).` }
      }

      // 모두 실패 — 가장 최신 기준 메시지
      const newest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const days = daysBetween(newest.date, dep)
      const upper = addMonths(newest.date, 36)
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      const reason =
        days === null
          ? '날짜 형식 오류'
          : days < 0
            ? `채혈일(${newest.date})이 출국일(${dep}) 이후`
            : days < 30
              ? `FAVN(${newest.date}) → 출국(${dep}): ${days}일 — 30일 미달 (대기 부족)`
              : `FAVN(${newest.date}) + 36개월(${upper}) < 출국일(${dep}) — 36개월 초과 (재검사 필요)`
      return {
        ok: false,
        message: reason,
        fixHint: '출국일 조정 또는 FAVN 재검사. 실제 lab 수령일 기준이라 채혈일에서 며칠 더 여유 두는 것이 안전.',
        offendingPaths: offending,
      }
    },
  },

  // ── 일정 ──
  {
    id: 'hi.health-cert-within-10days',
    country: COUNTRY,
    category: '일정',
    title: '건강증명서(내원일)는 출국 10일 이내 (한국 APQA 규정)',
    description:
      '건강증명서(영문 원본) 검진은 출국일 기준 10일 이내(`≤9`). HDOA 자체는 14일 허용이나 한국 APQA 검역 endorsement 룰이 더 strict (10일) — 한국 출국 케이스에는 더 엄격한 룰 적용. 도착 시 원본 미지참 시 release 거부.',
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const visit = typeof data.vet_visit_date === 'string' ? data.vet_visit_date : ''
      if (!dep || !visit) return SKIP

      const diff = daysBetween(visit, dep)
      if (diff === null) {
        return { ok: false, message: '날짜 형식 오류.', offendingPaths: ['vet_visit_date'] }
      }
      if (diff < 0) {
        return {
          ok: false,
          message: `내원일(${visit})이 출국일(${dep})보다 늦음.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      if (diff > 9) {
        return {
          ok: false,
          message: `내원일(${visit}) → 출국일(${dep}): ${diff}일 — 출국 포함 10일 이내(≤9일 전) 필요 (한국 APQA 규정).`,
          fixHint: `내원일을 ${dep} 기준 9일 전 이후로 조정하세요.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      return { ok: true, message: `내원일(${visit}) → 출국일(${dep}): ${diff}일.` }
    },
  },

  // ── 진드기 ──
  {
    id: 'hi.tick-treatment-within-14days',
    country: COUNTRY,
    category: '구충',
    title: '진드기 처치는 출국 14일 이내 (long-acting product)',
    description:
      '도착일 기준 14일 이내(`≤13`) 장시간 작용 진드기 구제 (Revolution 불가, Frontline/Bravecto 등 tick label 제품). 제품명·날짜는 건강증명서에 기재. (HDOA Step 6: "within 14 days of arrival")',
    severity: 'blocker',
    addedAt: '2026-05-06',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const entries = readExternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 0) {
        return {
          ok: false,
          message: `진드기 처치일(${latest.date})이 출국일(${dep})보다 늦음.`,
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      if (days > 13) {
        return {
          ok: false,
          message: `최근 진드기 처치(${latest.date}) → 출국(${dep}): ${days}일 — 출국 포함 14일 이내(≤13일 전) 필요.`,
          fixHint: `처치일을 ${dep} 기준 13일 전 이후로 조정. Long-acting tick 제품 (Revolution 불가).`,
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 진드기 처치(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },

]
