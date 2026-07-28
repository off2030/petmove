/**
 * 여정 카드 ↔ procedure-check 룰 배선 검사.
 *
 * 왜 필요한가 — 카드는 `validationIds` 로 검증 룰을 **이름으로** 지목한다. base 카드를
 * 목적지별로 갈아끼울 때 title·description 은 눈에 보여서 안 고치면 바로 티가 나지만,
 * validationIds 는 화면에 안 보인다. 안 고치면 **다른 나라 룰을 그대로 물려받은 채**
 * 조용히 아무 검증도 안 도는 상태가 된다(룰의 country 가 달라 실행 대상에서 빠지므로).
 *
 * 실제 사고: 대만·중국 '수입 검역' 카드가 base 의 jp.import-quarantine-date-valid 를
 * 물려받아, 두 나라에선 "검역일이 입국일보다 빠름" 같은 불가능한 입력이 통과했다
 * (2026-07-19 발견). 태국·필리핀·EU 는 각자 룰을 지목해 정상 동작 중이었다.
 *
 * 검사 내용 — 목적지 × 그 목적지에 뜨는 카드마다:
 *   1) validationIds 가 가리키는 룰이 실제로 존재하는가
 *   2) 그 룰이 **이 목적지에 적용되는가**(룰의 country 에 이 목적지가 들어있는가)
 *
 * ── 두 층으로 나눈 이유 ────────────────────────────────────────────────
 * 앱(펫무브) 노출 목적지(`appSupported`)는 **실패**시킨다 — 고객이 실제로 그 카드를 보고
 * 날짜를 넣는 곳이라 배선이 끊기면 곧 잘못된 입력이 그냥 저장된다.
 *
 * 펫무브워크 전용 목적지는 **경고만** 한다. 여정 카드가 고객에게 노출되지 않고, 그 나라들은
 * 애초에 룰이 몇 개뿐이라(usa=4 등) 지금 전부 메우는 건 이 작업의 범위를 넘는다.
 * 대신 `appSupported: true` 로 바꾸는 순간 자동으로 실패 대상이 되므로, **배선이 끊긴 채로
 * 앱에 출시되는 일은 막힌다.** 새 목적지를 앱에 올릴 때 이 린트가 문지기가 된다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { JOURNEY_STEP_CATALOG } from '../packages/domain/src/journey-steps/catalog'
import { resolveDatedStepField } from '../packages/domain/src/journey-steps/dated-steps'
import { resolveStepForDestination } from '../packages/domain/src/journey-steps/destination-overrides'
import { ALL_PROCEDURE_CHECKS, checkCountryKeys } from '../packages/domain/src/procedure-checks/registry'
import { DESTINATION_OVERRIDES, destinationKeysWhere } from '../packages/domain/src/destination-config'
import {
  EU_ENTRY_FAMILY,
  GENERAL_VACCINE_WAIT_DAYS,
  PARASITE_DEPARTURE_WINDOWS,
  RABIES_ENTRY_WAIT_DAYS,
} from '../packages/domain/src/journey-steps/date-rules'
import { TITER_MIN_DAYS_AFTER_VACCINE } from '../packages/domain/src/journey-steps/titer-validity'

const CHECKS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'packages',
  'domain',
  'src',
  'procedure-checks',
)

type Problem = {
  dest: string
  stepId: string
  ruleId: string
  kind:
    | 'missing'
    | 'cross-country'
    | 'unvalidated'
    | 'orphan-rule'
    | 'missing-pair'
    | 'own-calc'
    | 'no-blocker'
    | 'no-parasite-blocker'
    | 'no-wait-blocker'
    | 'no-titer-wait-decision'
    | 'no-save-block-decision'
    | 'dead-declaration'
    | 'notify-unregistered'
}

/**
 * 어느 카드도 지목하지 않아도 되는 룰 — **케이스 전체 조건**이라 특정 단계에 못 붙인다.
 * 이런 룰은 상단 caseAlert 로 뜨는 게 맞다.
 *
 * 3단계 검사를 넣은 이유: 중국 `cn.microchip-before-rabies` 가 어느 카드에도 안 붙어 있어
 * 대만·태국·베트남과 달리 **광견병 카드 배지 대신 상단 경고로 새고 있었다**(2026-07-19).
 * 룰은 정상 동작했기 때문에 기존 검사(1·2단계)도, behavior 스냅샷도 잡지 못했다 —
 * "경고가 뜨느냐"가 아니라 "어디에 뜨느냐"의 문제라서.
 */
const ORPHAN_RULE_OK: Record<string, string> = {
  // 마리 수 한도 — 케이스(보호자) 단위 조건이라 단계가 없다. 세 나라 모두 동일 처리.
  'cn.one-pet-per-guardian': '보호자 단위 조건 — 특정 단계 없음',
  'vn.max-2pets-per-guardian': '보호자 단위 조건 — 특정 단계 없음',
  'ph.max-3pets-per-shipment': '보호자 단위 조건 — 특정 단계 없음',
  'ma.max-5pets-non-commercial': '보호자 단위 조건 — 특정 단계 없음',
  // 견종 제한 — 동물 자체의 속성이라 단계가 없다.
  'cn.banned-breeds': '동물 속성 — 특정 단계 없음',
  'vn.banned-breeds': '동물 속성 — 특정 단계 없음',
  'th.banned-breeds': '동물 속성 — 특정 단계 없음',
  'ae.banned-breeds': '동물 속성 — 특정 단계 없음',
  'il.banned-breeds': '동물 속성 — 특정 단계 없음',
  'sg.banned-breeds': '동물 속성 — 특정 단계 없음',
  'au.banned-breeds': '동물 속성 — 특정 단계 없음(개 5종·늑대 교잡 4종 / 고양이 교잡 4종)',
  'nz.banned-breeds': '동물 속성 — 특정 단계 없음(Dog Control Act 1996 개 5종)',
  // 이스라엘 3마리+ 사전 Import License — 보호자 단위 조건이라 단계가 없다(운영자 전용 staff).
  'il.import-license-3plus-pets': '보호자 단위 조건 — 특정 단계 없음',
  // 아랍에미리트 개인당 연간 2마리 한도 — 보호자 단위 조건이라 단계가 없다.
  // (운영자 전용 audience: 'staff' 라 고객 화면엔 애초에 안 뜬다.)
  'ae.max-2pets-per-year': '보호자 단위 조건 — 특정 단계 없음',
}

/**
 * '입국 전 만료' 계열 — 백신 카드의 situational 안내가 같은 조건을 이미 말한다.
 * 배지로도 띄우면 중복이라 의도적으로 안 붙인다(scenario.ts ADVISORY_DEFERRED_CHECKS 참고).
 */
const ADVISORY_SUFFIXES = [
  '-not-expired-on-arrival',
  '-valid-on-departure',
  '-valid-until-on-entry',
  '-valid-until-on-departure',
]

/**
 * portal 표시에서 의도적으로 제외된 룰 — scenario.ts ADVISORY_DEFERRED_CHECKS 와 같은 목록.
 * 카드에 안 붙는 게 정상이라 3단계 대상이 아니다.
 * (같은 조건을 다른 카드의 situational 안내가 이미 말하고 있어 배지는 중복.)
 */
const PORTAL_DEFERRED: Record<string, string> = {
  'jp.entry-within-2years-of-titer': "'추가 검사' 카드 안내가 재검사를 가리킴",
  'jp.rabies-valid-until-on-departure': "'추가 백신' 카드가 담당",
}

/**
 * 신청일·출국일 '순서' 룰 — 두 날짜가 서로 다른 카드에 있어 한쪽에 붙이면 다른 쪽에서
 * 안 보인다. 케이스 전체 조건으로 보고 상단에 띄우는 게 맞다(태국·필리핀 동일 처리).
 */
