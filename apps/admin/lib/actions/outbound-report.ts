'use server'

/**
 * 운송업체 안내(고객앱 여정 카드)의 노출·클릭 집계 — 슈퍼어드민 전용.
 *
 * 협상에서 쓰는 문장은 건수가 아니라 **비율**이다: "안내를 본 N명 중 M명이 연락을 눌렀다".
 * 그래서 건수와 함께 사람 수(distinct user)를 같이 센다. 기록은 로그인 사용자에 한정된다
 * (펫무브워크 앱 미리보기가 노출을 부풀리지 않도록 portal 쪽에서 걸러낸다).
 *
 * 행 수가 적어(실험 규모) 집계는 JS 에서 한다 — SQL 뷰를 따로 두지 않는다.
 */

import { reportActionError } from './_report-error'
import { getCurrentUser } from '@petmove/auth/server'
import { createAdminClient } from '@petmove/auth'
import { TRANSPORT_PARTNERS } from '@petmove/domain'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface OutboundPartnerStat {
  slug: string
  name: string
  tel: number
  mail: number
  /** 업체 사이트의 견적 문의 폼으로 나간 클릭. */
  web: number
  /** 이 업체를 한 번이라도 누른 사람 수. */
  users: number
}

/** 안내가 놓인 자리 하나의 성적 — 자리별로 반응이 달라 합치면 의미가 흐려진다. */
export interface OutboundPlaceStat {
  key: string
  label: string
  impressions: number
  impressionUsers: number
  clickUsers: number
  partners: OutboundPartnerStat[]
}

export interface OutboundReport {
  days: number
  since: string
  places: OutboundPlaceStat[]
  /** 여정 카드의 '운송업체 문의' 버튼 — 카드별 노출·클릭. */
  guideLinks: {
    stepId: string
    label: string
    impressions: number
    clicks: number
    users: number
  }[]
  byDestination: { destination: string; impressions: number; clicks: number }[]
}

interface Row {
  event: string
  source: string
  step_id: string | null
  partner_slug: string | null
  destination: string | null
  user_id: string | null
}

