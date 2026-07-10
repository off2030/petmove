'use client'


import { C } from '@/lib/palette'
import type { CSSProperties } from 'react'
import type { CaseRow } from '@petmove/domain'
import { PetAvatarDisplay } from '@/components/me/pet-avatar-display'

/**
 * 완료 확인 prompt (A형 바텀시트) — 출국/귀국 후 미완료 여정에서.
 * 설계: docs/journey-lifecycle-design.md §4.2 / 시안: docs/portal-preview/journey-cards.html.
 * 발동 판정·호출은 여정 페이지에서. 여긴 표시 + 버튼 콜백만.
 */


/** 한국어 받침 — '와/과'. */
function waGwa(name: string): string {
  if (!name) return '와'
  const code = name.charCodeAt(name.length - 1)
  if (code < 0xac00 || code > 0xd7a3) return '와'
  return (code - 0xac00) % 28 !== 0 ? '과' : '와'
}

const btnBase: CSSProperties = {
  padding: '13px',
  borderRadius: 14,
  fontFamily: 'inherit',
  fontSize: 14.5,
  cursor: 'pointer',
  width: '100%',
}

export function CompletionPrompt({
  caseRow,
  petName,
  destination,
  busy,
  onDone,
  onDismiss,
  onCancel,
}: {
  caseRow: CaseRow
  petName: string
  destination: string
  busy: boolean
  onDone: () => void
  onDismiss: () => void
  onCancel: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={busy ? undefined : onDismiss}
        style={{ position: 'absolute', inset: 0, background: 'rgba(33,33,36,.42)' }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          margin: '0 12px max(12px, env(safe-area-inset-bottom))',
          borderRadius: 22,
          background: C.surface,
          boxShadow: '0 14px 44px rgba(33,33,36,.24)',
          padding: '10px 20px 22px',
          animation: 'pm-fade-up .28s cubic-bezier(0.2,0.8,0.2,1) both',
        }}
      >
        <div style={{ width: 38, height: 4, borderRadius: 999, background: C.line2, margin: '4px auto 16px' }} />
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <PetAvatarDisplay case_={caseRow} size={52} />
        </div>
        <h3 style={{ fontSize: 19, textAlign: 'center', margin: 0, color: C.ink, fontWeight: 600, lineHeight: 1.35 }}>
          {petName}
          {waGwa(petName)}의 {destination} 여정,
          <br />잘 마치셨나요?
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 18 }}>
          <button
            type="button"
            disabled={busy}
            onClick={onDone}
            style={{ ...btnBase, background: C.accent, color: '#FFFFFF', border: 'none', fontWeight: 600 }}
          >
            잘 다녀왔어요
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDismiss}
            style={{ ...btnBase, background: 'transparent', color: C.ink, border: `1px solid ${C.line2}`, fontWeight: 600 }}
          >
            아직 진행 중이에요
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            style={{ ...btnBase, background: 'transparent', color: C.ink3, border: 'none', fontWeight: 500 }}
          >
            이 여정은 취소할게요
          </button>
        </div>
      </div>
    </div>
  )
}
