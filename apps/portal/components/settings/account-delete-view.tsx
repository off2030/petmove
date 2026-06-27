'use client'

import { useTransition, type CSSProperties } from 'react'
import { useConfirm } from '@petmove/ui'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { requestAccountDeletion, cancelAccountDeletion } from '@/lib/actions/profile'
import { C, EditPageShell, SectionCard } from '@/components/me/settings-shared'

/**
 * 계정 삭제 (/settings/account-delete) — 요청 / 유예 상태 / 취소.
 *
 * - 활성 회원: 안내문 + 현재 등록된 케이스 N건 + [계정 삭제 요청] 버튼
 *   → 모달 확인 → requestAccountDeletion → deletion_scheduled_at = now()
 * - 유예 중: D-day 표시 + [요청 취소] 버튼 → cancelAccountDeletion → NULL
 *
 * 정책: docs/legal/privacy.md §4. 7일 유예 후 cron 이 hard delete + 케이스 익명화 +
 * 신청폼 경로 케이스(source='apply_form')의 조직 운영자에 시스템 봇 알림.
 */

const GRACE_DAYS = 7
const MS_PER_DAY = 24 * 3600 * 1000

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / MS_PER_DAY))
}

export function AccountDeleteView() {
  const { profile, refreshProfile } = useCases()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()

  const scheduledAt = profile?.deletion_scheduled_at ?? null
  const deletionAt = scheduledAt
    ? new Date(new Date(scheduledAt).getTime() + GRACE_DAYS * MS_PER_DAY).toISOString()
    : null

  async function handleRequest() {
    const ok = await confirm({
      message: '계정을 삭제하시겠습니까?',
      description: '7일 유예 후 회원 정보가 삭제되며 되돌릴 수 없습니다.',
      okLabel: '삭제 요청',
      variant: 'destructive',
    })
    if (!ok) return
    startTransition(async () => {
      const result = await requestAccountDeletion()
      if (!result.ok) {
        alert(`오류: ${result.error}`)
        return
      }
      await refreshProfile()
    })
  }

  // 취소는 reversible 한 undo 동작 — 모달 없이 즉시 실행. 잘못 눌렀으면 '계정 삭제 요청'
  // 버튼을 다시 눌러 모달까지 다시 받으면 되므로 안전.
  function handleCancel() {
    startTransition(async () => {
      const result = await cancelAccountDeletion()
      if (!result.ok) {
        alert(`오류: ${result.error}`)
        return
      }
      await refreshProfile()
    })
  }

  return (
    <EditPageShell title="계정 삭제" backHref="/settings" backLabel="설정">
      {scheduledAt && deletionAt ? (
        <>
          <SectionCard label="삭제 예정" marginTop={8}>
            <div style={{ padding: '14px 0' }}>
              <div style={{ fontSize: 15, color: C.ink }}>
                {formatDate(deletionAt)}
                <span style={{ fontSize: 13, color: C.ink3, marginLeft: 8 }}>
                  ({daysUntil(deletionAt)}일 후)
                </span>
              </div>
              <div style={{ fontSize: 13, color: C.ink3, marginTop: 8, lineHeight: 1.55 }}>
                유예 기간 동안은 삭제 요청을 취소할 수 있습니다.
              </div>
            </div>
          </SectionCard>

          <SectionCard>
            <button
              type="button"
              onClick={handleCancel}
              disabled={pending}
              style={{ ...buttonStyle, color: C.ink2, opacity: pending ? 0.5 : 1 }}
            >
              취소
            </button>
          </SectionCard>
        </>
      ) : (
        <>
          <SectionCard marginTop={8}>
            <p style={{ margin: 0, padding: '14px 0', fontSize: 13, color: C.ink2, lineHeight: 1.7 }}>
              계정 삭제를 요청하면 7일 유예 후 회원 정보가 삭제됩니다. 삭제 후에는 되돌릴 수 없으며,
              유예 중에는 이 메뉴에서 취소할 수 있습니다.
            </p>
          </SectionCard>

          <SectionCard>
            <button
              type="button"
              onClick={handleRequest}
              disabled={pending}
              style={{ ...buttonStyle, color: C.warn, opacity: pending ? 0.5 : 1 }}
            >
              계정 삭제 요청
            </button>
          </SectionCard>
        </>
      )}
    </EditPageShell>
  )
}

const buttonStyle: CSSProperties = {
  width: '100%',
  padding: '13px 0',
  background: 'transparent',
  border: 'none',
  textAlign: 'center',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 500,
}
