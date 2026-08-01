import type { CaseRow } from '../types'
import type { ProcedureCheck } from './types'
import {
  addMonths,
  daysBetween,
  findRabiesValidityBreaks,
  matchBannedBreed,
  readBreed,
  readCivEntries,
  readExternalParasiteEntries,
  readHeartwormEntries,
  readLungwormEntries,
  readInfectiousDiseaseEntries,
  readInternalParasiteEntries,
  readRabiesEntries,
  readScopedImportPermitFiled,
  readTiterEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
} from './utils'
import { readByDestValue } from '../destination-scoped-fields'
import {
  findOperativeRabiesPrimary,
  validateIdentityCheckAfterMicrochip,
  validateIdentityCheckBeforeTiter,
  validateIdentityCheckOrder,
  validateImportPermitNotAfterDeparture,
  validateInfectiousDiseaseTestDate,
  validateNzExternalSecondDose,
  validateNzExternalLastDose,
  validateNzInfectiousTestAfterExternal,
  validateNzQuarantineStartAfterTiter,
  validateDepartureNotAfterQuarantineStart,
  validateNzRcfDate,
  validateNzWithin5Days,
  validateRabiesDocRequiresTiter,
  validateTiterAfterIdentityCheck,
} from '../journey-steps/date-rules'
import {
  msgExportQuarantineAfterReturn,
  msgExportQuarantineBeforeEntry,
  msgMicrochipBeforeRabies,
  msgRabiesExpiredBefore,
  msgRabiesPrimeMinAge,
  msgTiterBeforeVaccine,
} from './messages'

/**
 * 뉴질랜드 (MPI — Ministry for Primary Industries) 절차 검증.
 *
 * 한국 = **category 3**(rabies absent or well-controlled). 1차 출처 전문 확인(2026-07-27):
 *  - Import Health Standard: Cats and Dogs 2026 (CATSDOGS.GEN, 2026-05-12 서명 / 2026-07-01 발효)
 *  - "Bringing your Dog to New Zealand — Dogs from category 3 countries" 지원문서 + 체크리스트
 *
 * ⚠️ 2026-07-27 전면 개정 — 이 파일은 **구 IHS(2021) 기준**으로 2026-05-06 에 작성돼 있었고,
 *   신 IHS 에서 바뀐 값들이 그대로 남아 있었다. 정정 목록:
 *   ① **항체 채혈 창 3~24개월 → 3~12개월.** 24개월 상한은 폐지됐다(2.1.3(3)).
 *      상한을 넉넉히 잡아 두면 **규정 위반 일정을 통과시킨다** — 가장 위험한 오류였다.
 *   ② **광견병 최소 연령이 '캘린더 3개월'이었다.** 신 IHS 는 "at least 12 weeks of age"(84일).
 *   ③ **면역 유효 기준이 '출국 + 계류 10일'이었다.** 규정은 "must remain continuously valid
 *      **until shipment**"(2.1.3(2)) 뿐이다. 계류 기간까지 유효를 요구하는 건 CIV 백신 하나다
 *      (2.9(2)(a)(i)). 종합·켄넬코프에 붙어 있던 10일 cushion 도 근거가 없어 삭제.
 *   ④ **내부구충 2차 4일 → 5일**(2.3(1)(b)), **심장사상충 투약 4일 → 5일**(2.11(2)(a)).
 *   ⑤ **외부구충이 '1차 30일 이내 + 2차 2일 이내'였다.** 신 IHS 2.2(2)는 기준이 다르다 —
 *      1차는 **바베시아 채혈 14일 전까지**, 마지막은 **출국 전 16일 이내**.
 *   ⑥ **전염병 검사 16일 → 30일**(2.7·2.8·2.12·2.13 모두 "in the 30 days before shipment").
 *   ⑦ **CIV 가 '의무 아님'으로 적혀 있었다.** 신 IHS 2.9(2)는 위험국 목록(MPI-STD-SAA)에
 *      한국을 넣었다 — 지원문서 제목 그대로 "Dogs from Canada, Korea (Republic) and USA only".
 *      **접종 또는 출국 전 10일 이내 PCR** 중 하나가 필수다.
 *   ⑧ 종합백신·켄넬코프는 **MPI 요건이 아니다**(계류시설 요구사항) → 날짜 룰 삭제.
 *   ⑨ severity 를 전부 info → warning 으로(타임라인 '주의'에 뜨게). 신설: 마이크로칩 인증 이후
 *      절차인 항체 순서·수입허가·계류 예약·도착 검역·수입 금지 품종.
 *
 * 경과 규정(1.19) — 2026-07-01 ~ 2027-04-01 은 구 IHS 로도 통관되지만 앱은 **신 IHS 하나만**
 *   판정한다. 두 벌을 동시에 통과시키면 어느 쪽으로 준비 중인지 알 수 없고, 2027-04-01 이후엔
 *   신 기준만 남는다. 지금 준비를 시작하는 고객은 신 기준으로 가야 안전하다.
 *
 * 컨벤션: au 와 동일.
 *  - 필수 입력 누락 시 SKIP
 *  - MPI "in the X days before shipment" = `dep - date ≤ X`(경계일 포함). 체크리스트가
 *    '30일 전 / 16일 전 / 5일 전' 구간을 그대로 행으로 나눠 놓아 경계일을 허용한다.
 *  - "not less than N months" 는 캘린더(`addMonths`) 기준
 *  - 종 필터는 run() 안에서 caseRow.data.species 로 가드
 *
 * 고양이는 아직 다루지 않았다(사용자 지시 '우선 강아지부터'). 고양이 전용 차이는 별도 확인
 *   후 반영할 것 — 신 IHS 상 개 전용 조항은 2.4·2.5·2.6·2.7·2.8·2.10·2.11·2.12·2.13 이다.
 */

const COUNTRY = 'new_zealand'

function species(caseRow: CaseRow): string {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  return typeof data.species === 'string' ? data.species : ''
}

