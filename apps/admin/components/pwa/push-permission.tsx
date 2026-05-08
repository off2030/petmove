'use client'

import { useEffect, useState } from 'react'

// Web Push 권한 토글 — 브라우저 권한 요청 + 구독 + 서버 등록.
// 표시 조건: SW + PushManager 지원 + VAPID 공개키 env 설정.
// VAPID 키는 NEXT_PUBLIC_VAPID_PUBLIC_KEY (publicly safe — 인증 우회 X).
//
// ⚠ 발송 인프라 미구축 (P2 #8 hygiene 이후 web-push 라이브러리 제거됨).
// 사용자가 구독하면 push_subscriptions 에 저장되지만 서버에서 실제 알림을
// 보내는 코드가 없어 알림은 전달되지 않는다. 발송 endpoint 도입 시 web-push
// 또는 동등 라이브러리 재설치 + sendNotification 호출부 작성 필요.
// 그 전까지 이 토글은 NEXT_PUBLIC_VAPID_PUBLIC_KEY 미설정으로 자동 숨겨지는
// 환경에서만 표시되지 않는다 (env 가 설정돼있으면 UI 가 나타나 사용자에게
// 오해 소지 — env 도 비활성화 권장).

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

// Uint8Array<ArrayBuffer> 명시 — TS 6 의 strict 타이핑이 Uint8Array<ArrayBufferLike>
// 로 추론하면 PushManager.subscribe 의 applicationServerKey: BufferSource 와 호환 X
// (BufferSource 의 backing buffer 는 SharedArrayBuffer 가 아닌 ArrayBuffer 강제).
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const buffer = new ArrayBuffer(raw.length)
  const arr = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export function PushPermission() {
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ok =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      typeof Notification !== 'undefined' &&
      !!VAPID_PUBLIC
    setSupported(ok)
    if (!ok) return
    setPermission(Notification.permission)
    // SW 등록되기 전에 호출되면 ready 가 wait — 안전.
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => setSubscribed(false))
  }, [])

  if (!supported) {
    return (
      <div className="font-serif text-[12px] text-foreground/50">
        이 브라우저는 푸시 알림을 지원하지 않습니다.
      </div>
    )
  }

  const enable = async () => {
    setBusy(true)
    setError(null)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        setError('알림 권한이 거부되었습니다')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC!),
      })
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      })
      if (!res.ok) {
        // 서버 저장 실패 시 브라우저 구독도 롤백
        await sub.unsubscribe().catch(() => {})
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error || `subscribe failed (${res.status})`)
      }
      setSubscribed(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    setError(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {})
        await sub.unsubscribe().catch(() => {})
      }
      setSubscribed(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류')
    } finally {
      setBusy(false)
    }
  }

  if (permission === 'denied') {
    return (
      <div className="font-serif text-[12px] text-foreground/60">
        브라우저 설정에서 이 사이트의 알림이 차단되어 있습니다.
        <br />
        주소창 좌측 자물쇠 → 알림 → 허용으로 변경 후 새로고침해주세요.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={subscribed ? disable : enable}
        disabled={busy}
        className="self-start rounded-full border border-foreground/30 px-md py-1.5 font-serif text-[13px] hover:bg-muted/40 disabled:opacity-40"
      >
        {busy ? '처리 중…' : subscribed ? '알림 끄기' : '알림 켜기'}
      </button>
      {error && (
        <div className="font-serif text-[12px] text-destructive">{error}</div>
      )}
    </div>
  )
}
