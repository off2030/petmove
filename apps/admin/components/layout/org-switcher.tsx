'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Building2, Check, ChevronDown } from 'lucide-react'
import { switchActiveOrg } from '@/lib/actions/super-admin'
import { cn } from '@/lib/utils'

/**
 * 상단바 조직 스위처 (super_admin 전용). 로잔/펫무브(직영) 등 조직을 바로 전환.
 * 기존 "설정 → 운영 → 조직관리 → 임시보기" 경로를 대체. 클릭 시 서버가 impersonation
 * 쿠키를 세팅/해제하고, 케이스 목록을 SSR 재호출하기 위해 hard reload 한다.
 */
export function OrgSwitcher({
  orgs,
  activeOrgId,
}: {
  orgs: { id: string; name: string }[]
  activeOrgId: string | null
}) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // 조직이 하나뿐이면 전환할 게 없어 숨김.
  if (orgs.length < 2) return null

  const active = orgs.find((o) => o.id === activeOrgId) ?? null

  function pick(id: string) {
    if (id === activeOrgId) {
      setOpen(false)
      return
    }
    startTransition(async () => {
      const r = await switchActiveOrg(id)
      if (r.ok) {
        // hard reload — 조직 전환은 SSR 데이터(케이스 목록·설정) 전체가 바뀌므로
        // 케이스 페이지를 서버에서 다시 그린다.
        window.location.href = '/cases'
      } else {
        setOpen(false)
      }
    })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        disabled={pending}
        title="조직 전환"
        aria-label="조직 전환"
        className={cn(
          'inline-flex items-center gap-1.5 h-9 pl-2.5 pr-2 rounded-md border border-border/70 bg-transparent text-foreground transition-colors hover:bg-accent disabled:opacity-50',
          open && 'bg-accent',
        )}
      >
        <Building2 size={15} className="shrink-0 text-muted-foreground" />
        <span className="max-w-[130px] truncate text-[13px] font-medium">
          {active?.name ?? '조직 선택'}
        </span>
        <ChevronDown
          size={13}
          className={cn('shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-40 min-w-[200px] rounded-md border border-border bg-popover p-1 shadow-md">
          {orgs.map((o) => {
            const isActive = o.id === activeOrgId
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => pick(o.id)}
                disabled={pending}
                className={cn(
                  'w-full flex items-center gap-2 rounded-sm px-2.5 py-2 text-left text-[13px] transition-colors',
                  isActive
                    ? 'text-foreground bg-accent/60'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <span className="flex-1 truncate">{o.name}</span>
                {isActive && <Check size={14} className="shrink-0 text-primary" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
