'use client'

import { useEffect, useState, useTransition } from 'react'
import { Inbox, X } from 'lucide-react'
import { listPlatformCases, moveCasesToHome, type PlatformCase } from '@/lib/actions/super-admin'
import { cn } from '@/lib/utils'

/**
 * 펫무브 직영(platform)을 보고 있을 때만 상단바에 뜨는 작은 아이콘 버튼 + 이동 모달.
 * 병원 링크(/apply/<slug>) 를 안 거치고 앱에서 직접 신청해 "미배정(펫무브 직영)"으로
 * 들어온 케이스를 home org(예: 로잔)로 옮긴다. 기본은 전체 해제 — 옮길 건만 체크(opt-in).
 *
 * active=false(펫무브가 아닌 조직 보기)면 아무것도 렌더 안 함(조회도 안 함).
 */
export function PlatformCasesMover({
  active,
  homeOrgName,
}: {
  active: boolean
  homeOrgName: string
}) {
  const [cases, setCases] = useState<PlatformCase[] | null>(null)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    // 조직 전환은 full reload(window.location) 라 컴포넌트가 새로 마운트 → active=true 일 때만
    // 조회하면 충분(stale 걱정 없음).
    if (!active) return
    let alive = true
    listPlatformCases().then((r) => {
      if (alive && r.ok) setCases(r.value)
    })
    return () => {
      alive = false
    }
  }, [active])

  // 목록 화면의 행별 "가져오기"로 옮겨진 케이스를 배지·목록에서 즉시 제거(재조회 없이 동기화).
  useEffect(() => {
    if (!active) return
    function onMoved(e: Event) {
      const id = (e as CustomEvent<{ id: string }>).detail?.id
      if (!id) return
      setCases((prev) => (prev ? prev.filter((c) => c.id !== id) : prev))
      setSelected((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
    window.addEventListener('platform-case-moved', onMoved)
    return () => window.removeEventListener('platform-case-moved', onMoved)
  }, [active])

  function openModal() {
    setSelected(new Set())
    setError(null)
    setOpen(true)
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (!cases) return
    setSelected((prev) => (prev.size === cases.length ? new Set() : new Set(cases.map((c) => c.id))))
  }

  function move() {
    if (selected.size === 0) return
    setError(null)
    startTransition(async () => {
      const r = await moveCasesToHome([...selected])
      if (!r.ok) {
        setError(r.error)
        return
      }
      // hard reload — 케이스 목록·배지 전부 SSR 재계산.
      window.location.href = '/cases'
    })
  }

  if (!active || !cases || cases.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title={`펫무브 미배정 신청 ${cases.length}건 — ${homeOrgName}(으)로 정리`}
        aria-label={`미배정 신청 ${cases.length}건 정리`}
        className="relative h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <Inbox size={18} />
        <span className="absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-primary text-primary-foreground font-mono text-[9px] font-semibold leading-none flex items-center justify-center ring-2 ring-background">
          {cases.length > 99 ? '99+' : cases.length}
        </span>
      </button>

      {open && (
        <div role="dialog" aria-modal="true" aria-label="미배정 신청 이동" className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !pending && setOpen(false)} />
          <div className="relative z-10 w-full max-w-lg max-h-[80vh] flex flex-col rounded-xl border border-border bg-popover shadow-2xl">
            <div className="shrink-0 flex items-center justify-between px-lg h-14 border-b border-border/80">
              <h2 className="font-serif text-[17px] text-foreground">
                미배정 신청을 {homeOrgName}(으)로 이동
              </h2>
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                aria-label="닫기"
                className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-lg">
              <div className="sticky top-0 flex items-center justify-between py-2 bg-popover border-b border-border/60">
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {selected.size === cases.length ? '전체 해제' : '전체 선택'}
                </button>
                <span className="text-[12px] text-muted-foreground font-mono tabular-nums">
                  {selected.size}/{cases.length}
                </span>
              </div>
              <ul className="py-sm">
                {cases.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 py-2.5 border-b border-dotted border-border/60 last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      className="h-4 w-4 accent-primary shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] text-foreground truncate">
                        {c.customer_name || '이름 없음'} · {c.pet_name || '-'}
                      </div>
                      <div className="text-[12px] text-muted-foreground truncate">
                        {c.destination || '-'} · {new Date(c.created_at).toLocaleDateString('ko-KR')}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="shrink-0 px-lg py-md border-t border-border/80 flex items-center justify-between gap-md">
              {error ? (
                <span className="text-[12px] text-destructive truncate">{error}</span>
              ) : (
                <span className="text-[12px] text-muted-foreground">
                  선택한 신청의 담당이 {homeOrgName}(으)로 바뀝니다.
                </span>
              )}
              <button
                type="button"
                onClick={move}
                disabled={pending || selected.size === 0}
                className={cn(
                  'shrink-0 inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-primary text-primary-foreground text-[13px] font-medium transition-opacity',
                  'hover:opacity-90 disabled:opacity-40',
                )}
              >
                {pending ? '이동 중…' : `${selected.size}건 이동`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
