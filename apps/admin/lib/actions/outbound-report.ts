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
  /** 이 업체를 한 번이라도 누른 사람 수. */
  users: number
}

export interface OutboundReport {
  days: number
  since: string
  /** 안내 블록이 화면에 실제로 보인 횟수. */
  impressions: number
  /** 안내를 본 사람 수 — 클릭률의 분모. */
  impressionUsers: number
  /** 업체 상관없이 한 번이라도 연락을 누른 사람 수. */
  clickUsers: number
  partners: OutboundPartnerStat[]
  byDestination: { destination: string; impressions: number; clicks: number }[]
}

interface Row {
  event: string
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
      .select('event, partner_slug, destination, user_id')
      .gte('created_at', since)
      .limit(50_000)
    if (error) return { ok: false, error: error.message }

    const rows = (data ?? []) as Row[]

    const impressionUsers = new Set<string>()
    const clickUsers = new Set<string>()
    const perPartner = new Map<string, { tel: number; mail: number; users: Set<string> }>()
    const perDest = new Map<string, { impressions: number; clicks: number }>()
    let impressions = 0

    for (const r of rows) {
      const destKey = r.destination ?? '(미지정)'
      const dest = perDest.get(destKey) ?? { impressions: 0, clicks: 0 }

      if (r.event === 'impression') {
        impressions++
        dest.impressions++
        if (r.user_id) impressionUsers.add(r.user_id)
      } else if (r.partner_slug) {
        dest.clicks++
        if (r.user_id) clickUsers.add(r.user_id)
        const p = perPartner.get(r.partner_slug) ?? { tel: 0, mail: 0, users: new Set<string>() }
        if (r.event === 'tel') p.tel++
        else if (r.event === 'mail') p.mail++
        if (r.user_id) p.users.add(r.user_id)
        perPartner.set(r.partner_slug, p)
      }
      perDest.set(destKey, dest)
    }

    // 목록에 있는 업체는 0건이어도 행을 남긴다 — "아무도 안 눌렀다"도 결과다.
    const partners: OutboundPartnerStat[] = TRANSPORT_PARTNERS.map((p) => {
      const s = perPartner.get(p.slug)
      return { slug: p.slug, name: p.name, tel: s?.tel ?? 0, mail: s?.mail ?? 0, users: s?.users.size ?? 0 }
    }).sort((a, b) => b.tel + b.mail - (a.tel + a.mail))

    const byDestination = [...perDest.entries()]
      .map(([destination, v]) => ({ destination, ...v }))
      .sort((a, b) => b.impressions - a.impressions)

    return {
      ok: true,
      value: {
        days: span,
        since,
        impressions,
        impressionUsers: impressionUsers.size,
        clickUsers: clickUsers.size,
        partners,
        byDestination,
      },
    }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'outbound-report.getOutboundReport') }
  }
}