export async function getOutboundReport(days = 30): Promise<Result<OutboundReport>> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false, error: '인증이 필요합니다.' }

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.is_super_admin) return { ok: false, error: '슈퍼어드민 전용입니다.' }

    const span = Math.min(Math.max(Math.trunc(days) || 30, 1), 365)
    const since = new Date(Date.now() - span * 86_400_000).toISOString()

    const { data, error } = await admin
      .from('outbound_clicks')
      .select('event, source, step_id, partner_slug, destination, user_id')
      .gte('created_at', since)
      .limit(50_000)
    if (error) return { ok: false, error: error.message }

    const rows = (data ?? []) as Row[]

    // 자리(source)별로 나눠 센다 — 같은 안내라도 여정 카드와 안내 페이지는 맥락이 달라
    // 합치면 어느 쪽이 통했는지 알 수 없다.
    // 업체별 연락(전화·메일·문의)이 일어나는 자리는 안내 페이지 하나뿐이다 —
    // 여정 카드의 연락처 블록은 2026-08-27 에 걷어냈고, 여정에는 버튼만 남았다.
    const PLACES: { key: string; label: string }[] = [
      { key: 'app-guide', label: '운송업체 페이지 (앱)' },
      { key: 'www-quote', label: '운송업체 페이지 (홈페이지)' },
    ]

    type Acc = {
      impressions: number
      impressionUsers: Set<string>
      clickUsers: Set<string>
      perPartner: Map<string, { tel: number; mail: number; web: number; users: Set<string> }>
    }
    const mkAcc = (): Acc => ({
      impressions: 0,
      impressionUsers: new Set(),
      clickUsers: new Set(),
      perPartner: new Map(),
    })
    const byPlace = new Map<string, Acc>(PLACES.map((p) => [p.key, mkAcc()]))
    const perDest = new Map<string, { impressions: number; clicks: number }>()
    // 카드 id → 화면에 쓰는 이름. 목록에 없는 id 는 id 그대로 보여준다(새 카드를 놓쳐도
    // 숫자는 보이게).
    const STEP_LABELS: Record<string, string> = {
      'flight-purchase': '항공권 구매',
      'import-permit': '수입 허가 신청',
      'za-aia-permit': 'AIA 수입 허가 신청',
      'au-rnatt-declaration': 'RNATT 선언서 (호주)',
      'nz-rcf': '광견병 증명서 RCF (뉴질랜드)',
      'au-quarantine-reservation': '계류시설 예약 (호주)',
      'nz-quarantine-reservation': '계류시설 예약 (뉴질랜드)',
      'za-quarantine-reservation': '계류시설 예약 (남아공)',
    }
    const perStep = new Map<
      string,
      { impressions: number; clicks: number; users: Set<string> }
    >()
    const stepAcc = (k: string) =>
      perStep.get(k) ?? { impressions: 0, clicks: 0, users: new Set<string>() }

    for (const r of rows) {
      const destKey = r.destination ?? '(미지정)'
      const dest = perDest.get(destKey) ?? { impressions: 0, clicks: 0 }

      // 항공권 구매 카드의 한 줄 안내 → 업체를 지목하지 않는 내부 링크.
      // 안내 페이지로 들어온 링크 — 앱 여정 카드('journey-note')와 홈페이지 글('www-article').
      if (r.source === 'journey-note' || r.source === 'www-article') {
        const key = r.step_id ?? '(미지정)'
        const st = stepAcc(key)
        if (r.event === 'impression') {
          st.impressions++
          dest.impressions++
        } else {
          st.clicks++
          if (r.user_id) st.users.add(r.user_id)
          dest.clicks++
        }
        perStep.set(key, st)
        perDest.set(destKey, dest)
        continue
      }

      const acc = byPlace.get(r.source)
      if (!acc) {
        perDest.set(destKey, dest)
        continue
      }

      if (r.event === 'impression') {
        acc.impressions++
        dest.impressions++
        if (r.user_id) acc.impressionUsers.add(r.user_id)
      } else if (r.partner_slug) {
        dest.clicks++
        if (r.user_id) acc.clickUsers.add(r.user_id)
        const p =
          acc.perPartner.get(r.partner_slug) ??
          { tel: 0, mail: 0, web: 0, users: new Set<string>() }
        if (r.event === 'tel') p.tel++
        else if (r.event === 'mail') p.mail++
        else if (r.event === 'web') p.web++
        if (r.user_id) p.users.add(r.user_id)
        acc.perPartner.set(r.partner_slug, p)
      }
      perDest.set(destKey, dest)
    }

    const places: OutboundPlaceStat[] = PLACES.map(({ key, label }) => {
      const acc = byPlace.get(key) ?? mkAcc()
      // 목록에 있는 업체는 0건이어도 행을 남긴다 — "아무도 안 눌렀다"도 결과다.
      const partners = TRANSPORT_PARTNERS.map((p) => {
        const st = acc.perPartner.get(p.slug)
        return {
          slug: p.slug,
          name: p.name,
          tel: st?.tel ?? 0,
          mail: st?.mail ?? 0,
          web: st?.web ?? 0,
          users: st?.users.size ?? 0,
        }
      }).sort((a, b) => b.tel + b.mail + b.web - (a.tel + a.mail + a.web))
      return {
        key,
        label,
        impressions: acc.impressions,
        impressionUsers: acc.impressionUsers.size,
        clickUsers: acc.clickUsers.size,
        partners,
      }
    })

    const byDestination = [...perDest.entries()]
      .map(([destination, v]) => ({ destination, ...v }))
      .sort((a, b) => b.impressions - a.impressions)

    return {
      ok: true,
      value: {
        days: span,
        since,
        places,
        guideLinks: [...perStep.entries()]
          .map(([stepId, v]) => ({
            stepId,
            label: STEP_LABELS[stepId] ?? stepId,
            impressions: v.impressions,
            clicks: v.clicks,
            users: v.users.size,
          }))
          .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions),
        byDestination,
      },
    }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'outbound-report.getOutboundReport') }
  }
}
