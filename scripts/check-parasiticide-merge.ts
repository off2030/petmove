/**
 * 별지25 계열 "기타 예방접종" 슬롯 압축 규칙 검사 — 순수 데이터(PDF 열지 않음).
 *
 * 칸이 모자랄 때만, 같은 구충제 반복 투약만, 날짜 병기로 합쳐지는지 확인한다.
 * 실수하면 증명서에서 처치 기록이 조용히 빠지거나(잘림) 다른 약이 한 줄로 뭉쳐
 * 배치번호가 틀린 채 발급되므로, 경계 네 가지를 못 박아 둔다.
 */
import { mergeParasiticideDoses, type SlotEntry } from '../apps/admin/lib/pdf-other-slots'

const errors: string[] = []
const vac = (name: string, date: string): SlotEntry =>
  ({ type: 'Vaccination', name, manufacturer: 'M', serial: 'B1', expiry: '2027/01/01', date })
const par = (name: string, date: string, serial = 'P1'): SlotEntry =>
  ({ type: 'Parasiticide', name, manufacturer: 'M', serial, expiry: '2027/01/01', date })

function check(label: string, got: SlotEntry[], wantDates: string[]) {
  const dates = got.map((e) => e.date)
  if (dates.join(' | ') !== wantDates.join(' | ')) {
    errors.push(`${label}\n  기대: ${wantDates.join(' | ')}\n  실제: ${dates.join(' | ')}`)
  }
}

// ① 최미진/밤비(호주) 실제 구성 — 10줄을 8칸에. 구충 2회씩이 각각 한 줄로 합쳐져 딱 맞는다.
check(
  '① 10줄 → 8칸: 외부·내부 구충이 각각 한 줄로',
  mergeParasiticideDoses(
    [
      vac('종합', '2025/07/30'), vac('종합', '2026/06/27'),
      vac('CIV', '2025/07/30'), vac('CIV', '2025/08/13'), vac('CIV', '2026/06/27'),
      vac('켄넬코프', '2026/08/16'),
      par('외부구충', '2026/09/06'), par('외부구충', '2026/10/05'),
      par('내부구충', '2026/09/06', 'P2'), par('내부구충', '2026/10/05', 'P2'),
    ],
    8,
  ),
  [
    '2025/07/30', '2026/06/27',
    '2025/07/30', '2025/08/13', '2026/06/27',
    '2026/08/16',
    '2026/09/06, 2026/10/05',
    '2026/09/06, 2026/10/05',
  ],
)

// ② 칸이 남으면 건드리지 않는다 — 기존 증명서 모양 그대로.
check(
  '② 슬롯 여유: 합치지 않음',
  mergeParasiticideDoses([par('외부구충', '2026/09/06'), par('외부구충', '2026/10/05')], 8),
  ['2026/09/06', '2026/10/05'],
)

// ③ 다른 약(배치 다름)은 합치지 않는다 — 합치면 배치번호가 틀린 증명서가 된다.
check(
  '③ 다른 배치: 합치지 않음 (넘쳐도)',
  mergeParasiticideDoses(
    [par('외부구충', '2026/09/06', 'P1'), par('외부구충', '2026/10/05', 'P9'), par('내부구충', '2026/10/05', 'P2')],
    2,
  ),
  ['2026/09/06', '2026/10/05', '2026/10/05'],
)

// ④ 백신은 회차별 배치·면역유효기간이 달라 절대 합치지 않는다.
check(
  '④ 백신: 합치지 않음',
  mergeParasiticideDoses([vac('종합', '2025/07/30'), vac('종합', '2026/06/27')], 1),
  ['2025/07/30', '2026/06/27'],
)

// ⑤ 3회차도 한 줄로 이어 붙는다.
check(
  '⑤ 3회차 연속 병합',
  mergeParasiticideDoses(
    [par('외부구충', '2026/08/01'), par('외부구충', '2026/09/06'), par('외부구충', '2026/10/05')],
    1,
  ),
  ['2026/08/01, 2026/09/06, 2026/10/05'],
)

if (errors.length > 0) {
  console.error('별지25 슬롯 압축 규칙 위반:\n\n' + errors.join('\n\n'))
  process.exit(1)
}
console.log('별지25 슬롯 압축 규칙 OK (5 케이스)')
