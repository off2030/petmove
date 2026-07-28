'use client'

import { C, EditPageShell } from './settings-shared'

/**
 * 설정 sub-page 스텁 — vet / agency 등 "위치만 확보" 항목용.
 */
export function ComingSoonView({ title, message }: { title: string; message?: string }) {
  return (
    <EditPageShell title={title}>
      <div
        style={{
          marginTop: 16,
          padding: '24px 20px',
          borderRadius: 18,
          background: C.surface,
          border: `.5px dashed ${C.line}`,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.55,
            color: C.ink3,
          }}
        >
          {message ?? '곧 만나뵐게요. 준비 중이에요.'}
        </p>
      </div>
    </EditPageShell>
  )
}
