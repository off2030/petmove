'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'destructive'

interface ConfirmOptions {
  message: string
  description?: string
  okLabel?: string
  cancelLabel?: string
  variant?: Variant
}

type ConfirmFn = (input: string | ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

interface PendingState extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const confirm = useCallback<ConfirmFn>((input) => {
    const opts = typeof input === 'string' ? { message: input } : input
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve })
    })
  }, [])

  const close = useCallback((ok: boolean) => {
    setPending((cur) => {
      if (cur) cur.resolve(ok)
      return null
    })
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {mounted && pending && <ConfirmDialog state={pending} onClose={close} />}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}

function ConfirmDialog({ state, onClose }: { state: PendingState; onClose: (ok: boolean) => void }) {
  const okRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    okRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose(false)
      else if (e.key === 'Enter') onClose(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const okLabel = state.okLabel ?? '확인'
  const cancelLabel = state.cancelLabel ?? '취소'
  const variant = state.variant ?? 'default'

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
      onClick={() => onClose(false)}
    >
      <div
        className="w-[400px] max-w-[90vw] rounded-lg border border-border bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <p className="font-serif text-[17px] leading-snug text-foreground">{state.message}</p>
        {state.description && (
          <p className="mt-2 text-sm text-muted-foreground">{state.description}</p>
        )}
        <div className="mt-6 flex justify-end gap-sm">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="px-md py-1.5 text-sm rounded-md border border-border hover:bg-accent/60 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={okRef}
            type="button"
            onClick={() => onClose(true)}
            className={cn(
              'px-md py-1.5 text-sm rounded-md transition-colors',
              variant === 'destructive'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-foreground text-background hover:bg-foreground/90',
            )}
          >
            {okLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
