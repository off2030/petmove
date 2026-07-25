import {
  buildDateRuleContext,
  violatesRabiesEntryWait,
  validateAeImportPermitWithin90Days,
  validateImportPermitNotAfterDeparture,
  validateParasiteDateForDestination,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  classifyExportQuarantineDate,
  daysBetween,
  readScopedImportPermitFiled,
  findRabiesValidityBreaks,
  evaluateRabiesAgeConservative,
  findSameGuardianCases,
  matchBannedBreed,
  readBreed,
  readExternalParasiteEntries,
  readGeneralVaccineEntries,
  readInternalParasiteEntries,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
  todayKst,
  readDepartureDate,
  readVetVisitDate,
} from './utils'
import {
  msgExportQuarantineAfterReturn,
  msgExportQuarantineBeforeEntry,
  msgImportQuarantineBeforeEntry,
  msgGeneralVaccineMinDaysBeforeDeparture,
  msgMicrochipBeforeRabies,
  msgRabiesMinDaysBeforeDeparture,
  msgRabiesExpiredBefore,
  msgRabiesPrimeMinAge,
} from './messages'

/**
 * 아랍에미리트 (MOCCAE — Ministry of Climate Change & Environment) 절차 검증.
 *
 * 출처:
 *  - MOCCAE Import Permit Pets — https://www.moccae.gov.ae/en/services/import-permit-pets
 *  - MOCCAE Export-Import Services — https://www.moccae.gov.ae/en/services/export-import-services/import-permit-pets.aspx
 *  - MOCCAE 입국 가이드 PDF — https://moccae.gov.ae/Handlers/DownloadPDF.ashx?id=67445
 *
 * 한국 = MOCCAE 저위험국(Low-risk country) 분류. RNATT 의무 아님.
 *
 * 핵심 룰:
 *  - 마이크로칩 (영구, ISO 11784/11785 운용)
 *  - 광견병: 저위험국발 12주(보수 91일 AND 캘린더 3개월) + 1차/단절 시 21일 대기 + 출국일 면역 유효
 *  - 종합백신: 백신 기록 (개 DHPP+L / 고양이 FVRCP), 출국 21일 전 접종 (운용 표준)
 *  - 구충 (외부·내부): 출국 14일 이내 (MOCCAE: "preventive doses ... during the 14 days prior to shipment")
 *  - 건강증명서: 출국일 10일 이내 (보수 ≤9)
 *  - Import Permit (MOCCAE 사전 발급, 90일 유효)
 *  - 개인당 연간 2마리 한도
 *  - Pitbull, Tosa, Doberman, Rottweiler 등 견종 수입 금지
 *
 * 별도 (시스템 검증 제외):
 *  - RNATT: 저위험국발은 의무 아님 (고위험국발만 필수)
 *  - 광견병 1년 라이선스: MOCCAE 명문 부재 — 라벨 따름
 *
 * 컨벤션 (MX/MA/RU 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - 유효기간 1년 = 접종일의 1주년 당일까지 인정
 */

const COUNTRY = 'uae'

