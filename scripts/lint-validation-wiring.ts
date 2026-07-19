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

type Problem = { dest: string; stepId: string; ruleId: string; kind: 'missing' | 'cross-country' }

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
    const resolved = resolveStepForDestination(step, dest, null) as { validationIds?: string[] }
    for (const ruleId of resolved.validationIds ?? []) {
      const rule = RULES.get(ruleId)
      if (!rule) out.push({ dest, stepId: step.id, ruleId, kind: 'missing' })
      else if (!checkCountryKeys(rule.country as never).includes(dest))
        out.push({ dest, stepId: step.id, ruleId, kind: 'cross-country' })
    }
  }
  return out
}

function describe(p: Problem): string {
  return p.kind === 'missing'
    ? '존재하지 않는 룰'
    : `이 목적지에 적용되지 않는 룰 → ${p.dest} 케이스에선 검증이 실행되지 않음`
}

function main(): void {
  const dests = Object.keys(DESTINATION_OVERRIDES)
  const appDests = dests.filter((d) => DESTINATION_OVERRIDES[d]?.appSupported)
  const adminDests = dests.filter((d) => !DESTINATION_OVERRIDES[d]?.appSupported)

  const blocking = appDests.flatMap(collect)
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
    console.error(`      ${p.ruleId} — ${describe(p)}`)
  }
  console.error(
    '\n  고치는 법: procedure-checks/<국가>.ts 에 그 나라 룰을 만들고,' +
      '\n  destination-overrides 의 해당 카드 validationIds 를 그 룰로 교체하세요.',
  )
  process.exit(1)
}

main()
