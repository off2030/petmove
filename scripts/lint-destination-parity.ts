/**
 * 형제 목적지 **구조 패리티** 검사.
 *
 * 왜 필요한가(2026-07-29) — 새 목적지는 형제 목적지를 복사해 만든다. 그런데 원본에 **나중에**
 * 붙는 수정은 복사본으로 전파되지 않는다. 뉴질랜드가 그랬다: 7/27 에 호주 골격으로 만들었는데
 * 호주에 7/27~7/28 에 붙은 것들이 통째로 빠져 있었다.
 *
 *   · 계류시설 예약 완료 모델 dated → booked (예약을 마치면 완료. 계류 시작일이 미래여도)
 *   · RNATT 선언서 카드(호주) ↔ RCF 카드(뉴질랜드) — 수입 허가 신청의 필수 제출물
 *   · 계류 예약 날짜 입력 방식(버튼 완료 → 날짜 입력)
 *   · 마이크로칩 인증 ↔ 항체 채혈 순서 검증
 *
 * 전부 사용자가 화면을 보다 발견했다. 카드 주석에는 "베끼면 틀리는 자리"(=달라야 하는 곳)를
 * 적어 뒀지만, **같아야 하는데 빠진 곳**을 잡아주는 장치는 없었다.
 *
 * 이 검사는 **문구를 보지 않는다**(그건 lint:copy 담당). 구조만 본다:
 *   ① 한쪽에만 있는 카드
 *   ② 같은 카드의 완료 모델이 다른 경우(dated/booked/quarantine/버튼완료/그 외 시그널)
 *   ③ 같은 카드의 날짜 입력칸 개수가 다른 경우
 *   ④ 한쪽만 검증(validationIds)이 비어 있는 경우
 *
 * 다른 게 **정당한** 자리는 KNOWN_DIFFERENCES 에 이유와 함께 등록한다(등록 = 판단을 내렸다는
 * 기록). 등록되지 않은 차이가 하나라도 있으면 실패한다.
 */
import {
  JOURNEY_STEP_CATALOG,
  getStepsForCase,
  resolveStepForDestination,
  type CaseRow,
  type StepDefinition,
} from '../packages/domain/src/journey-steps'

/** 형제 쌍 — 같은 아키타입에서 복사해 만든 목적지. [키, 한글 토큰] */
const SIBLING_PAIRS: Array<{ a: [string, string]; b: [string, string]; why: string }> = [
  {
    a: ['australia', '호주'],
    b: ['new_zealand', '뉴질랜드'],
    why: 'sea-permit 아키타입 + 계류 + 입국 항체 + 마이크로칩 인증까지 절차 골격이 같다',
  },
]

/**
 * 이름이 다른 같은 절차 — 한쪽 카드 id → 다른 쪽 카드 id.
 * 서류 이름이 나라마다 달라 카드 id 도 다르다(RNATT Declaration ↔ Rabies Certification Form).
 */
const STEP_ALIASES: Record<string, string> = {
  'au-identity-check': 'nz-identity-check',
  'au-rnatt-declaration': 'nz-rcf',
  'au-quarantine-reservation': 'nz-quarantine-reservation',
}

/**
 * 정당한 차이 — `<a키>:<b키>:<카드>:<항목>` → 이유.
 * ⚠️ 등록하기 전에 물을 것: "이 차이가 **규정에서 나온 것**인가, 아니면 전파를 빠뜨린 것인가?"
 */
const KNOWN_DIFFERENCES: Record<string, string> = {
  'australia:new_zealand:import-permit:completion':
    '뉴질랜드는 신청일을 받지 않고 허가 번호·첨부·완료 버튼 셋 중 하나로 완료(2026-07-29 사용자 확정). 호주는 신청일 입력 유지',
  'australia:new_zealand:import-permit:dateInputs':
    '위와 같은 이유 — 뉴질랜드 카드에는 날짜 입력칸이 없다',
  'australia:new_zealand:rabies-titer:validations':
    '호주는 검체 접수일 기준 180일, 뉴질랜드는 채혈일 기준 3~12개월 — 룰 개수가 다르지만 둘 다 채워져 있다(개수 차이는 규정 차이)',
  'australia:new_zealand:lungworm-treatment:missing':
    '폐충(Angiostrongylus vasorum) 치료는 뉴질랜드 요건(IHS 2.4 — 신 IHS 2026 신설). DAFF 는 요구하지 않는다',
  'australia:new_zealand:external-parasite-2:missing':
    '외부구충 **회수 요건**은 뉴질랜드만 있다(IHS 2.2(2) "두 번", 강아지 한정). DAFF 7.6 은 "출국 30일 전 시작 + 제조사 지침대로 반복"이라 회수를 정하지 않아 2차 카드가 성립하지 않는다. 내부구충은 양쪽 다 2회라 두 나라에 2차 카드가 있다(2026-07-29 카드 분리)',
  'australia:new_zealand:heartworm-test:missing':
    '심장사상충 검사는 뉴질랜드 요건(IHS 2.11 — 생후 7개월 이상 ELISA). DAFF 는 요구하지 않는다',
  'australia:new_zealand:import-permit:validations':
    '호주 카드는 버튼 완료라 저장값이 신청일이 아니라 **허가 취득일**이다. 신청일 기반 검증을 의도적으로 뺐다(카드 주석의 ⛔). 뉴질랜드 룰은 펫무브워크가 넣은 신청일을 보는 용도로 남긴다',
  'australia:new_zealand:nz-identity-check:dateInputs':
    '뉴질랜드만 인증이 2회일 수 있다(IHS 1.11(4) — 채혈이 출국 3~6개월 전인 경우). 호주는 1회뿐이라 칸이 하나',
}

