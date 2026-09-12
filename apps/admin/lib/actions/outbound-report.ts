'use server'

/**
 * 운송업체 안내의 노출·클릭 집계 — 슈퍼어드민 전용.
 *
 * 협상에서 쓰는 문장은 건수가 아니라 **비율**이다: "안내를 본 N명 중 M명이 연락을 눌렀다".
 * 그래서 건수와 함께 사람 수(distinct user)를 같이 센다. 앱 기록은 로그인 사용자에 한정된다
 * (펫무브워크 앱 미리보기가 노출을 부풀리지 않도록 portal 쪽에서 걸러낸다). 홈페이지는
 * 로그인 개념이 없어 사람 수가 없다 — 건수로만 읽는다.
 *
 * 집계 축은 **채널(앱·홈페이지) × 단계(유입 → 안내 페이지 → 업체 연락)**다. 두 채널은
 * 구조가 같다: 글·카드 안의 링크를 보고(노출) 누르면(클릭) 안내 페이지로 가고, 거기서
 * 업체에 연락한다. 예전엔 유입을 채널 구분 없이 한 표에 모아서, 홈페이지 글 슬러그가
 * '여정 카드' 표에 행으로 끼어들게 돼 있었다.
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

/** 유입 자리 한 줄 — 앱은 여정 카드 하나, 홈페이지는 글 하나. */
export interface OutboundEntryRow {
  key: string
  label: string
  impressions: number
  clicks: number
  users: number
}

/** 한 채널의 깔때기 — 유입(링크) → 안내 페이지 → 업체 연락. */
export interface OutboundChannel {
  key: 'app' | 'www'
  label: string
  /** 유입 자리의 이름 — '여정 카드' · '가이드 글'. */
  entryLabel: string
  entry: {
    impressions: number
    impressionUsers: number
    clicks: number
    clickUsers: number
    rows: OutboundEntryRow[]
  }
  page: {
    impressions: number
    impressionUsers: number
    clicks: number
    clickUsers: number
    partners: OutboundPartnerStat[]
  }
}

export interface OutboundReport {
  days: number
  since: string
  channels: OutboundChannel[]
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

/**
 * 채널 정의 — source 두 개가 한 깔때기를 이룬다.
 *
 * 여기 없는 source 는 통째로 버린다(2026-08-27 에 걷어낸 'journey-flight-step' 등 옛 자리).
 * 예전엔 버리면서도 여행지 항목만 0/0 으로 만들어 둬서, 실제로는 노출이 있었던 나라가
 * 맨 아랫줄에 '0/0' 유령으로 떴다.
 */
const CHANNELS: {
  key: 'app' | 'www'
  label: string
  entryLabel: string
  entrySource: string
  pageSource: string
}[] = [
  {
    key: 'app',
    label: '앱',
    entryLabel: '여정 카드',
    entrySource: 'journey-note',
    pageSource: 'app-guide',
  },
  {
    key: 'www',
    label: '홈페이지',
    entryLabel: '가이드 글',
    entrySource: 'www-article',
    pageSource: 'www-quote',
  },
]

/** 카드 id → 화면에 쓰는 이름. 목록에 없는 id(새 카드·글 슬러그)는 그대로 보여준다. */
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

    type EntryAcc = {
      impressions: number
      impressionUsers: Set<string>
      clicks: number
      clickUsers: Set<string>
      rows: Map<string, { impressions: number; clicks: number; users: Set<string> }>
    }
    type PageAcc = {
      impressions: number
      impressionUsers: Set<string>
      clicks: number
      clickUsers: Set<string>
      perPartner: Map<string, { tel: number; mail: number; web: number; users: Set<string> }>
    }
    const entries = new Map<string, EntryAcc>()
    const pages = new Map<string, PageAcc>()
    for (const c of CHANNELS) {
      entries.set(c.key, {
        impressions: 0,
        impressionUsers: new Set(),
        clicks: 0,
        clickUsers: new Set(),
        rows: new Map(),
      })
      pages.set(c.key, {
        impressions: 0,
        impressionUsers: new Set(),
        clicks: 0,
        clickUsers: new Set(),
        perPartner: new Map(),
      })
    }

