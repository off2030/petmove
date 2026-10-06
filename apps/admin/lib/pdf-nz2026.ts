/**
 * 뉴질랜드 신 IHS 2026 서식(NZ26 건강증명서 · NZ_ID 사전 ID 확인서) 전용 판단.
 *
 * pdf-fill.ts 의 변환(transform)·취소선(flagStrikes)이 여기서 값을 받는다. 서식 좌표는
 * scripts/nz2026-layout.py 가 원본 PDF 문구 위치에서 계산한다(data/pdf-templates/src/).
 *
 * ── 마이크로칩 인증(ID check) 경로 — IHS 1.11 ─────────────────────────────────
 *  · 6~12개월 경로: 항체 채혈이 출국 6~12개월 전 → 인증 1회(채혈 전 또는 같은 날).
 *  · 3~6개월 경로:  채혈이 출국 3~6개월 전 → 인증 2회(1차 = 출국 6개월 전, 2차 = 채혈 전).
 * 케이스에는 인증일 두 칸(id_date = 1차, id_date_2 = 2차)만 있고 경로 선택값이 없다.
 *  → 2차 인증일이 있으면 3~6개월 경로(두 번째 인증).
 *  → 그 밖에는 채혈일↔출국일 간격이 3~6개월로 확인될 때만 3~6개월 경로.
 *  → 나머지(간격이 6~12개월이거나, 채혈일·출국일·인증일이 아직 없는 경우)는 **6~12개월 경로가 기본**
 *    (2026-10-06 사용자 지시 — "기본적으로 첫번째 체크박스"). 인증 1회가 보통이고, 2회 경로는
 *    2차 인증일을 입력하는 순간 바뀐다.
 */
import { getDepartureDate, type CaseRow } from '@petmove/domain'

export type NzIdPath = '6to12' | '3to6'

export interface NzIdScan {
  path: NzIdPath
  /** 이번 서식이 몇 번째 인증인가 — 3~6개월 경로에서만 의미가 있다. */
  event: 1 | 2 | null
  /** 이번 인증일(YYYY-MM-DD). */
  date: string
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.slice(0, 10) : ''
}

/** 가장 최근 항체 채혈일. */
function latestTiterDate(data: Record<string, unknown>): string {
  const recs = Array.isArray(data.rabies_titer_records) ? data.rabies_titer_records : []
  const dates = recs
    .map((r) => (r && typeof r === 'object' ? str((r as { date?: unknown }).date) : ''))
    .filter(Boolean)
    .sort()
  return dates[dates.length - 1] ?? ''
}

/** a 에 n개월을 더한 날짜(YYYY-MM-DD). 말일 넘침은 그 달 말일로. */
function addMonths(date: string, n: number): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  const y = Number(m[1])
  const mo = Number(m[2]) - 1 + n
  const d = Number(m[3])
  const ty = y + Math.floor(mo / 12)
  const tm = ((mo % 12) + 12) % 12
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate()
  const dd = Math.min(d, last)
  return `${ty}-${String(tm + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

/** 채혈일 → 출국일 간격으로 경로. 3개월 미만·12개월 초과는 어느 경로도 아니다(규정 위반은 검증이 알린다). */
function pathByTiter(titer: string, departure: string): NzIdPath | null {
  if (!titer || !departure) return null
  if (addMonths(titer, 6) <= departure && departure <= addMonths(titer, 12)) return '6to12'
  if (addMonths(titer, 3) <= departure && departure < addMonths(titer, 6)) return '3to6'
  return null
}

export function readNzIdScan(caseRow: CaseRow, data: Record<string, unknown>): NzIdScan {
  const first = str(data.id_date)
  const second = str(data.id_date_2)
  if (second) return { path: '3to6', event: 2, date: second }
  const byTiter = pathByTiter(latestTiterDate(data), getDepartureDate(caseRow, null) ?? '')
  if (byTiter === '3to6') return { path: '3to6', event: 1, date: first }
  return { path: '6to12', event: null, date: first }
}

/**
 * `nzid:<key>` 변환.
 *  path_6to12 / path_3to6        — 경로 체크박스
 *  scan_first / scan_second      — 3~6개월 경로의 회차 체크박스
 *  path_6to12_date / path_3to6_date — 체크한 경로 문장의 '(date)' 칸 = 이번 인증일
 *  scan_date                      — 동물 표 'Date microchip scanned'
 *  cert_first_scan / cert_second_scan — NZ26 건강증명서 22a 의 1차·2차 인증일
 */
export function resolveNzIdTransform(key: string, caseRow: CaseRow, data: Record<string, unknown>): string | boolean {
  const scan = readNzIdScan(caseRow, data)
  switch (key) {
    case 'path_6to12': return scan.path === '6to12'
    case 'path_3to6': return scan.path === '3to6'
    case 'scan_first': return scan.path === '3to6' && scan.event === 1
    case 'scan_second': return scan.path === '3to6' && scan.event === 2
    case 'path_6to12_date': return scan.path === '6to12' ? scan.date : ''
    case 'path_3to6_date': return scan.path === '3to6' ? scan.date : ''
    case 'scan_date': return scan.date
    // NZ26 건강증명서 22a — 3~6개월 경로에서만 1차·2차 인증일(6~12개월 경로면 22a 가 지워진다).
    case 'cert_first_scan': return scan.path === '3to6' ? str(data.id_date) : ''
    case 'cert_second_scan': return scan.path === '3to6' ? str(data.id_date_2) : ''
    default: return ''
  }
}

/**
 * NZ26 건강증명서 "(*delete as appropriate)" 취소선 조건.
 *
 * 여러 마리를 한 장에 쓰면 **모든 동물에 해당할 때만** 종·성별 조건이 켜진다 — 개와 고양이가
 * 섞인 장에서 고양이 문장을 지우면 고양이 쪽 증명이 사라진다. 인증 경로·독감·외부구충 회차는
 * 증명서 본문이 한 벌(대표 동물 기준)이라 대표 케이스로 정한다(구 NZ 서식과 같은 방식).
 */
export function nz26StrikeFlags(cases: CaseRow[]): Set<string> {
  const flags = new Set<string>(['always'])
  if (cases.length === 0) return flags
  const datas = cases.map((c) => (c.data ?? {}) as Record<string, unknown>)
  const species = datas.map((d) => String(d.species ?? '').toLowerCase())
  const sexes = datas.map((d) => String(d.sex ?? '').toLowerCase())
  if (species.every((s) => s === 'dog')) flags.add('dog')
  if (species.every((s) => s === 'cat')) flags.add('cat')
  if (sexes.every((s) => s === 'male' || s === 'neutered_male')) flags.add('all_male')
  if (sexes.every((s) => s === 'neutered_male' || s === 'spayed_female')) flags.add('all_desexed')
  if (sexes.every((s) => s === 'male' || s === 'female')) flags.add('all_entire')

  const primary = cases[0]
  const pd = datas[0]
  const scan = readNzIdScan(primary, pd)
  if (scan.path === '6to12') flags.add('nzid1')
  if (scan.path === '3to6') flags.add('nzid2')
  const civ = Array.isArray(pd.civ_dates) ? pd.civ_dates : []
  if (civ.length > 0) flags.add('civ_vac')
  const ext = Array.isArray(pd.external_parasite_dates) ? pd.external_parasite_dates : []
  if (ext.length < 3) flags.add('ext_no_extra')
  return flags
}
