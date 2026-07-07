'use client'

/**
 * 전역 토스트 버스 — React 컨텍스트 없이 아무 곳(서버액션 실패 콜백, void async 블록)
 * 에서도 알림을 띄우기 위한 모듈 싱글턴 pub/sub.
 *
 * <Toaster/> (components/ui/toaster) 가 subscribe 해서 화면에 그린다.
 * 저장 실패를 조용히 넘기지 않는 게 목적 — persistField 로 낙관적 저장을 감싸면
 * 실패 시 자동으로 '다시 시도' 토스트가 뜬다.
 */

export type ToastVariant = 'error' | 'success' | 'info'

export interface ToastItem {
  id: number
  /** 같은 key 는 새 토스트가 기존 것을 대체 (같은 필드 반복 실패 시 스팸 방지). */
  key?: string
  title: string
  description?: string
  variant: ToastVariant
  /** 있으면 '다시 시도' 버튼 노출. 누르면 이 토스트를 닫고 실행. */
  retry?: () => void | Promise<void>
}

type Listener = (toasts: ToastItem[]) => void

let toasts: ToastItem[] = []
let seq = 0
const listeners = new Set<Listener>()

function emit() {
  for (const l of listeners) l(toasts)
}

export function subscribeToasts(l: Listener): () => void {
  listeners.add(l)
  l(toasts)
  return () => {
    listeners.delete(l)
  }
}

export function pushToast(t: Omit<ToastItem, 'id'>): number {
  const id = ++seq
  if (t.key) toasts = toasts.filter((x) => x.key !== t.key)
  toasts = [...toasts, { ...t, id }]
  emit()
  return id
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function toastError(title: string, description?: string, retry?: () => void | Promise<void>) {
  pushToast({ title, description, variant: 'error', retry })
}

export function toastInfo(title: string, description?: string) {
  pushToast({ title, description, variant: 'info' })
}

/**
 * 낙관적 저장을 감싼다. 화면은 이미 새 값으로 갱신된 상태에서 서버 저장만 시도하고,
 * 실패하면 값을 되돌리지 않고(사용자 입력 보존) '다시 시도' 토스트를 띄운다.
 * '다시 시도' 는 같은 저장을 그대로 재실행 → 성공하면 토스트가 사라짐.
 *
 * @param label 사용자에게 보일 필드명 (예: '전화번호')
 * @param run   실제 저장 함수 — { ok, error? } 를 돌려주는 서버액션 호출
 * @returns 성공 시 결과, 실패 시 null (호출부에서 후처리 스킵용)
 */
export async function persistField<T extends { ok: boolean; error?: string }>(
  label: string,
  run: () => Promise<T>,
): Promise<T | null> {
  try {
    const r = await run()
    if (!r.ok) {
      pushToast({
        key: `save:${label}`,
        title: `${label} 저장 실패`,
        description: r.error || '잠시 후 다시 시도하세요.',
        variant: 'error',
        retry: () => {
          void persistField(label, run)
        },
      })
      return null
    }
    return r
  } catch {
    pushToast({
      key: `save:${label}`,
      title: `${label} 저장 실패`,
      description: '연결을 확인한 뒤 다시 시도하세요.',
      variant: 'error',
      retry: () => {
        void persistField(label, run)
      },
    })
    return null
  }
}
