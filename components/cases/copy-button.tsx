'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * One-click copy-to-clipboard icon button.
 * Shows a brief check-mark confirmation on success.
 */
export function CopyButton({
  value,
  disabled = false,
  className,
}: {
  value: string
  disabled?: boolean
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    if (disabled || !value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch (err) {
      console.error('Clipboard copy failed:', err)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={disabled || !value || value === '—'}
      aria-label="복사"
      title="클립보드에 복사"
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        'disabled:pointer-events-none disabled:opacity-30',
        className,
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  )
}
