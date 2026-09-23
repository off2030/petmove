/**
 * 별지25호 계열 "기타 예방접종 및 기생충 처치내역" 슬롯 압축 규칙.
 *
 * pdf-fill 에서 분리한 순수 함수 — PDF·DB·카탈로그를 모르고 배열만 다룬다
 * (그래서 단독으로 검증 가능: `scripts/check-parasiticide-merge.ts`).
 */

/** 슬롯 한 줄. pdf-fill 의 OtherVacEntry 중 병합 판단에 필요한 필드만. */
export interface SlotEntry {
  type: 'Vaccination' | 'Parasiticide'
  name: string
  manufacturer: string
  serial: string
  expiry: string
  date: string
}

/** 같은 약품인가 — 이름·제조사·배치·유효기간이 모두 같아야 한 칸에 합칠 수 있다. */
function sameParasiticideProduct(a: SlotEntry, b: SlotEntry): boolean {
  return (
    a.type === 'Parasiticide' &&
    b.type === 'Parasiticide' &&
    a.name.trim() === b.name.trim() &&
    a.manufacturer.trim() === b.manufacturer.trim() &&
    a.serial.trim() === b.serial.trim() &&
    a.expiry.trim() === b.expiry.trim()
  )
}

/**
 * 칸이 모자랄 때 **같은 구충제 반복 투약**을 한 줄로 합친다 (날짜 칸에 병기).
 *
 * WHY: 별지25 EX 의 "기타 예방접종 및 기생충 처치내역" 은 8칸인데
 *      종합백신 2 + 독감 3 + 켄넬코프 1 + 외부구충 2 + 내부구충 2 = 10줄이면
 *      뒤 2줄(내부구충)이 조용히 잘려 실제 처치가 증명서에서 빠진다.
 *      같은 약을 두 번 쓴 것이라 제품·제조사·배치가 동일하므로, 한 줄에 날짜만
 *      "2026/09/06, 2026/10/05" 로 병기하면 정보 손실 없이 두 칸을 아낀다
 *      (수의사가 손으로 쓸 때도 같은 방식).
 *
 * 규칙:
 *  - 구충(Parasiticide) 만 대상. 백신은 배치·면역유효기간이 회차마다 달라 합치지 않는다.
 *  - 이름·제조사·배치·유효기간이 모두 같은 **연속된** 항목만 (외부끼리·내부끼리 붙어 있다).
 *  - 슬롯에 들어가는 순간 멈춘다 — 칸이 충분하면 종전과 똑같이 한 줄에 한 회차.
 *  - 다 합쳐도 넘치면 종전처럼 뒤가 잘린다 (가능한 만큼만 구제).
 */
export function mergeParasiticideDoses<T extends SlotEntry>(entries: T[], slotLimit: number): T[] {
  if (entries.length <= slotLimit) return entries
  const out = entries.slice()
  let i = 0
  while (out.length > slotLimit && i < out.length - 1) {
    const a = out[i]
    const b = out[i + 1]
    if (sameParasiticideProduct(a, b) && a.date && b.date && a.date !== b.date) {
      // 과거→최신 순으로 병기. 합친 자리에 그대로 두고 i 를 올리지 않아 3회차도 이어서 합쳐진다.
      out[i] = { ...a, date: `${a.date}, ${b.date}` }
      out.splice(i + 1, 1)
      continue
    }
    i++
  }
  return out
}
