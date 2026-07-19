/**
 * 목적지 **동작(반응) 스냅샷** — 정해둔 케이스들을 실제로 태워서 나오는
 * 입력불가 · 주의 · 안내 · 알림을 그대로 기록한다.
 *
 * 왜 필요한가 (2026-07-19 사용자 지적):
 *   설명문은 화면에서 눈으로 확인된다. 그런데 **입력불가·주의·안내·알림은 눈에 안 보인다** —
 *   제대로 걸려 있는지 알려면 매번 사람이 물어보거나 데이터를 직접 넣어봐야 했다.
 *   기존 스냅샷들은 "어떤 룰이 존재하는가"(destinations)와 "문구가 무엇인가"(checks-copy)만
 *   담아서, "이 입력에 실제로 반응하는가"는 아무도 지키지 않았다. 실제로 대만·중국 검역
 *   카드가 일본 룰을 가리켜 검증이 통째로 죽어 있었고(2026-07-19 발견) 어떤 스냅샷도
 *   그 사실을 드러내지 못했다.
 *
 * 이 파일이 답하는 질문:
 *   "생후 89일에 접종하고 칩을 나중에 넣은 케이스를 넣으면, 나라별로 무엇이 뜨는가?"
 *
 * 시나리오를 추가하는 법: SCENARIOS 에 케이스를 하나 더 적고 `pnpm lint:behavior:write`.
 * 규정을 고칠 때 이 스냅샷이 **의도한 목적지에서만** 바뀌는지 확인하는 게 핵심 용도다.
 */
import { readFileSync, writeFileSync } from 'fs'
import { runChecksForCase } from '../packages/domain/src/procedure-checks/registry'
import { collectReminders } from '../apps/portal/lib/journey/reminders'
import { collectMilestonePushes } from '../apps/portal/lib/journey/milestone-pushes'
import { APP_SUPPORTED_DESTINATION_KEYS, DESTINATION_OVERRIDES } from '../packages/domain/src/destination-config'
import { JOURNEY_STEP_CATALOG } from '../packages/domain/src/journey-steps/catalog'
import { resolveStepForDestination } from '../packages/domain/src/journey-steps/destination-overrides'
import {
  validateMicrochipBeforeBooster,
  validateRabiesPrimeAge,
} from '../packages/domain/src/journey-steps/date-rules'

/**
 * 입력불가(저장 거부) 층 — 화면에서 '저장'을 눌렀을 때 거부되는지.
 *
 * 주의·알림과 달리 이건 **저장 자체를 막는** 층이라 잘못 걸리면 사용자가 우회할 수 없다.
 * 그런데도 눈에 안 보여서 지금까지 스냅샷이 없었다(대만 titer 5개월 오차단, 베트남 89일
 * 오차단이 모두 이 층에서 났고 사람이 우연히 발견했다).
 *
 * 광견병 1차 카드가 선언한 earliest(일수 또는 달력 개월)를 그대로 태워 결과만 기록한다 —
 * 판정 로직을 복제하지 않는다(복제하면 진짜 동작과 어긋난다).
 */
function inputBlocks(destKey: string, data: Record<string, unknown>): string[] {
  const out: string[] = []
  const base = JOURNEY_STEP_CATALOG.find((s) => s.id === 'rabies-vaccine-1')
  if (!base) return out
  const step = resolveStepForDestination(base, destKey, null)
  const birth = typeof data.birth_date === 'string' ? data.birth_date : ''
  const chip =
    typeof data.microchip_implant_date === 'string' ? data.microchip_implant_date : ''
  const rabies = Array.isArray(data.rabies_dates)
    ? (data.rabies_dates as Array<{ date?: string }>)
    : []
  const first = rabies[0]?.date ?? ''
  if (!first) return out

  const e = step.earliest
  if (e?.anchor === 'birth') {
    const msg = validateRabiesPrimeAge(birth, first, e.daysAfter, e.monthsAfter)
    if (msg) out.push(`광견병 1차 최소 일령: ${msg}`)
  }
  const chipMsg = validateMicrochipBeforeBooster(chip, first)
  if (chipMsg) out.push(`마이크로칩 선행: ${chipMsg}`)
  return out
}

const GOLDEN = 'scripts/behavior.snapshot.txt'
/** 고정 기준 시각 — 알림은 '지금'에 따라 개수가 달라지므로 반드시 고정한다. */
const NOW = new Date('2026-01-01T00:00:00Z')

interface Scenario {
  name: string
  /** 왜 이 케이스인지 — 스냅샷에 함께 남는다. */
  why: string
  data: Record<string, unknown>
  departure?: string
}