const CROSS_CARD_ORDER_RULES = ['-not-after-departure']

/**
 * 날짜 입력칸이 있는데 validationIds 가 비어도 **정상인** 카드.
 *
 * 이 검사(2단계)를 넣은 이유 — 1단계는 "지목한 룰이 그 나라 것이냐"만 본다. 아무것도
 * 지목하지 않으면 조용히 통과했다. 실제로 대만·중국 수출검역 카드가 검증 0개로 방치돼
 * 있었고 린트가 못 잡았다(2026-07-19).
 *
 * 여기 적는 건 **"검증이 다른 카드에 있어서 이 카드엔 없는 게 맞다"**는 경우만.
 * 새 카드를 만들며 검증을 빠뜨린 걸 여기 추가해 넘어가지 말 것 — 그러면 이 가드가 무의미해진다.
 */
const UNVALIDATED_OK: Record<string, string> = {
  // 마이크로칩 삽입일의 순서 검증은 광견병 카드 쪽에 있다
  // (`{국가}.microchip-before-rabies` — 칩이 1차 접종보다 앞이어야 한다는 룰).
  // 칩 자체에는 단독으로 검증할 날짜 제약이 없다.
  microchip: '순서 검증은 광견병 카드(microchip-before-rabies)가 담당',
  // 중국은 항공권 날짜에 제한이 없다 — 채혈 후 대기 요건이 없어(EU 3개월·일본 180일과 다름)
  // 입국 시점에 백신·항체가 유효하기만 하면 된다. 그 유효성은 rabies/titer 카드가 본다.
  'flight-purchase': '중국은 항공권 날짜 제한 없음(대기 요건 부재) — 유효성은 백신·항체 카드가 담당',
  // 대만 수입허가 — 마감(120/20일) 주의는 항공권 카드가 표시한다. 신청일은 이미 지나간
  // 사실이라 어긋나도 못 고치고, 바꿀 수 있는 건 출국일뿐이라 조치 가능한 카드에 붙였다.
  // 신청일 칸 자체의 입력불가(출국 이후·20일 미만)는 validateImportPermitFiledDate 가 막는다.
  'taiwan:import-permit': '마감 주의는 항공권 카드가 표시(조치 가능한 칸이 거기) + 입력불가는 date-rules 담당',
  // 싱가포르 전용 절차 카드 — 완료일(≤오늘) 입력·첨부만. 날짜 순서 검증이 필요 없는 절차
  //   완료 추적용(강아지 라이선스·관부가세·국경검사 예약). 계류장 예약은 sg.quarantine-
  //   reservation-after-titer(채혈 이후) 룰이 있어 제외.
  'sg-dog-licence': '절차 완료일 추적용 — 날짜 순서 제약 없음',
  // sg-gst-permit·sg-border-inspection 은 2026-07-25 검증 추가로 예외 목록에서 제거.
}

/**
 * 예외 키는 `<목적지>:<카드>` 를 먼저 보고, 없으면 카드 id 로 떨어진다.
 * 카드 id 만 쓰면 한 나라 사정으로 **모든 목적지**의 같은 카드가 함께 풀린다 —
 * 새 목적지가 조용히 무검증으로 들어오는 걸 막으려고 좁은 키를 우선한다.
 */
function unvalidatedReason(dest: string, stepId: string): string | undefined {
  return UNVALIDATED_OK[`${dest}:${stepId}`] ?? UNVALIDATED_OK[stepId]
}

const RULES = new Map(
  (ALL_PROCEDURE_CHECKS as Array<{ id: string; country: unknown }>).map((r) => [r.id, r]),
)

/** 그 목적지에 이 카드가 뜨는가 — destinations + excludeDestinations 만 본다(종·트립 무관). */
function appliesToDest(step: (typeof JOURNEY_STEP_CATALOG)[number], dest: string): boolean {
  const { destinations, excludeDestinations, roundOnlyDestinations } = step.applicability
  if (excludeDestinations?.includes(dest)) return false
  // ⚠️ `roundOnlyDestinations` 를 빠뜨리면 **파생으로 카드를 받는 목적지가 통째로 검사에서
  //   빠진다**(2026-07-22 발견). 광견병 항체 카드가 그 경로다 — 귀국용으로만 필요한 13개국은
  //   destinations 목록에 없고 roundOnlyDestinations(프로파일 rabiesTiterForReturnOnly 파생)로
  //   왕복 케이스에만 뜬다. 그래서 그 카드들이 **일본 룰(jp.*)을 그대로 물려받은 채**
  //   — 카자흐스탄·태국·멕시코·브라질 등 전부 — 린트를 통과하고 있었다.
  //   앱 판정(applicability.ts isStepApplicable)과 같은 조건을 봐야 한다. 새 파생 경로가
  //   생기면 여기도 함께 넓힐 것.
  return (
    destinations === 'all' ||
    destinations.includes(dest) ||
    (roundOnlyDestinations?.includes(dest) ?? false)
  )
}

function collect(dest: string): Problem[] {
  const out: Problem[] = []
  for (const step of JOURNEY_STEP_CATALOG) {
    if (!appliesToDest(step, dest)) continue
    const resolved = resolveStepForDestination(step, dest, null) as {
      validationIds?: string[]
      inputs?: Array<{ key: string; type?: string }>
      buttonComplete?: boolean
    }
    const ids = resolved.validationIds ?? []

    // 1단계 — 지목한 룰이 존재하고, 이 목적지에 적용되는가.
    for (const ruleId of ids) {
      const rule = RULES.get(ruleId)
      if (!rule) out.push({ dest, stepId: step.id, ruleId, kind: 'missing' })
      else if (!checkCountryKeys(rule.country as never).includes(dest))
        out.push({ dest, stepId: step.id, ruleId, kind: 'cross-country' })
    }

    // 2단계 — 날짜를 받는데 검증이 하나도 없는가(위 UNVALIDATED_OK 예외 제외).
    // 버튼 완료 카드는 날짜 입력칸 자체가 없고(완료 버튼이 오늘을 기록) 검증 없음이 의도라
    // 자동 통과(2026-07-26 귀국 절차 전환).
    // ⚠️ **resolved** 를 본다 — base 카탈로그의 step.buttonComplete 만 보면, 목적지 override 로
    //   버튼 완료가 된 카드(홍콩·말레이시아·인도네시아·아랍에미리트 수입 허가)를 놓쳐서
    //   '날짜칸을 받는데 검증이 없다'고 잘못 실패시킨다(2026-07-26 발견).
    const dateInputs = (resolved.inputs ?? []).filter((i) => i.type === 'date')
    if (
      dateInputs.length > 0 &&
      !resolved.buttonComplete &&
      ids.length === 0 &&
      !unvalidatedReason(dest, step.id)
    ) {
      out.push({
        dest,
        stepId: step.id,
        ruleId: dateInputs.map((i) => i.key).join(', '),
        kind: 'unvalidated',
      })
    }
  }
  return out
}

/**
 * 3단계 — 그 나라 룰인데 **어느 카드도 지목하지 않는** 것.
 *
 * 이러면 룰은 정상 동작하지만 경고가 카드 배지가 아니라 상단 caseAlert 로 뜬다. 같은 룰이
 * 다른 나라에선 카드에 붙어 있으면 나라마다 경고 위치가 달라진다(중국 사고).
 */
