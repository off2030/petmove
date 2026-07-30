import type { CaseRow } from '../types'
import type { ProcedureCheck } from './types'
import {
  addMonths,
  addYears,
  daysBetween,
  exceedsValidityYears,
  findRabiesValidityBreaks,
  readExternalParasiteEntries,
  readHeartwormEntries,
  readInfectiousDiseaseEntries,
  readRabiesEntries,
  readScopedImportPermitFiled,
  SKIP,
  readDepartureDate,
} from './utils'
import { readByDestValue } from '../destination-scoped-fields'
import {
  validateDepartureNotAfterQuarantineStart,
  validateInfectiousDiseaseTestDate,
  violatesRabiesEntryWait,
} from '../journey-steps/date-rules'
import { msgRabiesExpiredBefore, msgRabiesPrimeMinAge } from './messages'

/**
 * 남아프리카공화국 (DALRRD — Department of Agriculture, Land Reform & Rural Development)
 * 절차 검증.
 *
 * 1차 출처(조사 정리본 docs/south-africa-pet-travel-guide-draft.md):
 *  - 남아공 정부 동물·축산물 수입 안내(gov.za)
 *  - 농업부 Animal Health — 수입 신청서·건강증명서 서식, Import/Export Policy Unit 수수료 문서
 *  - 2024-04-01 시행 AIA 사전승인 지침(살아있는 동물 수출입 지침)
 *  - 공개된 개 Veterinary Health Certificate(2026-03판)
 *
 * ⚠️ 남아공은 **발급받은 수입 허가서·건강증명서가 최종 기준**이라고 공식 안내한다. 여기 룰은
 *   공개 서식 기준의 하한이고, 개별 케이스에서 증명서 조건이 다르면 증명서가 우선한다.
 *   그래서 이 파일은 **판정할 수 있는 것만** 다룬다 — 거주 이력(6개월 연속)·검사기관 인정
 *   여부처럼 앱이 데이터를 갖고 있지 않은 조건은 카드 안내로만 두고 룰을 만들지 않는다.
 *
 * 핵심 룰:
 *  - 광견병: 마이크로칩 이후 · 생후 3개월(달력) 이후 · 출국 30일 전 이상(유효 부스터 면제) ·
 *    출국일이 유효기간(1년) 이내.
 *  - 항체 검사(RNATT) **없음** — 입국 요건이 아니고, 편도 전용이라 귀국용도 없다.
 *  - 5종 전염병 검사: 출국 30일 이내(≤29). 강아지 전용.
 *  - 심장사상충 예방: 음성 검사 채혈일 이후 시작. 강아지 전용.
 *  - 진드기·흡혈곤충 처치: 출국 30일 이내. 강아지 전용.
 *  - 허가 2장(AIA · 수의검역)은 둘 다 **버튼 완료 카드**라 날짜 검증이 없다 —
 *    남는 건 순서(AIA → 수의검역)뿐이고 그건 importPermitPrerequisiteError 가 막는다.
 *  - 검역 시작일 ≥ 출국일.
 *
 * 컨벤션 (IL/RU/MX 와 동일):
 *  - 필수 입력 누락 시 SKIP.
 *  - "N일 이내" = 출국일 포함 ≤N-1 (한국 공통 컨벤션).
 */

const COUNTRY = 'south_africa'

function species(caseRow: CaseRow): string {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  return typeof data.species === 'string' ? data.species : ''
}

/** by_dest 우선 · 없으면 top-level 인 날짜 리더(호주·뉴질랜드와 같은 형태). */
function readScopedDate(
  caseRow: CaseRow,
  destination: string | null | undefined,
  key: string,
): string {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const scoped = readByDestValue(data, destination ?? null, key)
  if (typeof scoped === 'string') return scoped.slice(0, 10)
  if (scoped === null) return ''
  const raw = data[key]
  return typeof raw === 'string' ? raw.slice(0, 10) : ''
}

