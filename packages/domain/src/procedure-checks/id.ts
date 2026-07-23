import {
  buildDateRuleContext,
  calendarAgeThreshold,
  meetsCalendarAge,
  validateImportPermitNotAfterDeparture,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  readRabiesEntries,
  readScopedImportPermitFiled,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
  findRabiesValidityBreaks,
} from './utils'
import { msgMicrochipBeforeRabies, msgRabiesExpiredBefore, msgRabiesPrimeMinAge } from './messages'

/**
 * 인도네시아 절차 검증.
 *
 * 구조는 태국(th.ts) 골격 복제(2026-07-22)이고, **수치·절차는 펫무브 인도네시아 가이드와
 * 원문 조사로 교체했다**(같은 날 사용자 지정 "펫무브 웹사이트 참고 / 조사결과 반영").
 *
 * 1차 출처: Keputusan Kepala Badan Karantina Pertanian No. 87/Kpts/KR.120/L.1/1/2016
 *   (인도네시아 외교부 재외공관 안내가 전재). ⚠️ Barantin 현행 사이트
 *   (karantinaindonesia.go.id)의 수입요건 페이지는 2026-07-22 기준 **전부 404** 이고 구 도메인은
 *   DNS 가 소멸했다 — 원문 PDF 직접 확보에는 실패했다.
 *
 * 확정한 것:
 *  - 광견병 **불활화 백신 / 생후 3개월 이후** 접종(위 원문).
 *  - **항체검사가 입국 요건**: "HPR telah memiliki titer antibodi protektif" + 결과를 건강
 *    증명서에 첨부. 광견병 발생국·청정국 분기 양쪽에 다 있다. 태국 복제본의 '귀국용'은 오류.
 *  - **반입 금지 지역**: "…tidak diperkenankan masuk ke wilayah bebas rabies, seperti jawa
 *    tengah, jawa timur, yogyakarta, **bali**, madura, NTB dan NTT" → 실질 입국지는 자카르타.
 *  - 도착 후 격리 약 1주~최대 2주(가이드) / 임상검사 출국 10일 이내(가이드).
 *  - 수입허가는 **현지 신청만** 가능(가이드) → 태국식 이메일 신청·R.6 는 걷어냈다.
 *
 * 확인 실패(값을 지어내지 않은 것):
 *  - **접종 후 출국까지 대기 일수** — 1차 출처에 일수 규정이 없다. 태국 복제값 21일은 근거가
 *    없어 제거했고, 프로파일에도 entryWaitDaysAfterVaccine 을 선언하지 않는다.
 *  - 항체 **0.5 IU/ml 수치**(원문은 "protektif"로만) · 채혈 시점 · 결과 유효기간.
 *  - ⚠️ **한국이 인도네시아 기준 '광견병 발생국(negara tertular rabies)'인지 미확인.**
 *    발생국이면 "출발국에서 3개월 격리·관찰" 조항이 붙는다 — 고객 일정에 결정적이라
 *    Ditjen PKH 조회가 필요하다(사용자 보고 대상).
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
  // ── 종합백신 룰 없음 — 인도네시아는 종합백신이 입국 요건이 아니라 카드 자체를 두지 않는다
  //   (2026-07-23 사용자 결정, catalog 명단·프로파일 vaccines 에서 제외). 종합백신 관련 룰
  //   (마이크로칩 선행·도착일 유효)도 함께 제거했다 — 입력 경로가 없어 죽은 룰이 된다.

  // ── 광견병 ──
  {
    id: 'id.rabies-prime-after-3months-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종은 생후 3개월 이후',
    description:
      '✅ 2026-07-22 조사 확정. Keputusan Kepala Barantan 87/2016 원문: "HPR telah divaksin dengan vaksin rabies **inaktif** … pada saat berumur **paling kurang 3 (tiga) bulan**" — 불활화 백신으로 생후 3개월 이후 접종. 달력 3개월 판정(meetsCalendarAge).',
    severity: 'warning',
    addedAt: '2026-07-22',
    run: ({ caseRow }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
      const rabies = readRabiesEntries(caseRow)
      if (!birth || rabies.length === 0) return SKIP

      const first = rabies[0]
      if (!meetsCalendarAge(birth, first.date, 3)) {
        return {
          ok: false,
          message: msgRabiesPrimeMinAge('3개월'),
          offendingPaths: [`rabies_dates[${first.originalIndex}].date`],
        }
      }
      return {
        ok: true,
        message: `1차 접종일(${first.date}) 생후 3개월(${calendarAgeThreshold(birth, 3)}) 이후.`,
      }
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

  // ── 수입 금지 견종 — **룰을 두지 않는다**(사용자 지정 2026-07-22 "없어도 돼").
  //   태국 복제로 핏불 계열 blocker 가 따라 들어왔는데 이 나라 가이드·규정에 근거가 없었다.
  //   되살리려면 근거부터 확보할 것 — blocker 는 저장을 막아 우회할 방법이 없다.

  // ── 수입 허가 ──
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