/** 중성화하지 않은 개체(브루셀라 검사 대상) — sex 가 male/female 이면 entire. */
function isIntact(caseRow: CaseRow): boolean {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const sex = typeof data.sex === 'string' ? data.sex : ''
  return sex === 'male' || sex === 'female'
}

/** by_dest 우선 · 없으면 top-level 인 날짜 리더(호주와 같은 형태). */
function readScopedDate(caseRow: CaseRow, destination: string | null | undefined, key: string): string {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const scoped = readByDestValue(data, destination ?? null, key)
  if (typeof scoped === 'string') return scoped.slice(0, 10)
  if (scoped === null) return ''
  const raw = data[key]
  return typeof raw === 'string' ? raw.slice(0, 10) : ''
}

/**
 * 마이크로칩 인증일 — 1차(`id_date`)와 2차(`id_date_2`) 중 **늦은 쪽**.
 *
 * IHS 1.11(4) 의 2회 케이스(채혈이 출국 3~6개월 전)는 2차가 채혈 직전에 온다. '채혈 전' 판정은
 * 마지막 인증 기준이어야 하고, '출국 6개월 이전' 판정은 1차 기준이어야 한다 — 두 룰이 서로
 * 다른 회차를 본다. 1회 케이스는 2차가 비어 있어 자연히 1차가 쓰인다.
 */
function readLatestIdentityCheckDate(caseRow: CaseRow, destination?: string | null): string {
  const first = readScopedDate(caseRow, destination, 'id_date')
  const second = readScopedDate(caseRow, destination, 'id_date_2')
  if (!second) return first
  if (!first) return second
  return second > first ? second : first
}

/**
 * 현재 유효한 '1차 접종'(primary) 을 찾는다.
 *
 * IHS 2.1.3 guidance — "A 'primary' rabies vaccination is the first vaccination ... **or** the
 * first vaccination given if the previous vaccination(s) did not remain continuously valid."
 * 즉 chain 이 끊기면 그 다음 접종이 새 1차가 되고, 출국 6개월 전 하한이 **거기서 다시 시작**한다.
 *
 * ⚠️ 구 룰(nz.rabies-primary-min-6months-before)은 접종이 2회 이상이면 "booster chain 이니
 *   적용 제외"로 무조건 통과시켰다. 그래서 **만료 후 재접종(= 새 1차)을 놓쳤다** — 정확히
 *   6개월 하한이 필요한 경우인데 검사를 건너뛰고 있었다.
 *
 * 판정 본체는 date-rules 의 findOperativeRabiesPrimary — 저장 거부(validateNzPrimaryRabiesWait,
 * 항공권 출국일 입력)와 **같은 함수**를 쓴다(단일 출처, 2026-08-01).
 */
function findOperativePrimary(entries: ReturnType<typeof readRabiesEntries>) {
  return findOperativeRabiesPrimary(entries)
}

