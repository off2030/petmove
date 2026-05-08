import type { ProcedureCheck } from './types'
import {
  daysBetween,
  evaluateRabiesAgeConservative,
  findSameGuardianCases,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
} from './utils'

/**
 * 모로코 (ONSSA — Office National de Sécurité Sanitaire des Produits Alimentaires) 절차 검증.
 *
 * 출처:
 *  - ONSSA "Importation des chiens et chats" — https://www.onssa.gov.ma/controle-a-limportation-et-a-lexportation/controle-a-limportation/importation-des-animaux-vivants/chiens-et-chats/?lang=en
 *  - ONSSA EU 수입 PDF — https://www.onssa.gov.ma/wp-content/uploads/2023/07/Importation-au-Maroc-de-chiens-et-chats-a-partir-de-lUE.pdf
 *  - ONSSA "Models of health certificates" — https://www.onssa.gov.ma/models-of-health-certificates/?lang=en
 *
 * 핵심 룰:
 *  - 마이크로칩: ISO 11784/11785 (15자리), 광견병 백신 이전 또는 동일일 식재
 *  - 광견병: 1차 ≥ 생후 12주(91일 보수) + **출국 ≥ 접종 + 30일** (1차 시 21일+ 운용) + 출국일 면역 유효, 불활화 백신
 *  - 건강증명서: 출국일(항공기 탑승) 10일 이내 (보수 ≤9). ONSSA EU 양식은 24시간이나 일반 운용 10일.
 *
 * 별도 (시스템 검증 제외):
 *  - RNATT: 모로코 영구 체류 시 면제. 비영구 체류·재출국 시 채혈 후 30일+ 필요 (한국 귀국용 별도)
 *  - 종합백신: ONSSA 명시 의무 부재
 *  - 비상업 1인 5두 이하
 *
 * 컨벤션 (MX/RU/MY 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - 유효기간 1년 = 접종일 + 364일까지 인정
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
      'ISO 11784/11785 마이크로칩이 광견병 1차 접종일과 같거나 이전이어야 함. (ONSSA: 2011-07-03 이전 판독 가능 문신만 예외)',
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
    id: 'ma.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'ONSSA: "12주(3개월) 이상 접종" — 안전 기준으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요.',
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
    id: 'ma.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 30일 이상 전',
    description:
      '광견병 접종일로부터 출국일까지 최소 30일(한 달) 경과 필요. (ONSSA EU 양식 운용 표준 — 1차는 21일+, 일반은 30일)',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const earliest = rabies[0]
      const days = daysBetween(earliest.date, dep)
      if (days === null) return SKIP
      if (days < 30) {
        return {
          ok: false,
          message: `광견병 접종(${earliest.date}) → 출국일(${dep}): ${days}일 — 30일 이상 필요.`,
          fixHint: `광견병 접종을 출국일 ${dep} 기준 30일 이전에 완료하세요.`,
          offendingPaths: [`rabies_dates[${earliest.originalIndex}].date`, 'departure_date'],
        }
      }
      return { ok: true, message: `광견병 접종(${earliest.date}) → 출국일(${dep}): ${days}일.` }
    },
  },
  {
    id: 'ma.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함. (ONSSA: 제조사 라벨 유효기간 내)',
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

  // ── 일정 ──
  {
    id: 'ma.vet-visit-within-10days',
    country: COUNTRY,
    category: '일정',
    title: '건강증명서(내원일)는 출국 10일 이내 (보수: 9일 전부터)',
    description:
      'ONSSA EU 양식은 24시간 이내 — 일반 운용 10일. 한국 APQA 정부 수의관 발급. 사용자 보수 N-1 → ≤9 적용.',
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

  // ── 보호자 한도 (비상업 5두 이하) ──
  {
    id: 'ma.max-5pets-non-commercial',
    country: COUNTRY,
    category: '서류',
    title: '비상업 1인 5마리 이하 (ONSSA)',
    description:
      'ONSSA: 비상업 목적 1인당 5두 이하 통상 인정. 동일 보호자(이름·영문이름·전화·국내주소 일치)가 모로코 목적 케이스 6건 이상 등록 시 경고.',
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow, relatedCases }) => {
      if (relatedCases === undefined) return SKIP
      const others = findSameGuardianCases(caseRow, relatedCases, { sameDestination: true })
      if (others.length + 1 > 5) {
        return {
          ok: false,
          message: `같은 보호자(${caseRow.customer_name})가 모로코 목적 케이스 ${others.length + 1}건 등록 — 비상업 5두 한도 초과.`,
          fixHint: 'ONSSA: 1인 비상업 5두 한도. 추가는 상업 수입 절차 필요.',
          offendingPaths: ['customer_name'],
        }
      }
      return { ok: true, message: '보호자 케이스 ≤ 5건.' }
    },
  },
]
