import type { ProcedureCheck } from './types'
import {
  daysBetween,
  evaluateRabiesAgeConservative,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
} from './utils'

/**
 * 인도네시아 (BARANTIN / Karantina Indonesia — Indonesian Quarantine Agency, 구 Karantina Pertanian) 절차 검증.
 *
 * 출처:
 *  - karantinaindonesia.go.id "Impor Hewan dan Produk Hewan" — https://karantinaindonesia.go.id/hal/Impor-Hewan-dan-Produk-Hewan
 *  - embassyofindonesia.org "Pet Animal Quarantine" — https://www.embassyofindonesia.org/pet-animal-quarantine/
 *  - Soekarno-Hatta Karantina Pertanian — https://soekarnohatta.karantina.pertanian.go.id/layanan/karantina-hewan/persyaratan-karantina-hewan
 *  - Permentan No. 15 Tahun 2021 (동물·동물성제품 반입·반출)
 *
 * ⚠️ **발리·NTB·NTT·Maluku·Papua·Kalbar 직접 반입 금지**. 한국발은 **자카르타 CGK 한정**.
 *
 * 핵심 룰:
 *  - 마이크로칩: 실무상 ISO 11784/11785 요구 (BARANTIN 1차 명문 미확인)
 *  - 광견병: 출국 30일 이상 ~ 12개월 이내, 생후 90일 이상, 임신·수유 중 불가
 *  - **RNATT ≥ 0.5 IU/ml** (BARANTIN 명시), 채혈 ≥ 광견병 + 30일 (보수)
 *  - 건강증명서 출국 10일 이내 (보수 ≤9, 1차 일자 명문 모호)
 *  - BARANTIN IKH 14일 격리 (요건 미충족 시 최대 4-6개월)
 *  - 수입허가 (Surat Persetujuan Pemasukan): 발급 후 3개월 유효, 처리 1-2개월
 *  - 도착 2일 전 PPK Online 사전 통보
 *
 * 컨벤션 (RU/MX/IL 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - 유효기간 1년 = 접종일 + 364일까지 인정
 */

const COUNTRY = 'indonesia'

export const ID_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'id.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      'ISO 표준 마이크로칩이 광견병 1차 접종일과 같거나 이전이어야 함. (BARANTIN 운용 표준 — 광견병 백신·항체검사 식별 연계 필요)',
    severity: 'blocker',
    addedAt: '2026-05-07',
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

  // ── 광견병 ──
  {
    id: 'id.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'BARANTIN: "at least 90 days old at the time of export/shipment" — 안전 기준으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요.',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
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
            ? `생후 ${ev.ageInDays}일령 — 91일 미달`
            : ev.failedRule === 'calendar3m'
              ? `${first.date} < 캘린더 3개월(${ev.calendar3mThreshold})`
              : `생후 ${ev.ageInDays}일령 + ${first.date} < 캘린더 3개월(${ev.calendar3mThreshold})`
        return {
          ok: false,
          message: `1차 접종일(${first.date}) 보수적 기준 미충족 — ${reason}.`,
          fixHint: `생후 91일 AND ${ev.calendar3mThreshold}(캘린더 3개월) 둘 다 충족 이후로 1차 접종일을 조정하세요.`,
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${ev.ageInDays}일령 + 캘린더 3개월(${ev.calendar3mThreshold}) 충족.` }
    },
  },
  {
    id: 'id.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간(1년)이 출국일 이전에 만료되지 않아야 함. (BARANTIN: "vaccination performed at least 30 days and not more than 1 year prior to export/shipment")',
    severity: 'blocker',
    addedAt: '2026-05-07',
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
          fixHint: '출국 전 부스터 접종 필요.',
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── RNATT (인도네시아 입국 필수) ──
  {
    id: 'id.rnatt-min-30days-after-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '항체검사는 광견병 접종 30일 이후',
    description:
      'RNATT 채혈일은 직전 광견병 접종으로부터 30일 이후. (BARANTIN 본문 명시 부재 — EU/TR/IL/UA OIE 표준 차용 보수적 기준)',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      const titers = readTiterEntries(caseRow)
      if (rabies.length === 0 || titers.length === 0) return SKIP

      const offending: string[] = []
      const problems: string[] = []
      for (const t of titers) {
        const priorDoses = rabies.filter((r) => r.date <= t.date)
        if (priorDoses.length === 0) {
          offending.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push(`채혈일(${t.date}) 이전 광견병 접종 기록 없음`)
          continue
        }
        const latest = priorDoses[priorDoses.length - 1]
        const gap = daysBetween(latest.date, t.date)
        if (gap === null || gap < 30) {
          offending.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push(`채혈(${t.date}) - 직전접종(${latest.date}) = ${gap ?? '?'}일 (<30일)`)
        }
      }
      if (offending.length > 0) {
        return {
          ok: false,
          message: problems.join(' / '),
          fixHint: '채혈일을 직전 광견병 접종일로부터 30일 이후로 조정하세요.',
          offendingPaths: offending,
        }
      }
      return { ok: true, message: '항체검사 시기 적합 (30일 경과).' }
    },
  },

  // ── 일정 ──
  {
    id: 'id.vet-visit-within-10days',
    country: COUNTRY,
    category: '일정',
    title: '건강증명서(내원일)는 출국 10일 이내 (보수: 9일 전부터)',
    description:
      'BARANTIN 자체 일자 명시 모호. 한국 APQA endorsement 10일 룰 + 사용자 보수 N-1 → ≤9 적용.',
    severity: 'blocker',
    addedAt: '2026-05-07',
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
          message: `내원일(${visit}) → 출국일(${dep}): ${diff}일 — 출국일 포함 10일 이내(≤9일 전) 필요.`,
          fixHint: `내원일을 ${dep} 기준 9일 전 이후로 조정.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      return { ok: true, message: `내원일(${visit}) → 출국일(${dep}): ${diff}일.` }
    },
  },
]