export const ZA_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  // ⛔ 'za.microchip-before-rabies'(칩이 1차 접종보다 앞) 룰을 다시 만들지 말 것 —
  //   2026-07-30 원문 대조로 삭제했다. HA2123 증명서 A.1 은 칩 번호·위치 표와
  //   "Microchip must be able to be read by ISO 11784 or ISO 11785 scanners" 한 줄이 전부이고,
  //   접종·채혈과의 **순서 조항이 없다**. 칩을 먼저 넣는 건 실무 권고(리포 초안 "가장 안전")일
  //   뿐인데 요건으로 올려 놨던 것이다. EU(Reg 576/2013)·일본과 달리 남아공엔 근거가 없다.

  // ── 광견병 ──
  {
    id: 'za.rabies-prime-after-3months-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 생후 3개월령(캘린더) 이상',
    description:
      '광견병 1차 접종은 생년월일 기준 캘린더 3개월(`addMonths(birth, 3)`) 이후. ✅ 1차 출처 확인(2026-07-30) — HA2123 증명서 4항이 "for animals **over 3 months**"와 "for animals **under 3 months**"(모견 접종란)로 갈리고, 각주 1) d)가 "Animals under 3 months of age **may not be vaccinated**"라고 못박는다. 달력 개월이므로 91일 근사 대신 정확한 월 계산 — 일수로 환산하면 생월에 따라 89~92일로 흔들려 규정을 지킨 케이스를 막는다(괌·베트남과 같은 처리). ⚠️ 각주 1) d) 의 모견 예외(3개월 미만 개체는 모견이 출산 30일~12개월 전에 접종했으면 유효한 접종으로 간주, 남아공 도착 후 3개월령에 접종)는 **판정하지 않는다** — 앱이 모견 접종 기록을 저장하지 않는다.',
    severity: 'warning',
    addedAt: '2026-07-30',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!birth || rabies.length === 0) return SKIP

      const first = rabies[0]
      const earliestValid = addMonths(birth, 3)
      if (!earliestValid) return SKIP
      if (first.date < earliestValid) {
        return {
          ok: false,
          message: msgRabiesPrimeMinAge('3개월'),
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      const age = daysBetween(birth, first.date)
      return {
        ok: true,
        message: `1차 접종일(${first.date}) ≥ 3개월령(${earliestValid}). 생후 ${age}일.`,
      }
    },
  },
  {
    // ⛔ 구 'za.rabies-30to364days-before-departure'(30일 대기 + 유효기간을 한 룰에 넣은 것)는
    //   2026-07-30 에 아래 세 룰로 나눴다. 이유 둘:
    //   ① 그 룰은 최근 접종일만 보고 30일을 셌다 — **유효 부스터 면제**를 구현하지 않아
    //      정상적인 부스터 케이스(만료 직전 추가접종 후 곧 출국)를 위반으로 잡았다.
    //   ② 이름이 배선 린트의 컨벤션(`*.rabies-min-<N>days-before-departure`)에 안 맞아
    //      프로파일 파생 저장 거부와 짝이 맺어지지 않았다.
    //   구 id 는 org_disabled_checks 에 남을 수 있지만 남아공은 앱 미노출 목적지였고 실제
    //   케이스가 없어 영향이 없다.
    id: 'za.rabies-min-30days-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국일 30일 이상 전',
    description:
      '최근 광견병 접종일로부터 출국일까지 최소 30일 경과 필요. HA2123 각주 1) b) "In the case of the primary Rabies vaccination, the animal must have been vaccinated at least 30 days, but not longer than 12 months **prior to export**" — 앵커가 **출국(export)**이라 앱 판정과 규정이 정확히 같다(2026-07-30 원문 확인. 구 주석의 "규정 앵커는 도착일"은 오독이었다). 유효 부스터는 면제 — 각주 1) c) "The 30 days waiting period ... does not apply to the booster vaccination if it was applied before the previous Rabies vaccination expired". 저장 거부(validateRabiesEntryWait ← 프로파일 rabies.entryWaitDaysAfterVaccine: 30)와 **같은 판정 함수**(violatesRabiesEntryWait)를 쓴다.',
    severity: 'warning',
    addedAt: '2026-07-01',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const latest = rabies[rabies.length - 1]
      // 판정은 도메인 함수 하나 — 저장 거부(항공권 카드)와 이 주의가 어긋나면 안 된다.
      // 기준은 **최근** 접종이고 유효 부스터는 면제(베트남·멕시코와 같은 형태).
      if (!violatesRabiesEntryWait(data, dep, destination)) {
        return {
          ok: true,
          message: `최근 접종(${latest.date}) → 출국일(${dep}): 30일 충족(또는 유효 부스터).`,
        }
      }
      // 접종일은 지나간 사실이라 조치는 '출국일을 미루는 것'뿐 — 날짜를 넣지 않는다
      // (고객 노출 문구 규칙 — lint:checks).
      return {
        ok: false,
        message:
          '광견병 접종 후 30일이 지나야 남아프리카공화국에 입국할 수 있어요. 출국일을 미뤄야 해요.',
        offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
      }
    },
  },
  {
    id: 'za.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효기간이 남아있어야 함',
    description:
      '남아공은 "출국 12개월 이내 접종"을 요구한다 = 출국일이 최근 접종의 유효기간(달력 1년, 1주년 당일 포함) 안이어야 한다. 만료됐으면 재접종이 필요하고, 재접종은 새 1차라 30일 대기가 다시 붙는다(za.rabies-min-30days-before-departure).',
    severity: 'warning',
    addedAt: '2026-07-30',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      // 윤년에도 정확하도록 일수 대신 날짜 비교.
      const validUntil = addYears(latest.date, 1)
      if (!validUntil) return SKIP
      if (dep > validUntil) {
        return {
          ok: false,
          message: msgRabiesExpiredBefore('출국'),
          offendingPaths: [`rabies_dates[${latest.originalIndex}].date`, 'departure_date'],
        }
      }
      return { ok: true, message: `출국일(${dep}) ≤ 유효기간(${validUntil}).` }
    },
  },
  {
    id: 'za.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간(1년) 이내에 해야 함. 만료 후 접종은 chain 이 끊겨 새 1차로 간주되고 30일 대기가 다시 시작된다. 저장 거부(findRabiesChainBreak)의 짝이 되는 주의 — 펫무브워크는 저장을 막지 않고 절차검증만 보므로 이 룰이 없으면 운영자 화면에서 끊긴 chain 이 안 보인다.',
    severity: 'warning',
    addedAt: '2026-07-30',
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
    id: 'za.rabies-only-1year-vaccine',
    country: COUNTRY,
    category: '광견병',
    title: '1년 라이선스 광견병 백신만 인정 (2·3년 거부)',
    description:
      '남아공은 라이선스 기간과 무관하게 **입국 12개월 이내 접종**을 요구하므로 유효기간을 1년만 인정한다. valid_until 이 접종일 + 1년(달력, 그날 포함) 초과면 거부. 프로파일 rabies.oneYearVaccineOnly 선언이 저장 거부(펫무브앱 YearSelect 비활성)의 출처이고, 이 룰이 그 짝이다.',
    severity: 'blocker',
    addedAt: '2026-07-30',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      if (rabies.length === 0) return SKIP

      const offending: string[] = []
      for (const r of rabies) {
        if (exceedsValidityYears(r.date, r.valid_until)) {
          offending.push(`rabies_dates[${r.originalIndex}].valid_until`)
        }
      }
      if (offending.length > 0) {
        return {
          ok: false,
          message:
            '남아프리카공화국은 유효기간 1년인 광견병 백신만 인정해요. 2년·3년 백신은 인정되지 않아요.',
          offendingPaths: offending,
        }
      }
      return { ok: true, message: `광견병 ${rabies.length}건 모두 1년 유효기간 이내.` }
    },
  },

  // ── 전염병 검사 (5종) — 강아지 전용 ──
  {
    id: 'za.infectious-disease-within-29days',
    country: COUNTRY,
    category: '검사',
    title: '전염병 검사는 도착 30일 이내 (강아지)',
    description:
      '5종 검사(Brucella canis · Trypanosoma evansi · Babesia gibsoni · Dirofilaria immitis · Leishmania) 채혈일이 **남아공 도착일** 기준 30일 이내여야 함 — HA2123 5항 "within 30 days from date of sample collection to the **date of import**". 도착일은 **검역 시작일**(za_quarantine_reservation_date, 검역시설 예약 카드)로 안다. 그 값이 없으면 출국일 기준 29일로 폴백한다(비행 하루치 여유 — 도착이 출국 다음 날이어도 30일을 안 넘긴다). 저장 거부(validateInfectiousDiseaseTestDate)와 같은 함수 — INFECTIOUS_TEST_DEPARTURE_WINDOWS.south_africa 가 단일 출처. ⚠️ 룰 id 의 29days 는 폴백 값 잔재다(org_disabled_checks 에 저장되므로 그대로 둔다).',
    severity: 'warning',
    addedAt: '2026-07-01',
    run: ({ caseRow, destination }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const entries = readInfectiousDiseaseEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      // 도착일 = 검역 시작일. 있으면 규정 앵커 그대로 30일, 없으면 출국일 29일 폴백.
      const arrival = readScopedDate(caseRow, destination, 'za_quarantine_reservation_date')
      const blocked = validateInfectiousDiseaseTestDate(latest.date, dep, COUNTRY, arrival)
      if (blocked) {
        const paths = [`infectious_disease_records[${latest.originalIndex}].date`]
        if (days >= 0) paths.push('departure_date')
        return { ok: false, message: blocked, offendingPaths: paths }
      }
      const anchorLabel = arrival ? `검역 시작일(${arrival})` : `출국일(${dep})`
      return {
        ok: true,
        message: `최근 전염병검사(${latest.date}) → ${anchorLabel}: 창 이내.`,
      }
    },
  },

  // ── 심장사상충 예방 — 강아지 전용 ──
  {
    id: 'za.heartworm-not-before-infectious-test',
    country: COUNTRY,
    category: '구충',
    title: '심장사상충 예방은 음성 검사 채혈 이후 (강아지)',
    description:
      '건강증명서는 Dirofilaria immitis **음성 검체를 채취한 날부터 출국일까지** 예방을 유지하도록 요구한다. 예방 기록이 그 채혈일보다 앞서면 증명서가 요구하는 구간을 덮지 못한다. ⚠️ 상한(출국 N일 이내)은 두지 않는다 — 남아공은 "출국일까지 끊기지 않게"만 요구하고 마지막 투약 시점을 규정하지 않는다(뉴질랜드 5일 창을 가져오지 말 것). 채혈일은 5종 검사 카드(infectious_disease_records)에서 읽는다 — 심장사상충 검사가 그 5종에 들어 있기 때문.',
    severity: 'warning',
    addedAt: '2026-07-30',
    run: ({ caseRow }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const heartworm = readHeartwormEntries(caseRow)
      const infectious = readInfectiousDiseaseEntries(caseRow)
      if (heartworm.length === 0 || infectious.length === 0) return SKIP

      // 채혈 기준일 = 가장 최근 5종 검사(증명서에 적히는 그 검사).
      const sample = infectious[infectious.length - 1]
      const earliest = heartworm.reduce((a, b) => (a.date <= b.date ? a : b))
      if (earliest.date < sample.date) {
        return {
          ok: false,
          message:
            '심장사상충 예방 기록이 검사 채혈일보다 빨라요. 채혈일부터 출국일까지 끊기지 않게 투약한 기록이 필요해요.',
          offendingPaths: [
            `heartworm_dates[${earliest.originalIndex}].date`,
            `infectious_disease_records[${sample.originalIndex}].date`,
          ],
        }
      }
      return { ok: true, message: `심장사상충 예방(${earliest.date}) ≥ 채혈일(${sample.date}).` }
    },
  },

  // ── 진드기·흡혈곤충 처치 — 강아지 전용 ──
  {
    id: 'za.external-parasite-within-30days',
    country: COUNTRY,
    category: '구충',
    title: '진드기·흡혈곤충 처치는 출국 30일 이내 (강아지)',
    description:
      '✅ 1차 출처 확인(2026-07-30) — HA2123 증명서 6.2 "Leishmania and Babesia gibsoni: the animals must be treated with an effective **acaricide** and with **insect repellent** registered in the exporting country, **within 30 days before departure**." 앵커가 출국일이고 창이 30일이라 gap ≤ 30 으로 판정한다(구 29 는 도착일 앵커로 오해해 하루 좁혀 둔 값이었다 — 2026-07-30 정정). 저장 거부(validateParasiteDateForDestination — PARASITE_DEPARTURE_WINDOWS.south_africa, kinds: [external])와 짝. ⚠️ 리포 초안이 "2026-03판에서 처치 항목 구성이 바뀌었다"고 유보했지만, 확인된 최신 서식(2024-11-14 개정)에는 이 조항이 그대로 있다. 발급받은 증명서가 최종 기준이라는 안내는 카드 문구에 남긴다.',
    severity: 'warning',
    addedAt: '2026-07-30',
    run: ({ caseRow, destination }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const entries = readExternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 0) {
        return {
          ok: false,
          message: '처치일이 출국일보다 늦어요. 날짜를 확인하세요.',
          offendingPaths: [`external_parasite_dates[${latest.originalIndex}].date`],
        }
      }
      if (days > 30) {
        return {
          ok: false,
          message: '진드기·흡혈곤충 처치는 출국 30일 이내에 해야 해요. 다시 처치해야 할 수 있어요.',
          offendingPaths: [
            `external_parasite_dates[${latest.originalIndex}].date`,
            'departure_date',
          ],
        }
      }
      return {
        ok: true,
        message: `마지막 처치(${latest.date}) → 출국일(${dep}): ${days}일 (≤30일).`,
      }
    },
  },

  // ── 허가 2장 · 검역 ──
  // ⛔ 'za.aia-permit-not-after-departure'(AIA 신청일 < 출국일) 룰을 다시 만들지 말 것 —
  //   2026-07-30 AIA 카드가 버튼 완료로 바뀌며 삭제했다. 저장값이 신청일이 아니라 **허가
  //   취득일**(버튼 누른 날)이라 판정 근거가 사라졌다. 호주가 같은 이유로
  //   au.import-permit-not-after-departure 를 뗀 것과 같은 자리다. 수입 허가와의 순서는
  //   아래 za.aia-permit-before-import-permit + importPermitPrerequisiteError 가 담당한다.
  {
    id: 'za.aia-permit-before-import-permit',
    country: COUNTRY,
    category: '수입허가',
    title: 'AIA 허가를 수의검역 수입 허가보다 먼저 (강아지)',
    description:
      '✅ 규정 명문(DALRRD 보도자료 2024-04-10) — "the Animal Improvement Permit/authorisation must be applied for first, and the AIA Permit/authorisation must be **attached to** the application for the Veterinary Import Permit". AIA 허가서가 수의검역 허가 신청의 첨부물이라 순서가 뒤집히면 신청 자체가 성립하지 않는다. 저장 거부(importPermitPrerequisiteError — 뉴질랜드 RCF·호주 RNATT 선언서와 같은 함수)의 짝이 되는 주의 — 수의검역 신청일을 넣은 뒤 AIA 완료를 취소한 경우를 표면화한다. ⛔ **날짜 크기 비교를 넣지 말 것** — AIA 카드가 버튼 완료라 저장값이 \'버튼 누른 날\'이어서, 순서를 제대로 지킨 케이스에도 오경보가 난다(호주 RNATT 선언서와 같은 이유). ⚠️ **고양이는 AIA 면제**라 판정하지 않는다("animals such as cats, birds and fish do not require an AIA Permit").',
    severity: 'warning',
    addedAt: '2026-07-30',
    run: ({ caseRow, destination }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const filed = readScopedImportPermitFiled(data, destination)
      // 수의검역 허가 카드에 입력이 없으면 아직 판정할 게 없다.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(filed)) return SKIP
      const aia = readScopedDate(caseRow, destination, 'za_aia_permit_application_date')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(aia)) {
        return {
          ok: false,
          message:
            'AIA 수입 허가를 먼저 받아야 해요. AIA 허가서를 첨부해서 수의검역 수입 허가를 신청해요.',
          offendingPaths: ['za_aia_permit_application_date', 'import_permit_application_date'],
        }
      }
      return { ok: true, message: `AIA 허가 취득(${aia}) 완료 — 수의검역 신청(${filed}).` }
    },
  },
  // ⛔ 'za.import-permit-not-after-departure'(수입 허가 신청일 < 출국일) 룰을 다시 만들지 말 것 —
  //   2026-07-30 수입 허가 카드가 **버튼 완료**로 바뀌며 삭제했다. 저장값이 신청일이 아니라
  //   허가 취득일(버튼 누른 날)이라 판정 근거가 사라졌다. AIA 카드·호주 수입 허가와 같은 자리다.
  {
    id: 'za.quarantine-start-not-before-departure',
    country: COUNTRY,
    category: '검역',
    title: '출국일은 검역 시작일보다 늦을 수 없음',
    description:
      '도착한 강아지는 화물터미널 확인 후 바로 국가 검역시설로 옮겨진다. 검역 시작일 = 도착일이고 도착은 출국 이후거나 같은 날이라, 출국일이 검역 시작일보다 뒤면 예약이나 항공 일정 중 하나가 어긋난 것이다. 저장 거부(validateDepartureNotAfterQuarantineStart)와 같은 함수 — 카드는 **운송 예약**(출국일 칸이 있는 쪽, 호주·뉴질랜드·싱가포르와 같은 배치).',
    severity: 'warning',
    addedAt: '2026-07-30',
    run: ({ caseRow, destination }) => {
      const start = readScopedDate(caseRow, destination, 'za_quarantine_reservation_date')
      const dep = readDepartureDate(caseRow, destination)
      if (!start || !dep) return SKIP
      const msg = validateDepartureNotAfterQuarantineStart(dep, start)
      if (msg) {
        return {
          ok: false,
          message: msg,
          offendingPaths: ['za_quarantine_reservation_date', 'departure_date'],
        }
      }
      return { ok: true, message: `출국일(${dep}) ≤ 검역 시작일(${start}).` }
    },
  },
  {
    id: 'za.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '남아프리카공화국 수입 검역일',
    description: '남아프리카공화국 수입 검역(검역 시작)일은 출국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-30',
    run: ({ caseRow, destination }) => {
      const raw = readScopedDate(caseRow, destination, 'za_import_quarantine_date')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const dep = readDepartureDate(caseRow, destination)
      if (dep && raw < dep) {
        return {
          ok: false,
          message: '남아프리카공화국 수입 검역일은 출국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['za_import_quarantine_date'],
        }
      }
      return { ok: true, message: `남아프리카공화국 수입검역일(${raw}) 출국 이후.` }
    },
  },
]