export const AE_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'ae.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      'ISO 표준 마이크로칩이 광견병 1차 접종일과 같거나 이전이어야 함. (UAE 시점 미명시, 한국 수출검역 사실상 필수)',
    // severity 승격 info→warning(2026-07-22) — 구세대 파일의 잔재. 의료·일정 룰은
    // warning 이 앱 기준이다(다른 목적지와 동일).
    severity: 'warning',
    addedAt: '2026-05-07',
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

  // ── 광견병 ──
  {
    id: 'ae.rabies-prime-after-91days-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 보수적 기준 (생후 91일 AND 캘린더 3개월)',
    description:
      'MOCCAE 저위험국 출발: 생후 12주 이상 — 안전 기준으로 생후 91일 AND 캘린더 3개월 둘 다 충족 필요.',
    // severity 승격 info→warning(2026-07-22) — 구세대 파일의 잔재. 의료·일정 룰은
    // warning 이 앱 기준이다(다른 목적지와 동일).
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
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
            ? `생후 ${ev.ageInDays}일령으로 91일에 미달해요`
            : ev.failedRule === 'calendar3m'
              ? `${first.date}이 캘린더 3개월(${ev.calendar3mThreshold})보다 빨라요`
              : `생후 ${ev.ageInDays}일령이며 ${first.date}이 캘린더 3개월(${ev.calendar3mThreshold})보다 빨라요`
        return {
          ok: false,
          message: msgRabiesPrimeMinAge('91일'),
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${ev.ageInDays}일령 + 캘린더 3개월(${ev.calendar3mThreshold}) 충족.` }
    },
  },
  {
    id: 'ae.rabies-min-21days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 21일 이상 전',
    description:
      '광견병 1차 접종 또는 면역기간 만료 후 재접종 시 출국까지 최소 21일 경과 필요. (MOCCAE 공식: "a period not less than 21 days must pass from vaccination against Rabies"). 부스터 chain 유지 시 면제이나 시스템은 가장 이른 접종 기준 보수적 검증.',
    // severity 승격 info→warning(2026-07-22) — 구세대 파일의 잔재. 의료·일정 룰은
    // warning 이 앱 기준이다(다른 목적지와 동일).
    severity: 'warning',
    addedAt: '2026-05-07',
    // ⚠️ **자체 계산 금지**(2026-07-22 수정). 예전엔 `rabies[0]`(가장 이른 접종) 기준으로
    //   직접 일수를 셌다 — ①만료 후 재접종 케이스를 통째로 놓치고(1차부터 세어 '통과')
    //   ②프로파일 파생 저장 거부(validateRabiesEntryWait)와 계산이 어긋났다.
    //   멕시코에서 같은 결함을 고친 것과 동일 처리 — 공용 헬퍼 violatesRabiesEntryWait 를 쓴다.
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const latest = rabies[rabies.length - 1]
      if (!violatesRabiesEntryWait(data, dep, destination)) {
        return { ok: true, message: `최근 접종(${latest.date}) → 출국일(${dep}): 21일 충족(또는 유효 부스터).` }
      }
      return {
        ok: false,
        message: msgRabiesMinDaysBeforeDeparture(21),
        offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
      }
    },
  },
  {
    id: 'ae.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함.',
    // severity 승격 info→warning(2026-07-22) — 구세대 파일의 잔재. 의료·일정 룰은
    // warning 이 앱 기준이다(다른 목적지와 동일).
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      // 이미 만료(오늘 기준)는 common.rabies-validity-expired '주의'가 담당 — 여기선 아직
      // 유효한데 출국 시점에 만료 예정인 경우만 남긴다(만료 재구성 B, 2026-07-25).
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

  // ── 종합백신 ──
  {
    id: 'ae.general-vaccine-required',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신 접종 필수',
    description:
      '종합백신 접종 기록 필요. 강아지: DHPP+L(distemper/hepatitis/parvo/parainflu/lepto) / 고양이: FVRCP(rhinotracheitis/calici/panleuk). (MOCCAE 운용 표준 — 명시 의무 부재)',
    // severity 승격 info→warning(2026-07-22) — 구세대 파일의 잔재. 의료·일정 룰은
    // warning 이 앱 기준이다(다른 목적지와 동일).
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const entries = readGeneralVaccineEntries(caseRow)
      if (entries.length === 0) {
        return {
          ok: false,
          message: '종합백신 기록이 없어요.',
        }
      }
      return { ok: true, message: `종합백신 ${entries.length}회 기록됨.` }
    },
  },
  {
    id: 'ae.general-vaccine-21days-before-departure',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신은 출국일 21일 이상 전 접종',
    description:
      '종합백신 접종일로부터 출국일까지 최소 21일 경과 필요. (MOCCAE 운용 표준)',
    // severity 승격 info→warning(2026-07-22) — 구세대 파일의 잔재. 의료·일정 룰은
    // warning 이 앱 기준이다(다른 목적지와 동일).
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 21) {
        return {
          ok: false,
          message: msgGeneralVaccineMinDaysBeforeDeparture(21),
          offendingPaths: [`general_vaccine_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 종합백신(${latest.date}) → 출국일(${dep}): ${days}일.` }
    },
  },

  // ── 구충 ──
  {
    id: 'ae.external-parasite-within-14days',
    country: COUNTRY,
    category: '구충',
    title: '외부구충은 출국 포함 14일 이내 (13일 전 이후)',
    description:
      '외부구충(벼룩·진드기) 처치는 출국 포함 14일 이내 = 출국일 기준 13일 전 이후. (MOCCAE: "preventive doses for internal and external parasites during the 14 days prior to shipment")',
    // severity 승격 info→warning(2026-07-22) — 구세대 파일의 잔재. 의료·일정 룰은
    // warning 이 앱 기준이다(다른 목적지와 동일).
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readExternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      // 저장 거부(client)와 같은 dispatch — 검증 단일 출처.
      const err = validateParasiteDateForDestination(latest.date, {
        destinationKey: destination,
        kind: 'external',
        departureDate: dep,
      })
      if (err) {
        return { ok: false, message: err, offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`] }
      }
      const diff = daysBetween(latest.date, dep)
      return { ok: true, message: `외부 기생충 치료(${latest.date}) → 출국일(${dep}): ${diff}일.` }
    },
  },
  {
    id: 'ae.internal-parasite-within-14days',
    country: COUNTRY,
    category: '구충',
    title: '내부구충은 출국 포함 14일 이내 (13일 전 이후)',
    description:
      '내부구충(선충·조충) 처치는 출국 포함 14일 이내 = 출국일 기준 13일 전 이후. (MOCCAE: "preventive doses for internal and external parasites during the 14 days prior to shipment")',
    // severity 승격 info→warning(2026-07-22) — 구세대 파일의 잔재. 의료·일정 룰은
    // warning 이 앱 기준이다(다른 목적지와 동일).
    severity: 'warning',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readInternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const err = validateParasiteDateForDestination(latest.date, {
        destinationKey: destination,
        kind: 'internal',
        departureDate: dep,
      })
      if (err) {
        return { ok: false, message: err, offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`] }
      }
      const diff = daysBetween(latest.date, dep)
      return { ok: true, message: `내부 기생충 치료(${latest.date}) → 출국일(${dep}): ${diff}일.` }
    },
  },

  // ── 수입 금지 견종 ──
  {
    id: 'ae.banned-breeds',
    country: COUNTRY,
    category: '서류',
    title: '수입 금지 견종 (Pit Bull, Tosa, Doberman, Rottweiler 등)',
    description:
      'MOCCAE 수입 금지: Pitbull, Argentinian Mastiff (Dogo Argentino), Brazilian Mastiff (Fila Brasileiro), Tosa (Japanese Fighting Dog), American Staffordshire Terrier, Bull Mastiff, Doberman, Rottweiler 및 교잡.',
    severity: 'blocker',
    addedAt: '2026-05-07',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const species = typeof data.species === 'string' ? data.species : ''
      if (species && species !== 'dog') return SKIP
      const breed = readBreed(caseRow)
      if (!breed.ko && !breed.en) return SKIP
      const match = matchBannedBreed(breed, [
        'pit bull', 'pitbull', '핏불',
        'dogo argentino', '도고 아르헨티노',
        'fila brasileiro', '필라 브라질레이로',
        'tosa', '도사',
        'american staffordshire terrier', '아메리칸 스태퍼드셔',
        'staffordshire bull terrier', '스태퍼드셔 불 테리어',
        'bull mastiff', '불 마스티프',
        'doberman', '도베르만',
        'rottweiler', '로트와일러',
      ])
      if (match) {
        return {
          ok: false,
          message: `견종 "${breed.ko || breed.en}"은 UAE 수입 금지 견종이에요 (매치: ${match}).`,
          offendingPaths: ['breed', 'breed_en'],
        }
      }
      return { ok: true, message: `견종 "${breed.ko || breed.en}" 통과.` }
    },
  },

  // ── 보호자 한도 (개인당 연간 2마리) ──
  {
    id: 'ae.max-2pets-per-year',
    country: COUNTRY,
    category: '서류',
    title: '개인당 연간 2마리 한도 (MOCCAE)',
    description:
      'MOCCAE: 개인당 연간 최대 2마리(개2 또는 고양이2 또는 개+고양이). 동일 보호자(이름·영문이름·전화·국내주소 일치)가 UAE 목적 케이스 3건 이상 등록 시 경고. (시간 윈도우는 시스템 미구현 — 보수적으로 전체 케이스 카운트)',
    severity: 'warning',
    // relatedCases 는 펫무브워크(운영자)만 전달 — 보호자 이름·건수가 필요한 운영자용 룰.
    audience: 'staff',
    addedAt: '2026-05-07',
    run: ({ caseRow, relatedCases, destination }) => {
      if (relatedCases === undefined) return SKIP
      const others = findSameGuardianCases(caseRow, relatedCases, { sameDestination: true })
      if (others.length + 1 > 2) {
        return {
          ok: false,
          message: `같은 보호자(${caseRow.customer_name})가 UAE 목적 케이스를 ${others.length + 1}건 등록하여 개인당 연간 2마리 한도를 초과해요.`,
          offendingPaths: ['customer_name'],
        }
      }
      return { ok: true, message: '보호자 케이스 ≤ 2건.' }
    },
  },
  // ── 수입 허가(MOCCAE) — 90일 유효 (2026-07-22 신설) ──
  // 입력 차단(validateImportPermitFiledDate case 'uae')과 같은 함수를 본다.
  {
    id: 'ae.import-permit-within-90days',
    country: COUNTRY,
    category: '수입허가',
    title: '수입 허가는 출국 90일 이내 신청',
    description:
      'MOCCAE 수입 허가는 발급일로부터 90일 유효(ae.ts 헤더). 너무 일찍 신청하면 입국 전에 만료된다. 출국일 이후 신청도 불가. 입력 차단과 같은 함수(validateAeImportPermitWithin90Days).',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const filed = readScopedImportPermitFiled(data, destination)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(filed)) return SKIP
      const dep = readDepartureDate(caseRow, destination)
      if (!dep) return SKIP
      const msg =
        validateImportPermitNotAfterDeparture(filed, dep) ??
        validateAeImportPermitWithin90Days(filed, dep)
      if (msg) {
        return { ok: false, message: msg, offendingPaths: ['import_permit_application_date'] }
      }
      return { ok: true, message: `신청일(${filed}) 출국일(${dep}) 기준 90일 이내.` }
    },
  },

  // ── 검역 일정 (2026-07-22 신설) — 필리핀 골격 복제 시 비어 있던 자리 ──
  {
    id: 'ae.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간 이내여야 함. 만료 후 접종은 chain 이 끊겨 새 1차로 간주된다. 저장 거부(findRabiesChainBreak)의 짝 — 펫무브워크는 저장을 막지 않으므로 이 룰이 없으면 운영자 화면에서 끊긴 chain 이 안 보인다.',
    severity: 'warning',
    addedAt: '2026-07-22',
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
  {
    id: 'ae.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '아랍에미리트 수입 검역일',
    description:
      '아랍에미리트 수입 검역일은 아랍에미리트 입국일 이후여야 함. "그 나라에 도착한 뒤 받았는가"라는 물리적 제약이라 나라별 규정 조사가 필요 없다.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const ctx = buildDateRuleContext(caseRow, destination)
      const raw = typeof data.ae_import_quarantine_date === 'string' ? data.ae_import_quarantine_date.slice(0, 10) : ''
      if (!raw) return SKIP
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      if (entry && raw < entry) {
        return {
          ok: false,
          message: msgImportQuarantineBeforeEntry('아랍에미리트'),
          offendingPaths: ['ae_import_quarantine_date'],
        }
      }
      return { ok: true, message: `아랍에미리트 수입검역일(${raw}) 입국 이후.` }
    },
  },
  {
    id: 'ae.export-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '아랍에미리트 수출 검역일',
    description:
      '아랍에미리트 수출 검역일은 입국일 이후·한국 귀국일 이전이어야 함(체류 기간 내). 판정은 classifyExportQuarantineDate 공용.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      const ret =
        typeof ctx.data.return_date === 'string' && ctx.data.return_date.length >= 10
          ? ctx.data.return_date.slice(0, 10)
          : ''
      const verdict = classifyExportQuarantineDate(data.ae_export_quarantine_date, entry, ret)
      if (verdict === 'skip') return SKIP
      if (verdict === 'before-entry') {
        return {
          ok: false,
          message: msgExportQuarantineBeforeEntry('아랍에미리트'),
          offendingPaths: ['ae_export_quarantine_date'],
        }
      }
      if (verdict === 'after-return') {
        return {
          ok: false,
          message: msgExportQuarantineAfterReturn('아랍에미리트'),
          offendingPaths: ['ae_export_quarantine_date'],
        }
      }
      return { ok: true, message: '아랍에미리트 수출검역일 체류 기간 내.' }
    },
  },
]