const SCENARIOS: Scenario[] = [
  {
    name: '정상 준비',
    why: '문제 없는 케이스 — 여기서 경고가 뜨면 과잉 차단이다',
    departure: '2026-09-01',
    data: {
      birth_date: '2025-01-01',
      microchip_implant_date: '2026-01-10',
      rabies_dates: [{ date: '2026-02-01' }, { date: '2026-03-05' }],
      rabies_titer_records: [{ date: '2026-03-20', result: '1.2' }],
      entry_date: '2026-09-01',
      return_date: '2026-09-20',
    },
  },
  {
    name: '어린 나이 접종',
    why: '생후 89일 접종 — 달력 3개월은 충족(2월생). 일수 기준 나라만 걸려야 한다',
    departure: '2026-09-01',
    data: {
      birth_date: '2026-02-01',
      microchip_implant_date: '2026-04-01',
      rabies_dates: [{ date: '2026-05-01' }],
      entry_date: '2026-09-01',
    },
  },
  {
    name: '칩이 접종보다 늦음',
    why: '마이크로칩 선행 규정 위반 — 대부분 목적지가 잡아야 한다',
    departure: '2026-09-01',
    data: {
      birth_date: '2025-01-01',
      microchip_implant_date: '2026-05-10',
      rabies_dates: [{ date: '2026-05-01' }],
      entry_date: '2026-09-01',
    },
  },
  {
    name: '항체 검사가 2차 접종보다 빠름',
    why: '2회 접종국(일본·중국)만 걸려야 하고, 메시지가 "2차 접종 후"라고 명시해야 한다',
    departure: '2026-12-01',
    data: {
      birth_date: '2025-01-01',
      microchip_implant_date: '2026-01-01',
      rabies_dates: [{ date: '2026-02-01' }, { date: '2026-03-10' }],
      rabies_titer_records: [{ date: '2026-02-15', result: '1.2' }],
      entry_date: '2026-12-01',
      return_date: '2026-12-20',
    },
  },
  // ── '나중에 어긋나는' 유형 ──────────────────────────────────────────────
  // 입력불가는 **저장하는 순간**만 본다. 앞 단계를 나중에 고쳐서 뒤가 어긋나는 경로는 못 잡고
  // 주의만 뜬다(date-rules 헤더에 명시된 설계). 실무에서 흔한데 시나리오가 없었다
  // (2026-07-19 사용자 지시로 추가). 여기서 '입력불가 0건 + 주의 N건'이 나오는 게 정상이다.
  {
    name: '출국일을 미뤄 백신 유효기간이 만료됨',
    why: '접종 입력 시점엔 정상이었는데 출국일을 뒤로 옮겨 도착일에 만료 — 입력불가는 못 잡고 주의만 떠야 한다',
    departure: '2026-12-01',
    data: {
      birth_date: '2024-01-01',
      // 칩 → 접종 순서는 정상. 만료만 남기려고 칩을 접종보다 앞에 둔다.
      microchip_implant_date: '2025-05-01',
      // 2025-06-01 접종, 유효기간 2026-06-01 — 도착(12-01)엔 이미 만료.
      // 2회 접종국도 만료만 보이도록 2차까지 넣는다(2차 누락 경고와 섞이지 않게).
      rabies_dates: [
        { date: '2025-06-01', valid_until: '2026-06-01' },
        { date: '2025-07-05', valid_until: '2026-07-05' },
      ],
      rabies_titer_records: [{ date: '2025-08-01', result: '1.2' }],
      entry_date: '2026-12-01',
      return_date: '2026-12-20',
    },
  },
  {
    name: '2차 접종을 뒤로 옮겨 채혈이 역전됨',
    why: '채혈 입력 땐 2차보다 늦었는데 2차를 나중으로 수정해 순서가 뒤집힘 — 입력불가가 이미 지나간 상태',
    departure: '2026-12-01',
    data: {
      birth_date: '2025-01-01',
      microchip_implant_date: '2026-01-01',
      // 채혈(03-20) 후에 2차를 04-15 로 옮긴 상황.
      rabies_dates: [{ date: '2026-02-01' }, { date: '2026-04-15' }],
      rabies_titer_records: [{ date: '2026-03-20', result: '1.2' }],
      entry_date: '2026-12-01',
      return_date: '2026-12-20',
    },
  },
  {
    name: '검역일이 도착보다 빠름',
    why: '물리적으로 불가능한 날짜 — 각 나라 수입검역 룰이 잡아야 한다',
    departure: '2026-09-01',
    data: {
      birth_date: '2025-01-01',
      microchip_implant_date: '2026-01-10',
      rabies_dates: [{ date: '2026-02-01' }],
      entry_date: '2026-09-01',
      return_date: '2026-09-20',
      jp_import_quarantine_date: '2026-08-20',
      cn_import_quarantine_date: '2026-08-20',
      tw_import_quarantine_date: '2026-08-20',
      vn_import_quarantine_date: '2026-08-20',
      th_import_quarantine_date: '2026-08-20',
      ph_import_quarantine_date: '2026-08-20',
    },
  },
]

