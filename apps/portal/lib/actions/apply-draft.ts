'use server'

import { createClient, getCurrentUser } from '@petmove/auth/server'

/**
 * 신청 폼 임시 저장 — 사용자당 1건 (`apply_drafts`).
 *
 * WHY: /apply 는 3~4단계라 중간에 나가면 입력이 전부 날아갔다. 이어서 쓰게 하는 게
 *      1차 목적이고, 부수적으로 "폼까지 왔다가 포기"를 데이터로 볼 수 있게 된다
 *      (draft 는 있는데 case 는 없는 계정 = 중도 이탈, step = 이탈 지점).
 *
 * 로그인 사용자 전용 — 공개 조직 신청폼(/apply/<slug>, 미로그인)은 저장하지 않는다.
 * RLS 가 본인 행만 허용하므로 일반 클라이언트로 충분(admin client 불필요).
 */

/** 폼이 저장하는 값 — 스키마를 고정하지 않는다(폼 필드가 자주 바뀜). */
export type ApplyDraftData = Record<string, unknown>

export interface ApplyDraft {
  step: number
  data: ApplyDraftData
  updatedAt: string
}

export async function loadApplyDraft(): Promise<ApplyDraft | null> {
  try {
    const user = await getCurrentUser()
    if (!user) return null
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('apply_drafts')
      .select('step, data, updated_at')
      .eq('user_id', user.id)
      .maybeSingle()
    if (error || !data) return null
    return {
      step: typeof data.step === 'number' ? data.step : 1,
      data: (data.data ?? {}) as ApplyDraftData,
      updatedAt: data.updated_at as string,
    }
  } catch {
    // 임시 저장은 보조 기능 — 실패해도 신청 자체를 막지 않는다.
    return null
  }
}

export async function saveApplyDraft(input: {
  orgId: string | null
  step: number
  data: ApplyDraftData
}): Promise<{ ok: boolean }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false }
    const supabase = await createClient()
    const { error } = await supabase.from('apply_drafts').upsert(
      {
        user_id: user.id,
        org_id: input.orgId,
        step: input.step,
        data: input.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}

export async function clearApplyDraft(): Promise<{ ok: boolean }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { ok: false }
    const supabase = await createClient()
    const { error } = await supabase.from('apply_drafts').delete().eq('user_id', user.id)
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}
