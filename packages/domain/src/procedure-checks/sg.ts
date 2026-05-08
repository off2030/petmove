import type { ProcedureCheck } from './types'
import {
  addYears,
  daysBetween,
  evaluateRabiesAgeConservative,
  matchBannedBreed,
  readBreed,
  readExternalParasiteEntries,
  readGeneralVaccineEntries,
  readInternalParasiteEntries,
  readRabiesEntries,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
} from './utils'

/**
 * 싱가포르 (NParks/AVS Schedule III) 절차 검증.
 *
 * 출처: NParks/AVS "Veterinary Certificate for Import of Dogs and Cats — Schedule III",
 * Section IV (Veterinary Certification).
 * Schedule III = Schedule I/II 국가 발 (한국 포함).
 *
 * 컨벤션: jp.ts 와 동일.
 *  - 필수 입력 누락 시 SKIP (ok: true, 색상·알림 없음)
 *  - 유효기간은 `addYears(d, 1)` (1주년 -1일, 즉 364일째까지) → "유효기간 1년" 보수 해석
 *  - offendingPaths 로 문제 필드 경로를 알려주면 상세페이지에서 색상·툴팁 표시
 */

export const SG_CHECKS: ProcedureCheck[] = [
  // ── 일정 ──
  {
    id: 'sg.vet-visit-within-7days-of-departure',
    country: 'singapore',
    category: '일정',
    title: '내원일은 출국일 7일 이내 (보수: 6일 전부터)',
    description:
      '수의사 검진·증명서 발급은 출국일 기준 7일 이내(`≤6`)여야 함. (NParks/AVS Schedule III IV(a)(i)(ii) "not more than seven (7) days prior to export" — 사용자 보수 N-1 적용)',
    severity: 'blocker',
    addedAt: '2026-05-05',
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
          fixHint: `내원일을 ${dep} 기준 6일 전 이후로 조정하세요.`,
          offendingPaths: ['vet_visit_date'],
        }
      }
      return { ok: true, message: `내원일(${visit}) → 출국일(${dep}): ${diff}일.` }
    },
  },

  // ── 광견병 ──
  {
    id: 'sg.rabies-prime-after-91days-old',
    country: 'singapore',
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'NParks/AVS 는 "제조사 권장"으로만 표기되어 정량 기준 미명시 — 안전 기준으로 생후 91일 AND 캘린더 3개월(`addMonths(birth, 3)`) 둘 다 충족 필요. 출생일에 따라 어느 쪽이 더 엄격한지 달라지므로 AND 결합.',
    severity: 'blocker',
    addedAt: '2026-05-05',
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
    id: 'sg.titer-min-28days-after-vaccine',
    country: 'singapore',
    category: '광견병',
    title: '항체검사는 광견병 접종 28일 후',
    description:
      'RNATT 채혈일은 직전 광견병 접종(1차 또는 부스터)으로부터 28일 이후여야 함. (Schedule III IV(a)(iii) "At least 28 days after the primary rabies vaccination or rabies booster")',
    severity: 'blocker',
    addedAt: '2026-05-05',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      const titers = readTiterEntries(caseRow)
      if (rabies.length === 0 || titers.length === 0) return SKIP

      const offendingPaths: string[] = []
      const problems: string[] = []
      for (const t of titers) {
        // 채혈일 이전(또는 같은 날) 가장 최근 접종 찾기
        const priorDoses = rabies.filter((r) => r.date <= t.date)
        if (priorDoses.length === 0) {
          offendingPaths.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push(`채혈일(${t.date}) 이전 광견병 접종 기록 없음`)
          continue
        }
        const latest = priorDoses[priorDoses.length - 1]
        const gap = daysBetween(latest.date, t.date)
        if (gap === null || gap < 28) {
          offendingPaths.push(`rabies_titer_records[${t.originalIndex}].date`)
          problems.push(`채혈(${t.date}) - 직전접종(${latest.date}) = ${gap ?? '?'}일 (<28일)`)
        }
      }
      if (offendingPaths.length > 0) {
        return {
          ok: false,
          message: problems.join(' / '),
          fixHint: '채혈일을 직전 광견병 접종일로부터 28일 이후로 조정하세요.',
          offendingPaths,
        }
      }
      return { ok: true, message: '항체검사 시기 적합 (28일 경과).' }
    },
  },
  {
    id: 'sg.departure-min-90days-after-titer',
    country: 'singapore',
    category: '광견병',
    title: '출국일은 항체검사일 90일 이후',
    description:
      'RNATT 채혈일로부터 출국일까지 최소 90일 경과 필요. (Schedule III IV(a)(iii) "not less than 90 days ... prior to export")',
    severity: 'blocker',
    addedAt: '2026-05-05',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      let best: { entry: (typeof titers)[number]; days: number } | null = null
      for (const t of titers) {
        const days = daysBetween(t.date, dep)
        if (days === null) continue
        if (!best || days > best.days) best = { entry: t, days }
      }
      if (best && best.days >= 90) {
        return { ok: true, message: `항체검사(${best.entry.date}) → 출국일(${dep}): ${best.days}일.` }
      }
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      const message = !best
        ? '항체검사일과 출국일을 확인할 수 없습니다.'
        : best.days < 0
          ? `항체검사일(${best.entry.date})이 출국일(${dep})보다 이후입니다. 채혈은 출국 전에 완료되어야 합니다.`
          : `항체검사일로부터 출국일까지 ${best.days}일 — 90일 이상 필요합니다.`
      return {
        ok: false,
        message,
        fixHint: '출국일을 채혈일 + 90일 이후로 조정하거나 더 이른 항체검사가 필요합니다.',
        offendingPaths: offending,
      }
    },
  },
  {
    id: 'sg.departure-within-12months-of-titer',
    country: 'singapore',
    category: '광견병',
    title: '출국일은 항체검사일 12개월 이내',
    description:
      'RNATT 유효기간 12개월 — 출국일이 채혈일 + 1년을 넘으면 재검사 필요. 1주년 당일은 만료일이라 364일째까지만 인정. (Schedule III IV(a)(iii) "not more than 12 months prior to export")',
    severity: 'blocker',
    addedAt: '2026-05-05',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      const valid = titers.find((t) => addYears(t.date, 1) >= dep)
      if (valid) {
        return {
          ok: true,
          message: `항체검사(${valid.date}) 유효(${addYears(valid.date, 1)}) ≥ 출국일(${dep}).`,
        }
      }
      const newest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const newestValidUntil = addYears(newest.date, 1)
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      return {
        ok: false,
        message: `최신 항체검사(${newest.date}) 유효기간(${newestValidUntil}) < 출국일(${dep}).`,
        fixHint: '재검사 또는 출국일을 검사일 + 12개월 이내로 조정하세요.',
        offendingPaths: offending,
      }
    },
  },
  {
    id: 'sg.rabies-valid-until-on-departure',
    country: 'singapore',
    category: '광견병',
    title: '출국일 시점 광견병 면역 유효',
    description:
      '출국일에 가장 최근 광견병 접종의 면역 유효기간이 만료되지 않아야 함. (Schedule III IV(a)(iii) "valid ... in accordance with the recommendations of the vaccine manufacturer")',
    severity: 'blocker',
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
          message: `최근 접종(${latest.date})의 유효기간(${validUntil})이 출국일(${dep}) 이전에 만료.`,
          fixHint: '출국 전 추가 접종이 필요합니다.',
          offendingPaths: [
            'departure_date',
            `rabies_dates[${latest.originalIndex}].date`,
          ],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── 종합백신 ──
  {
    id: 'sg.comprehensive-vaccine-14days-before-departure',
    country: 'singapore',
    category: '종합백신',
    title: '종합백신은 출국일 14일 이전 접종',
    description:
      '종합백신(개: distemper/adeno1/parvo2, 고양이: calici/herpes-1/panleuk)은 출국 최소 14일 전 접종 필요. (Schedule III IV(a)(iv)(v) "not less than two (2) weeks prior to export")',
    severity: 'blocker',
    addedAt: '2026-05-05',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const diff = daysBetween(latest.date, dep)
      if (diff === null) return SKIP
      if (diff < 14) {
        return {
          ok: false,
          message: `최근 종합백신(${latest.date}) → 출국일(${dep}): ${diff}일 — 14일 이상 필요.`,
          fixHint: `종합백신을 출국일 ${dep} 기준 14일 전 이전에 접종하세요.`,
          offendingPaths: [`general_vaccine_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 종합백신(${latest.date}) → 출국일(${dep}): ${diff}일.` }
    },
  },
  {
    id: 'sg.comprehensive-vaccine-valid-on-departure',
    country: 'singapore',
    category: '종합백신',
    title: '출국일 시점 종합백신 면역 유효',
    description:
      '출국일에 가장 최근 종합백신의 면역 유효기간이 만료되지 않아야 함. valid_until 미입력 시 디폴트 1년(addOneYear, +364일) 적용. (Schedule III IV(a)(iv)(v) "according to the vaccine manufacturer\'s recommendations")',
    severity: 'blocker',
    addedAt: '2026-05-05',
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
          message: `최근 종합백신(${latest.date})의 유효기간(${validUntil})이 출국일(${dep}) 이전에 만료.`,
          fixHint: '출국 전 추가 접종이 필요합니다.',
          offendingPaths: [
            'departure_date',
            `general_vaccine_dates[${latest.originalIndex}].date`,
          ],
        }
      }
      return { ok: true, message: `최근 종합백신(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── 구충 ──
  {
    id: 'sg.external-parasite-2to7days-before-departure',
    country: 'singapore',
    category: '구충',
    title: '외부구충은 출국일 2~7일 전',
    description:
      '외부구충(벼룩·진드기) 처치는 출국일 기준 2~7일 사이에 실시. (Schedule III IV(a)(vi) "between 2 and 7 days of export")',
    severity: 'blocker',
    addedAt: '2026-05-05',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const entries = readExternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const diff = daysBetween(latest.date, dep)
      if (diff === null) return SKIP
      if (diff < 2 || diff > 7) {
        return {
          ok: false,
          message: `외부구충(${latest.date}) → 출국일(${dep}): ${diff}일 — 2~7일 범위 필요.`,
          fixHint: `외부구충일을 ${dep} 기준 2~7일 전 사이로 조정하세요.`,
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `외부구충(${latest.date}) → 출국일(${dep}): ${diff}일.` }
    },
  },
  {
    id: 'sg.internal-parasite-2to7days-before-departure',
    country: 'singapore',
    category: '구충',
    title: '내부구충은 출국일 2~7일 전',
    description:
      '내부구충(선충·조충) 처치는 출국일 기준 2~7일 사이에 실시. (Schedule III IV(a)(vi) "between 2 and 7 days of export")',
    severity: 'blocker',
    addedAt: '2026-05-05',
    run: ({ caseRow }) => {
      const dep = caseRow.departure_date
      const entries = readInternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const diff = daysBetween(latest.date, dep)
      if (diff === null) return SKIP
      if (diff < 2 || diff > 7) {
        return {
          ok: false,
          message: `내부구충(${latest.date}) → 출국일(${dep}): ${diff}일 — 2~7일 범위 필요.`,
          fixHint: `내부구충일을 ${dep} 기준 2~7일 전 사이로 조정하세요.`,
          offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `내부구충(${latest.date}) → 출국일(${dep}): ${diff}일.` }
    },
  },

  // ── 수입 금지 견종 ──
  {
    id: 'sg.banned-breeds',
    country: 'singapore',
    category: '서류',
    title: '수입 금지 견종 (NParks First Schedule Part 1)',
    description:
      'NParks First Schedule Part 1 (수입·판매·방문·거주 전면 금지): Pit Bull 계열(American Pit Bull Terrier, American Staffordshire Terrier, Staffordshire Bull Terrier, American Bulldog), Neapolitan Mastiff, Tosa, Akita, Dogo Argentino, Boerboel, Fila Brasileiro, Perro de Presa Canario 및 교잡. (Animals and Birds (Licensing and Control of Cats and Dogs) Rules 2024)',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const species = typeof data.species === 'string' ? data.species : ''
      if (species && species !== 'dog') return SKIP
      const breed = readBreed(caseRow)
      if (!breed.ko && !breed.en) return SKIP
      const match = matchBannedBreed(breed, [
        'pit bull', 'pitbull', '핏불',
        'american staffordshire terrier', '아메리칸 스태퍼드셔',
        'staffordshire bull terrier', '스태퍼드셔 불 테리어',
        'american bulldog', '아메리칸 불독',
        'neapolitan mastiff', '네아폴리탄 마스티프',
        'tosa', '도사', '도사 이누',
        'akita', '아키타',
        'dogo argentino', '도고 아르헨티노',
        'boerboel', '보어보엘',
        'fila brasileiro', '필라 브라질레이로',
        'perro de presa canario', '프레사 카나리오',
      ])
      if (match) {
        return {
          ok: false,
          message: `견종 "${breed.ko || breed.en}"은 NParks 수입 금지 (매치: ${match}).`,
          fixHint: 'NParks First Schedule Part 1 견종은 싱가포르 수입·거주 전면 금지. 별도 가능 절차 없음.',
          offendingPaths: ['breed', 'breed_en'],
        }
      }
      return { ok: true, message: `견종 "${breed.ko || breed.en}" 통과.` }
    },
  },
]
