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
import { resolveStepForDestination } from '../packages/domain/src/journey-steps/destination-overrides'
import { ALL_PROCEDURE_CHECKS, checkCountryKeys } from '../packages/domain/src/procedure-checks/registry'
import { DESTINATION_OVERRIDES, destinationKeysWhere } from '../packages/domain/src/destination-config'
import { EU_ENTRY_FAMILY } from '../packages/domain/src/journey-steps/date-rules'

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
  //   완료 추적용(강아지 라이센스·관부가세·국경검사 예약). 계류장 예약은 sg.quarantine-
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
    const dateInputs = (resolved.inputs ?? []).filter((i) => i.type === 'date')
    if (dateInputs.length > 0 && ids.length === 0 && !unvalidatedReason(dest, step.id)) {
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

function titerWaitWithoutBlocker(appDests: string[]): Problem[] {
  const out: Problem[] = []
  const blocked = new Set<string>([
    ...EU_ENTRY_FAMILY,
    ...destinationKeysWhere((o) => typeof o.titer?.entryWaitAfterTiter?.months === 'number'),
    // 일수 기반(싱가포르 90일) — validateEuEntryDate 의 TITER_ENTRY_WAIT_DAYS 로 하드 차단됨.
    //   대만(days:180)은 OWN_ENTRY_BLOCKER_DESTS(전용 함수)로 별도 커버.
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
    // 주석 줄은 제외하고 실제 코드의 `key === '<dest>'` 만 본다(주석에 남긴 제외 사유가
    // 오탐되지 않게). import-permit 문맥 밖의 key 비교(사전신고 등)도 있으나, 그것들은
    // 목적지가 명시 등록 대상이 아니라 아래 appSet 교집합에서 자연히 걸러진다.
    for (const line of src.split('\n')) {
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue
      for (const m of line.matchAll(/key === '([a-z_]+)'/g)) found.add(m[1])
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

  if (knownDead.size > 0) {
    console.log(`· 프로파일 선언 ${knownDead.size}건은 아직 진실 출처가 아닙니다 (동작은 다른 곳에 있음).`)
    for (const [field, where] of knownDead) console.log(`  ${field}: ${where}`)
    console.log('  파생으로 교체하면 DEAD_DECLARATION_KNOWN 에서 지우세요.\n')
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