function koLabel(destKey: string): string {
  return DESTINATION_OVERRIDES[destKey]?.keywords[0] ?? destKey
}

function build(): string {
  const out: string[] = [
    '# 목적지 동작(반응) 스냅샷 — scripts/lint-behavior.ts 로 자동 생성.',
    '#',
    '# 정해둔 케이스를 실제로 태워서 나오는 주의·알림·푸시를 기록한다.',
    '# 문구(journey-copy)·구조(destinations) 스냅샷이 못 잡는 "실제 반응"을 지킨다.',
    `# 기준 시각 ${NOW.toISOString().slice(0, 10)} 고정 — 알림 개수가 '지금'에 안 흔들리게.`,
    '#',
    '# 손으로 고치지 마세요. `pnpm lint:behavior:write` 로 재생성합니다.',
    '',
  ]

  for (const sc of SCENARIOS) {
    out.push('═'.repeat(76))
    out.push(`[시나리오] ${sc.name}`)
    out.push(`  ${sc.why}`)
    out.push('═'.repeat(76))

    for (const destKey of APP_SUPPORTED_DESTINATION_KEYS) {
      const token = koLabel(destKey)
      const caseRow = {
        id: 'snapshot',
        pet_name: '테스트',
        destination: token,
        trip_type: 'round',
        departure_date: sc.departure ?? null,
        data: sc.data,
      } as never

      // 메시지까지 기록한다 — 룰 id 만 담으면 "같은 룰이 다른 문구를 낸다"를 못 잡는다.
      // 실제로 msgTiterBeforeVaccine 을 2회 접종국용으로 바꿨을 때 id 는 그대로라 스냅샷이
      // 조용히 통과했다(2026-07-19). 고객이 읽는 건 id 가 아니라 이 문장이다.
      const failed = runChecksForCase(destKey, { caseRow, destination: token } as never)
        .filter((r) => (r.result as { ok?: boolean })?.ok === false)
        .map((r) => {
          const msg = (r.result as { message?: string })?.message ?? ''
          return `${r.check.id} [${r.check.severity}]\n         ${msg.replace(/\s+/g, ' ')}`
        })
        .sort()

      let reminders: string[] = []
      let pushes: string[] = []
      try {
        reminders = collectReminders([caseRow], NOW)
          .map((r) => r.body.replace(/\s+/g, ' ').slice(0, 44))
          .sort()
        pushes = collectMilestonePushes(caseRow)
          .map((p) => p.key.split('|').slice(1).join('|'))
          .sort()
      } catch {
        reminders = ['(수집 실패)']
      }

      const blocks = inputBlocks(destKey, sc.data)

      out.push('')
      out.push(`▸ ${destKey} (${token})`)
      out.push(`   입력불가 ${blocks.length}건`)
      for (const b of blocks) out.push(`     ✕ ${b}`)
      out.push(`   주의·차단 ${failed.length}건`)
      for (const f of failed) out.push(`     - ${f}`)
      out.push(`   알림 ${reminders.length}건`)
      for (const r of [...new Set(reminders)]) out.push(`     · ${r}`)
      if (pushes.length) out.push(`   푸시: ${pushes.join(', ')}`)
    }
    out.push('')
  }
  return out.join('\n').replace(/\s+$/, '') + '\n'
}

const snapshot = build()
if (process.argv.includes('--write')) {
  writeFileSync(GOLDEN, snapshot, 'utf-8')
  console.log(`✓ behavior 스냅샷 재생성: ${GOLDEN}`)
  console.log('  git diff 로 어떤 목적지의 반응이 바뀌었는지 확인한 뒤 함께 커밋하세요.')
} else {
  let prev = ''
  try {
    prev = readFileSync(GOLDEN, 'utf-8')
  } catch {
    console.error(`✗ 골든 파일이 없습니다. \`pnpm lint:behavior:write\` 로 먼저 생성하세요.`)
    process.exit(1)
  }
  if (prev === snapshot) {
    console.log('✓ behavior lint: 목적지 반응이 골든 스냅샷과 일치')
  } else {
    console.error('✗ behavior lint: 목적지 반응이 바뀌었습니다.\n')
    const a = prev.split('\n')
    const b = snapshot.split('\n')
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) {
        if (a[i] !== undefined) console.error(`  - ${a[i]}`)
        if (b[i] !== undefined) console.error(`  + ${b[i]}`)
      }
    }
    console.error('\n  의도한 변경이면 `pnpm lint:behavior:write` 로 갱신해 함께 커밋하세요.')
    process.exit(1)
  }
}
