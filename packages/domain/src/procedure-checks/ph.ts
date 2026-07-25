import {
  buildDateRuleContext,
  isValidBooster,
  validateImportPermitNotAfterDeparture,
  validatePhImportPermitVaccineGap,
  validatePhImportPermitWithin60Days,
  validatePhInternalParasiteWindow,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  daysBetween,
  findSameGuardianCases,
  readGeneralVaccineEntries,
  readInternalParasiteEntries,
  readRabiesEntries,
  readScopedImportPermitFiled,
  resolveValidUntil,
  SKIP,
  todayKst,
  readDepartureDate,
  readVetVisitDate,
  findRabiesValidityBreaks,
} from './utils'
import { msgMicrochipBeforeGeneralVaccine, msgMicrochipBeforeRabies, msgRabiesPrimeMinAge } from './messages'

/**
 * 필리핀 (BAI — Bureau of Animal Industry) 절차 검증.
 *
 * 출처:
 *  - BAI Pet Import 페이지 — https://www.bai.gov.ph/Stakeholders/PetImport
 *  - BAI MC No. 49 (2022) "Streamlining the SPS Import Clearance for Dogs and Cats" —
 *    https://ww2.bai.gov.ph/media/gwvj4njp/memorandum-circular-no-49-streamlining-the-sps-import-clearance-application-requirements-of-dogs-and-cats-for-one-time-importation-2022.pdf
 *  - BAI Citizen's Charter 2024 (3rd Ed.) — https://ww2.bai.gov.ph/media/bdybdoyx/2024-bai-citizen-s-charter.pdf
 *
 * ⚠️ 핵심:
 *  - 마이크로칩 (ISO 호환) ≤ 광견병 1차 (BAI MC 49)
 *  - 광견병: 생후 12주(84일) 이상, 1차는 SPSIC 신청 14일 전 (≈ 출국 21일 전 합산), 1년 유효, 부스터 즉시 출국 가능
 *  - 종합백신 (개 DHPPL / 고양이 FVRCP): 1차는 SPSIC 신청 14일 전, 1년 유효, 부스터 즉시 가능
 *  - 내·외부구충: SPSIC 신청 기준 7~91일 (BAI MC 49 명시 의무)
 *  - 출국 시 만 4개월(120일) 이상 (SPSIC 신청 자격)
 *  - 한국 APQA 검역: 출국 10일 이내(보수 ≤9)
 *  - SPSIC import permit: 60일 유효, 1회 3마리 한도
 *
 * RNATT: BAI 입국 의무 아님 (한국 귀국용 별도 흐름) → 검증 미적용.
 *
 * 컨벤션 (NZ/HI/CN/TH 와 동일):
 *  - "X일 이내" → `dep - X ≤ N-1`
 *  - "X일 이전" / "X일 전" → `dep - X ≥ N` (이상 inclusive)
 */

const COUNTRY = 'philippines'

