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
import { DESTINATION_OVERRIDES } from '../packages/domain/src/destination-config'

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
  kind: 'missing' | 'cross-country' | 'unvalidated' | 'orphan-rule' | 'missing-pair' | 'own-calc'
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

function describe(p: Problem): string {
  if (p.kind === 'missing') return '존재하지 않는 룰'
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

function main(): void {
  const dests = Object.keys(DESTINATION_OVERRIDES)
  const appDests = dests.filter((d) => DESTINATION_OVERRIDES[d]?.appSupported)
  const adminDests = dests.filter((d) => !DESTINATION_OVERRIDES[d]?.appSupported)

  const blocking = [
    ...appDests.flatMap(collect),
    ...orphanRules(appDests),
    ...missingPairRules(appDests),
    ...ownCalcRules(appDests),
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
