import {
  buildDateRuleContext,
  isValidBooster,
  validateImportPermitNotAfterDeparture,
  validatePhImportPermitWithin60Days,
  validateThImportPermitVaccineGap,
} from '../journey-steps/date-rules'
import { todayKst } from '../dates'
import type { ProcedureCheck } from './types'
import {
  daysBetween,
  matchBannedBreed,
  readBreed,
  readGeneralVaccineEntries,
  readRabiesEntries,
  readScopedImportPermitFiled,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
  readVetVisitDate,
  findRabiesValidityBreaks,
} from './utils'
import { msgGeneralVaccineExpiredBefore, msgMicrochipBeforeGeneralVaccine, msgMicrochipBeforeRabies, msgRabiesExpiredBefore, msgRabiesPrimeMinAge } from './messages'

/**
 * 태국 (DLD — Department of Livestock Development, กรมปศุสัตว์) 절차 검증.
 *
 * 출처:
 *  - DLD AQS-Suvarnabhumi 공식 안내 — http://aqs-suvarn-dld.go.th/wp/en/import-en/importation-of-pet-dog-and-cat/
 *    ⚠️ HTTPS 는 인증서 불일치(sv164.hostsevenplus.com) + 404 다. **평문 HTTP 로 접근**할 것.
 *    시나리오별 PDF 3종(2026-07-20 확인) — 최소 일령 각주가 셋 다 토씨까지 같다:
 *      .../wp-content/uploads/2016/09/1A.cargo_.pdf          (화물)
 *      .../wp-content/uploads/2016/09/B.Checked-baggage.pdf  (기내·수하물, 사전신청)
 *      .../wp-content/uploads/2016/09/1C.on-arrival.pdf      (도착 시 신청)
 *  - 태국 외교부(MFA) 공식 PDF (Revised 30 Jan 2025) —
 *    https://image.mfa.go.th/mfa/0/91fPdh6NtO/About-Thailand/Bringing_Pets_to_Thailand/All_Airports_-_Instructions_for_Bringing_Dog-Cat-Rabbit_into_Thailand_from_the_USA_(Revised_30Jan2025).pdf
 *  - DLD AQI 영문 PDF — https://aqi.dld.go.th/webnew/images/stories/document/data-import-export/importation_eng.pdf
 *    ⚠️ **2026-07-20 기준 403 Forbidden**(aqi.dld.go.th 도메인 전체가 봇 차단으로 보인다).
 *    User-Agent·Referer 를 바꿔도 실패했다. 이 URL 의 내용은 **미검증 상태**다.
 *
 * ⚠️ 최소 일령 12주는 2026-07-20 위 1차 출처로 재검증했다. 그전 주석에 DLD 인용으로 적혀
 *   있던 "at least 3 months old or 12 weeks or 84 days at time of administered" 는
 *   **어느 공식 문서에도 없는 문장**이었다(1차 출처엔 '3 months'·'84 days' 표현 자체가 없다).
 *   출처 없는 인용을 코드에 남기면 다른 나라 판단의 근거로 재사용된다 — 실제로 몽골 최소
 *   일령을 정할 때 이 문장이 논거로 쓰였다. 인용은 반드시 원문 대조 후 적을 것.
 *
 * ⚠️ 핵심:
 *  - **광견병 접종 출발 21일 전 완료** (1차 또는 단절 시; 유효 부스터 면제) + 생후 12주(84일) 이상
 *  - 종합백신 (개 DHPPL / 고양이 Panleukopenia 포함 FVRCP) 출발 21일 전 완료
 *  - **광견병 항체 검사 (RNATT)**: 태국 입국엔 비필수 (한국 귀국용은 별도 흐름)
 *  - R7 import permit: 출발 7영업일 ~ 60일 전 신청, 60일 유효 (별도 데이터 추적 미구현 → info)
 *  - 한국 APQA 검역: 출국 10일 이내 (보수 ≤9). DLD 자체 일자 명문 없음.
 *  - 핏불 계열 수입 금지
 *
 * 컨벤션 (NZ/HI/CN 와 동일):
 *  - 필수 입력 누락 시 SKIP
 *  - "X일 이내" → `dep - X ≤ N-1`
 *  - "X일 이전" / "X일 전" → `dep - X ≥ N` (이상 inclusive)
 */

