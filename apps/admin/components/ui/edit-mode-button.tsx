'use client'

import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 편집/저장 토글 — 도구·설정·케이스 상세에서 공통으로 쓰는 버튼.
 * editMode=false → "편집" / true → "저장" (saving 중에는 "저장 중…").
 */
export function EditModeButton({
  editMode,
  onToggle,
  saving = false,
  className,
}: {
  editMode: boolean
  onToggle: () => void
  saving?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={saving}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors disabled:opacity-50',
        editMode
          ? 'border-pmw-accent bg-pmw-accent/15 text-pmw-accent-strong'
          : 'border-border/80 bg-transparent text-muted-foreground hover:text-foreground',
        className,
      )}
      title={editMode ? '저장' : '편집'}
    >
      <Pencil size={13} />
      {editMode ? (saving ? '저장 중…' : '저장') : '편집'}
    </button>
  )
}
