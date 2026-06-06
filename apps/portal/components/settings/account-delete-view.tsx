'use client'

import { useTransition, type CSSProperties } from 'react'
import { buildCaseJourneyContext, type CaseRow } from '@petmove/domain'
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

/** '한국 ⇄ 일본' (왕복) 또는 '한국 → 일본' (편도). 목적지 미설정이면 null. */
function travelSummary(case_: CaseRow): string | null {
  const dest = case_.destination?.trim() || null
  if (!dest) return null
  const arrow = buildCaseJourneyContext(case_).tripType === 'round' ? '⇄' : '→'
  return `한국 ${arrow} ${dest}`
}

export function AccountDeleteView() {
  const { cases, profile, refreshProfile } = useCases()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()

  const scheduledAt = profile?.deletion_scheduled_at ?? null
  const deletionAt = scheduledAt
    ? new Date(new Date(scheduledAt).getTime() + GRACE_DAYS * MS_PER_DAY).toISOString()
    : null
  const caseCount = cases.length

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

  async function handleCancel() {
    const ok = await confirm({
      message: '계정 삭제 요청을 취소하시겠습니까?',
      okLabel: '예, 취소',
    })
    if (!ok) return
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
                예정일 이전에는 아래에서 취소할 수 있습니다. 예정일이 되면 회원 정보는 파기되고,
                출국 절차 기록은 보호자 식별 정보가 제거된 상태로 보존됩니다.
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
              요청 취소
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

          {caseCount > 0 && (
            <SectionCard label="현재 등록된 케이스">
              {cases.map((c, i) => {
                const name = c.pet_name?.trim() || '이름 미설정'
                const travel = travelSummary(c)
                return (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      padding: '11px 0',
                      borderBottom: i === cases.length - 1 ? 'none' : `.5px solid ${C.line}`,
                      gap: 12,
                    }}
                  >
                    <span style={{ fontSize: 15, color: C.ink }}>{name}</span>
                    <span style={{ fontSize: 13, color: travel ? C.ink2 : C.ink3 }}>
                      {travel ?? '목적지 미설정'}
                    </span>
                  </div>
                )
              })}
            </SectionCard>
          )}

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
