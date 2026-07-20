import {
  buildDateRuleContext,
  calendarAgeThreshold,
  meetsCalendarAge,
} from '../journey-steps/date-rules'
import type { ProcedureCheck } from './types'
import {
  findRabiesValidityBreaks,
  readRabiesEntries,
  resolveValidUntil,
  SKIP,
  readDepartureDate,
} from './utils'
import { msgRabiesExpiredBefore, msgRabiesPrimeMinAge } from './messages'

/**
 * 캐나다 (CFIA 제정 — Canadian Food Inspection Agency / CBSA 국경 집행) 절차 검증.
 *
 * ✅ **4국 중 1차 출처가 가장 충실하다** (2026-07-20 개별 조사 완료). 베트남 복제 상태에서
 *   벗어났다. CFIA pets 페이지는 JS 결정트리(wb-fieldflow)라 정적 fetch 로는 안 나와서,
 *   콘텐츠 원본 노드를 직접 열어 앵커별 원문을 추출했다(Date modified 2026-07-02).
 *     https://inspection.canada.ca/en/node/7059
 *     진입점 https://inspection.canada.ca/en/importing-food-plants-animals/pets
 *
 * 한국의 지위 — 어느 분기를 타는지 결정한다:
 *  - CFIA **광견병 청정국 목록에 없음**(호주·피지·핀란드·아이슬란드·아일랜드·일본·뉴질랜드·
 *    스웨덴·영국 9개국뿐) — /en/importing-food-plants-animals/pets/rabies-free
 *  - CFIA **개 광견병 고위험국 목록에도 없음**(중국·북한·베트남 등재, 한국 부재)
 *    — /en/animal-health/terrestrial-animals/diseases/reportable/rabies/countries-high-risk-dog
 *  → '비청정국이지만 고위험국은 아님' 분기. 개 dog-per-a8-rabies / 고양이 cat-dom-a3-rabies.
 *
 * 조사로 확정된 것:
 *  - **다년(3년) 백신을 인정한다.** CFIA 는 증명서에 적힌 유효기간을 그대로 인정하고,
 *    미기재일 때만 1년으로 강등한다. 원문: "specify the period of validity of the rabies
 *    vaccination (otherwise, it will be considered valid for 1 year from the date of
 *    vaccination)". → `ca.rabies-only-1year-vaccine` blocker 를 삭제했다(아래 주석).
 *  - **격리가 없다.** Import Reference Document 명문: "Pet dogs imported from any country
 *    are not subject to post-import quarantine in Canada."
 *    실제로는 CBSA 의 서류 검사 + 육안 검사뿐이고, 필요할 때만 CFIA 로 이관된다.
 *    미충족 시 결과도 격리가 아니라 **접종 명령 또는 반송**이다.
 *  - **검사 수수료가 있다**(미국발 제외 = 한국발엔 적용). CBSA 공표 요율:
 *    첫 마리 CAD $36.95, 추가 마리당 $6.16 (+GST/HST). 접종 명령 발부 시 $67.75 / $36.95.
 *    "All fees must be paid at the time of inspection."
 *    https://www.cbsa-asfc.gc.ca/services/fpa-apa/fees-droits-eng.html
 *  - **필요 서류는 광견병 접종증명서 하나**. 별도 건강증명서·정부 배서·수입허가 모두 불요.
 *  - **증명서는 영어 또는 불어**(아니면 공식 번역 첨부). 번역은 인증번역사 또는 선서진술서를
 *    붙인 비인증 번역사가 해야 하고, **수입자 본인·가족은 번역할 수 없다.**
 *  - 3개월 미만은 접종증명서 대신 **연령 증빙**(수의사 발급)으로 입국한다.
 *  - 8개월 미만 강아지 금지는 **상업 카테고리 + 고위험국**에만 걸린다. 한국은 고위험국이
 *    아니고 개인 동반은 상업이 아니라 이중으로 해당 없음 — 구버전 주석의 '동적 확인 필요'는
 *    해소됐다. 3~8개월 개인 펫 요건은 8개월 이상과 완전히 동일하다.
 *  - **하이브리드는 금지**(사바나캣·벵갈캣·울프독). F5+ 는 가축으로 보아 일반 요건,
 *    F1~F4 는 야생으로 보아 수입허가+CITES+6개월 소유+본인 동반이 필요하다.
 *    → 현재 카드·룰로 만들지 않았다(해당 케이스가 드물고 분기가 크다). 필요 시 별도 작업.
 *  - **소유자 = 수입자**여야 하고 소유 증빙이 요구될 수 있다("upon request").
 *
 * 확인 실패(추측으로 채우지 않은 것):
 *  - AIRS 실조회 미수행(세션 기반). CFIA 안내 코드 HS 01/06/19, OGD 2083(개)·2084(고양이).
 *  - 입국 시 발급되는 서류 유무 — 언급 부재로 '없음'을 추정했을 뿐 명문 근거는 없다.
 *  - 지정 입국공항 5곳(YYZ/YUL/YVR/YYC/YHZ)·고위험국 칩 필수설은 **상업 사이트 단독**이고
 *    CFIA 원문과 배치돼 채택하지 않았다.
 *
 * 컨벤션: 필수 입력 누락 시 SKIP. 유효기간 1년 = 접종일의 1주년 당일까지.
 */

