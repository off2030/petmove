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
 * Android 헤드업(포그라운드에서도 즉시 팝업)용 HIGH importance 채널을 보장하고 그 id 를 반환.
 * 기본 채널은 앱을 보고 있을 때 상단바로만 조용히 들어가 "안 떴다"고 오해하기 쉬움 → 테스트는
 * HIGH 채널로 띄운다. iOS/웹은 채널 개념이 없어(또는 플러그인이 포그라운드 표시 담당) undefined.
 */
async function ensureTestChannel(): Promise<string | undefined> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (Capacitor.getPlatform() !== 'android') return undefined
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const id = 'pm-test'
    await LocalNotifications.createChannel({
      id,
      name: '테스트 알림',
      description: '알림 작동 테스트용',
      importance: 5, // HIGH — 포그라운드에서도 헤드업으로 즉시 표시
    })
    return id
  } catch {
    return undefined
  }
}

/**
 * 테스트 알림 — 누르면 **즉시** 1건 발송(schedule 생략). 앱을 보고 있을 때도 바로 뜨도록
 * Android 는 HIGH importance 채널(헤드업), iOS 는 플러그인 기본 포그라운드 표시를 쓴다.
 * 알림이 이 기기에 실제로 도착하는지 확인용(특히 삼성폰 배터리 절약이 막지 않는지). 권한 없으면 요청.
 */
export async function sendTestReminder(): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (!(await isNative())) return { ok: false, reason: 'web' }
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    let perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions()
    if (perm.display !== 'granted') return { ok: false, reason: 'denied' }
    const channelId = await ensureTestChannel()
    // ⚠️ 스토어 스크린샷용 임시(2026-07-14): 실전 문구 3건을 한 번에 발송.
    // 작업 끝나면 아래 STORE_SHOT_SET 을 false 로 되돌려 원래 1건 테스트로 복원.
    const STORE_SHOT_SET = true
    const bodies = STORE_SHOT_SET
      ? [
          '내일은 밀꾸 광견병 항체 검사 예정일이에요 🐾 예약 시간은 오전 10시 30분이에요.',
          '밀꾸 수입 허가증이 나왔어요. ✨',
          '밀꾸 광견병 백신 유효기간이 한 달 뒤(2026년 8월 13일) 만료돼요. 추가 접종을 준비하세요.',
        ]
      : ['일정 알림이 정상 작동해요! 🐾']
    await LocalNotifications.schedule({
      notifications: bodies.map((body, i) => ({
        // TEST_ID 아래로 내려가며 부여(99999·99998·99997) — ID_BASE(100000) 이상은
        // 예약 리마인더 네임스페이스라 침범하면 cancelOurs 에 걸리고 실제 알림과 충돌.
        id: TEST_ID - i,
        title: '펫무브',
        body,
        // 스크린샷용: 버튼 탭 15초 뒤부터 4초 간격 도착 — 홈/잠금 화면으로 나가서
        // '알림이 도착하는' 실제 수신 장면을 찍을 수 있게. (원복 시 schedule 제거 = 즉시 발송)
        schedule: { at: new Date(Date.now() + (15 + i * 4) * 1000), allowWhileIdle: true },
        // channelId 는 Android 에서만(iOS 는 undefined → 미포함).
        ...(channelId ? { channelId } : {}),
      })),
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
      // 탭하면 해당 동물 일정 페이지로 — 알림 id 의 첫 구간이 caseId(notification-tap-listener 가 읽음).
      extra: { path: `/cases/${r.id.split('|')[0]}/journey` },
    }))
    if (toSchedule.length) await LocalNotifications.schedule({ notifications: toSchedule })
  } catch {
    /* best-effort — 알림 예약 실패가 앱을 막지 않게 */
  }
}
