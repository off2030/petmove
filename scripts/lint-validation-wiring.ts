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
import { JOURNEY_STEP_CATALOG } from '../packages/domain/src/journey-steps/catalog'
import { resolveStepForDestination } from '../packages/domain/src/journey-steps/destination-overrides'
import { ALL_PROCEDURE_CHECKS, checkCountryKeys } from '../packages/domain/src/procedure-checks/registry'
import { DESTINATION_OVERRIDES } from '../packages/domain/src/destination-config'

type Problem = {
  dest: string
  stepId: string
  ruleId: string
  kind: 'missing' | 'cross-country' | 'unvalidated' | 'orphan-rule'
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
  // 견종 제한 — 동물 자체의 속성이라 단계가 없다.
  'cn.banned-breeds': '동물 속성 — 특정 단계 없음',
  'vn.banned-breeds': '동물 속성 — 특정 단계 없음',
  'th.banned-breeds': '동물 속성 — 특정 단계 없음',
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
}

const RULES = new Map(
  (ALL_PROCEDURE_CHECKS as Array<{ id: string; country: unknown }>).map((r) => [r.id, r]),
)

/** 그 목적지에 이 카드가 뜨는가 — destinations + excludeDestinations 만 본다(종·트립 무관). */
function appliesToDest(step: (typeof JOURNEY_STEP_CATALOG)[number], dest: string): boolean {
  const { destinations, excludeDestinations } = step.applicability
  if (excludeDestinations?.includes(dest)) return false
  return destinations === 'all' || destinations.includes(dest)
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
    if (dateInputs.length > 0 && ids.length === 0 && !(step.id in UNVALIDATED_OK)) {
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

function describe(p: Problem): string {
  if (p.kind === 'missing') return '존재하지 않는 룰'
  if (p.kind === 'unvalidated')
    return `날짜칸(${p.ruleId})을 받는데 검증이 하나도 없음 — 말이 안 되는 날짜가 그냥 저장됨`
  if (p.kind === 'orphan-rule')
    return `${p.ruleId} — 어느 카드도 지목하지 않음. 경고가 카드 배지 대신 상단으로 샌다`
  return `이 목적지에 적용되지 않는 룰 → ${p.dest} 케이스에선 검증이 실행되지 않음`
}

function main(): void {
  const dests = Object.keys(DESTINATION_OVERRIDES)
  const appDests = dests.filter((d) => DESTINATION_OVERRIDES[d]?.appSupported)
  const adminDests = dests.filter((d) => !DESTINATION_OVERRIDES[d]?.appSupported)

  const blocking = [...appDests.flatMap(collect), ...orphanRules(appDests)]
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