function orphanRules(appDests: string[]): Problem[] {
  const appSet = new Set(appDests)
  const referenced = new Set<string>()
  for (const dest of appDests) {
    for (const step of JOURNEY_STEP_CATALOG) {
      if (!appliesToDest(step, dest)) continue
      const r = resolveStepForDestination(step, dest, null) as { validationIds?: string[] }
      for (const id of r.validationIds ?? []) referenced.add(id)
    }
  }
  const out: Problem[] = []
  for (const rule of ALL_PROCEDURE_CHECKS as Array<{ id: string; country: unknown }>) {
    if (referenced.has(rule.id)) continue
    if (rule.id in ORPHAN_RULE_OK) continue
    if (ADVISORY_SUFFIXES.some((x) => rule.id.endsWith(x))) continue
    if (CROSS_CARD_ORDER_RULES.some((x) => rule.id.endsWith(x))) continue
    if (rule.id in PORTAL_DEFERRED) continue
    const countries = checkCountryKeys(rule.country as never).filter((c) => appSet.has(c))
    if (countries.length === 0) continue // 앱 미노출 목적지 전용 룰은 대상 아님
    out.push({ dest: countries.join(','), stepId: '(카드 없음)', ruleId: rule.id, kind: 'orphan-rule' })
  }
  return out
}

/**
 * 4단계 — **저장 거부가 걸리는데 짝이 되는 주의 룰이 없는** 목적지.
 *
 * 왜 필요한가: 입력불가(저장 거부)는 프로파일 선언에서 자동 파생되지만, 그 짝이 되는
 * procedure-check 주의 룰은 **사람이 손으로 만든다.** 그래서 한쪽만 생기는 일이 실제로
 * 벌어졌다 — 펫무브워크(운영자)는 저장을 막지 않고 절차검증만 보므로, 주의 룰이 없으면
 * **운영자 화면에서 그 위반이 아예 안 보이는 반쪽 상태**가 된다.
 *
 * 실제 사고(2026-07-21 발견): 모로코·우크라이나·멕시코·브라질 4개국에 광견병 체인 검증
 * 주의 룰이 없었다. 저장 거부(findRabiesChainBreak)는 1회 접종국이라 이미 걸려 있었는데도.
 * '베트남 골격 복제'가 프로파일·카드·서류까지만 가고 procedure-checks 파일은 구세대를
 * 그대로 둔 채 값만 패치했기 때문이다. 기존 1~3단계는 "있는 룰의 연결"만 보므로 못 잡았다.
 *
 * 프로파일 선언 → 필요한 룰 접미사 매핑(둘 다 파생이라 정적으로 검사 가능):
 *   rabies.doses === 1                    → findRabiesChainBreak 저장거부 → 체인 주의 룰
 *   rabies.entryWaitDaysAfterVaccine 선언 → validateRabiesEntryWait 저장거부 → 대기 주의 룰
 */
function missingPairRules(appDests: string[]): Problem[] {
  const ruleIds = new Set((ALL_PROCEDURE_CHECKS as Array<{ id: string }>).map((r) => r.id))
  const out: Problem[] = []
  for (const dest of appDests) {
    const rabies = DESTINATION_OVERRIDES[dest]?.rabies
    if (!rabies) continue
    const has = (suffix: string) => [...ruleIds].some((id) => id.endsWith(suffix))
    // 룰 id 는 나라 접두사가 제각각(kh/mn/ma…)이라 접미사로 본다. 단 그 나라 룰이어야 하므로
    // country 로 한 번 더 거른다.
    const ownRules = (ALL_PROCEDURE_CHECKS as Array<{ id: string; country: unknown }>).filter((r) =>
      checkCountryKeys(r.country as never).includes(dest),
    )
    const ownHas = (suffix: string) => ownRules.some((r) => r.id.endsWith(suffix))
    void has

    if (rabies.doses === 1 && !ownHas('.rabies-booster-within-prime-validity')) {
      out.push({
        dest,
        stepId: '(프로파일 rabies.doses === 1)',
        ruleId: `${dest}: *.rabies-booster-within-prime-validity`,
        kind: 'missing-pair',
      })
    }
    if (rabies.entryWaitDaysAfterVaccine && !ownRules.some((r) => /\.rabies-min-\d+days-before-departure$/.test(r.id))) {
      out.push({
        dest,
        stepId: `(프로파일 entryWaitDaysAfterVaccine: ${rabies.entryWaitDaysAfterVaccine})`,
        ruleId: `${dest}: *.rabies-min-<N>days-before-departure`,
        kind: 'missing-pair',
      })
    }
  }
  return out
}

/**
 * 5단계 — **저장 거부와 주의가 서로 다른 계산을 하는** 목적지.
 *
 * 대기일 판정은 도메인 함수 하나(violatesRabiesEntryWait)로 통일돼 있다. 그런데 주의 룰이
 * 그 헬퍼를 안 쓰고 자체 계산(daysBetween + rabies[0])을 하면 **두 층의 기준이 갈린다.**
 *
 * 실제 사고(2026-07-21 발견): mx.rabies-min-30days-before-departure 가 가장 이른 접종을
 * 기준으로 삼아 ①만료 후 재접종 케이스를 통째로 놓치고(1차부터 세어 '통과') ②프로파일
 * 파생 저장 거부와 계산이 어긋났다.
 *
 * 검사 방법: entryWaitDaysAfterVaccine 를 선언한 목적지의 procedure-checks 파일이
 * violatesRabiesEntryWait 를 import 하는지 (정적 텍스트 검사).
 */
function ownCalcRules(appDests: string[]): Problem[] {
  const out: Problem[] = []
  const seen = new Set<string>()
  for (const dest of appDests) {
    if (!DESTINATION_OVERRIDES[dest]?.rabies?.entryWaitDaysAfterVaccine) continue
    const rule = (ALL_PROCEDURE_CHECKS as Array<{ id: string; country: unknown }>).find(
      (r) =>
        /\.rabies-min-\d+days-before-departure$/.test(r.id) &&
        checkCountryKeys(r.country as never).includes(dest),
    )
    if (!rule) continue // 4단계가 잡는다
    const cc = rule.id.split('.')[0]
    if (seen.has(cc)) continue
    seen.add(cc)
    const file = path.join(CHECKS_DIR, `${cc}.ts`)
    if (!fs.existsSync(file)) continue
    const src = fs.readFileSync(file, 'utf8')
    if (!src.includes('violatesRabiesEntryWait')) {
      out.push({
        dest,
        stepId: `(procedure-checks/${cc}.ts)`,
        ruleId: rule.id,
        kind: 'own-calc',
      })
    }
  }
  return out
}

/**
 * 6단계 — **주의는 뜨는데 저장 거부가 없는** 목적지 (4단계의 정반대 방향).
 *
 * 왜 필요한가: 4단계는 '저장 거부는 있는데 주의 룰이 없다'를 잡는다. 그런데 실제로는
 * 반대도 벌어졌다 — 주의 룰(`<cc>.departure-min-3months-after-titer`)은 손으로 만들어 뒀는데
 * 저장 거부 함수가 **나라 이름 하드코딩**이라 그 나라를 안 보는 경우다.
 *
 * 실제 사고(2026-07-22 발견): 우크라이나가 채혈 후 3개월 대기를 프로파일에 선언하고 주의 룰도
 * 갖췄는데, 저장 거부(validateEuEntryDate)가 EU 목록만 보고 있어 **채혈 2개월 뒤 입국일도
 * 그냥 저장됐다.** 일본·대만·EU 8개국은 이름이 목록에 있어 정상이었고, 새로 올린 나라만 샜다.
 * 1~5단계는 '룰끼리의 연결'만 보므로 못 잡았다.
 *
 * 검사 방법: 채혈 후 대기 주의 룰을 가진 앱 목적지가 저장 거부 대상(EU 패밀리 ∪ 프로파일
 * 선언 ∪ 전용 함수 보유국)에 들어 있는지. 전용 함수는 나라별 분기가 얽혀 있어 명단으로 둔다.
 */
const OWN_ENTRY_BLOCKER_DESTS = new Set(['japan', 'taiwan'])