export const NZ_CHECKS: ProcedureCheck[] = [
  // ── 마이크로칩 ──
  {
    id: 'nz.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩은 광견병 1차 접종 이전 시술',
    description:
      'ISO 호환 마이크로칩(11784 / Annex A of 11785)이 광견병 1차 접종일 이전이어야 함. IHS 2.1.3(1) — 광견병 접종과 항체 채혈 **양쪽 시점에** 수의사가 칩 번호를 확인·기록해야 한다. 999 로 시작하는 번호는 고유성이 보장되지 않아 인정되지 않는다(지원문서 Microchip).',
    severity: 'warning',
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
        message: msgMicrochipBeforeRabies(),
        offendingPaths: ['microchip_implant_date'],
      }
    },
  },
  {
    id: 'nz.microchip-before-identity-check',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩 인증은 칩 시술 이후',
    description:
      '검역관이 확인하는 대상이 마이크로칩이므로 칩 시술일보다 앞선 인증일은 성립하지 않는다. 저장 거부(validateIdentityCheckAfterMicrochip)와 같은 함수 — 인증을 먼저 저장한 뒤 칩 시술일을 나중 날짜로 고친 경우를 표면화하는 짝 주의. 칩 시술일은 이미 지나간 사실이라 조치 가능한 쪽(인증일)으로 안내한다.',
    severity: 'warning',
    addedAt: '2026-07-29',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const chip =
        typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
      const first = readScopedDate(caseRow, destination, 'id_date')
      if (!chip || !first) return SKIP
      const msg = validateIdentityCheckAfterMicrochip(chip, first)
      if (msg) return { ok: false, message: msg, offendingPaths: ['id_date'] }
      return { ok: true, message: `마이크로칩(${chip}) ≤ 1차 인증(${first}).` }
    },
  },
  {
    id: 'nz.identity-check-order',
    country: COUNTRY,
    category: '마이크로칩',
    title: '2차 인증은 1차 이후',
    description:
      'IHS 1.11(4) 의 2회 케이스는 1차(출국 6개월 이전) → 2차(채혈 직전) 순서다. 회차가 뒤집힌 기록은 그 자체로 잘못된 입력이라 저장 거부(validateIdentityCheckOrder)와 짝을 이룬다. 2차 없이 1차만 있는 1회 케이스는 SKIP.',
    severity: 'warning',
    addedAt: '2026-07-29',
    run: ({ caseRow, destination }) => {
      const first = readScopedDate(caseRow, destination, 'id_date')
      const second = readScopedDate(caseRow, destination, 'id_date_2')
      if (!first || !second) return SKIP
      const msg = validateIdentityCheckOrder(first, second)
      if (msg) return { ok: false, message: msg, offendingPaths: ['id_date_2', 'id_date'] }
      return { ok: true, message: `1차(${first}) ≤ 2차(${second}).` }
    },
  },
  {
    id: 'nz.identity-check-before-titer',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩 인증은 항체 채혈 전',
    description:
      'IHS 1.11(4) — 검역관의 pre-export identification check 는 RNATT 채혈 **전에** 끝나야 한다. 호주와 달리 **필수 절차**라 어기면 계류 연장이 아니라 수입 허가 자체가 나오지 않는다(1.13 "a pre-export identification check form must have been entered into our online system by an official veterinarian before we can issue an import permit"). 같은 날은 허용된다(1.11 guidance "The blood sample for the RNATT can be taken on the same day as the microchip scan"). 저장 거부(validateIdentityCheckBeforeTiter)와 같은 함수 — 인증을 먼저 저장한 뒤 채혈일을 더 이른 날로 고친 경우를 표면화하는 짝 주의.',
    severity: 'warning',
    addedAt: '2026-07-28',
    run: ({ caseRow, destination }) => {
      // 2회 받는 케이스는 **마지막 인증**이 채혈 전이어야 한다(1차는 6개월 전이라 자동 성립).
      const id = readLatestIdentityCheckDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (titers.length === 0) return SKIP
      // ⚠️ 인증일 미입력도 잡는다(2026-07-29 사용자 지적) — 예전엔 `if (!id) return SKIP` 이라
      //   인증 없이 채혈만 기록된 케이스에서 아무것도 뜨지 않았다. 저장 거부는 **새로 입력할 때**만
      //   걸리므로 이미 저장된 케이스는 그냥 지나갔다. 뉴질랜드는 인증이 필수 절차라 인증 없는
      //   채혈은 무효이고, 저장 거부와 **같은 함수**로 판정해 문구도 하나로 맞춘다.
      if (!id) {
        const earliest = titers.reduce((a, b) => (a.date <= b.date ? a : b))
        const msg = validateTiterAfterIdentityCheck('', earliest.date, { required: true })
        if (msg) {
          return {
            ok: false,
            message: msg,
            offendingPaths: ['id_date', `rabies_titer_records[${earliest.originalIndex}].date`],
          }
        }
        return SKIP
      }
      const msg = validateIdentityCheckBeforeTiter(
        id,
        titers.map((t) => t.date),
      )
      if (msg) {
        return {
          ok: false,
          message: msg,
          offendingPaths: [
            'id_date',
            'id_date_2',
            `rabies_titer_records[${titers[0].originalIndex}].date`,
          ],
        }
      }
      return { ok: true, message: `인증(${id}) → 채혈(${titers[0].date}).` }
    },
  },
  {
    id: 'nz.identity-check-6months-before-departure',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩 인증은 출국 6개월 이전',
    description:
      'IHS 1.11(4) — 인증 횟수가 채혈 시점에 따라 갈리지만(6~12개월 전 채혈이면 1회, 3~6개월 전 채혈이면 2회) **두 갈래 모두 첫 인증이 출국 6개월 이전**이다. 1회 경로도 인증이 채혈보다 앞서고 그 채혈이 출국 6개월 이전이라 자동으로 성립한다. 경과 규정(1.19)도 2027-04-01 부터 전 케이스에 "the identification check at least six months before shipment" 를 명시한다. 그래서 앱이 1회/2회 분기를 몰라도 이 하한 하나로 판정할 수 있다. **되돌릴 수 없는 마감**이라(늦으면 출국일을 미루는 수밖에 없다) 광견병 1차 6개월 하한과 같은 무게다.',
    severity: 'warning',
    addedAt: '2026-07-28',
    run: ({ caseRow, destination }) => {
      const id = readScopedDate(caseRow, destination, 'id_date')
      const dep = readDepartureDate(caseRow, destination)
      if (!id || !dep) return SKIP
      const earliestDep = addMonths(id, 6)
      if (!earliestDep) return SKIP
      if (earliestDep <= dep) {
        return { ok: true, message: `인증(${id}) + 6개월(${earliestDep}) ≤ 출국일(${dep}).` }
      }
      return {
        ok: false,
        message: '마이크로칩 인증은 출국 6개월 전까지 받아야 해요. 출국일을 다시 확인하세요.',
        offendingPaths: ['departure_date', 'id_date'],
      }
    },
  },

  // ── 광견병 ──
  {
    id: 'nz.rabies-prime-after-84days',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 생후 84일(12주) 이상',
    description:
      'IHS 2.1.3(2) — "vaccinated or revaccinated for rabies by a veterinarian when the animal was at least 12 weeks of age". 불활화(inactivated) 또는 재조합(recombinant) 백신이어야 한다. ⚠️ 구 룰의 "캘린더 3개월"은 구 IHS 표현이라 2026-07-27 에 84일로 정정했다.',
    severity: 'warning',
    addedAt: '2026-07-27',
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
          message: msgRabiesPrimeMinAge('84일(12주)'),
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return { ok: true, message: `1차 접종일(${first.date}) 생후 ${age}일령.` }
    },
  },
  {
    id: 'nz.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      'IHS 2.1.3(2) — "The vaccination(s) must remain continuously valid until shipment." 만료 후 접종은 chain 이 끊겨 **새 1차**가 되고, 그 순간 출국 6개월 하한이 다시 시작된다(2.1.3(2) 마지막 문장). 저장 거부(findRabiesChainBreak)의 짝이 되는 주의 — 펫무브워크는 저장을 막지 않아 이 룰이 없으면 끊긴 chain 이 운영자 화면에서 안 보인다.',
    severity: 'warning',
    addedAt: '2026-07-27',
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
    id: 'nz.rabies-primary-min-6months-before',
    country: COUNTRY,
    category: '광견병',
    title: '1차 접종은 출국 6개월 이전',
    description:
      'IHS 2.1.3(2) — "In the case of a primary vaccination, the vaccine must be given not less than 6 months before the date of shipment." 유효기간 안에 맞은 추가 접종(booster)에는 적용되지 않지만, **만료 후 재접종은 새 1차**라 6개월을 다시 기다려야 한다. 이 하한 때문에 개는 출국 시 생후 9개월 이상이 된다.',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const primary = findOperativePrimary(rabies)
      if (!primary) return SKIP
      const earliestDep = addMonths(primary.date, 6)
      if (!earliestDep) return SKIP
      if (earliestDep <= dep) {
        return { ok: true, message: `1차 접종(${primary.date}) + 6개월(${earliestDep}) ≤ 출국일(${dep}).` }
      }
      return {
        ok: false,
        message:
          '광견병 1차 접종일로부터 6개월이 지난 후에 출국할 수 있어요. 출국일을 다시 확인하세요.',
        offendingPaths: ['departure_date', `rabies_dates[${primary.originalIndex}].date`],
      }
    },
  },
  {
    id: 'nz.rabies-valid-until-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일까지 광견병 면역 유효',
    description:
      'IHS 2.1.3(2) — "must remain continuously valid **until shipment**". ⚠️ 구 룰은 "출국 + 계류 10일"까지 요구했는데 그런 조항이 없다(2026-07-27 정정). 계류 기간까지 유효를 요구하는 건 CIV 백신 하나뿐이다(2.9(2)(a)(i)).',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      const latest = rabies[rabies.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
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

  // ── 광견병 항체 검사 (RNATT) ──
  {
    id: 'nz.titer-after-rabies',
    country: COUNTRY,
    category: '광견병',
    title: '항체 검사는 광견병 접종 이후 채혈',
    description:
      'RNATT 는 접종으로 생긴 항체를 확인하는 검사라 접종 이후에만 의미가 있다. **최소 대기 일수는 두지 않는다** — IHS 2.1.3 guidance 의 "3-4 weeks" 는 권고이고, 이미 접종해 온 개는 더 일찍 채혈할 수 있다("this may not be necessary").',
    severity: 'warning',
    addedAt: '2026-07-27',
    run: ({ caseRow }) => {
      const rabies = readRabiesEntries(caseRow)
      const titers = readTiterEntries(caseRow)
      if (rabies.length === 0 || titers.length === 0) return SKIP

      const offendingPaths: string[] = []
      for (const t of titers) {
        const prior = rabies.filter((r) => r.date <= t.date)
        if (prior.length === 0) offendingPaths.push(`rabies_titer_records[${t.originalIndex}].date`)
      }
      if (offendingPaths.length > 0) {
        return { ok: false, message: msgTiterBeforeVaccine(), offendingPaths }
      }
      return { ok: true, message: '모든 채혈일 이전에 광견병 접종 기록이 있어요.' }
    },
  },
  {
    id: 'nz.titer-3to12months-before-departure',
    country: COUNTRY,
    category: '광견병',
    title: 'RNATT 채혈은 출국 3~12개월 전',
    description:
      'IHS 2.1.3(3) — "on a sample taken by a veterinarian **not less than 3 months and not more than 12 months** before the date of shipment, with a result of at least 0.5 IU/mL". ⚠️ 구 룰은 상한이 **24개월**이었다(구 IHS 값). 상한이 넉넉하면 규정 위반 일정을 통과시키므로 가장 먼저 정정했다(2026-07-27). 하한 3개월은 저장 거부(validateEuEntryDate, titer.entryWaitAfterTiter.months=3)와 같은 값이다.',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const titers = readTiterEntries(caseRow)
      if (!dep || titers.length === 0) return SKIP

      // 하나라도 3~12개월 창을 만족하면 통과.
      const valid = titers.find((t) => {
        const lower = addMonths(t.date, 3)
        const upper = addMonths(t.date, 12)
        return !!lower && !!upper && lower <= dep && upper >= dep
      })
      if (valid) {
        const days = daysBetween(valid.date, dep)
        return { ok: true, message: `RNATT(${valid.date}) → 출국일(${dep}): ${days}일 (3~12개월 창 안).` }
      }

      const newest = [...titers].sort((a, b) => b.date.localeCompare(a.date))[0]
      const lower = addMonths(newest.date, 3)
      const days = daysBetween(newest.date, dep)
      const offending: string[] = ['departure_date']
      for (const t of titers) offending.push(`rabies_titer_records[${t.originalIndex}].date`)
      const message =
        days !== null && days < 0
          ? '항체 검사 채혈일이 출국일보다 늦어요. 날짜를 확인하세요.'
          : lower && lower > dep
            ? '항체 검사 채혈일로부터 3개월이 지난 후에 출국할 수 있어요. 출국일을 다시 확인하세요.'
            : '항체 검사 결과는 채혈일부터 12개월간 유효해요. 출국일까지 유효하지 않으니 재채혈이 필요해요.'
      return { ok: false, message, offendingPaths: offending }
    },
  },

  // ── 수입 허가 · 계류 ──
  {
    id: 'nz.import-permit-not-after-departure',
    country: COUNTRY,
    category: '수입허가',
    title: '수입 허가 신청일, 출국일 순서',
    description:
      '수입 허가 신청일은 출국일 이전이어야 함(출국 당일·이후엔 신청 불가). 입력 차단(validateImportPermitNotAfterDeparture)과 같은 함수. IHS 1.13 guidance — "Apply ... at least 8 weeks before it is required. Allow 30 working days for processing after all required documents have been received."',
    severity: 'warning',
    addedAt: '2026-07-27',
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
    id: 'nz.rcf-order',
    country: COUNTRY,
    category: '광견병',
    title: 'RCF는 채혈 이후',
    description:
      '지원문서 Documentation — RCF 는 항체 결과를 옮겨 적는 서식이라 채혈보다 앞설 수 없다. 완료 버튼을 먼저 누른 뒤 채혈일을 더 늦은 날로 고친 경우를 표면화한다. ⛔ 구 룰의 "허가 신청 이전" 갈래는 2026-07-29 에 삭제했다 — 수입 허가 카드가 신청일을 받지 않게 되면서 판정할 값이 사라졌다. 허가와의 순서는 허가 카드의 저장 거부(importPermitPrerequisiteError)가 **완료 여부**로 보장한다. 구 IHS 시절 같은 서류 이름은 OVD.',
    severity: 'warning',
    addedAt: '2026-07-29',
    run: ({ caseRow, destination }) => {
      const rcf = readScopedDate(caseRow, destination, 'nz_rcf_date')
      if (!rcf) return SKIP

      const titers = readTiterEntries(caseRow)
      // 채혈 기록 자체가 없으면 발급이 성립하지 않는다 — 저장 거부와 같은 함수(2026-07-29).
      const missing = validateRabiesDocRequiresTiter(
        rcf,
        titers.map((t) => t.date),
      )
      if (missing) {
        return { ok: false, message: missing, offendingPaths: ['nz_rcf_date'] }
      }
      if (titers.length > 0) {
        const earliest = titers.reduce((a, b) => (a.date <= b.date ? a : b))
        const msg = validateNzRcfDate(
          rcf,
          titers.map((t) => t.date),
        )
        if (msg) {
          return {
            ok: false,
            message: msg,
            offendingPaths: ['nz_rcf_date', `rabies_titer_records[${earliest.originalIndex}].date`],
          }
        }
      }

      return { ok: true, message: `RCF(${rcf}) 채혈 이후.` }
    },
  },
  {
    id: 'nz.quarantine-start-after-titer',
    country: COUNTRY,
    category: '검역',
    title: '계류 시작일은 채혈 3개월 후(6개월 미만이면 인증 2회)',
    description:
      'IHS 2.1.3(3) 채혈 창 + 1.11(4) 인증 횟수 분기를 합친 판정. 3개월 미만은 규정 위반 확정(계류 시작일은 도착일이고 도착은 출국 이후라 출국 기준으로는 더 짧다), 3~6개월은 인증을 2회 받아야 합법, 6개월 이상은 1회로 충분. 저장 거부(validateNzQuarantineStartAfterTiter)와 같은 함수 — 예약을 먼저 저장한 뒤 채혈일을 늦추거나 2차 인증일을 지운 경우를 표면화하는 짝 주의.',
    severity: 'warning',
    addedAt: '2026-07-29',
    run: ({ caseRow, destination }) => {
      const start = readScopedDate(caseRow, destination, 'nz_quarantine_reservation_date')
      if (!start) return SKIP
      const titers = readTiterEntries(caseRow)
      if (titers.length === 0) return SKIP
      const hasSecond = !!readScopedDate(caseRow, destination, 'id_date_2')
      const msg = validateNzQuarantineStartAfterTiter(
        titers.map((t) => t.date),
        start,
        hasSecond,
      )
      if (msg) {
        return {
          ok: false,
          message: msg,
          offendingPaths: ['nz_quarantine_reservation_date', 'id_date_2'],
        }
      }
      return { ok: true, message: `계류 시작(${start}) — 채혈 창·인증 횟수 충족.` }
    },
  },
  {
    // ⚠️ 앞서 있던 nz.quarantine-reservation-matches-entry(계류 시작일 = 도착일)는 항공권 카드가
    //   단순형으로 바뀌며 도착일 칸이 사라져 영영 SKIP 이었다(2026-07-30 사용자 발견). 도착일
    //   대신 **출국일**을 기준으로, 하한만(출국 ≤ 계류 시작) 보는 이 룰로 대체한다. 상한을 두지
    //   않는 이유는 야간 출발·다음 날 도착이 정상이고 경유 편은 더 벌어지기 때문.
    //   저장 거부(validateDepartureNotAfterQuarantineStart)와 **같은 함수** — 호주와 대칭.
    //   카드는 **운송 예약**(출국일 칸이 있는 쪽) — 싱가포르와 같은 배치.
    id: 'nz.quarantine-start-not-before-departure',
    country: COUNTRY,
    category: '검역',
    title: '출국일은 계류 시작일보다 늦을 수 없음',
    description:
      'IHS 1.15(3) — 도착한 동물은 수입 허가에 적힌 계류시설로 바로 옮겨진다. 계류 시작일 = 도착일이고 도착은 출국 이후거나 같은 날이라, 출국일이 계류 시작일보다 뒤면 예약이나 항공 일정 중 하나가 어긋난 것이다.',
    severity: 'warning',
    addedAt: '2026-07-30',
    run: ({ caseRow, destination }) => {
      const start = readScopedDate(caseRow, destination, 'nz_quarantine_reservation_date')
      const dep = readDepartureDate(caseRow, destination)
      if (!start || !dep) return SKIP
      const msg = validateDepartureNotAfterQuarantineStart(dep, start)
      if (msg) {
        return {
          ok: false,
          message: msg,
          offendingPaths: ['nz_quarantine_reservation_date', 'departure_date'],
        }
      }
      return { ok: true, message: `출국일(${dep}) ≤ 계류 시작일(${start}).` }
    },
  },
  {
    id: 'nz.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '뉴질랜드 수입 검역일',
    description: '뉴질랜드 수입 검역(계류 시작)일은 뉴질랜드 도착일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-27',
    run: ({ caseRow, destination }) => {
      const raw = readScopedDate(caseRow, destination, 'nz_import_quarantine_date')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return SKIP
      const entry = readScopedDate(caseRow, destination, 'entry_date')
      if (entry && raw < entry) {
        return {
          ok: false,
          message: '뉴질랜드 수입 검역일은 뉴질랜드 도착일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['nz_import_quarantine_date'],
        }
      }
      return { ok: true, message: `뉴질랜드 수입검역일(${raw}) 도착 이후.` }
    },
  },

  // ── 수입 금지 품종 ──
  // 생물안전이 아니라 Dog Control Act 1996 소관이지만, 걸리면 입국 자체가 안 되므로
  //   준비 착수 전에 걸러야 한다(지원문서 Eligibility / 체크리스트 6-12개월 구간).
  {
    id: 'nz.banned-breeds',
    country: COUNTRY,
    category: '서류',
    title: '수입 금지 품종 (개 5종)',
    description:
      'Dog Control Act 1996 — 브라질리언 필라(Brazilian fila), 도고 아르헨티노(dogo Argentino), 도사견(Japanese tosa), 프레사 카나리오(perro de presa Canario), 아메리칸 핏불테리어. 교잡 자손도 포함("wholly or predominantly"). 별개로 늑대 등 야생종과의 교잡견은 EPA(환경보호청) 승인이 필요하다.',
    severity: 'blocker',
    addedAt: '2026-07-27',
    run: ({ caseRow }) => {
      if (species(caseRow) === 'cat') return SKIP
      const breed = readBreed(caseRow)
      if (!breed.ko && !breed.en) return SKIP
      const banned = [
        'fila brasileiro', 'brazilian fila', '필라 브라질레이로', '브라질리언 필라',
        'dogo argentino', '도고 아르헨티노',
        'japanese tosa', 'tosa', '도사',
        'presa canario', '프레사 카나리오',
        'pit bull', 'pitbull', '핏불',
      ]
      const match = matchBannedBreed(breed, banned)
      if (match) {
        return {
          ok: false,
          message: `"${breed.ko || breed.en}"은 뉴질랜드 수입 금지 품종이에요 (매치: ${match}).`,
          offendingPaths: ['breed', 'breed_en'],
        }
      }
      return { ok: true, message: `품종 "${breed.ko || breed.en}" 통과.` }
    },
  },

  // ── 독감(CIV) — 한국 출발 강아지 필수 ──
  // IHS 2.9(2) — CIV 위험국(MPI-STD-SAA 등재) 출발 개는 **백신 또는 출국 전 10일 이내 PCR** 중
  //   하나가 필수다. 앱은 백신 기록만 저장하므로, PCR 을 택한 케이스는 이 카드가 비어 있고
  //   두 룰 모두 SKIP 된다(빈 입력에 경고를 띄우지 않는다).
  {
    id: 'nz.civ-14days-before-departure',
    country: COUNTRY,
    category: '종합백신',
    title: '독감(CIV) 백신은 출국 14일 전까지',
    description:
      'IHS 2.9(2)(a) — "fully vaccinated against canine influenza ... **between 12 months and 14 days** before the date of shipment". 지원문서가 대상국을 "Canada, Korea (Republic) and USA only" 로 명시한다. ⚠️ 구 룰은 CIV 를 "MPI 의무 아님 — 계류장 요구"로 적어 뒀는데 신 IHS 에서 **입국 요건**이 됐다(2026-07-27 정정).',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const entries = readCivEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      if (days < 14) {
        return {
          ok: false,
          message: '독감(CIV) 백신은 출국 14일 전까지 접종해야 해요. 출국일을 미뤄야 해요.',
          offendingPaths: [`civ_dates[${latest.originalIndex}].date`, 'departure_date'],
        }
      }
      return { ok: true, message: `최근 CIV(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },
  {
    id: 'nz.civ-within-12months',
    country: COUNTRY,
    category: '종합백신',
    title: '독감(CIV) 백신은 출국 12개월 이내',
    description:
      'IHS 2.9(2)(a) — "between 12 months and 14 days before the date of shipment" 로 상한도 있다. 더해서 (a)(i) "The vaccination must remain continuously valid for the **entire period in the post-arrival transitional facility**" — 계류(최소 10일)가 끝날 때까지 유효기간이 남아 있어야 한다. 12개월을 넘겼으면 출국 전 추가 접종이 필요하다.',
    severity: 'warning',
    addedAt: '2026-07-27',
    run: ({ caseRow, destination }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const entries = readCivEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const withinYear = entries.find((e) => {
        const upper = addMonths(e.date, 12)
        return !!upper && upper >= dep
      })
      if (withinYear) {
        return { ok: true, message: `CIV(${withinYear.date}) 출국 12개월 이내.` }
      }
      const latest = entries[entries.length - 1]
      return {
        ok: false,
        message: '독감(CIV) 백신은 출국일 기준 12개월 이내에 접종한 기록이 있어야 해요. 추가 접종이 필요해요.',
        offendingPaths: [`civ_dates[${latest.originalIndex}].date`, 'departure_date'],
      }
    },
  },

  // ── 전염병 검사 — 강아지 전용 ──
  {
    id: 'nz.infectious-disease-test-within-30days',
    country: COUNTRY,
    category: '검사',
    title: '전염병 검사는 출국 전 30일 이내 (강아지)',
    description:
      '바베시아 깁소니(2.7 IFA·ELISA + PCR) · 리슈만편모충(2.12) · 렙토스피라 Canicola MAT(2.13) · 브루셀라(2.8, 중성화 안 한 개체) 가 **모두** "in the 30 days before the date of shipment" 다. ⚠️ 구 룰은 16일이었다(구 IHS 값, 2026-07-27 정정). 생후 6개월 미만 개의 3회 PCR 대안(44일 창)은 앱이 회차를 구분하지 않아 판정하지 않는다.',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const entries = readInfectiousDiseaseEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      // 저장 거부와 **같은 함수**(출국일보다 늦음 + 30일 창) — 문구·일수 단일 출처.
      const blocked = validateInfectiousDiseaseTestDate(latest.date, dep, 'new_zealand')
      if (blocked) {
        const paths = [`infectious_disease_records[${latest.originalIndex}].date`]
        if (days >= 0) paths.push('departure_date')
        return { ok: false, message: blocked, offendingPaths: paths }
      }
      const note = isIntact(caseRow) ? ' (중성화 미실시 — 브루셀라 검사 포함 대상)' : ''
      return { ok: true, message: `최근 전염병검사(${latest.date}) → 출국일(${dep}): ${days}일.${note}` }
    },
  },
  {
    id: 'nz.infectious-disease-test-after-external-parasite',
    country: COUNTRY,
    category: '검사',
    title: '바베시아 채혈은 1차 외부구충 14일 이후 (강아지)',
    description:
      'IHS 2.7(1) — 바베시아 깁소니 검사는 "on samples taken **at least 14 days after the first external parasite treatment** and in the 30 days before the date of shipment". 2.2 guidance 는 이 14일 연속 보호가 깨지면 **외부구충과 바베시아 검사를 처음부터 다시** 해야 한다고 못박는다. 전염병 검사 카드가 바베시아를 포함하므로 그 채혈일을 기준으로 본다.',
    severity: 'warning',
    addedAt: '2026-07-27',
    run: ({ caseRow }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const infectious = readInfectiousDiseaseEntries(caseRow)
      const external = readExternalParasiteEntries(caseRow)
      if (infectious.length === 0 || external.length === 0) return SKIP

      const first = external[0]
      const sample = infectious[infectious.length - 1]
      // 저장 거부와 **같은 함수**(2026-07-30 사용자 지정으로 저장 거부 신설) — 저장 뒤에
      //   1차 외부구충일을 고쳐 어긋난 경우를 표면화하는 짝 주의다.
      const err = validateNzInfectiousTestAfterExternal(sample.date, first.date)
      if (err) {
        return {
          ok: false,
          message: err,
          offendingPaths: [
            `external_parasite_dates[${first.originalIndex}].date`,
            `infectious_disease_records[${sample.originalIndex}].date`,
          ],
        }
      }
      const gap = daysBetween(first.date, sample.date)
      return { ok: true, message: `1차 외부구충(${first.date}) → 채혈(${sample.date}): ${gap}일.` }
    },
  },

  // ── 구충 ──
  {
    id: 'nz.external-parasite-protocol',
    country: COUNTRY,
    category: '구충',
    title: '외부구충 2회 (1차는 바베시아 채혈 14일 전, 마지막은 출국 전 16일 이내)',
    description:
      'IHS 2.2(2) — 개는 진드기·벼룩 제품으로 **두 번** 처치한다. (a) 1차는 바베시아 채혈 **14일 전까지**, (b) 마지막은 출국 **16일 이내**, (c) 1차부터 출국일까지 제조사 지침대로 연속 보호, (d) 매 처치 시점과 출국 2일 전 검진에서 외부 기생충이 없어야 한다. ⚠️ 구 룰은 "1차 30일 이내 + 2차 2일 이내"였다(구 IHS 값, 2026-07-27 정정). (a) 는 짝 룰(nz.infectious-disease-test-after-external-parasite)이 채혈 쪽에서 판정한다 — 여기서 또 잡으면 같은 경고가 두 번 뜬다. (c) 연속 보호는 제품마다 지속일이 달라 판정하지 않는다.',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readExternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP
      // ⛔ '2회 미만이면 경고'를 되살리지 말 것(2026-07-29 사용자 지정으로 삭제).
      //   1차만 넣고 2차를 기다리는 건 **규정대로 진행 중**인데 주의가 떴다 — 정상 진행을
      //   문제로 표시한 것이다. 회수는 이제 카드가 말한다: 강아지는 external-parasite-2 카드가
      //   따로 있어 '미완료'가 곧 안내다(광견병 1차/2차와 같은 모델). 고양이는 2.2(1) 로 1회라
      //   애초에 2차 카드가 없다.
      const last = entries[entries.length - 1]
      const toDep = daysBetween(last.date, dep)
      if (toDep === null) return SKIP
      if (toDep < 0) {
        return {
          ok: false,
          message: '외부 기생충 치료일이 출국일보다 늦어요. 날짜를 확인하세요.',
          offendingPaths: [`external_parasite_dates[${last.originalIndex}].date`],
        }
      }
      // '마지막 치료'는 강아지에선 **2차**다 — 1차만 있는 동안 이 판정을 돌리면 1차를 마지막으로
      //   보고 "출국 전 16일 이내에 해야 해요"가 뜬다. 2차를 기다리는 정상 상태에 대고 경고하는
      //   꼴이라(2026-07-29 발견) 2회가 다 들어온 뒤에만 본다. 고양이는 2.2(1) 로 1회라
      //   그 한 번이 곧 마지막이므로 그대로 판정한다.
      if (species(caseRow) === 'dog' && entries.length < 2) return SKIP
      // 강아지 2회 — 1차 후 28일 이내 + 출국 전 16일 이내를 **저장 거부와 같은 함수**로 본다
      //   (2026-07-30 사용자 지정으로 저장 거부 신설). 저장 뒤에 출국일이나 1차를 고쳐
      //   어긋난 경우를 표면화하는 짝 주의다.
      if (species(caseRow) === 'dog') {
        const err = validateNzExternalSecondDose(entries[0].date, last.date, dep)
        if (err) {
          return {
            ok: false,
            message: err,
            offendingPaths: [
              `external_parasite_dates[${entries[0].originalIndex}].date`,
              `external_parasite_dates[${last.originalIndex}].date`,
              'departure_date',
            ],
          }
        }
        return {
          ok: true,
          message: `1차(${entries[0].date}) → 2차(${last.date}) → 출국(${dep}): 간격 ${daysBetween(entries[0].date, last.date)}일, 출국까지 ${toDep}일.`,
        }
      }
      // 고양이(1회) 판정 — 저장 거부(validateNzExternalLastDose)와 **같은 함수**. 예전엔 여기만
      //   16일을 봤고 저장은 통과시켰다(2026-07-30 사용자 지정으로 저장 거부 신설).
      const lastErr = validateNzExternalLastDose(last.date, dep)
      if (lastErr) {
        return {
          ok: false,
          message: lastErr,
          offendingPaths: [`external_parasite_dates[${last.originalIndex}].date`, 'departure_date'],
        }
      }
      return { ok: true, message: `마지막 외부구충(${last.date}) → 출국(${dep}): ${toDep}일 (총 ${entries.length}회).` }
    },
  },
  {
    id: 'nz.internal-parasite-protocol',
    country: COUNTRY,
    category: '구충',
    title: '내부구충 2회 (1차 30일 이내, 14일 이상 간격, 2차 5일 이내)',
    description:
      'IHS 2.3(1) — 선충·조충(Echinococcus 포함) 제품으로 두 번. "The first treatment must be given in the 30 days before the date of shipment and at least 14 days before the second treatment ... The second treatment must be given in the **5 days** before the date of shipment." ⚠️ 구 룰의 2차 4일은 구 IHS 값이다(2026-07-27 정정). 폐충(Angiostrongylus vasorum, 2.4)도 출국 전 5일 이내라 2차와 같은 방문에서 함께 처치한다.',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readInternalParasiteEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP
      // ⛔ '2회 미만이면 경고' 삭제 — 위 외부구충과 같은 이유(2026-07-29). 회수는
      //   internal-parasite-2 카드의 미완료가 안내한다. 2회가 다 들어왔을 때만 판정한다.
      if (entries.length < 2) return SKIP

      const dose1 = entries[entries.length - 2]
      const dose2 = entries[entries.length - 1]
      const dep1 = daysBetween(dose1.date, dep)
      const dep2 = daysBetween(dose2.date, dep)
      const interval = daysBetween(dose1.date, dose2.date)

      const issues: string[] = []
      const offending: string[] = []
      if (dep1 === null || dep1 < 0 || dep1 > 30) {
        issues.push('1차 치료는 출국 전 30일 이내여야 해요.')
        offending.push(`internal_parasite_dates[${dose1.originalIndex}].date`)
      }
      if (dep2 === null || dep2 < 0 || dep2 > 5) {
        issues.push('2차 치료는 출국 전 5일 이내여야 해요.')
        offending.push(`internal_parasite_dates[${dose2.originalIndex}].date`)
      }
      if (interval === null || interval < 14) {
        issues.push('두 번의 치료는 14일 이상 벌어져야 해요.')
        offending.push(
          `internal_parasite_dates[${dose1.originalIndex}].date`,
          `internal_parasite_dates[${dose2.originalIndex}].date`,
        )
      }
      if (issues.length > 0) {
        return { ok: false, message: issues.join(' '), offendingPaths: Array.from(new Set(offending)) }
      }
      return {
        ok: true,
        message: `1차(${dose1.date}) → 2차(${dose2.date}): 간격 ${interval}일, 2차→출국 ${dep2}일.`,
      }
    },
  },

  // ── 폐충(Angiostrongylus vasorum) ──
  {
    id: 'nz.lungworm-within-5days',
    country: COUNTRY,
    category: '구충',
    title: '폐충 치료는 출국 전 5일 이내',
    description:
      'IHS 2.4 Angiostrongylus vasorum **(dogs)** — "The dog must be treated by a veterinarian with a product listed in MPI-STD-SAA effective against Angiostrongylus vasorum, **in the 5 days before the date of shipment**". 신 IHS 2026 에서 새로 들어온 항목이다. 내부구충 2차와 시점이 같아 같은 방문에서 끝나지만 **약이 다르다**(구충약이 폐충까지 커버하지 않는 경우가 많다). 저장 거부(validateNzWithin5Days)와 **같은 함수**를 본다 — 2026-07-30 사용자 지정으로 주의만 두던 것을 차단으로 올렸다.',
    severity: 'warning',
    addedAt: '2026-07-29',
    run: ({ caseRow, destination }) => {
      // ⚠️ 종 가드 — 폐충은 **개 전용**(2.4)이라 카드도 강아지에게만 뜬다. 그런데 이 룰엔
      //   가드가 없어서, 폐충 기록이 있는 고양이 케이스(동물 단위 필드라 다른 목적지에서
      //   남은 값이 보일 수 있다)에 **카드도 없는 주의**가 떴다(2026-07-30 발견).
      if (species(caseRow) !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const entries = readLungwormEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      const err = validateNzWithin5Days(latest.date, dep, '폐충 치료')
      if (err) {
        return {
          ok: false,
          message: err,
          offendingPaths:
            days < 0
              ? [`lungworm_dates[${latest.originalIndex}].date`]
              : [`lungworm_dates[${latest.originalIndex}].date`, 'departure_date'],
        }
      }
      return { ok: true, message: `폐충 치료(${latest.date}) → 출국(${dep}): ${days}일.` }
    },
  },

  // ── 심장사상충 — 강아지 전용 ──
  {
    id: 'nz.heartworm-treatment-within-5days',
    country: COUNTRY,
    category: '구충',
    title: '심장사상충 예방은 출국 전 5일 이내 (강아지)',
    description:
      'IHS 2.11(2) Heartworm **(dogs)** — "All dogs must be either: (a) Treated by a veterinarian with a product listed in MPI-STD-SAA for heartworm prevention **in the 5 days before the date of shipment**; or (b) Up to date with a **sustained-release injection** ...". 카드가 **예방만** 담당하게 분리된 뒤(2026-07-30 사용자 지정) 이 창을 볼 수 있게 됐다 — 그전엔 같은 배열에 검사일이 섞여 바깥 창인 30일만 판정했다. 검사(30일 이내)는 전염병 검사 카드가 담당한다(시기가 같아 그쪽으로 옮겼다). 저장 거부(validateNzWithin5Days)와 **같은 함수**를 본다. ⚠️ (b) 지속형 주사 케이스는 이 창을 따르지 않지만 앱이 제품 유효기간을 몰라 함께 거부된다 — 2026-07-30 사용자 판단으로 감수한 트레이드오프(카드 문구에서도 지속형 주사 안내를 뺐다).',
    severity: 'warning',
    addedAt: '2026-05-06',
    run: ({ caseRow, destination }) => {
      if (species(caseRow) !== 'dog') return SKIP
      const dep = readDepartureDate(caseRow, destination)
      const entries = readHeartwormEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const days = daysBetween(latest.date, dep)
      if (days === null) return SKIP
      const err = validateNzWithin5Days(latest.date, dep, '심장사상충 예방')
      if (err) {
        return {
          ok: false,
          message: err,
          offendingPaths:
            days < 0
              ? [`heartworm_dates[${latest.originalIndex}].date`]
              : [`heartworm_dates[${latest.originalIndex}].date`, 'departure_date'],
        }
      }
      return { ok: true, message: `최근 예방(${latest.date}) → 출국일(${dep}): ${days}일.` }
    },
  },
]
