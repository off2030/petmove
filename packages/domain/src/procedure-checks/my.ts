import type { ProcedureCheck } from './types'
import {
  daysBetween,
  evaluateRabiesAgeConservative,
  matchBannedBreed,
  readBreed,
  readExtraField,
  readGeneralVaccineEntries,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
} from './utils'

/**
 * 말레이시아 (DVS / JPV — Department of Veterinary Services) 절차 검증.
 *
 * 출처:
 *  - DVS Non-Scheduled Countries 규정 PDF (R2-CatsNdogs) —
 *    https://www.dvs.gov.my/dvs/resources/user_1/2025/BKPBV/IMPORT%20EKSPORT/(R2)-CatsNdogs-NONSCHEDULED_COUNTRIES-revised131213.docx_.pdf
 *  - DVS Procedure to Import Dogs and Cats —
 *    https://www.dvs.gov.my/dvs/resources/auto%20download%20images/56499641c998c.pdf
 *  - Animal Passport Portal — https://animalpassport.dvs.gov.my/portal-main/...
 *
 * 한국 = Non-Scheduled (Scheduled: AU/NZ/UK/IE/JP/SE/SG/BN). MAQIS 7일 의무 검역.
 *
 * 핵심 룰:
 *  - 마이크로칩 ISO 11784/11785, 광견병 백신 이전 식재 (DVS 명시)
 *  - 광견병: 생후 3개월 이상, 출국 30일 이상 전, 출국일 면역 유효 (DVS 명시)
 *  - 종합백신 (개 DHPPL+파라인플루엔자 / 고양이 FVRCP): 운용 표준 (DVS 1차 명문 미확인)
 *  - 건강증명서: 출국 7일 이내 (보수 ≤6) (DVS 명시)
 *
 * 별도 (시스템 검증 제외 또는 추가 권고):
 *  - RNATT: DVS 1차 명문 미확인. Non-Scheduled 출발 시 사실상 요구되는 사례 보고
 *  - eP-Permit: 발급 30일 유효, 출국 2-4주 전 신청
 *  - 금지 견종 (Pit Bull, Akita, Tosa 등 7종) / 제한 견종 (Rottweiler 등 6종)
 *
 * 컨벤션 (RU/CN/SG 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - 유효기간 1년 = 접종일 + 364일까지 인정
 */

const COUNTRY = 'malaysia'