/**
 * 입국 티터 요건인데 **규정상 채혈 후 대기가 없는** 목적지 — 사유와 함께 명시 등록.
 *
 * 왜 필요한가: 6단계 두 번째 검사(아래)는 "입국 티터면 대기 차단이든 '대기 없음' 선언이든
 * 둘 중 하나는 반드시 있어야"를 강제한다. 하와이가 이 구멍으로 샜다 — 대기 주의가
 * `hi.favn-sample-...` 이름이라 `*-after-titer` 패턴에 안 걸렸고, 프로파일 entryWaitAfterTiter 도
 * 선언 안 해 blocked 에도 없어서 **조용히 통과**했다(2026-07-25). 이름 규칙에 의존하지 않고
 * 티터 요건 자체를 기준으로 삼아, 대기가 없는 나라는 여기에 근거를 남기게 한다(silent default 금지).
 */
const TITER_NO_ENTRY_WAIT_KNOWN: Record<string, string> = {
  indonesia: '1차 출처에 채혈 후 대기 일수 규정 없음(id.ts 헤더)',
  morocco: '채혈 후 대기 없음 — 접종 후 21일만(ma.ts rnatt 룰)',
  // china·israel 은 blocked(EU_ENTRY_FAMILY)/전용 처리로 이미 6단계 대상 밖이라 여기 불필요.
}

/**
 * 6-b단계 — **기생충 창 주의는 있는데 저장 거부가 없는** 목적지.
 *
 * 왜 필요한가: 기생충(외부·내부) 처치 창은 date-rules 의 validateParasiteDateForDestination
 * dispatch 로 저장 거부한다. 그런데 저장 거부가 목적지별로 손수 배선되던 시절, 새 목적지는
 * 주의 룰·카드만 자동으로 붙고 저장 거부는 누락됐다 — 하와이(2026-07-25)·터키·멕시코·UAE·
 * 브라질이 그 상태였다(주의만·저장은 됨). 이름 규칙이 아니라 '기생충 창 룰 존재' 자체를
 * 기준으로, dispatch 커버리지(PARASITE_DEPARTURE_WINDOWS ∪ 싱가포르 ∪ 특수 앵커 나라)에
 * 들어 있는지 검사한다. 새 목적지는 PARASITE_DEPARTURE_WINDOWS 한 줄이면 자동 커버·통과.
 */
const PARASITE_BLOCK_COVERED = new Set<string>([
  ...Object.keys(PARASITE_DEPARTURE_WINDOWS), // turkey·mexico·brazil·uae·hawaii (출국일 앵커)
  'singapore', // 2~7일 창(validateSgParasiteWindow, dispatch 내 분기)
  'philippines', // 수입허가 신청일 앵커(validatePhInternalParasiteWindow, client 전용 분기)
  // EU 촌충 5국 — 입국일 앵커(validateEchinococcusWindow, client 전용 분기).
  'uk',
  'ireland',
  'malta',
  'norway',
  'finland',
])

function parasiteWindowWithoutBlocker(appDests: string[]): Problem[] {
  const out: Problem[] = []
  for (const dest of appDests) {
    if (PARASITE_BLOCK_COVERED.has(dest)) continue
    const rule = (ALL_PROCEDURE_CHECKS as Array<{ id: string; country: unknown }>).find(
      (r) =>
        // 심장사상충도 같은 창(PARASITE_DEPARTURE_WINDOWS)을 쓰는데 패턴에서 빠져 있어
        //   괌 카드가 차단 없이 통과했다(2026-07-27). 같은 계열이라 함께 본다.
        /(external|internal)-parasite|heartworm|tick-treatment|tapeworm|echino/i.test(r.id) &&
        checkCountryKeys(r.country as never).includes(dest),
    )
    if (!rule) continue
    out.push({
      dest,
      stepId: '(기생충 처치 창)',
      ruleId: rule.id,
      kind: 'no-parasite-blocker',
    })
  }
  return out
}

/**
 * **대기 주의 룰 ↔ 저장 거부 짝 검사** (2026-07-27 신설).
 *
 * 왜 필요한가: 주의 룰은 procedure-checks/<국가>.ts 에 자유롭게 쓸 수 있는데, **저장 거부는
 * 프로파일 선언(파생 목록)에 등록해야** 걸린다. 한쪽만 하면 조용히 반쪽이 된다 —
 * "주의는 뜨는데 입력은 그대로 저장됨". 괌 하나에서만 같은 형태를 네 번 만났다:
 *   · gu.rnatt-after-rabies-10days      ← titer.minDaysAfterVaccine 미선언
 *   · gu.general-vaccine-10days-…       ← generalVaccineWaitDays 미선언
 *   · gu.kennel-cough-10days-…          ← 〃 (같은 선언이 둘을 함께 덮는다)
 *   · gu.heartworm-within-14days        ← 기생충 창 게이트 누락(위 parasite 검사가 커버)
 *
 * 기존 titerWaitWithoutBlocker 는 **채혈 후 입국 대기**(entryWaitAfterTiter)만 본다 —
 * 여기서 보는 건 **접종 후 채혈 대기**·**접종 후 출국 대기**로 계열이 다르다.
 */
const WAIT_RULE_BLOCK_SOURCES: Array<{
  test: RegExp
  what: string
  blocked: (dest: string) => boolean
  fix: string
}> = [
  {
    // 접종 → 채혈 최소 간격 (EU 30일·싱가포르 28일·괌 10일 …)
    test: /\.(titer|rnatt)-min-\d+days-after-vaccine$|\.rnatt-after-rabies-\d+days$/,
    what: '접종 후 채혈 대기',
    blocked: (d) => EU_ENTRY_FAMILY.includes(d) || TITER_MIN_DAYS_AFTER_VACCINE[d] !== undefined,
    fix: '프로파일 titer.minDaysAfterVaccine 선언(TITER_MIN_DAYS_AFTER_VACCINE 파생)',
  },
  {
    // 종합백신·켄넬코프 접종 → 출국 대기 (한 선언이 둘을 함께 덮는다)
    test: /\.(general-vaccine|kennel-cough)-\d+days-before-(arrival|departure)$/,
    what: '종합백신·켄넬코프 출국 대기',
    blocked: (d) => GENERAL_VACCINE_WAIT_DAYS[d] !== undefined,
    fix: '프로파일 generalVaccineWaitDays 선언(GENERAL_VACCINE_WAIT_DAYS 파생)',
  },
  {
    // 광견병 접종 → 출국 대기
    test: /\.rabies-min-\d+days-before-departure$|\.rabies-\d+days-before-arrival$/,
    what: '광견병 출국 대기',
    blocked: (d) => RABIES_ENTRY_WAIT_DAYS[d] !== undefined || WAIT_OWN_BLOCKER_DESTS.has(d),
    fix: '프로파일 rabies.entryWaitDaysAfterVaccine 선언(RABIES_ENTRY_WAIT_DAYS 파생)',
  },
]

/** 전용 판정 함수로 차단하는 목적지 — 파생 목록에 없어도 정상. 이유와 함께 등록할 것. */
const WAIT_OWN_BLOCKER_DESTS = new Set<string>([
  // 홍콩 — 상한(1년)까지 봐야 해서 violatesHkRabiesDoseWindow 전용 분기를 쓴다.
  'hongkong',
])

/**
 * 이미 존재하던 구멍 — **사용자 확인 대기**. 검사를 새로 만들면서 드러난 것들이라 무단으로
 * live 목적지 동작을 바꾸지 않고 여기 적어 둔다. 실패 대신 경고로 뜨고, 결정되면 지운다.
 * ⛔ 새 목적지를 여기 넣어 통과시키지 말 것 — 새로 만드는 건 처음부터 짝을 맞춰야 한다.
 */
