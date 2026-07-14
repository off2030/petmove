'use client'

import { useTransition } from 'react'
import { Building2 } from 'lucide-react'
import { switchActiveOrg } from '@/lib/actions/super-admin'
import { cn } from '@/lib/utils'

/**
 * 상단바 조직 스위처 (super_admin 전용). 다크모드 토글처럼 아이콘 한 번 클릭으로
 * 다음 조직으로 전환(조직 2개면 로잔 ⇄ 펫무브 토글). 드롭다운 없음.
 * 기존 "설정 → 운영 → 조직관리 → 임시보기" 경로 대체. 클릭 시 서버가 impersonation
 * 쿠키를 세팅/해제하고, 케이스 목록을 SSR 재호출하기 위해 hard reload 한다.
 */
export function OrgSwitcher({
  orgs,
  activeOrgId,
}: {
  orgs: { id: string; name: string }[]
  activeOrgId: string | null
}) {
  const [pending, startTransition] = useTransition()

  // 조직이 하나뿐이면 전환할 게 없어 숨김.
  if (orgs.length < 2) return null

  const activeIdx = orgs.findIndex((o) => o.id === activeOrgId)
  const active = orgs[activeIdx] ?? orgs[0]
  // 다음 조직(마지막이면 처음으로 순환). 2개면 반대편 = 토글.
  const next = orgs[((activeIdx < 0 ? 0 : activeIdx) + 1) % orgs.length]

  function toggle() {
    startTransition(async () => {
      const r = await switchActiveOrg(next.id)
      if (r.ok) {
        // hard reload — 조직 전환은 SSR 데이터(케이스 목록·설정) 전체가 바뀌므로
        // 케이스 페이지를 서버에서 다시 그린다.
        window.location.href = '/cases'
      }
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={`${active.name} → ${next.name} 전환`}
      aria-label={`조직 전환 (현재 ${active.name})`}
      className={cn(
        'inline-flex items-center gap-1.5 h-9 pl-2.5 pr-3 rounded-md border border-border/70 bg-transparent text-foreground transition-colors hover:bg-accent disabled:opacity-50',
      )}
    >
      <Building2 size={15} className="shrink-0 text-muted-foreground" />
      <span className="max-w-[120px] truncate text-[13px] font-medium">{active.name}</span>
    </button>
  )
}
