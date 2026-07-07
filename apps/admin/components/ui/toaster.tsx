'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, RefreshCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { subscribeToasts, dismissToast, type ToastItem } from '@/lib/toast-bus'

/**
 * 전역 토스트 렌더러 — 우측 하단에 쌓임. toast-bus 를 subscribe.
 * 저장 실패 토스트는 '다시 시도' 버튼을 갖는다(눌러도 안 사라지지 않게: 실패면 같은 key
 * 로 다시 뜸). 성공/정보는 자동으로 사라진다.
 */
export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  useEffect(() => subscribeToasts(setToasts), [])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  )
}

function ToastCard({ toast }: { toast: ToastItem }) {
  const isError = toast.variant === 'error'
  const isSuccess = toast.variant === 'success'

  // 정보·성공 토스트는 잠시 뒤 자동으로 사라짐. 오류(재시도 가능)는 사용자가 닫을 때까지 유지.
  useEffect(() => {
    if (isError) return
    const t = setTimeout(() => dismissToast(toast.id), 4000)
    return () => clearTimeout(t)
  }, [isError, toast.id])

  return (
    <div
      className={cn(
        'rounded-[10px] border border-border/80 bg-popover p-3 shadow-md',
        isError && 'border-l-2 border-l-destructive',
      )}
    >
      <div className="flex items-start gap-2.5">
        {isError ? (
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        ) : isSuccess ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-pmw-positive" />
        ) : (
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-foreground">{toast.title}</div>
          {toast.description && (
            <div className="mt-0.5 break-words text-[12.5px] text-muted-foreground">
              {toast.description}
            </div>
          )}
          {toast.retry && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  dismissToast(toast.id)
                  void toast.retry?.()
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-destructive/60 px-2.5 py-1 text-[12.5px] text-destructive transition-colors hover:bg-destructive/10"
              >
                <RefreshCw className="h-3 w-3" />
                다시 시도
              </button>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded-md px-2 py-1 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground"
              >
                닫기
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => dismissToast(toast.id)}
          aria-label="닫기"
          className="shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