/** 경고로 출력할 확인 대기 항목 — main 에서 읽는다. */
const waitBacklog = new Map<string, string>()

const WAIT_BLOCKER_BACKLOG: Record<string, string> = {
  'thailand:종합백신·켄넬코프 출국 대기':
    '2026-07-27 검사 신설로 발견. 태국 카드는 "입국 3주 전까지 접종"이라 안내하는데 차단이 없어 접종 4일 뒤 출국도 저장된다. live 목적지라 사용자 확인 후 generalVaccineWaitDays: 21 선언 예정.',
  'thailand:광견병 출국 대기':
    '2026-07-27 검사 신설로 발견. 위와 같은 형태 — rabies.entryWaitDaysAfterVaccine: 21 선언 예정.',
}

function waitRuleWithoutBlocker(appDests: string[]): Problem[] {
  const out: Problem[] = []
  for (const dest of appDests) {
    for (const src of WAIT_RULE_BLOCK_SOURCES) {
      if (src.blocked(dest)) continue
      const rule = (ALL_PROCEDURE_CHECKS as Array<{ id: string; country: unknown }>).find(
        (r) => src.test.test(r.id) && checkCountryKeys(r.country as never).includes(dest),
      )
      if (!rule) continue
      if (WAIT_BLOCKER_BACKLOG[`${dest}:${src.what}`]) {
        waitBacklog.set(`${dest} — ${src.what}`, WAIT_BLOCKER_BACKLOG[`${dest}:${src.what}`])
        continue
      }
      out.push({ dest, stepId: `(${src.what})`, ruleId: `${rule.id} — ${src.fix}`, kind: 'no-wait-blocker' })
    }
  }
  return out
}

function titerWaitWithoutBlocker(appDests: string[]): Problem[] {
  const out: Problem[] = []
  const blocked = new Set<string>([
    ...EU_ENTRY_FAMILY,
    ...destinationKeysWhere((o) => typeof o.titer?.entryWaitAfterTiter?.months === 'number'),
    // 일수 기반(싱가포르 90일·하와이 30일) — validateEuEntryDate 의 TITER_ENTRY_WAIT_DAYS 로 하드
    //   차단됨. 대만(days:180)은 OWN_ENTRY_BLOCKER_DESTS(전용 함수)로 별도 커버.
    ...destinationKeysWhere((o) => typeof o.titer?.entryWaitAfterTiter?.days === 'number'),
    ...OWN_ENTRY_BLOCKER_DESTS,
  ])
  for (const dest of appDests) {
    if (blocked.has(dest)) continue
    const rule = (ALL_PROCEDURE_CHECKS as Array<{ id: string; country: unknown }>).find(
      (r) =>
        /\.departure-min-.+-after-titer$/.test(r.id) &&
        checkCountryKeys(r.country as never).includes(dest),
    )
    if (!rule) continue
    out.push({
      dest,
      stepId: '(채혈 후 대기)',
      ruleId: rule.id,
      kind: 'no-blocker',
    })
  }
  // 두 번째 검사 — 이름 규칙(*-after-titer)에 의존하지 않고 **티터 요건 자체**를 기준으로.
  //   입국 티터(titer.need==='entry')인데 대기 차단(blocked)도 없고 '대기 없음' 명시
  //   (TITER_NO_ENTRY_WAIT_KNOWN)도 없으면 실패 — 하와이형 누락을 원천 차단한다.
  for (const dest of appDests) {
    if (DESTINATION_OVERRIDES[dest]?.titer?.need !== 'entry') continue
    if (blocked.has(dest)) continue
    if (dest in TITER_NO_ENTRY_WAIT_KNOWN) continue
    out.push({
      dest,
      stepId: '(입국 티터 — 채혈 후 대기 결정)',
      ruleId: '—',
      kind: 'no-titer-wait-decision',
    })
  }
  return out
}

/**
 * 7단계 — **선언만 하고 아무도 안 읽는** 프로파일 필드.
 *
 * 왜 필요한가: 프로파일 선언은 "규정을 적어 두면 동작이 따라온다"는 약속인데, 소비처를
 * 배선하지 않으면 **적어 뒀다는 사실이 오히려 안전하다는 착각**을 만든다. 6단계가 잡은
 * 우크라이나가 정확히 그 상태였다 — `entryWaitAfterTiter: { months: 3 }` 이 프로파일에
 * 있었지만 그 필드를 읽는 코드가 저장소 어디에도 없었다.
 *
 * 검사 방법: 앱 노출 목적지가 **실제로 선언한** 프로파일 필드 이름이 destination-config.ts
 * 바깥 소스에서 한 번이라도 등장하는지(정적 텍스트). 아무도 안 쓰면 죽은 선언이다.
 *
 * ⚠️ 앱 미노출 목적지의 선언은 보지 않는다 — Phase 1-b 로 미리 적어 둔 값들이라 소비처가
 *   아직 없는 게 정상이다(destination-config 상단 주석). 앱에 올리는 순간 검사 대상이 된다.
 */
/**
 * 이미 알고 있는 죽은 선언 — **동작 자체는 다른 곳에 하드코딩돼 있는** 것들.
 *
 * 우크라이나(동작이 어디에도 없었다)와는 등급이 다르다. 여기 있는 건 "규정은 지켜지는데
 * 프로파일 선언이 아직 진실 출처가 아닌" 상태다(Phase 1-b 잔여). 그래서 실패가 아니라
 * **매 실행마다 목록으로 보여주고 넘어간다** — 파생으로 교체할 때 지우면 된다.
 *
 * ⚠️ 새로 만든 선언을 여기 적어 넘기지 말 것. 값은 '지금 그 동작이 어디 있는지'여야 하고,
 *   적을 곳이 없다면 그건 우크라이나와 같은 진짜 구멍이다.
 */
const DEAD_DECLARATION_KNOWN: Record<string, string> = {
  hardDeadlineHours: '아일랜드 24시간은 validateIeAdvanceNoticeDate 에 1일로 하드코딩',
  doseIntervalDays: "중국 30일 'soft' 는 cn.ts 룰 문구·카드 안내가 담당(하드 차단 없음)",
  applyDeadlineDays: '대만 마감은 tw.import-permit-120days-before-entry 룰이 담당',
  docName: '서류명은 required-docs.ts 가 자체 목록으로 들고 있다',
  quarantineDays: '베트남 14일은 도착 검역 카드 문구에 직접 쓰여 있다',
}

const PROFILE_FIELD_SCAN_DIRS = [
  path.join(CHECKS_DIR, '..'), // packages/domain/src
  path.join(CHECKS_DIR, '..', '..', '..', '..', 'apps'),
]

function collectSource(dir: string, acc: string[]): void {
  if (!fs.existsSync(dir)) return
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name.startsWith('.next-')) continue
      collectSource(p, acc)
    } else if (/\.(ts|tsx)$/.test(e.name) && e.name !== 'destination-config.ts') {
      acc.push(fs.readFileSync(p, 'utf8'))
    }
  }
}

function deadDeclarations(appDests: string[]): Problem[] {
  const sources: string[] = []
  for (const d of PROFILE_FIELD_SCAN_DIRS) collectSource(d, sources)
  const consumed = (field: string) => sources.some((s) => s.includes(field))

  // 앱 목적지가 선언한 프로파일 필드 이름을 전부 모은다(중첩 객체 1단계까지).
  const declared = new Map<string, string>() // field → 선언한 목적지(첫 번째)
  for (const dest of appDests) {
    const o = DESTINATION_OVERRIDES[dest] as Record<string, unknown> | undefined
    if (!o) continue
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const nk of Object.keys(v as Record<string, unknown>)) {
          if (!declared.has(nk)) declared.set(nk, dest)
        }
      }
    }
  }

  const out: Problem[] = []
  for (const [field, dest] of declared) {
    if (consumed(field)) continue
    if (field in DEAD_DECLARATION_KNOWN) {
      knownDead.set(field, `${dest} — ${DEAD_DECLARATION_KNOWN[field]}`)
      continue
    }
    out.push({
      dest,
      stepId: '(프로파일 선언)',
      ruleId: field,
      kind: 'dead-declaration',
    })
  }
  return out
}

