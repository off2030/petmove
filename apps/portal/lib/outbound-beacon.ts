'use client'

import type { LogOutboundInput } from '@/lib/actions/outbound'

/**
 * 화면을 떠나는 클릭의 기록 — sendBeacon 으로 보낸다.
 *
 * 서버 액션(logOutbound)은 라우터 전환에 묶여 있어, 누르자마자 화면이 바뀌는 버튼에서는
 * 요청이 통째로 사라진다(2026-08-27 guide_link 유실). 이동을 동반하는 클릭은 반드시 이쪽.
 * 노출처럼 머무르는 기록은 서버 액션을 그대로 쓰는 게 낫다(왕복이 한 번 줄어든다).
 */
export function beaconOutbound(input: LogOutboundInput): void {
  try {
    const body = JSON.stringify(input)
    const url = '/api/outbound'
    if (navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }))) return
    void fetch(url, {
      method: 'POST',
      body,
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    /* 기록 실패가 이동을 막지 않는다 */
  }
}