const COUNTRY = 'canada'

export const CA_CHECKS: ProcedureCheck[] = [
  {
    id: 'ca.rabies-prime-after-3months-old',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 1차 접종은 생후 3개월 이후',
    description:
      'CFIA: 3개월 이상 강아지·고양이는 광견병 백신 의무(3개월 미만 면제) — 달력 3개월 기준. 입력 차단(step.earliest.monthsAfter)과 같은 판정 함수(meetsCalendarAge)를 쓴다.',
    severity: 'warning',
    addedAt: '2026-07-20',
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
  // ⚠️ 접종 후 입국 대기 룰은 **없다** — 캐나다는 대기 0일(사용자 지정). 다른 3국(베트남·몽골·
  //   우즈베키스탄·캄보디아 30일)과 유일하게 다른 지점이라, "빠졌다"고 올리지 말 것.
  {
    id: 'ca.rabies-booster-within-prime-validity',
    country: COUNTRY,
    category: '광견병',
    title: '광견병 추가 접종은 직전 접종 유효기간 이내',
    description:
      '연속된 광견병 접종은 직전 접종의 면역 유효기간(1년) 이내에 해야 함. 만료 후 접종은 chain 이 끊겨 새 1차로 간주된다. 저장 거부(findRabiesChainBreak)의 짝이 되는 주의 — 펫무브워크는 저장을 막지 않고 절차검증만 보므로 이 룰이 없으면 운영자 화면에서 끊긴 chain 이 안 보인다.',
    severity: 'warning',
    addedAt: '2026-07-20',
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
  // ⚠️ `ca.rabies-only-1year-vaccine`(3년 백신 거부 blocker)을 **삭제했다** (2026-07-20 조사).
  //   CFIA 원문이 정반대를 말한다 — 증명서에 적힌 유효기간을 그대로 인정하고 미기재일 때만
  //   1년으로 강등한다: "specify the period of validity of the rabies vaccination (otherwise,
  //   it will be considered valid for 1 year from the date of vaccination)". 즉 3년 백신은
  //   증명서에 3년이 적혀 있으면 3년간 유효하다. blocker 는 저장을 거부해 우회가 불가능하므로
  //   **CFIA 규정에 맞는 케이스를 우리가 막고 있었다** — 4국 중 가장 명백한 오류였다.
  //   프로파일의 oneYearVaccineOnly 도 함께 제거했다(포털 YearSelect 비활성 해제).
  //   대신 진짜 위험(유효기간 미기재 → 1년 강등)은 광견병 카드 validityLine 의 안내 문구로
  //   옮겼다 — 한국 동물병원 증명서에 유효기간이 안 적히는 경우가 흔하다.
  {
    id: 'ca.rabies-valid-on-departure',
    country: COUNTRY,
    category: '광견병',
    title: '출국일에 광견병 면역 유효',
    description: '최근 광견병 접종의 면역 유효기간이 출국일 이전에 만료되지 않아야 함.',
    // ⚠️ 'info' 는 **표시 억제를 겸한다** — 베트남 vn.rabies-valid-on-departure 와 같은 구조.
    // severity 를 올리려면 ADVISORY_DEFERRED_CHECKS(scenario.ts)에도 함께 등록할 것.
    severity: 'info',
    addedAt: '2026-07-20',
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
  // ── 도착 수입 검역 ──
  {
    id: 'ca.import-quarantine-date-valid',
    country: COUNTRY,
    category: '검역',
    title: '캐나다 수입 검역일',
    description: '캐나다 수입 검역일은 캐나다 입국일 이후여야 함.',
    severity: 'warning',
    addedAt: '2026-07-20',
    run: ({ caseRow, destination }) => {
      const data = (caseRow.data ?? {}) as Record<string, unknown>
      const raw =
        typeof data.ca_import_quarantine_date === 'string'
          ? data.ca_import_quarantine_date.slice(0, 10)
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
          message: '캐나다 수입 검역일은 캐나다 입국일보다 빠를 수 없어요. 날짜를 확인하세요.',
          offendingPaths: ['ca_import_quarantine_date'],
        }
      }
      return { ok: true, message: `캐나다 수입검역일(${raw}) 입국 이후.` }
    },
  },
]