/** 7단계에서 걸렀지만 실패시키지 않은 것 — main 에서 목록으로 보여준다. */
const knownDead = new Map<string, string>()

function describe(p: Problem): string {
  if (p.kind === 'missing') return '존재하지 않는 룰'
  if (p.kind === 'no-blocker')
    return '주의 룰은 있는데 **저장 거부가 이 목적지를 보지 않는다** — 규정 위반 날짜가 그냥 저장된다(우크라이나 2026-07-22 사고와 동일)'
  if (p.kind === 'no-parasite-blocker')
    return "기생충 처치 창 주의는 있는데 **저장 거부가 없다** — 창 밖 처치일이 그냥 저장된다(하와이·터키·멕시코·UAE·브라질 2026-07-25 사고). date-rules 의 PARASITE_DEPARTURE_WINDOWS 에 창을 선언하거나(출국일 앵커) dispatch·PARASITE_BLOCK_COVERED 에 특수 앵커 분기를 추가할 것"
  if (p.kind === 'no-wait-blocker')
    return '대기 주의 룰은 있는데 **저장 거부가 없다** — 주의는 뜨는데 입력은 그대로 저장된다(괌 2026-07-27 에서 같은 형태를 네 번 발견). 위 fix 대로 프로파일에 선언하거나, 전용 판정 함수로 막는다면 WAIT_OWN_BLOCKER_DESTS 에 이유와 함께 등록할 것'
  if (p.kind === 'no-save-block-decision')
    return "날짜 입력칸이 있는데 **저장 차단 결정이 등록되지 않았다** — DATE_SAVE_BLOCK_DECISIONS 에 '차단: <어느 함수가>' 또는 '주의만: <근거>' 로 등록할 것(하와이 입국 신청 2026-07-26 사고 재발 방지). 불가능한 날짜 조합이면 차단을 먼저 만들 것"
  if (p.kind === 'no-titer-wait-decision')
    return "입국 티터 요건인데 **채혈 후 대기 차단도, '대기 없음' 명시도 없다** — 30일 안쪽 입국일이 그냥 저장된다(하와이 2026-07-25 사고). 대기가 있으면 프로파일 titer.entryWaitAfterTiter 를 선언하고, 없으면 TITER_NO_ENTRY_WAIT_KNOWN 에 근거와 함께 등록할 것"
  if (p.kind === 'notify-unregistered')
    return '수입 허가 마감 알림·발급 푸시가 걸려 있는데 IMPORT_PERMIT_NOTIFY_OK 에 등록되지 않았다 — 이 나라에 실제 신청 마감이 있는지 확인하고 사유와 함께 등록하거나, 마감이 없으면 알림/푸시를 제거할 것(말레이시아 사고)'
  if (p.kind === 'dead-declaration')
    return `프로파일에 선언했는데 **읽는 코드가 없다** — 규정을 적어 뒀지만 아무 동작도 하지 않는다`
  if (p.kind === 'missing-pair')
    return '저장 거부는 프로파일에서 파생돼 이미 걸리는데 **짝이 되는 주의 룰이 없다** — 운영자(펫무브워크) 화면에서 이 위반이 안 보인다'
  if (p.kind === 'own-calc')
    return '대기일 주의 룰이 violatesRabiesEntryWait 를 쓰지 않는다 — 저장 거부와 계산이 갈린다(만료 후 재접종을 놓침)'
  if (p.kind === 'unvalidated')
    return `날짜칸(${p.ruleId})을 받는데 검증이 하나도 없음 — 말이 안 되는 날짜가 그냥 저장됨`
  if (p.kind === 'orphan-rule')
    return `${p.ruleId} — 어느 카드도 지목하지 않음. 경고가 카드 배지 대신 상단으로 샌다`
  return `이 목적지에 적용되지 않는 룰 → ${p.dest} 케이스에선 검증이 실행되지 않음`
}

/**
 * 8단계 — **신청 마감 알림·발급 푸시가 걸린 목적지가 명시 등록됐는가.**
 *
 * 왜 필요한가(2026-07-23 사용자 요청 "여행지 추가 시 사전에 확인"): 수입 허가 마감 알림
 * (reminders.ts)과 발급 완료 푸시(milestone-pushes.ts)는 목적지 키가 **손으로 하드코딩**돼
 * 있다. 새 나라를 태국 복제로 만들면 그 알림/푸시가 딸려오는데, **그 나라에 실제로 신청
 * 마감이 있는지는 확인되지 않은 채** 알림이 나간다.
 *
 * 실제 사고: 말레이시아·인도네시아가 태국 복제로 '출국 7영업일 전까지 신청' 알림을 물려받아,
 * MAQIS 는 신청 마감이 없는데도 없는 기한을 안내하고 있었다(2026-07-23 발견·제거).
 *
 * 검사 방법: 두 파일을 텍스트로 읽어 import-permit 관련 목적지 키를 뽑고, **아래 명시
 * 등록(IMPORT_PERMIT_NOTIFY_OK)에 없는 앱 목적지**를 실패시킨다. 새로 넣으려면 그 나라의
 * 마감 근거를 확인하고 사유와 함께 등록해야 한다 — 복제로 조용히 새는 걸 막는 문지기.
 */
const IMPORT_PERMIT_NOTIFY_OK: Record<string, string> = {
  thailand: 'DLD — 출국 7영업일 전 신청 마감(확인됨)',
  philippines: 'BAI SPSIC — 신청 마감 관행 있음',
  taiwan: 'APHIA — 도착 120일 전 마감',
  guam: 'DOAG — 도착 30일 전 서류 제출 마감(확인됨. 14일 미만은 처리 보장 불가)',
  switzerland: 'FSVO — 입국 21일 전 신청 마감(확인됨. 카드 배지·입력 차단·주의가 모두 21일)',
  // ⛔ 여기 없는 앱 목적지가 알림/푸시 코드에 있으면 실패한다. 마감 근거를 확인한 뒤
  //   사유와 함께 추가할 것. 마감이 없는 나라(말레이시아·아랍에미리트)는 애초에 알림/푸시를
  //   만들지 않는다 — 여기 넣어서 통과시키지 말 것.
}