export const PH_CHECKS: ProcedureCheck[] = [
  {
    id: 'ph.rabies-booster-within-prime-validity',
    country: COUNTRY,
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
    id: 'ph.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩, 백신 타이밍',
    description:
      '마이크로칩(ISO 11784/11785, 15자리)이 광견병 접종일과 같거나 이전이어야 함. 매 준비 단계마다 칩 스캔 확인 필수. (BAI SPSIC) 백신 입력 시 client 차단(validateMicrochipBeforeBooster)과 짝.',
    severity: 'warning',
    addedAt: '2026-05-06',
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
  {
    id: 'ph.microchip-before-general-vaccine',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩, 종합백신 타이밍',
    description:
      '마이크로칩(ISO 11784/11785, 15자리)이 종합백신 접종일과 같거나 이전이어야 함. 칩으로 식별된 동물의 접종만 인정 — 백신 입력 시 client 차단과 짝, 칩 시술일 수정 후 깨진 경우를 주의로 표면화.',
    severity: 'warning',
    addedAt: '2026-06-12',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const microchip = typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      const entries = readGeneralVaccineEntries(caseRow)
      if (!microchip || entries.length === 0) return SKIP

      const first = entries[0] // readGeneralVaccineEntries 는 날짜순 정렬 — [0] = 가장 이른 접종.
      if (microchip <= first.date) {
        return { ok: true, message: `마이크로칩(${microchip}) ≤ 종합백신(${first.date}).` }
      }
      return {
        ok: false,
        message: msgMicrochipBeforeGeneralVaccine(),
        offendingPaths: ['microchip_implant_date', `general_vaccine_dates[${first.originalIndex}].date`],
      }
    },
  },

  // ── 광견병 ──
  {
    id: 'ph.rabies-prime-after-12weeks',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 생후 12주(84일) 이상',
    description:
      '광견병 1차 접종은 생후 최소 12주(84일) 이후. (BAI MC 49 — EU Reg 576/2013 동일 기준)',
    severity: 'warning',
    addedAt: '2026-05-06',
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
    id: 'ph.rabies-prime-21days-before-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국 21일 이전 완료 (유효 부스터 면제)',
    description:
      'BAI 공식: "initial rabies vaccination should not be less than 14 days prior to application of the SPSIC". SPSIC 신청 ≈ 출국 7-14일 전 → 합산 21일 (dep proxy). **직전 접종 유효기간 내 재접종한 유효 부스터는 면제** ("annual booster, shipped immediately"). 만료 후 재접종(단절)은 새 1차라 21일 적용.',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      // 유효 부스터(직전 접종 면역 유효기간 내 재접종)는 21일 면제 — 태국과 동일 기준.
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (isValidBooster(data, 'rabies_dates')) {
        return { ok: true, message: '유효 부스터 — 21일 대기 면제.' }
      }

      // 유효 부스터가 아니면(1차·단절) 가장 최근 접종 기준 21일.
      const latest = rabies[rabies.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 21) {
        return {
          ok: false,
          message: '광견병 접종은 출국 21일 전까지 해야 해요.',
          offendingPaths: ['departure_date', `rabies_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 접종(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },
  {
    id: 'ph.rabies-not-expired-on-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '도착(예정)일에 광견병 면역 유효 (1년 = 1주년 당일까지)',
    description:
      '최근 광견병 접종 면역 유효기간이 필리핀 도착일 이전 만료되지 않아야 함. **1년 = 1주년 당일까지** 허용. valid_until 명시 시 그 값 사용, 미명시 시 디폴트 1년 (`addOneYear`). 2026-07-16: 도착일(entry_date) 입력 시 그 값, 미입력이면 출국일(departure_date)로 대체 — 대부분 보호자가 도착일까지는 입력하지 않고 두 날짜도 통상 당일·익일 차이라 출국일로도 충분히 근사됨.',
    severity: 'warning',
    addedAt: '2026-05-06',
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
      // 유효한데 도착 시점에 만료 예정인 경우만 남긴다(만료 재구성 B, 2026-07-25).
      if (validUntil < todayKst()) return SKIP
      if (validUntil < anchor) {
        return {
          ok: false,
          message: `광견병 백신 면역 유효기간이 ${usingEntry ? '도착' : '출국'} 전에 만료돼요. 만료 전에 추가 접종을 하세요.`,
          offendingPaths: [
            usingEntry ? 'entry_date' : 'departure_date',
            `rabies_dates[${latest.originalIndex}].date`,
          ],
        }
      }
      return {
        ok: true,
        message: `최근 접종(${latest.date}) 유효기간(${validUntil}) ≥ ${usingEntry ? '도착일' : '출국일'}(${anchor}).`,
      }
    },
  },

  // ── 종합백신 ──
  {
    id: 'ph.general-vaccine-prime-21days-before-arrival',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신 접종은 출국 21일 이전 완료 (유효 부스터 면제)',
    description:
      '종합백신(강아지 DHPPL / 고양이 FVRCP) 가장 최근 접종이 출국일 기준 21일 이전 완료. **직전 접종 유효기간 내 재접종한 유효 부스터는 면제** (광견병과 동일 기준). 만료 후 재접종(단절)은 새 1차라 21일 적용.',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      // 유효 부스터(직전 접종 면역 유효기간 내 재접종)는 21일 면제 — 광견병과 동일 기준.
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (isValidBooster(data, 'general_vaccine_dates')) {
        return { ok: true, message: '유효 부스터 — 21일 대기 면제.' }
      }

      // 유효 부스터가 아니면(1차·단절) 가장 최근 접종 기준 21일.
      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 21) {
        return {
          ok: false,
          message: '종합백신 접종은 출국 21일 전까지 해야 해요.',
          offendingPaths: ['departure_date', `general_vaccine_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 종합백신(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },
  {
    id: 'ph.general-vaccine-not-expired-on-arrival',
    country: COUNTRY,
    category: '종합백신',
    title: '도착(예정)일에 종합백신 면역 유효 (1년 = 1주년 당일까지)',
    description:
      '최근 종합백신 면역 유효기간이 필리핀 도착일 이전 만료되지 않아야 함. **1년 = 1주년 당일까지** 허용. valid_until 명시 시 그 값, 미명시 시 디폴트 1년 (`addOneYear`). 2026-07-16: 도착일(entry_date) 입력 시 그 값, 미입력이면 출국일(departure_date)로 대체 — 대부분 보호자가 도착일까지는 입력하지 않고 두 날짜도 통상 당일·익일 차이라 출국일로도 충분히 근사됨.',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const ctx = buildDateRuleContext(caseRow, destination)
      const entry =
        typeof ctx.data.entry_date === 'string' && ctx.data.entry_date.length >= 10
          ? ctx.data.entry_date.slice(0, 10)
          : ''
      const dep = readDepartureDate(caseRow, destination)
      const anchor = entry || dep
      const usingEntry = !!entry
      const entries = readGeneralVaccineEntries(caseRow)
      if (!anchor || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      // 이미 만료(오늘 기준)는 common.general-vaccine-validity-expired '주의'가 담당 —
      // 여기선 아직 유효한데 도착 시점에 만료 예정인 경우만 남긴다(만료 재구성 B, 2026-07-25).
      if (validUntil < todayKst()) return SKIP
      if (validUntil < anchor) {
        return {
          ok: false,
          message: `종합백신 면역 유효기간이 ${usingEntry ? '도착' : '출국'} 전에 만료돼요. 만료 전에 추가 접종을 하세요.`,
          offendingPaths: [
            usingEntry ? 'entry_date' : 'departure_date',
            `general_vaccine_dates[${latest.originalIndex}].date`,
          ],
        }
      }
      return {
        ok: true,
        message: `최근 종합백신(${latest.date}) 유효기간(${validUntil}) ≥ ${usingEntry ? '도착일' : '출국일'}(${anchor}).`,
      }
    },
  },

  // ── 일정 ──
  {
    id: 'ph.min-120days-on-arrival',
    country: COUNTRY,
    category: '일정',
    title: '출국일 시점 만 120일(약 4개월) 이상',
    description:
      '필리핀 SPSIC 신청 자격: 생후 120일(약 4개월) 이상. (BAI MC 49: "Only dogs and cats that are 120 days and above at the time of SPSIC application")',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      if (!dep || !birth) return SKIP

      const ageOnDep = daysBetween(birth, dep)
      if (ageOnDep === null) return SKIP
      if (ageOnDep < 120) {
        return {
          ok: false,
          message: '120일령(4개월) 이상의 강아지(혹은 고양이)만 데려갈 수 있어요.',
          offendingPaths: ['departure_date', 'birth_date'],
        }
      }
      return { ok: true, message: `출국일 시점 ${ageOnDep}일령 (≥120).` }
    },
  },
  // ── 보호자 한도 (1회 3마리) ──
  {
    id: 'ph.max-3pets-per-shipment',
    country: COUNTRY,
    category: '서류',
    title: '한 보호자당 3마리 한도 (BAI MC 49)',
    description:
      'BAI MC 49: 개인(일회성) 수입은 한 보호자당 최대 3마리. 동일 보호자(이름·영문이름·전화·국내주소 일치)가 필리핀 목적 케이스 4건 이상 등록 시 경고.',
    severity: 'warning',
    // relatedCases 는 펫무브워크만 전달 — 운영자용.
    audience: 'staff',
    addedAt: '2026-05-07',
    run: ({ caseRow, relatedCases, destination }) => {
      if (relatedCases === undefined) return SKIP
      const others = findSameGuardianCases(caseRow, relatedCases, { sameDestination: true })
      if (others.length + 1 > 3) {
        return {
          ok: false,
          message: `같은 보호자(${caseRow.customer_name})가 필리핀 목적 케이스를 ${others.length + 1}건 등록했어요. 한 보호자당 3마리까지만 데려갈 수 있습니다.`,
          offendingPaths: ['customer_name'],
        }
      }
      return { ok: true, message: '보호자 케이스 ≤ 3건.' }
    },
  },

  // ── 수입허가(SPSIC) — 백신 14일 후 신청 (부스터 면제) ──
  {
    // SPSIC 60일 유효 — 너무 이른 신청(출국 전 만료) 주의 (2026-07-25 신설 — 차단만 있고
    // 주의가 빠져 있던 갭). 입력 차단(validateImportPermitFiledDate case 'philippines')과
    // 같은 함수를 본다.
    id: 'ph.import-permit-within-60days',
    country: COUNTRY,
    category: '수입허가',
    title: '수입 허가는 출국 60일 이내 신청',
    description:
      'SPSIC 은 발급일로부터 60일 유효 — 너무 일찍 신청하면 출국 전에 만료된다. 입력 차단과 같은 함수(validatePhImportPermitWithin60Days).',
    severity: 'warning',
    addedAt: '2026-07-25',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const filed = readScopedImportPermitFiled(data, destination)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(filed)) return SKIP
      const dep = (readDepartureDate(caseRow, destination) ?? '').slice(0, 10)
      if (!dep) return SKIP
      const msg = validatePhImportPermitWithin60Days(filed, dep)
      if (msg) {
        return {
          ok: false,
          message: msg,
          offendingPaths: ['import_permit_application_date', 'departure_date'],
        }
      }
      return { ok: true, message: `신청일(${filed}) 출국일(${dep}) 기준 60일 이내.` }
    },
  },
  {
    id: 'ph.import-permit-not-after-departure',
    country: COUNTRY,
    category: '수입허가',
    title: '수입 허가 신청일, 출국일 순서',
    description:
      '수입 허가 신청일은 출국일 이전이어야 함(출국 당일·이후엔 신청 불가). 입력 차단(validateImportPermitNotAfterDeparture)과 같은 함수 — 출국일을 나중에 당겨 어긋난 경우를 주의로 표면화(태국·말레이·인니·싱가포르와 동일).',
    severity: 'warning',
    addedAt: '2026-07-25',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const filed = readScopedImportPermitFiled(data, destination)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(filed)) return SKIP
      const dep = (readDepartureDate(caseRow, destination) ?? '').slice(0, 10)
      const msg = validateImportPermitNotAfterDeparture(filed, dep)
      if (msg) {
        return {
          ok: false,
          message: msg,
          offendingPaths: ['import_permit_application_date', 'departure_date'],
        }
      }
      return { ok: true, message: `신청일(${filed}) < 출국일(${dep || '미입력'}).` }
    },
  },
  {
    id: 'ph.import-permit-14days-after-vaccines',
    country: COUNTRY,
    category: '수입허가',
    title: '백신, 수입 허가증(SPSIC) 타이밍',
    description:
      'SPSIC 신청은 광견병·종합백신 1차(단일 접종) 기준 14일 이후 — 부스터(2회+)는 BAI 면제. 입력 차단(validatePhImportPermitVaccineGap)과 같은 함수.',
    severity: 'warning',
    addedAt: '2026-06-12',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const filed = readScopedImportPermitFiled(data, destination)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(filed)) return SKIP
      const msg = validatePhImportPermitVaccineGap(filed, data)
      if (msg) {
        return {
          ok: false,
          message: msg,
          offendingPaths: ['import_permit_application_date'],
        }
      }
      return { ok: true, message: `신청일(${filed}) 백신 접종 14일 이후 (또는 부스터 면제).` }
    },
  },

  // ── 내부 기생충 치료 — SPSIC 신청 기준 7~91일 전 (BAI MC 49) ──
  // ⚠️ 이 룰이 없어서 **카드가 '7일~3개월'이라고 말해 놓고 그 창을 벗어난 입력을 아무도
  //   잡지 않는 상태**였다(2026-07-22 사용자 지적). 브라질·멕시코는 같은 종류의 요건에
  //   룰이 있었는데 필리핀만 비어 있었다. 배선 린트도 못 잡았다 — 빈 카드 검사가 `date`
  //   입력만 보고 `date_array`(회차 목록)를 빼고 있었기 때문(그 구멍은 별도 수정).
  // 외부 기생충 치료는 필리핀 카드 자체가 없다(SPSIC import terms 7항 "recommended but
  //   optional") — 룰도 만들지 않는다.
  {
    id: 'ph.internal-parasite-7days-to-3months-before-permit',
    country: COUNTRY,
    category: '구충',
    title: '내부 기생충 치료는 SPSIC 신청 7일~3개월 전',
    description:
      '내부 기생충 치료는 수입 허가증(SPSIC) 신청일 기준 7일 전 ~ 달력 3개월 이내. 상한은 일수 환산이 아니라 달력 개월(낀 달에 따라 89~92일로 흔들리지 않게). 입력 차단(치료일 칸 + 신청일 칸 양쪽)과 같은 함수 — 신청일 미입력이면 판정하지 않는다.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const filed = readScopedImportPermitFiled(data, destination)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(filed)) return SKIP
      const entries = readInternalParasiteEntries(caseRow)
      if (entries.length === 0) return SKIP

      // 창을 만족하는 치료가 하나라도 있으면 통과 — 여러 번 치료한 경우를 벌하지 않는다.
      const okEntry = entries.find((e) => validatePhInternalParasiteWindow(e.date, filed) === null)
      if (okEntry) {
        return { ok: true, message: `내부 기생충 치료(${okEntry.date}) → SPSIC 신청(${filed}) 창 내.` }
      }
      const latest = entries[entries.length - 1]
      return {
        ok: false,
        message: validatePhInternalParasiteWindow(latest.date, filed) ?? '',
        offendingPaths: [`internal_parasite_dates[${latest.originalIndex}].date`],
      }
    },
  },

  // ── 검역 일정 재검증 — 입력 차단과 같은 규칙을 매 렌더 재실행 (jp/th *-date-valid 와 동일 모델) ──
  {
    id: 'ph.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '필리핀 수입 검역일',
    description: '필리핀 수입 검역일은 필리핀 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-06-12',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.ph_import_quarantine_date === 'string'
          ? data.ph_import_quarantine_date.slice(0, 10)
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
          message: '필리핀 수입 검역일은 필리핀 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['ph_import_quarantine_date'],
        }
      }
      return { ok: true, message: `필리핀 수입검역일(${raw}) 입국 이후.` }
    },
  },
  {
    id: 'ph.export-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '필리핀 수출 검역일',
    description: '필리핀 수출 검역일은 필리핀 입국일 이후·한국 귀국일 이전이어야 함.',
    severity: 'warning',
    addedAt: '2026-06-12',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.ph_export_quarantine_date === 'string'
          ? data.ph_export_quarantine_date.slice(0, 10)
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
          message: '필리핀 수출 검역일은 필리핀 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['ph_export_quarantine_date'],
        }
      }
      if (ret && raw > ret) {
        return {
          ok: false,
          message: '필리핀 수출 검역일은 한국 귀국일보다 늦을 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['ph_export_quarantine_date'],
        }
      }
      return { ok: true, message: `필리핀 수출검역일(${raw}) 필리핀 체류 구간 내.` }
    },
  },
  // ── 현지 동물병원 방문(건강증명서 발급) ──
  // 카드 순서: 필리핀 수입검역(140) → 현지 병원(150) → BAI 수출검역(155).
  // 현지 병원 건강증명서가 있어야 BAI 수출검역을 받을 수 있으므로(카드 설명), 방문일은
  // **필리핀 수입검역일 이후 · 수출검역일 이전**이어야 한다. 두 끝값이 없으면 그 비교는 건너뛴다
  // (아직 입력 전일 수 있음) — 있는 것만 검사.
  {
    id: 'ph.local-vet-visit-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '필리핀 현지 동물병원 방문일',
    description: '현지 동물병원 방문일은 필리핀 수입 검역일 이후·수출 검역일 이전이어야 함.',
    severity: 'warning',
    addedAt: '2026-07-19',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const read = (k: string) =>
        typeof data[k] === 'string' && (data[k] as string).length >= 10
          ? (data[k] as string).slice(0, 10)
          : ''
      const raw = read('ph_local_vet_visit_date')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const imp = read('ph_import_quarantine_date')
      const exp = read('ph_export_quarantine_date')
      if (imp && raw < imp) {
        return {
          ok: false,
          message: '현지 동물병원 방문일은 필리핀 수입 검역일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['ph_local_vet_visit_date'],
        }
      }
      if (exp && raw > exp) {
        return {
          ok: false,
          message: '현지 동물병원 방문일은 필리핀 수출 검역일보다 늦을 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['ph_local_vet_visit_date'],
        }
      }
      return { ok: true, message: `현지 병원 방문일(${raw}) 필리핀 체류 구간 내.` }
    },
  },
]
