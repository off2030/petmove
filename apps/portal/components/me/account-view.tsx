'use client'

import { signOut } from '@/lib/actions/profile'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { C, EditPageShell } from './settings-shared'

/**
 * 설정 > 계정 — /me/account.
 * 이메일 + 알림(placeholder) + 로그아웃.
 * 원본: ProfileView 의 AccountSection.
 */
export function AccountView() {
  const { userEmail } = useCases()

  return (
    <EditPageShell title="계정">
      <div
        style={{
          marginTop: 8,
          background: C.surface,
          border: `.5px solid ${C.line}`,
          borderRadius: 18,
          padding: '4px 16px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '13px 0',
            borderBottom: `.5px solid ${C.line}`,
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13, color: C.ink2 }}>이메일</span>
          <span
            style={{
              fontSize: 15,
              color: C.ink,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {userEmail ?? '—'}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '13px 0',
            borderBottom: `.5px solid ${C.line}`,
          }}
        >
          <span style={{ fontSize: 13, color: C.ink2 }}>알림</span>
          <span style={{ fontSize: 15, color: C.ink3 }}>준비 중</span>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '13px 0',
              background: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: 'inherit',
              fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 13, color: C.ink2 }}>로그아웃</span>
            <span style={{ fontSize: 15, color: C.ink3 }}>›</span>
          </button>
        </form>
      </div>
    </EditPageShell>
  )
}