interface CardShape {
  id: string
  completion: string
  dateInputs: number
  hasValidations: boolean
}

function completionModel(step: StepDefinition): string {
  if (step.buttonComplete) return '버튼완료'
  const done = step.done
  if (typeof done !== 'string') return '기타'
  for (const p of ['dated:', 'booked:', 'quarantine:']) {
    if (done.startsWith(p)) return p.slice(0, -1)
  }
  return done
}

function shapesFor(key: string, token: string): Map<string, CardShape> {
  const caseRow = {
    id: 'parity',
    destination: token,
    departure_date: '2027-06-01',
    data: { species: 'dog' },
  } as unknown as CaseRow
  const out = new Map<string, CardShape>()
  for (const raw of getStepsForCase(JOURNEY_STEP_CATALOG, caseRow)) {
    const step = resolveStepForDestination(raw, key, token)
    out.set(step.id, {
      id: step.id,
      completion: completionModel(step),
      dateInputs: (step.inputs ?? []).filter((i) => i.type === 'date').length,
      hasValidations: (step.validationIds ?? []).length > 0,
    })
  }
  return out
}

function canonical(id: string): string {
  return STEP_ALIASES[id] ?? id
}

const problems: string[] = []
const ignored: string[] = []

for (const pair of SIBLING_PAIRS) {
  const [aKey, aToken] = pair.a
  const [bKey, bToken] = pair.b
  const a = shapesFor(aKey, aToken)
  const b = shapesFor(bKey, bToken)

  // 별칭을 적용한 정규 id 로 맞춘다.
  const aByCanon = new Map([...a.values()].map((s) => [canonical(s.id), s]))
  const bByCanon = new Map([...b.values()].map((s) => [canonical(s.id), s]))
  const allIds = [...new Set([...aByCanon.keys(), ...bByCanon.keys()])].sort()

  const note = (card: string, aspect: string, detail: string) => {
    const key = `${aKey}:${bKey}:${card}:${aspect}`
    const reason = KNOWN_DIFFERENCES[key]
    if (reason) ignored.push(`  · ${card} (${aspect}) — ${reason}`)
    else problems.push(`  [${card}] ${aspect}\n      ${detail}\n      등록 키: ${key}`)
  }

  for (const id of allIds) {
    const sa = aByCanon.get(id)
    const sb = bByCanon.get(id)
    if (!sa || !sb) {
      const has = sa ? aToken : bToken
      const missing = sa ? bToken : aToken
      note(id, 'missing', `${has} 에만 있는 카드 — ${missing} 에는 없다`)
      continue
    }
    if (sa.completion !== sb.completion) {
      note(id, 'completion', `완료 모델이 다르다 — ${aToken} ${sa.completion} / ${bToken} ${sb.completion}`)
    }
    if (sa.dateInputs !== sb.dateInputs) {
      note(id, 'dateInputs', `날짜 입력칸 개수가 다르다 — ${aToken} ${sa.dateInputs} / ${bToken} ${sb.dateInputs}`)
    }
    if (sa.hasValidations !== sb.hasValidations) {
      const empty = sa.hasValidations ? bToken : aToken
      note(id, 'validations', `한쪽만 검증이 비어 있다 — ${empty} 쪽이 0개`)
    }
  }
}

if (ignored.length > 0) {
  console.log(`\n· 정당한 차이로 등록된 항목 ${ignored.length}건:`)
  for (const line of ignored) console.log(line)
}

if (problems.length > 0) {
  console.error('\n✗ 형제 목적지 구조가 어긋납니다. 전파를 빠뜨린 것인지 확인하세요:\n')
  for (const p of problems) console.error(p)
  console.error(
    '\n  고치는 법: 한쪽에만 있는 수정이면 **양쪽에 반영**하세요.\n' +
      '  규정에서 나온 정당한 차이라면 KNOWN_DIFFERENCES 에 이유와 함께 등록하세요.\n',
  )
  process.exit(1)
}

console.log(`\n✓ destination-parity lint: 형제 쌍 ${SIBLING_PAIRS.length}개 구조 일치`)
