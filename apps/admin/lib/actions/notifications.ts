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
  /** 알림이 속한 조직. 옛 행·조직 맥락 없는 알림은 null. */
  org_id: string | null
  /** 표시용 조직 이름(예: '펫무브', '로잔동물의료센터'). 조회 불가면 null. */
  org_name: string | null
}

// 알림 탭이 한 번에 보여줄 최대 개수. 넘는 과거분은 조용히 잘린다 —
// 알림은 피드지 아카이브가 아니므로 페이지네이션은 두지 않는다.
const LIST_LIMIT = 200

/** org 이름은 embed 로 함께 받는다 — organizations SELECT 정책이 본인 소속 org 를 허용. */
const SELECT_WITH_ORG = 'id, case_id, content, created_at, read_at, org_id, organizations(name)'
const SELECT_LEGACY = 'id, case_id, content, created_at, read_at'

type RawRow = Omit<NotificationRow, 'org_id' | 'org_name'> & {
  org_id?: string | null
  organizations?: { name: string | null } | { name: string | null }[] | null
}

function normalize(rows: RawRow[]): NotificationRow[] {
  return rows.map((r) => {
    const org = Array.isArray(r.organizations) ? r.organizations[0] : r.organizations
    return {
      id: r.id,
      case_id: r.case_id,
      content: r.content,
      created_at: r.created_at,
      read_at: r.read_at,
      org_id: r.org_id ?? null,
      org_name: org?.name ?? null,
    }
  })
}

export async function listMyNotifications(): Promise<Result<NotificationRow[]>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: '로그인이 필요합니다' }
  const { data, error } = await supabase
    .from('notifications')
    .select(SELECT_WITH_ORG)
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT)
  if (!error) return { ok: true, value: normalize((data ?? []) as unknown as RawRow[]) }

  // org_id 마이그레이션(20260923000001) 적용 전 배포에서도 알림이 통째로 비지 않도록
  // 한 번만 구 스키마로 재시도. 마이그레이션 적용 후엔 도달하지 않는 경로.
  const legacy = await supabase
    .from('notifications')
    .select(SELECT_LEGACY)
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT)
  if (legacy.error) return { ok: false, error: legacy.error.message }
  return { ok: true, value: normalize((legacy.data ?? []) as unknown as RawRow[]) }
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
