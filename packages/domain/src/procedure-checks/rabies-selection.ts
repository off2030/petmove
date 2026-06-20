import type { CaseRow } from '../types'
import { getChecksForCountry } from './registry'

interface NormRec {
  date: string
  valid_until: string | null
}

/**
 * 모달 normalize(rabies-select-dialog) 와 **동일한 정렬 공간**으로 정규화:
 * date 오름차순, 동일자는 입력 순서 유지(Array.sort 안정성). 여기서 매기는 위치가
 * 곧 모달의 ascIndex 라서, 반환 인덱스를 recommendedIndices 로 그대로 넘길 수 있다.
 *
 * 주의: 서버 fillPdfCore 의 sortedAscRecords 는 동일자 tie 를 (desc 후 reverse 라서)
 * 역순으로 깬다 — 모달과 미세하게 다르나, 같은 날 광견병 2건은 사실상 없으므로
 * 모달 공간(입력순 tie)에 맞춘다.
 */
function normalizeAsc(rabiesDates: unknown): NormRec[] {
  if (!Array.isArray(rabiesDates)) return []
  const recs: NormRec[] = []
  for (const r of rabiesDates) {
    if (!r) continue
    if (typeof r === 'string') {
      recs.push({ date: r, valid_until: null })
    } else if (typeof r === 'object') {
      const rec = r as { date?: string; valid_until?: string | null }
      if (typeof rec.date === 'string' && rec.date) {
        recs.push({ date: rec.date, valid_until: typeof rec.valid_until === 'string' ? rec.valid_until : null })
      }
    }
  }
  return recs.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * 별지25/EX 의 광견병 dose 기본 선택을 **국가별 검증 규칙으로** 산출.
 *
 * "광견병 1회 접종 필수" 국가에서:
 *  - 기본은 가장 최근 접종 1건.
 *  - 최근 1건만으로 그 국가의 광견병 규칙(예: EU 항체검사 30일·SG 28일 anchor)을
 *    충족하지 못하면 — 최근 접종이 채혈 anchor 가 아니어서 titer 체크가 실패하는
 *    경우 — 직전 접종을 하나씩 더해, **추가 실패 없이 통과되는 최소 trailing window**
 *    를 찾는다.
 *
 * 임계값(30일/28일 …)을 새로 하드코딩하지 않고 getChecksForCountry 의 '광견병'
 * 체크를 그대로 실행한다. 판정 = "부분집합 K 의 실패 체크 ⊆ 전체(N)의 실패 체크"
 * 가 되는 가장 작은 K. 의미:
 *  - chain 이 끊겨(또는 anchor 누락) 직전 접종을 넣어도 통과가 안 되면 window 가
 *    안 늘어난다 → 최근 것만 (직전은 무의미).
 *  - 면역 유효기간이 이어지고 최근 것이 규정 충족 → K=1, 최근 1건만.
 *  - 이어지지만 최근 것이 규정 미달(최근 부스터가 채혈 후) → anchor 접종 닿을 때까지
 *    확장 → 2건 이상.
 *  - titer 가 없으면 모든 K 에서 결과 동일 → 최근 1건.
 *  - N=N 자체가 실패하는(케이스 미충족) 경우엔 그 실패가 K 에도 그대로라 ⊆ 성립 →
 *    최근 1건으로 수렴(선택 문제가 아니라 검증 경고로 별도 표면화).
 *
 * 반환: normalizeAsc(date 오름차순) 공간의 ascIndex 배열.
 *
 * @param caseRow other_hospital strip + destination flatten 이 끝난 케이스
 * @param country getChecksForCountry 용 정규화 키 (예: 'eu', 'singapore', 'thailand')
 * @param destination 체크 ctx 토큰(by_dest scoping). flatten 됐으면 null.
 */
export function recommendRabiesDoseIndices(
  caseRow: CaseRow,
  country: string,
  destination: string | null,
): number[] {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const asc = normalizeAsc(data.rabies_dates)
  const N = asc.length
  const allIdx = asc.map((_, i) => i)
  if (N <= 1) return allIdx

  const checks = getChecksForCountry(country).filter((c) => c.category === '광견병' && c.run)
  // 광견병 규칙이 없는 국가 — 비교 기준이 없으므로 최근 1건만.
  if (checks.length === 0) return [N - 1]

  const failingFor = (subset: NormRec[]): Set<string> => {
    const subCase: CaseRow = { ...caseRow, data: { ...data, rabies_dates: subset } }
    const fails = new Set<string>()
    for (const c of checks) {
      let ok = true
      try {
        ok = c.run!({ caseRow: subCase, destination }).ok
      } catch {
        ok = true // 실행 오류는 선택 판정에서 무시 (검증 탭이 따로 표면화)
      }
      if (!ok) fails.add(c.id)
    }
    return fails
  }

  const failingFull = failingFor(asc)
  for (let k = 1; k <= N; k++) {
    const subset = asc.slice(N - k)
    const f = failingFor(subset)
    let subseteq = true
    for (const id of f) {
      if (!failingFull.has(id)) {
        subseteq = false
        break
      }
    }
    if (subseteq) return Array.from({ length: k }, (_, i) => N - k + i)
  }
  return allIdx
}