function importPermitNotifyLeaks(appDests: string[]): Problem[] {
  const files = [
    path.join(CHECKS_DIR, '..', '..', '..', '..', 'apps', 'portal', 'lib', 'journey', 'reminders.ts'),
    path.join(CHECKS_DIR, '..', '..', '..', '..', 'apps', 'portal', 'lib', 'journey', 'milestone-pushes.ts'),
  ]
  const appSet = new Set(appDests)
  const found = new Set<string>()
  for (const f of files) {
    if (!fs.existsSync(f)) continue
    const src = fs.readFileSync(f, 'utf8')
    // 주석 줄은 제외하고 실제 코드의 `key === '<dest>'` 분기만 본다(주석에 남긴 제외 사유가
    // 오탐되지 않게). **그 분기 본문이 실제로 수입 허가를 다룰 때만** 집계한다 —
    // 예전엔 분기 존재만으로 잡아서, 수입 허가와 무관한 알림(호주 전염병 검사 채혈 창)을
    // 넣었을 뿐인데 '등록되지 않은 수입 허가 알림'으로 실패했다(2026-07-27).
    // 목적지 키가 importPermit 프로파일을 가지면 무조건 걸리던 구조라, 허가국은 그 나라
    // 알림을 하나라도 만드는 순간 오탐이 났다.
    const code = src
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    const marks: Array<{ key: string; idx: number }> = []
    for (const m of code.matchAll(/key === '([a-z_]+)'/g)) {
      marks.push({ key: m[1], idx: m.index ?? 0 })
    }
    for (let i = 0; i < marks.length; i++) {
      const body = code.slice(marks[i].idx, i + 1 < marks.length ? marks[i + 1].idx : code.length)
      if (/permit/i.test(body)) found.add(marks[i].key)
    }
  }
  const out: Problem[] = []
  for (const dest of found) {
    if (!appSet.has(dest)) continue
    if (dest in IMPORT_PERMIT_NOTIFY_OK) continue
    // 알림/푸시 코드에 있는데 등록 안 된 앱 목적지 — 단, import-permit 카드가 있는 나라만
    // (사전신고 등 다른 문맥의 key 비교는 importPermit 프로파일이 없어 제외).
    if (!DESTINATION_OVERRIDES[dest]?.importPermit) continue
    out.push({ dest, stepId: '(reminders/milestone-pushes)', ruleId: `${dest}`, kind: 'notify-unregistered' })
  }
  return out
}

/**
 * 9단계 — 날짜 입력칸이 있는 모든 카드는 **저장 차단 결정이 명시돼 있어야** 한다.
 *
 * 왜 필요한가(2026-07-26): 기존 단계들은 사고가 났던 특정 유형(광견병 대기 짝·티터 대기·
 * 기생충 창·검증 0개 카드)만 지킨다. "주의 룰은 있는데 그 조건 중 논리 불가능/마감 부분이
 * 저장 거부로 안 걸린" 일반 사례는 어디에도 안 걸렸다 — 하와이 입국 신청이 그랬다(도착일
 * 이후 신청일도 그냥 저장). 차단이냐 주의만이냐는 규정 성격 판단이라 기계가 자동으로 정할
 * 수 없으므로, **판단을 안 내리고 조용히 넘어가는 것**을 막는다: 날짜(단일·목록) 입력칸이
 * 있는 카드는 아래 명단에 '차단: <어느 함수/경로가>' 또는 '주의만: <근거>' 중 하나로
 * 등록돼야 통과한다. 새 카드를 만들면 lint 가 실패해 결정을 강제한다.
 *
 * ⚠️ '주의만:' 으로 등록해 통과시키기 전에 반드시 물을 것 — "이 날짜 조합은 현실에서
 *   실제로 벌어질 수 있는 사실인가?" 불가능(순서 역전 등)이면 차단을 만들고 '차단:'으로.
 */
const DATE_SAVE_BLOCK_DECISIONS: Record<string, string> = {
  'australia:au-identity-check':
    '차단: validateAuIdentityCheckDate(인증일 ≤ 항체 채혈일 — 같은 날 허용)',
  // ── 기본 정보·의료 기록 (step-detail-view getSaveBlockError 분기) ──────────
  microchip: '차단: 출생일 이전 시술일·15자리 형식 거부(isMicrochip 인라인)',
  'rabies-vaccine-1':
    '차단: validateRabiesPrimeAge(최소 연령)·validateMicrochipBeforeBooster(칩 선행)·findRabiesChainBreak(단일카드 목록)·1년 백신 한정',
  'rabies-vaccine-2':
    '차단: validateRabiesInterval(간격)·findRabiesChainBreak(유효기간 내)·validateMicrochipBeforeBooster',
  'rabies-titer':
    '차단: validateTiterDate·validateTiterAfterBooster(입국 요건국 순서)·validateEuTiterAfterVaccine(접종 후 대기)',
  'general-vaccine':
    '차단: 출생일 이전 거부·validateMicrochipBeforeBooster(칩 선행국)·findRabiesChainBreak(추가 접종 chain)',
  // 켄넬코프 — 종합백신과 같은 기계를 필드키만 바꿔 쓴다(2026-07-27 카드 분리).
  'kennel-cough-vaccine':
    '차단: 출생일 이전 거부·findRabiesChainBreak(추가 접종 chain) — 종합백신과 같은 경로(getSaveBlockError 의 isVaccineArray 분기)',
  // 심장사상충 — 구충과 같은 기계를 필드키만 바꿔 쓴다(2026-07-27 카드 분리).
  'heartworm-test':
    '차단: validateParasiteDateForDestination(출국일 앵커 창 dispatch)·출생일 이전 거부 — 구충과 같은 경로(isParasite 분기)',
  'external-parasite': '차단: validateParasiteDateForDestination(출국일 앵커 창 dispatch)·출생일 이전 거부',
  'internal-parasite':
    '차단: validateParasiteDateForDestination + validatePhInternalParasiteWindow(필리핀 SPSIC 창)·출생일 이전 거부',
  'echinococcus-treatment': '차단: validateEchinococcusWindow(입국 1~5일 창)',
  // ── 일정·신청 ────────────────────────────────────────────────────────────
  'flight-purchase':
    '차단: validateEntryDateForDestination(목적지별 대기·마감 dispatch)·왕복 순서·싱가포르 예약일 연동',
  'advance-notification': '차단: validateAdvanceNotification(일본 입국 40일 전)',
  'import-permit': '차단: validateImportPermitFiledDate(목적지별 dispatch — 출국 후·유효기간·백신 간격 등)',
  'ie-advance-notice': '차단: validateIeAdvanceNoticeDate(입국 24시간 전)',
  'no-advance-notice': '차단: validateNoAdvanceNoticeDate(입국 48시간 전)',
  'cy-advance-notice': '차단: validateCyAdvanceNoticeDate(입국 48시간 전)',
  'mt-advance-notice': '차단: validateMtAdvanceNoticeDate(입국 3영업일 전)',
  'il-advance-notice': '차단: validateIlAdvanceNoticeDate(출국 2일 전)',
  // 홍콩은 24시간 판정이 아일랜드와 같아 같은 함수를 쓴다(목적지 중립 메시지).
  'hk-advance-notice': '차단: validateIeAdvanceNoticeDate(도착 24시간 전 — 입국일 없으면 출국일 폴백)',
  'hi-import-declaration': '차단: validateHiImportDeclarationDate(도착 이후·도착 10일 미만 모두)',
  'sg-quarantine-reservation':
    '차단: validateSgQuarantineReservationFiled(채혈 이후)·validateSgQuarantineReservationDate(채혈+90일~12개월)·validateSgReservationVsDeparture',
  'sg-dog-licence':
    '주의만: 절차 완료일 추적용 — 날짜 자체 제약 없음. 라이선스↔수입허가 순서는 수입허가 쪽 차단(validateSgImportPermitAfterDogLicence)·주의(sg.dog-licence-before-import-permit)가 담당',
  'au-quarantine-reservation':
    '차단: validateAuQuarantineReservationDate(항체 검체 도착 + 180일 이후) — 짝 주의는 au.quarantine-reservation-min-180days',
  'sg-gst-permit': '차단: validateSgGstPermitDate(도착 전 + 도착 14일 이내)',
  'sg-border-inspection': '차단: validateSgBorderInspectionDate(도착 최소 5일 전)',
  // 독감(CIV)·전염병 검사 — 호주 전용 카드(둘 다 강아지 요건).
  //   둘 다 '출국까지 N일' 요건이라 **날짜를 고쳐 회복할 수 있는** 위반이고, 실제로 그렇게
  //   받아 온 기록을 그대로 적어야 하는 자리다(늦게 맞았으면 늦게 맞았다고 적고 재접종·재검사로
  //   푼다). 저장을 막으면 사실을 못 적는다 — 그래서 주의만 둔다(입력 조건 원칙의 예외가 아니라,
  //   '논리적으로 불가능한 조합'이 아니기 때문).
  'civ-vaccine': '주의만: au.civ-14days-before-departure·au.civ-within-12months — 날짜 수정으로 회복 가능한 위반이라 기록을 막지 않는다',
  'infectious-disease-test':
    '주의만: au.infectious-disease-test-within-45days — 45일 창 밖 검사도 사실로 기록해야 하고, 재검사로 회복된다',
  // ── 검사·검역·증명서 (한국 측 공통) ──────────────────────────────────────
  'vet-visit': '차단: validateVetVisitDate(출국 전 윈도우)',
  'certificate-issue': '차단: validateKrExportDate',
  'kr-import-quarantine': '차단: validateKrImportDate(귀국일 이후)',
  // ── 도착 수입검역·현지 수출검역·귀국 서류 ────────────────────────────────
  departure: '차단: validateImportQuarantineDate(입국일 이후) — 일본은 validateJpImportDate',
  'jp-export-quarantine': '차단: validateJpExportReservationDate + 신청 10일 마감(인라인)',
}

