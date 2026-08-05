'use server'
// 펫무브워크 알림 — 평범한 알림 테이블(notifications) 읽기/읽음처리.
//
// 구 채팅 유산(conversations/messages + 봇 발신자) 대체 (2026-08-05).
// 쓰는 쪽: DB 트리거(신규 신청·공유링크 제출·계정 삭제) + evaluateAndNotify
//          (system-notifications.ts) + portal 문의/파트너 변경 액션.
// 읽는 쪽: dashboard-shell(뱃지·realtime refetch) + alerts-app(탭/팝업).

import { createClient } from '@petmove/auth/server'

type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface NotificationRow {
  id: string
  case_id: string | null
  content: string
  created_at: string
  read_at: string | null
}

// 알림 탭이 한 번에 보여줄 최대 개수. 넘는 과거분은 조용히 잘린다 —
// 알림은 피드지 아카이브가 아니므로 페이지네이션은 두지 않는다.
const LIST_LIMIT = 200

export async function listMyNotifications(): Promise<Result<NotificationRow[]>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다' }
  const { data, error } = await supabase
    .from('notifications')
    .select('id, case_id, content, created_at, read_at')
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT)
  if (error) return { ok: false, error: error.message }
  return { ok: true, value: (data ?? []) as NotificationRow[] }
}

/** 안 읽은 알림 전부 읽음 처리 — 알림 화면이 보이는 동안 호출. */
export async function markAllNotificationsRead(): Promise<Result<null>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다' }
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null)
  if (error) return { ok: false, error: error.message }
  return { ok: true, value: null }
}