    /**
     * 나라별 줄 — 깔때기의 **양 끝**만 센다: 링크 노출(맨 위)과 업체 연락(맨 아래).
     * 중간 단계(링크 클릭·페이지 노출)까지 더하면 같은 사람의 한 흐름이 여러 번 세어져
     * 나라별 비율이 실제보다 부풀어 보인다.
     */
    const perDest = new Map<string, { impressions: number; clicks: number }>()
    const bumpDest = (key: string | null, field: 'impressions' | 'clicks') => {
      const k = key ?? '(미지정)'
      const d = perDest.get(k) ?? { impressions: 0, clicks: 0 }
      d[field]++
      perDest.set(k, d)
    }

    for (const r of rows) {
      const channel = CHANNELS.find((c) => c.entrySource === r.source || c.pageSource === r.source)
      if (!channel) continue // 옛 자리 — 집계에 넣지 않는다.

      if (r.source === channel.entrySource) {
        const acc = entries.get(channel.key)!
        const key = r.step_id ?? '(미지정)'
        const row = acc.rows.get(key) ?? { impressions: 0, clicks: 0, users: new Set<string>() }
        if (r.event === 'impression') {
          acc.impressions++
          row.impressions++
          if (r.user_id) acc.impressionUsers.add(r.user_id)
          bumpDest(r.destination, 'impressions')
        } else {
          acc.clicks++
          row.clicks++
          if (r.user_id) {
            acc.clickUsers.add(r.user_id)
            row.users.add(r.user_id)
          }
        }
        acc.rows.set(key, row)
        continue
      }

      // 안내 페이지 — 노출과 업체별 연락. 업체 연락은 이 자리에만 있다.
      const acc = pages.get(channel.key)!
      if (r.event === 'impression') {
        acc.impressions++
        if (r.user_id) acc.impressionUsers.add(r.user_id)
      } else if (r.partner_slug) {
        acc.clicks++
        if (r.user_id) acc.clickUsers.add(r.user_id)
        const p = acc.perPartner.get(r.partner_slug) ?? {
          tel: 0,
          mail: 0,
          web: 0,
          users: new Set<string>(),
        }
        if (r.event === 'tel') p.tel++
        else if (r.event === 'mail') p.mail++
        else if (r.event === 'web') p.web++
        if (r.user_id) p.users.add(r.user_id)
        bumpDest(r.destination, 'clicks')
        acc.perPartner.set(r.partner_slug, p)
      }
    }

    const channels: OutboundChannel[] = CHANNELS.map((c) => {
      const e = entries.get(c.key)!
      const p = pages.get(c.key)!
      // 목록에 있는 업체는 0건이어도 행을 남긴다 — "아무도 안 눌렀다"도 결과다.
      const partners = TRANSPORT_PARTNERS.map((tp) => {
        const st = p.perPartner.get(tp.slug)
        return {
          slug: tp.slug,
          name: tp.name,
          tel: st?.tel ?? 0,
          mail: st?.mail ?? 0,
          web: st?.web ?? 0,
          users: st?.users.size ?? 0,
        }
      }).sort((a, b) => b.tel + b.mail + b.web - (a.tel + a.mail + a.web))

      return {
        key: c.key,
        label: c.label,
        entryLabel: c.entryLabel,
        entry: {
          impressions: e.impressions,
          impressionUsers: e.impressionUsers.size,
          clicks: e.clicks,
          clickUsers: e.clickUsers.size,
          rows: [...e.rows.entries()]
            .map(([key, v]) => ({
              key,
              label: STEP_LABELS[key] ?? key,
              impressions: v.impressions,
              clicks: v.clicks,
              users: v.users.size,
            }))
            .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions),
        },
        page: {
          impressions: p.impressions,
          impressionUsers: p.impressionUsers.size,
          clicks: p.clicks,
          clickUsers: p.clickUsers.size,
          partners,
        },
      }
    })

    const byDestination = [...perDest.entries()]
      .map(([destination, v]) => ({ destination, ...v }))
      .filter((d) => d.impressions > 0 || d.clicks > 0)
      .sort((a, b) => b.impressions - a.impressions)

    return { ok: true, value: { days: span, since, channels, byDestination } }
  } catch (e) {
    return { ok: false, error: reportActionError(e, 'outbound-report.getOutboundReport') }
  }
}
