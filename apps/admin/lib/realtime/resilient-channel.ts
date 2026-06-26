// 인증·재연결을 자체 관리하는 Realtime 채널 구독.
//
// 단발 .subscribe() 패턴의 문제 3가지를 해결한다:
//   1. status 콜백 부재 — CHANNEL_ERROR/TIMED_OUT 을 감지·복구하지 못함.
//   2. setAuth 1회성 — 액세스 토큰 만료 후 realtime 이 stale 토큰을 계속 써서
//      RLS 걸린 테이블(cases·messages 등)의 이벤트가 조용히 사라짐.
//   3. 탭 백그라운드·절전으로 WebSocket 이 끊겨도 postgres_changes 재조인이 안 됨.
//
// onSubscribed 는 최초 구독과 "모든 재연결" 시 호출 — 재연결은 끊긴 동안의
// 이벤트를 replay 하지 않으므로, 호출자가 여기서 전체 refetch 로 공백을 메운다.

import { supabaseBrowser } from '@/lib/supabase/browser'

type Channel = ReturnType<typeof supabaseBrowser.channel>
type ChannelBuilder = (channel: Channel) => Channel

/**
 * @param name         채널 이름 (org/conv 별로 고유해야 함)
 * @param build        채널에 .on(...) 핸들러를 붙이는 빌더. .subscribe() 는 호출하지 말 것.
 * @param onSubscribed (선택) 채널이 SUBSCRIBED 될 때마다 호출. 재연결 공백 보충용.
 * @returns            구독 해제 함수 — useEffect cleanup 에서 호출.
 */
export function subscribeRealtime(
  name: string,
  build: ChannelBuilder,
  onSubscribed?: () => void,
): () => void {
  let disposed = false
  let channel: Channel | null = null
  let joined = false
  let generation = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retryDelay = 1000

  function clearRetry() {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  function scheduleReconnect() {
    if (disposed || retryTimer) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      retryDelay = Math.min(retryDelay * 2, 30_000)
      void connect()
    }, retryDelay)
  }

  async function connect() {
    if (disposed) return
    const myGen = ++generation
    joined = false

    // 이전 채널 정리 — 재연결 시 중복 구독 방지.
    if (channel) {
      const stale = channel
      channel = null
      void supabaseBrowser.removeChannel(stale)
    }

    const {
      data: { session },
    } = await supabaseBrowser.auth.getSession()
    if (disposed || myGen !== generation) return
    if (!session?.access_token) {
      // 세션이 아직 복원 안 됐으면 잠시 후 재시도.
      scheduleReconnect()
      return
    }

    // RLS 걸린 postgres_changes 가 anon 이 아닌 user JWT 로 join 하도록 보장.
    await supabaseBrowser.realtime.setAuth(session.access_token)
    if (disposed || myGen !== generation) return

    const ch = build(supabaseBrowser.channel(name))
    channel = ch
    ch.subscribe((status) => {
      if (disposed || myGen !== generation || ch !== channel) return
      if (status === 'SUBSCRIBED') {
        joined = true
        retryDelay = 1000
        clearRetry()
        onSubscribed?.()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        joined = false
        scheduleReconnect()
      } else if (status === 'CLOSED') {
        joined = false
      }
    })
  }

  // 토큰 갱신 시 realtime 재인증 + 재조인 — 만료 토큰으로 RLS 이벤트가 사라지는 것 방지.
  const { data: authSub } = supabaseBrowser.auth.onAuthStateChange((event) => {
    if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
      void connect()
    }
  })

  // 탭이 다시 보이면 채널 건강 상태 점검 후 필요 시 재조인.
  function onVisible() {
    if (disposed || document.visibilityState !== 'visible') return
    if (!joined) {
      clearRetry()
      void connect()
    }
  }
  document.addEventListener('visibilitychange', onVisible)

  void connect()

  return () => {
    disposed = true
    clearRetry()
    authSub.subscription.unsubscribe()
    document.removeEventListener('visibilitychange', onVisible)
    if (channel) void supabaseBrowser.removeChannel(channel)
  }
}