const COUNTRY = 'thailand'

export const TH_CHECKS: ProcedureCheck[] = [
  {
    id: 'th.rabies-booster-within-prime-validity',
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
    id: 'th.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩, 백신 타이밍',
    description:
      '마이크로칩(ISO 11784/11785)이 광견병 접종일과 같거나 이전이어야 함. 입국 시 칩 번호와 서류 일치 검증. (DLD 표준) 백신 입력 시 client 차단(validateMicrochipBeforeBooster)과 짝 — 칩 시술일을 나중에 수정해 깨진 경우를 주의로 표면화.',
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
    id: 'th.microchip-before-general-vaccine',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩, 종합백신 타이밍',
    description:
      '마이크로칩(ISO 11784/11785)이 종합백신 접종일과 같거나 이전이어야 함. 칩으로 식별된 동물의 접종만 인정 — 백신 입력 시 client 차단(validateMicrochipBeforeBooster)과 짝, 칩 시술일 수정 후 깨진 경우를 주의로 표면화.',
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
    id: 'th.rabies-prime-after-12weeks',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 생후 12주(84일) 이상',
    description:
      '광견병 1차 접종은 생후 최소 12주(84일) 이후. 불활화(사독) 또는 재조합 백신만 인정. (DLD AQS-수완나품 안내 PDF 각주: "In case of primary Rabies vaccine: animal was at least 12 weeks old at the time of administration" — 개·고양이 동일. 태국 MFA PDF(Rev. 30 Jan 2025)도 "at least 12 weeks old at the time of vaccination")',
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
    id: 'th.rabies-21days-before-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국(=도착) 21일 이전 완료',
    description:
      '가장 최근 광견병 접종이 도착일 기준 21일 이전 완료. 단, 직전 접종 유효기간 내 재접종한 유효 부스터는 21일 면제. (DLD: "primary or discontinuity vaccination must wait for 21 days before departure. Valid booster vaccination, waiting period not required")',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      // 유효 부스터(직전 접종 면역 유효기간 내 재접종)는 21일 대기 면제 — DLD 원문.
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      if (isValidBooster(data, 'rabies_dates')) {
        return { ok: true, message: '유효 부스터 — 21일 대기 면제.' }
      }

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
    id: 'th.rabies-not-expired-on-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '도착일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간이 도착일 이전 만료되지 않아야 함. valid_until 명시 시 그 값 사용, 미명시 시 디폴트 1년 (`addOneYear` = 1주년 당일까지).',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      // 이미 만료(오늘 기준)는 common.rabies-validity-expired '주의'가 담당 — 여기선 아직
      // 유효한데 도착 시점에 만료 예정인 경우만 남긴다(만료 재구성 B, 2026-07-25).
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
  // (구 th.general-vaccine-required — "기록 없음" 안내 룰은 제거. 여정의 종합백신 카드가
  //  미완료 상태로 같은 사실을 이미 전달하므로 중복 노출이었음. 다른 룰과 동일하게
  //  "입력 없으면 SKIP" 컨벤션으로 통일. 2026-06-12)
  {
    id: 'th.general-vaccine-21days-before-arrival',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신 출국(=도착) 21일 이전 완료',
    description:
      '종합백신(강아지 DHPPL / 고양이 Panleukopenia 포함 FVRCP) 가장 최근 접종이 도착일 기준 21일 이전 완료. (DLD: 광견병과 동일 21일 룰 적용 — 1차/단절 시. 유효 부스터 면제하나 보수적으로 모든 경우 적용)',
    severity: 'warning',
    addedAt: '2026-05-06',
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
          message: '종합백신 접종은 출국 21일 전까지 해야 해요.',
          offendingPaths: ['departure_date', `general_vaccine_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 종합백신(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },
  {
    id: 'th.general-vaccine-not-expired-on-arrival',
    country: COUNTRY,
    category: '종합백신',
    title: '도착일에 종합백신 면역 유효',
    description:
      '최근 종합백신 면역 유효기간이 도착일 이전 만료되지 않아야 함. valid_until 명시 시 그 값 사용, 미명시 시 디폴트 1년.',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
      // 이미 만료(오늘 기준)는 common.general-vaccine-validity-expired '주의'가 담당 —
      // 여기선 아직 유효한데 도착 시점에 만료 예정인 경우만 남긴다(만료 재구성 B, 2026-07-25).
      if (validUntil < todayKst()) return SKIP
      if (validUntil < dep) {
        return {
          ok: false,
          message: msgGeneralVaccineExpiredBefore('출국'),
          offendingPaths: ['departure_date', `general_vaccine_dates[${latest.originalIndex}].date`],
        }
      }
      return { ok: true, message: `최근 종합백신(${latest.date}) 유효기간(${validUntil}) ≥ 출국일(${dep}).` }
    },
  },

  // ── 수입 금지 견종 ──
  {
    id: 'th.banned-breeds',
    country: COUNTRY,
    category: '서류',
    title: '수입 금지 견종 (Pit Bull 계열)',
    description:
      '태국은 American Pit Bull Terrier, American Staffordshire Terrier 등 핏불 계열 수입 금지. (DLD/태국 정부)',
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
        'american staffordshire terrier', '아메리칸 스태퍼드셔',
        'staffordshire bull terrier', '스태퍼드셔 불 테리어',
      ])
      if (match) {
        return {
          ok: false,
          message: `"${breed.ko || breed.en}"은 태국 수입이 금지되어 있어요 (매치: ${match}).`,
          offendingPaths: ['breed', 'breed_en'],
        }
      }
      return { ok: true, message: `견종 "${breed.ko || breed.en}" 통과.` }
    },
  },

  // ── 수입 허가 ──
  {
    id: 'th.import-permit-9days-before-entry',
    country: COUNTRY,
    category: '수입허가',
    title: '수입 허가 신청 마감 (출국 9일 전)',
    description:
      '수입 허가는 출국(=입국) 최소 7영업일(달력일 9일) 전까지 신청해야 함. **신청 전**에 오늘(KST) 기준 ' +
      '출국까지 9일 미만이면 "신청 시간 부족" 안내(info) — 출국일 앵커 D-day. 신청일을 입력하면 안내 중단 ' +
      '(이후는 카드 situational "진행 중" 메시지가 인계). 입력 차단·주의가 아닌 안내로만 — 리스크 안고 ' +
      '진행하는 보호자도 있어서. (DLD: at least 7 business days prior to departure)',
    severity: 'info',
    addedAt: '2026-06-12',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      // 이미 신청일을 입력했으면 안내하지 않는다 — 신청을 마친 뒤 "신청 시간 부족" 안내는 어색.
      // (신청 후 진행 안내는 카드 situational "진행 중" 메시지가 담당.)
      if (/^\d{4}-\d{2}-\d{2}$/.test(readScopedImportPermitFiled(data, destination))) return SKIP
      // 신청 전 — 오늘(KST) 기준 출국까지 9일 미만이면 안내. 보호자가 입력하는 건
      // 출국일이므로 출국일을 앵커로 D-day 계산. (단계 완료 시 카드 자체가 안 보임.)
      const dep = (readDepartureDate(caseRow, destination) ?? '').slice(0, 10)
      if (!dep) return SKIP
      const x = daysBetween(todayKst(), dep)
      if (x === null || x < 0 || x >= 9) return SKIP // 이미 지남·9일 이상 남음 → 침묵
      const when = x === 0 ? '오늘 출발 예정이에요.' : `${x}일 후 출발 예정이에요.`
      return {
        ok: false,
        message: `${when} 수입 허가 신청에 필요한 시간이 부족해요. 출국 전에 허가증을 받지 못하면 출발일을 변경하세요.`,
        offendingPaths: ['departure_date'],
      }
    },
  },
  {
    // R7 허가 60일 유효 — 너무 이른 신청(출국 전 만료) 주의 (2026-07-25 신설, 필리핀 패턴).
    // 입력 차단(validateImportPermitFiledDate case 'thailand')과 같은 함수를 본다.
    id: 'th.import-permit-within-60days',
    country: COUNTRY,
    category: '수입허가',
    title: '수입 허가는 출국 60일 이내 신청',
    description:
      'R7 수입 허가는 발급일로부터 60일 유효(th.ts 헤더) — 너무 일찍 신청하면 출국 전에 만료된다. 입력 차단과 같은 함수(validatePhImportPermitWithin60Days — 목적지 중립 60일 로직).',
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
    id: 'th.import-permit-not-after-departure',
    country: COUNTRY,
    category: '수입허가',
    title: '수입 허가 신청일, 출국일 순서',
    description:
      '수입 허가 신청일은 출국일 이전이어야 함(출국 당일·이후엔 신청 불가). 입력 차단(validateImportPermitNotAfterDeparture)과 같은 함수 — 출국일을 나중에 당겨 어긋난 경우를 주의로 표면화.',
    severity: 'warning',
    addedAt: '2026-06-13',
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
    id: 'th.import-permit-14days-after-vaccines',
    country: COUNTRY,
    category: '수입허가',
    title: '백신, 수입 허가 타이밍',
    description:
      '수입 허가 신청은 광견병·종합백신의 가장 최근 접종일 + 14일(2주) 이후. 입력 차단(validateThImportPermitVaccineGap)과 같은 함수 — 백신을 나중에 수정해 깨진 경우를 주의로 표면화.',
    severity: 'warning',
    addedAt: '2026-06-12',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const filed = readScopedImportPermitFiled(data, destination)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(filed)) return SKIP
      const msg = validateThImportPermitVaccineGap(filed, data)
      if (msg) {
        return {
          ok: false,
          message: msg,
          offendingPaths: ['import_permit_application_date'],
        }
      }
      return { ok: true, message: `신청일(${filed}) 백신 접종 14일 이후.` }
    },
  },

  // ── 검역 일정 재검증 — 입력 차단과 같은 규칙을 매 렌더 재실행 (jp.*-date-valid 와 동일 모델) ──
  {
    id: 'th.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '태국 수입 검역일',
    description: '태국 수입 검역일은 태국 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-06-12',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.th_import_quarantine_date === 'string'
          ? data.th_import_quarantine_date.slice(0, 10)
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
          message: '태국 수입 검역일은 태국 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['th_import_quarantine_date'],
        }
      }
      return { ok: true, message: `태국 수입검역일(${raw}) 입국 이후.` }
    },
  },
  {
    id: 'th.export-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '태국 수출 검역일',
    description: '태국 수출 검역일은 태국 입국일 이후·한국 귀국일 이전이어야 함.',
    severity: 'warning',
    addedAt: '2026-06-12',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.th_export_quarantine_date === 'string'
          ? data.th_export_quarantine_date.slice(0, 10)
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
          message: '태국 수출 검역일은 태국 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['th_export_quarantine_date'],
        }
      }
      if (ret && raw > ret) {
        return {
          ok: false,
          message: '태국 수출 검역일은 한국 귀국일보다 늦을 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['th_export_quarantine_date'],
        }
      }
      return { ok: true, message: `태국 수출검역일(${raw}) 태국 체류 구간 내.` }
    },
  },
]