export const MY_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'my.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      'ISO 11784/11785 마이크로칩이 광견병 1차 접종일과 같거나 이전이어야 함. (DVS Non-Scheduled: "identified using an ISO (Std 11784 & 11785) compliant microchip")',
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
    id: 'my.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'DVS Non-Scheduled: "shall not be less than 3 months of age at the time of import" — 안전 기준으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요.',
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
    id: 'my.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함.',
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

  // ── 종합백신 ──
  {
    id: 'my.general-vaccine-required',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신 접종 필수',
    description:
      '종합백신 접종 기록 필요. 강아지: DHPPL+파라인플루엔자 / 고양이: 범백혈구감소증 (FVRCP). (DVS 운용 표준 — Non-Scheduled 규정 PDF 1차 명문 미확인)',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const entries = readGeneralVaccineEntries(caseRow)
      if (entries.length === 0) {
        return {
          ok: false,
          message: '종합백신 기록 없음.',
          fixHint: '강아지: DHPPL/파라인플루엔자, 고양이: 범백혈구감소증(FVRCP) 접종 후 등록.',
        }
      }
      return { ok: true, message: `종합백신 ${entries.length}회 기록됨.` }
    },
  },
  {
    id: 'my.general-vaccine-valid-on-departure',
    country: COUNTRY,
    category: '종합백신',
    title: '출국일에 종합백신 면역 유효',
    description:
      '최근 종합백신의 면역 유효기간이 출국일 이전에 만료되지 않아야 함.',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      if (validUntil < dep) {
        return {
          ok: false,
          message: `최근 종합백신(${latest.date}) 유효기간(${validUntil}) < 출국일(${dep}) — 만료.`,
          fixHint: '출국 전 추가 접종 필요.',
          offendingPaths: ['departure_date', `general_vaccine_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 종합백신(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── 일정 ──
  {
    id: 'my.vet-visit-within-7days',
    country: COUNTRY,
    category: '일정',
    title: '건강증명서(내원일)는 출국 7일 이내 (보수: 6일 전부터)',
    description:
      'DVS Non-Scheduled: "examined and found to be healthy ... within seven (7) days immediately prior to export" — 출국 7일 이내(`≤6`). 사용자 보수 N-1 적용.',
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
      if (diff > 6) {
        return {
          ok: false,
          message: `내원일(${visit}) → 출국일(${dep}): ${diff}일 — 출국일 포함 7일 이내(≤6일 전) 필요.`,
          fixHint: `내원일을 ${dep} 기준 6일 전 이후로 조정.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      return { ok: true, message: `내원일(${visit}) → 출국일(${dep}): ${diff}일.` }
    },
  },

  // ── 서류 (eP-Permit) ──
  {
    id: 'my.epermit-validity-30days',
    country: COUNTRY,
    category: '서류',
    title: 'DVS eP-Permit 발급 후 30일 이내 도착',
    description:
      'DVS eP-Permit: "valid for 30 days from date of issuance" — 발급일로부터 30일 이내 도착. data.malaysia_extra.permit_issue_date 입력 시 검증.',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const issueDate = readExtraField(caseRow, 'permit_issue_date')
      if (!dep || !issueDate) return SKIP
      const days = daysBetween(issueDate, dep)
      if (days === null) return SKIP
      if (days < 0) {
        return {
          ok: false,
          message: `DVS eP-Permit 발급일(${issueDate})이 도착일(${dep})보다 늦음.`,
          offendingPaths: ['permit_issue_date'],
        }
      }
      if (days > 30) {
        return {
          ok: false,
          message: `DVS eP-Permit 발급일(${issueDate}) → 도착일(${dep}): ${days}일 — 30일 이내 도착 필요.`,
          fixHint: 'DVS 재발급 또는 도착일 조정.',
          offendingPaths: ['permit_issue_date'],
        }
      }
      return { ok: true, message: `eP-Permit(${issueDate}) → 도착일(${dep}): ${days}일 (30일 이내).` }
    },
  },

  // ── 수입 금지 견종 (DVS 7종) ──
  {
    id: 'my.banned-breeds',
    country: COUNTRY,
    category: '서류',
    title: '수입 금지 견종 (Pit Bull 계열, Akita, Tosa 등 7종)',
    description:
      'DVS 수입 금지: Akita, American Bulldog, Dogo Argentino, Fila Brasileiro, Japanese Tosa, Neapolitan Mastiff, Pit Bull Terrier (American Pit Bull, American Staffordshire Terrier, Staffordshire Bull Terrier 포함). 교잡 포함.',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const species = typeof data.species === 'string' ? data.species : ''
      if (species && species !== 'dog') return SKIP
      const breed = readBreed(caseRow)
      if (!breed.ko && !breed.en) return SKIP
      const match = matchBannedBreed(breed, [
        'akita', '아키타',
        'american bulldog', '아메리칸 불독',
        'dogo argentino', '도고 아르헨티노',
        'fila brasileiro', '필라 브라질레이로',
        'tosa', '도사',
        'neapolitan mastiff', '네아폴리탄 마스티프',
        'pit bull', 'pitbull', '핏불',
        'american staffordshire terrier', '아메리칸 스태퍼드셔',
        'staffordshire bull terrier', '스태퍼드셔 불 테리어',
      ])
      if (match) {
        return {
          ok: false,
          message: `견종 "${breed.ko || breed.en}"은 말레이시아 수입 금지 (매치: ${match}).`,
          fixHint: 'DVS 7종 수입 금지 견종 — 별도 가능 절차 없음.',
          offendingPaths: ['breed', 'breed_en'],
        }
      }
      return { ok: true, message: `견종 "${breed.ko || breed.en}" 금지 견종 아님.` }
    },
  },

  // ── 제한 견종 (DVS — MAQIS 특별 승인 필요) ──
  {
    id: 'my.restricted-breeds',
    country: COUNTRY,
    category: '서류',
    title: '제한 견종 (MAQIS 특별 승인 필요)',
    description:
      'DVS 제한 견종 (MAQIS 특별 승인 필요, 혈통서 필수, 상업 목적 금지): Bull Mastiff, Bull Terrier, Doberman, German Shepherd/Alsatian (Belgian, East European 포함), Perro de Presa Canario, Rottweiler.',
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const species = typeof data.species === 'string' ? data.species : ''
      if (species && species !== 'dog') return SKIP
      const breed = readBreed(caseRow)
      if (!breed.ko && !breed.en) return SKIP
      const match = matchBannedBreed(breed, [
        'bull mastiff', '불 마스티프',
        'bull terrier', '불 테리어',
        'doberman', '도베르만',
        'german shepherd', '저먼 셰퍼드', '독일 셰퍼드',
        'alsatian', '알자스 셰퍼드',
        'belgian shepherd', '벨지안 셰퍼드',
        'perro de presa canario', '프레사 카나리오',
        'rottweiler', '로트와일러',
      ])
      if (match) {
        return {
          ok: false,
          message: `견종 "${breed.ko || breed.en}"은 말레이시아 제한 견종 (매치: ${match}) — MAQIS 특별 승인 필요.`,
          fixHint: 'DVS 제한 견종은 MAQIS 사전 특별 승인 + 혈통서 필수. 상업 목적 수입 금지.',
          offendingPaths: ['breed', 'breed_en'],
        }
      }
      return { ok: true, message: `견종 "${breed.ko || breed.en}" 제한 견종 아님.` }
    },
  },
]
