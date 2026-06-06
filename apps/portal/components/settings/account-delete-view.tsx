'use client'

import { useTransition, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
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
  const { cases, profile } = useCases()
  const confirm = useConfirm()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const scheduledAt = profile?.deletion_scheduled_at ?? null
  const deletionAt = scheduledAt
    ? new Date(new Date(scheduledAt).getTime() + GRACE_DAYS * MS_PER_DAY).toISOString()
    : null
  const caseCount = cases.length

  async function handleRequest() {
    const ok = await confirm({
      message: '계정을 삭제하시겠습니까?',
      description:
        '7일 유예 기간이 시작되며 같은 메뉴에서 취소할 수 있습니다. 유예 후 회원 정보는 파기되고 출국 절차 기록은 익명화되어 보존됩니다.',
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
      router.refresh()
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
      router.refresh()
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
            <div style={{ padding: '14px 0', fontSize: 13, color: C.ink2, lineHeight: 1.6 }}>
              계정 삭제를 요청하면 7일 유예 기간이 시작됩니다. 유예 중에는 이 메뉴에서 취소할 수
              있고, 유예 종료 시 다음과 같이 처리됩니다.
              <ul style={{ margin: '10px 0 0', paddingLeft: 20, color: C.ink2 }}>
                <li>회원 가입 정보(이름·이메일·연락처)는 파기됩니다.</li>
                <li>
                  출국 절차 기록은 보호자 식별 정보가 제거된 상태로 보존됩니다
                  (서비스 품질 개선 및 재이용 안내 — 3년).
                </li>
                <li>
                  신청폼을 통해 진행 중인 절차가 있는 경우, 담당 동물병원·운송업체 운영자에게
                  절차 마무리 안내가 전달됩니다.
                </li>
              </ul>
            </div>
          </SectionCard>

          {caseCount > 0 && (
            <SectionCard label="현재 등록된 케이스">
              <div
                style={{
                  padding: '13px 0',
                  fontSize: 15,
                  color: C.ink,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {caseCount}건
              </div>
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