function dateSaveBlockDecision(dest: string, stepId: string): string | undefined {
  return DATE_SAVE_BLOCK_DECISIONS[`${dest}:${stepId}`] ?? DATE_SAVE_BLOCK_DECISIONS[stepId]
}

function saveBlockDecisions(appDests: string[]): Problem[] {
  const missing = new Map<string, Set<string>>() // stepId → 걸린 목적지들
  for (const dest of appDests) {
    for (const step of JOURNEY_STEP_CATALOG) {
      if (!appliesToDest(step, dest)) continue
      const resolved = resolveStepForDestination(step, dest, null) as {
        inputs?: Array<{ key: string; type?: string }>
      }
      const hasDateInput = (resolved.inputs ?? []).some(
        (i) => i.type === 'date' || i.type === 'date_array',
      )
      if (!hasDateInput) continue
      // 버튼 완료 카드 — 날짜 입력칸이 없어 저장 차단 결정이 성립하지 않는다(2026-07-26).
      if (step.buttonComplete) continue
      const decision = dateSaveBlockDecision(dest, step.id)
      if (decision && /^(차단|주의만): /.test(decision)) continue
      if (!missing.has(step.id)) missing.set(step.id, new Set())
      missing.get(step.id)!.add(dest)
    }
  }
  return [...missing.entries()].map(([stepId, dests]) => ({
    dest: [...dests].join(','),
    stepId,
    ruleId: '—',
    kind: 'no-save-block-decision' as const,
  }))
}

function main(): void {
  const dests = Object.keys(DESTINATION_OVERRIDES)
  const appDests = dests.filter((d) => DESTINATION_OVERRIDES[d]?.appSupported)
  const adminDests = dests.filter((d) => !DESTINATION_OVERRIDES[d]?.appSupported)

  const blocking = [
    ...appDests.flatMap(collect),
    ...orphanRules(appDests),
    ...missingPairRules(appDests),
    ...ownCalcRules(appDests),
    ...titerWaitWithoutBlocker(appDests),
    ...waitRuleWithoutBlocker(appDests),
    ...parasiteWindowWithoutBlocker(appDests),
    ...saveBlockDecisions(appDests),
    ...deadDeclarations(appDests),
    ...importPermitNotifyLeaks(appDests),
  ]
  const backlog = adminDests.flatMap(collect)

  if (backlog.length > 0) {
    const byDest = new Set(backlog.map((p) => p.dest))
    console.log(
      `· 펫무브워크 전용 목적지 ${byDest.size}개에 끊긴 배선 ${backlog.length}건 (앱 미노출 — 경고만).`,
    )
    console.log(
      `  ${[...byDest].join(', ')}`,
    )
    console.log('  해당 국가를 앱에 올릴 때(appSupported: true) 반드시 먼저 메워야 합니다.\n')
  }

  if (waitBacklog.size > 0) {
    console.log(`· 대기 주의 룰에 저장 거부가 없는 곳 ${waitBacklog.size}건 — **사용자 확인 대기**(경고만).`)
    for (const [where, why] of waitBacklog) console.log(`  ${where}\n    ${why}`)
    console.log('  결정되면 프로파일에 선언하고 WAIT_BLOCKER_BACKLOG 에서 지우세요.\n')
  }

  if (knownDead.size > 0) {
    console.log(`· 프로파일 선언 ${knownDead.size}건은 아직 진실 출처가 아닙니다 (동작은 다른 곳에 있음).`)
    for (const [field, where] of knownDead) console.log(`  ${field}: ${where}`)
    console.log('  파생으로 교체하면 DEAD_DECLARATION_KNOWN 에서 지우세요.\n')
  }

  // ── dated 카드 저장 배선 ────────────────────────────────────────────────
  // 앱에 뜨는 목적지 × 그 목적지의 실효 `done: 'dated:<field>'` 카드가 전부 저장 맵
  // (DATED_STEP_FIELDS — portal updateSimpleDateField 의 신뢰 목록)에 있어야 한다.
  // 없으면 보호자가 날짜를 넣고 저장을 눌러도 "알 수 없는 절차 단계입니다." 로 죽는다
  // (2026-07-28 계류시설 예약 실제 사고). 맵이 파생이라 평시엔 자동으로 맞지만,
  // 파생 조건을 다시 좁히거나 목적지마다 필드가 갈리면 여기서 걸린다.
  const datedGaps: string[] = []
  for (const dest of appDests) {
    for (const step of JOURNEY_STEP_CATALOG) {
      if (!appliesToDest(step, dest)) continue
      const resolved = resolveStepForDestination(step, dest)
      const done = resolved.done
      if (typeof done !== 'string' || !done.startsWith('dated:')) continue
      const field = done.slice('dated:'.length)
      // 목적지별로 푼 값과 비교한다 — 같은 stepId 가 나라마다 다른 필드를 쓰는 카드가 있다
      //   ('departure' 도착 검역 = 호주·뉴질랜드·싱가포르 각각 다른 검역일 필드).
      const mapped = resolveDatedStepField(resolved.id, dest)
      if (mapped !== field) {
        datedGaps.push(`  [${dest}] ${resolved.id}: 카드는 ${field}, 저장 맵은 ${mapped ?? '(없음)'}`)
      }
    }
  }
  if (datedGaps.length > 0) {
    console.error('✗ dated 카드 저장 배선이 끊겼습니다 — 저장이 "알 수 없는 절차 단계입니다." 로 죽습니다.\n')
    console.error(datedGaps.join('\n'))
    console.error(
      '\n  고치는 법: packages/domain/src/journey-steps/dated-steps.ts 의 파생을 확인하세요.' +
        '\n  목적지마다 필드가 갈리는 카드가 정말 필요하면 맵을 목적지별로 쪼개야 합니다.',
    )
    process.exit(1)
  }

  if (blocking.length === 0) {
    console.log(`✓ validation-wiring lint: 앱 노출 목적지 ${appDests.length}개 배선 정상`)
    return
  }

  console.error('✗ validation-wiring lint: 앱 노출 목적지에 배선이 끊긴 카드가 있습니다.\n')
  for (const p of blocking) {
    console.error(`  [${p.dest}] ${p.stepId}`)
    console.error(`      ${p.kind === 'unvalidated' ? '' : p.ruleId + ' — '}${describe(p)}`)
  }
  console.error(
    '\n  고치는 법: procedure-checks/<국가>.ts 에 그 나라 룰을 만들고,' +
      '\n  카드의 validationIds 로 그 룰을 지목하세요.' +
      '\n  검증이 다른 카드에 있어 이 카드엔 없는 게 맞다면 UNVALIDATED_OK 에 이유와 함께 등록하세요.',
  )
  process.exit(1)
}

main()
