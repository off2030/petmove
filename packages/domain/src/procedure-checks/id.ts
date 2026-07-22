import {
  buildDateRuleContext,
  isValidBooster,
  validateImportPermitNotAfterDeparture,
  validateIdImportPermitVaccineGap,
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
  findRabiesValidityBreaks,
} from './utils'
import { msgGeneralVaccineExpiredBefore, msgMicrochipBeforeGeneralVaccine, msgMicrochipBeforeRabies, msgRabiesExpiredBefore, msgRabiesPrimeMinAge } from './messages'

/**
 * 인도네시아 절차 검증.
 *
 * ⚠️ **태국(th.ts) 한 벌 복제 (2026-07-22)** — 룰 구조·수치(12주·21일·14일·9일)는 아직
 *   전부 태국 것이다. 나라별 규정 확정 후 수정 예정(사용자 지정 — "태국 복사 후 세부 수정").
 *   금지 견종(blocker) 포함 — 인도네시아 근거는 미확인 상태다.
 *
 * 복제 전 구세대 파일(BARANTIN 조사값)은 git 이력 참고 — 되살릴 후보:
 *  - 출처: karantinaindonesia.go.id / embassyofindonesia.org / Soekarno-Hatta Karantina /
 *    Permentan No. 15 Tahun 2021
 *  - **발리·NTB·NTT·Maluku·Papua·Kalbar 직접 반입 금지 — 한국발은 자카르타 CGK 한정**
 *  - 광견병: 출국 30일 이상 ~ 12개월 이내, 생후 90일 이상, 임신·수유 중 불가
 *  - **RNATT ≥ 0.5 IU/ml 이 입국 요건**(BARANTIN 명시 — 태국 복제본의 '귀국용'과 다르다!)
 *  - 건강증명서 출국 10일 이내(보수 ≤9) / BARANTIN IKH 14일 격리(미충족 시 최대 4-6개월)
 *  - 수입허가(Surat Persetujuan Pemasukan): 발급 후 3개월 유효, 처리 1-2개월
 *  - 도착 2일 전 PPK Online 사전 통보
 */

const COUNTRY = 'indonesia'

