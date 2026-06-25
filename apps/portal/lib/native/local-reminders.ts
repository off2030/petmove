'use client'

import type { AppReminder } from '@/lib/journey/reminders'

/**
 * 기기 로컬 알림 예약 — Capacitor 환경(iOS/Android 네이티브 앱)에서만 동작.
 * 웹 브라우저에서는 모두 no-op (조용히 무시).
 *
 * 흐름:
 *   1) 설정에서 '일정 알림 켜기' → enableReminders(): 권한 요청 + 플래그 ON
 *   2) 케이스 데이터가 로드/변경되면 syncReminders(collectReminders(...)) 로 재예약
 *      (기존 예약 취소 후 새로 — 멱등)
 *   3) '끄기' → disableReminders(): 플래그 OFF + 우리 알림 모두 취소
 *
 * 알림 ID 는 ID_BASE 이상으로 네임스페이스를 둬, 우리 것만 골라 취소한다.
 * iOS 는 대기 알림 64개 제한이 있어, 가장 가까운 일정 위주로 MAX_SCHEDULE 개만 예약한다.
 */

const ENABLED_KEY = 'pm_local_reminders_enabled'
const ID_BASE = 100_000
const TEST_ID = 99_999 // 예약 리마인더 네임스페이스(>=ID_BASE) 밖 — cancelOurs 에 안 걸림
const MAX_SCHEDULE = 60 // iOS 대기 알림 한도(64) 안쪽으로

export function remindersEnabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** 문자열 id → ID_BASE 이상의 안정적 정수. */
function numericId(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return ID_BASE + (Math.abs(h) % 1_000_000)
}

async function cancelOurs(): Promise<void> {
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  const pending = await LocalNotifications.getPending()
  const ours = pending.notifications.filter((n) => n.id >= ID_BASE)
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) })
}

/**
 * '일정 알림 켜기' — 권한 요청 후 플래그 ON.
 * @returns ok=true 면 켜짐. reason: 'web'(웹) | 'denied'(권한 거부) | error message
 */
export async function enableReminders(): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (!(await isNative())) return { ok: false, reason: 'web' }
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return { ok: false, reason: 'denied' }
    localStorage.setItem(ENABLED_KEY, '1')
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

/** '일정 알림 끄기' — 플래그 OFF + 예약된 우리 알림 모두 취소. */
export async function disableReminders(): Promise<void> {
  try {
    localStorage.removeItem(ENABLED_KEY)
    if (!(await isNative())) return
    await cancelOurs()
  } catch {
    /* best-effort */
  }
}

/**
 * 테스트 알림 — 약 10초 뒤 1건 발송. 알림이 이 기기에 실제로 도착하는지 확인용
 * (특히 삼성폰의 배터리 절약이 알림을 막지 않는지). 권한 없으면 요청.
 */
export async function sendTestReminder(): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (!(await isNative())) return { ok: false, reason: 'web' }
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    let perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return { ok: false, reason: 'denied' }
    await LocalNotifications.schedule({
      notifications: [
        {
          id: TEST_ID,
          title: '펫무브',
          body: '알림이 잘 도착해요! 🐾 일정 알림이 정상 작동 중이에요.',
          schedule: { at: new Date(Date.now() + 10_000) },
        },
      ],
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: (e as Error).message }
  }
}

/** 수집된 알림을 기기에 재예약(기존 취소 후). 켜져 있고 권한 있을 때만. */
export async function syncReminders(reminders: AppReminder[]): Promise<void> {
  try {
    if (!remindersEnabled()) return
    if (!(await isNative())) return
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') return

    await cancelOurs()

    const toSchedule = reminders.slice(0, MAX_SCHEDULE).map((r) => ({
      id: numericId(r.id),
      title: r.title,
      body: r.body,
      schedule: { at: new Date(r.fireAtIso) },
    }))
    if (toSchedule.length) await LocalNotifications.schedule({ notifications: toSchedule })
  } catch {
    /* best-effort — 알림 예약 실패가 앱을 막지 않게 */
  }
}
