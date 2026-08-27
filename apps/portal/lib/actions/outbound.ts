'use server'

/**
 * 외부 업체 접점(현재는 운송업체 안내)의 노출·클릭 기록.
 *
 * best-effort — 실패해도 UI 는 그대로 진행한다(연락을 막을 이유가 없다). 그래서 Result 를
 * 돌려주지 않고 조용히 삼킨다. 기록 자체가 목적이라 예외로 사용자 흐름을 끊지 않는다.
 *
 * RLS: outbound_clicks 는 정책이 없는 service-role 전용 테이블이라 admin 클라이언트로 쓴다.
 * 입력은 전부 화이트리스트 검증 — 클라이언트가 임의 문자열을 못 넣게.
 */

import * as Sentry from '@sentry/nextjs'
import { getCurrentUser } from '@petmove/auth/server'
import { createAdminClient } from '@petmove/auth'
import { TRANSPORT_PARTNER_SLUGS } from '@petmove/domain'

const EVENTS = ['impression', 'tel', 'mail', 'web', 'guide_link'] as const
type OutboundEvent = (typeof EVENTS)[number]

// 'journey-note' = 여정 카드 본문에 붙는 한 줄 안내 링크. 어느 카드인지는 stepId 로 가른다
// (카드가 늘 때마다 source 를 늘리면 집계 축이 둘로 쪼개진다).
const SOURCES = ['journey-flight-step', 'app-guide', 'journey-note'] as const
export type OutboundSource = (typeof SOURCES)[number]

export interface LogOutboundInput {
  event: OutboundEvent
  source: OutboundSource
  /** 여정 카드 id — 어느 카드에서 눌렀는지. 카드 밖(안내 페이지)은 생략. */
  stepId?: string | null
  /** impression·guide_link 는 업체를 지목하지 않는다. 나머지 클릭은 업체 slug 필수. */
  partnerSlug?: string | null
  destination?: string | null
  caseId?: string | null
}

export async function logOutbound(input: LogOutboundInput): Promise<void> {
  try {
    if (!EVENTS.includes(input.event)) return
    if (!SOURCES.includes(input.source)) return

    // 테이블 제약과 같은 규칙 — 업체 없는 이벤트는 slug 를 비우고, 업체 클릭은 반드시 채운다.
    const partnerless = input.event === 'impression' || input.event === 'guide_link'
    const slug = partnerless ? null : (input.partnerSlug ?? null)
    if (!partnerless && (!slug || !TRANSPORT_PARTNER_SLUGS.includes(slug))) return

    // 로그인 사용자만 기록한다. 펫무브워크 '펫무브 앱 미리보기'는 세션 없는 pm_preview
    // 쿠키로 도는데, 그걸 세면 운영자가 케이스를 열어볼 때마다 노출이 부풀어 클릭률이
    // 망가진다. 여정 카드는 로그인 후에만 보이므로 실제 고객은 전부 잡힌다.
    const user = await getCurrentUser()
    if (!user) return

    const admin = createAdminClient()
    await admin.from('outbound_clicks').insert({
      event: input.event,
      partner_slug: slug,
      step_id: input.stepId ?? null,
      source: input.source,
      // 여행지는 자유 문자열이라 길이만 자른다(표시용 토큰, 조회 키가 아님).
      destination: input.destination ? input.destination.slice(0, 60) : null,
      user_id: user.id,
      case_id: input.caseId ?? null,
    })
  } catch (e) {
    Sentry.captureException(e, { tags: { action: 'outbound.logOutbound' } })
  }
}