export const ID_CHECKS: ProcedureCheck[] = [
  {
    id: 'id.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간 이내에 해야 함. 만료 후 접종은 chain 이 끊겨 새 1차로 간주된다. 저장 거부(findRabiesChainBreak)의 짝이 되는 주의 — 펫무브워크는 저장을 막지 않고 절차검증만 보므로 이 룰이 없으면 운영자 화면에서 끊긴 chain 이 안 보인다.',
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
  // ── 마이크로칩 ──
  {
    id: 'id.microchip-before-rabies',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩, 백신 타이밍',
    description:
      '마이크로칩(ISO 11784/11785)이 광견병 접종일과 같거나 이전이어야 함. 입국 시 칩 번호와 서류 일치 검증. 백신 입력 시 client 차단(validateMicrochipBeforeBooster)과 짝 — 칩 시술일을 나중에 수정해 깨진 경우를 주의로 표면화.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow }) => {
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
    id: 'id.microchip-before-general-vaccine',
    country: COUNTRY,
    category: '마이크로칩',
    title: '마이크로칩, 종합백신 타이밍',
    description:
      '마이크로칩(ISO 11784/11785)이 종합백신 접종일과 같거나 이전이어야 함. 칩으로 식별된 동물의 접종만 인정 — 백신 입력 시 client 차단(validateMicrochipBeforeBooster)과 짝, 칩 시술일 수정 후 깨진 경우를 주의로 표면화.',
    severity: 'warning',
    addedAt: '2026-07-22',
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
    id: 'id.rabies-prime-after-12weeks',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종 생후 12주(84일) 이상',
    description:
      '광견병 1차 접종은 생후 최소 12주(84일) 이후. ⚠️ 태국 복제값 — 인도네시아 규정 확정 후 수정(구세대 조사값은 생후 90일).',
    severity: 'warning',
    addedAt: '2026-07-22',
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
    id: 'id.rabies-21days-before-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 접종은 출국(=도착) 21일 이전 완료',
    description:
      '가장 최근 광견병 접종이 도착일 기준 21일 이전 완료. 단, 직전 접종 유효기간 내 재접종한 유효 부스터는 21일 면제. ⚠️ 태국 복제값 — 인도네시아 규정 확정 후 수정(구세대 조사값은 30일).',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const rabies = readRabiesEntries(caseRow)
      if (!dep || rabies.length === 0) return SKIP

      // 유효 부스터(직전 접종 면역 유효기간 내 재접종)는 21일 대기 면제.
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
    id: 'id.rabies-not-expired-on-arrival',
    country: COUNTRY,
    category: '광견병',
    title: '도착일에 광견병 면역 유효',
    description:
      '최근 광견병 접종의 면역 유효기간이 도착일 이전 만료되지 않아야 함. valid_until 명시 시 그 값 사용, 미명시 시 디폴트 1년 (`addOneYear` = 1주년 당일까지).',
    severity: 'warning',
    addedAt: '2026-07-22',
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

  // ── 종합백신 ──
  {
    id: 'id.general-vaccine-21days-before-arrival',
    country: COUNTRY,
    category: '종합백신',
    title: '종합백신 출국(=도착) 21일 이전 완료',
    description:
      '종합백신(강아지 DHPPL / 고양이 Panleukopenia 포함 FVRCP) 가장 최근 접종이 도착일 기준 21일 이전 완료. ⚠️ 태국 복제값 — 인도네시아 규정 확정 후 수정.',
    severity: 'warning',
    addedAt: '2026-07-22',
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
    id: 'id.general-vaccine-not-expired-on-arrival',
    country: COUNTRY,
    category: '종합백신',
    title: '도착일에 종합백신 면역 유효',
    description:
      '최근 종합백신 면역 유효기간이 도착일 이전 만료되지 않아야 함. valid_until 명시 시 그 값 사용, 미명시 시 디폴트 1년.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const dep = readDepartureDate(caseRow, destination)
      const entries = readGeneralVaccineEntries(caseRow)
      if (!dep || entries.length === 0) return SKIP

      const latest = entries[entries.length - 1]
      const validUntil = resolveValidUntil(latest.date, latest.valid_until)
      if (!validUntil) return SKIP
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
    id: 'id.banned-breeds',
    country: COUNTRY,
    category: '서류',
    title: '수입 금지 견종 (Pit Bull 계열)',
    description:
      '핏불 계열 수입 금지. ⚠️ 태국 복제 명단 — 인도네시아 근거 미확인. 규정 확정 후 수정.',
    severity: 'blocker',
    addedAt: '2026-07-22',
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
      ])
      if (match) {
        return {
          ok: false,
          message: `"${breed.ko || breed.en}"은 인도네시아 수입이 금지되어 있어요 (매치: ${match}).`,
          offendingPaths: ['breed', 'breed_en'],
        }
      }
      return { ok: true, message: `견종 "${breed.ko || breed.en}" 통과.` }
    },
  },

  // ── 수입 허가 ──
  {
    id: 'id.import-permit-9days-before-entry',
    country: COUNTRY,
    category: '수입허가',
    title: '수입 허가 신청 마감 (출국 9일 전)',
    description:
      '수입 허가는 출국(=입국) 최소 7영업일(달력일 9일) 전까지 신청해야 함. **신청 전**에 오늘(KST) 기준 ' +
      '출국까지 9일 미만이면 "신청 시간 부족" 안내(info) — 출국일 앵커 D-day. 신청일을 입력하면 안내 중단 ' +
      '(이후는 카드 situational "진행 중" 메시지가 인계). 입력 차단·주의가 아닌 안내로만 — 리스크 안고 ' +
      '진행하는 보호자도 있어서. ⚠️ 태국 복제값 — 인도네시아 규정 확정 후 수정(구세대 조사값: SPP 처리 1-2개월).',
    severity: 'info',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      // 이미 신청일을 입력했으면 안내하지 않는다 — 신청을 마친 뒤 "신청 시간 부족" 안내는 어색.
      if (/^\d{4}-\d{2}-\d{2}$/.test(readScopedImportPermitFiled(data, destination))) return SKIP
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
    id: 'id.import-permit-not-after-departure',
    country: COUNTRY,
    category: '수입허가',
    title: '수입 허가 신청일, 출국일 순서',
    description:
      '수입 허가 신청일은 출국일 이전이어야 함(출국 당일·이후엔 신청 불가). 입력 차단(validateImportPermitNotAfterDeparture)과 같은 함수 — 출국일을 나중에 당겨 어긋난 경우를 주의로 표면화.',
    severity: 'warning',
    addedAt: '2026-07-22',
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
    id: 'id.import-permit-14days-after-vaccines',
    country: COUNTRY,
    category: '수입허가',
    title: '백신, 수입 허가 타이밍',
    description:
      '수입 허가 신청은 광견병·종합백신의 가장 최근 접종일 + 14일(2주) 이후. 입력 차단(validateIdImportPermitVaccineGap)과 같은 함수 — 백신을 나중에 수정해 깨진 경우를 주의로 표면화.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const filed = readScopedImportPermitFiled(data, destination)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(filed)) return SKIP
      const msg = validateIdImportPermitVaccineGap(filed, data)
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
    id: 'id.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '인도네시아 수입 검역일',
    description: '인도네시아 수입 검역일은 인도네시아 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.id_import_quarantine_date === 'string'
          ? data.id_import_quarantine_date.slice(0, 10)
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
          message: '인도네시아 수입 검역일은 인도네시아 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['id_import_quarantine_date'],
        }
      }
      return { ok: true, message: `인도네시아 수입검역일(${raw}) 입국 이후.` }
    },
  },
  {
    id: 'id.export-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '인도네시아 수출 검역일',
    description: '인도네시아 수출 검역일은 인도네시아 입국일 이후·한국 귀국일 이전이어야 함.',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.id_export_quarantine_date === 'string'
          ? data.id_export_quarantine_date.slice(0, 10)
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
          message: '인도네시아 수출 검역일은 인도네시아 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['id_export_quarantine_date'],
        }
      }
      if (ret && raw > ret) {
        return {
          ok: false,
          message: '인도네시아 수출 검역일은 한국 귀국일보다 늦을 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['id_export_quarantine_date'],
        }
      }
      return { ok: true, message: `인도네시아 수출검역일(${raw}) 인도네시아 체류 구간 내.` }
    },
  },
]
