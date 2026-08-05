'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Building2, Loader2 } from 'lucide-react'
import { switchActiveOrg } from '@/lib/actions/super-admin'
import { cn } from '@/lib/utils'

/**
 * 상단바 조직 스위처 (super_admin 전용). 다크모드 토글처럼 아이콘 한 번 클릭으로
 * 다음 조직으로 전환(조직 2개면 로잔 ⇄ 펫무브 토글). 드롭다운 없음.
 * 기존 "설정 → 운영 → 조직관리 → 임시보기" 경로 대체. 클릭 시 서버가 impersonation
 * 쿠키를 세팅/해제하고, 케이스 목록을 SSR 재호출하기 위해 hard reload 한다.
 *
 * 전환 중에는 전체 화면 오버레이("OO(으)로 전환 중")를 띄운다 — 서버액션 + hard
 * reload 로 수 초가 걸리는데, 화면이 멈춘 채면 무겁게 느껴지고 재클릭도 유발한다
 * (2026-08-05 속도 개선 A). 오버레이는 새 문서가 로드되면서 자연히 사라진다.
 */

/** 받침 유무에 따라 '으로/로' — 한글이 아니면 '로'. */
function roParticle(word: string): string {
  const last = word.charCodeAt(word.length - 1)
  if (last < 0xac00 || last > 0xd7a3) return '로'
  return (last - 0xac00) % 28 > 0 ? '으로' : '로'
}

export function OrgSwitcher({
  orgs,
  activeOrgId,
}: {
  orgs: { id: string; name: string }[]
  activeOrgId: string | null
}) {
  const [pending, startTransition] = useTransition()
  // pending(액션 왕복)과 별개로, reload 가 시작된 뒤에도 오버레이를 유지하기 위한 플래그.
  const [switching, setSwitching] = useState<string | null>(null)

  // 조직이 하나뿐이면 전환할 게 없어 숨김.
  if (orgs.length < 2) return null

  const activeIdx = orgs.findIndex((o) => o.id === activeOrgId)
  const active = orgs[activeIdx] ?? orgs[0]
  // 다음 조직(마지막이면 처음으로 순환). 2개면 반대편 = 토글.
  const next = orgs[((activeIdx < 0 ? 0 : activeIdx) + 1) % orgs.length]

  function toggle() {
    setSwitching(next.name)
    startTransition(async () => {
      const r = await switchActiveOrg(next.id)
      if (r.ok) {
        // hard reload — 조직 전환은 SSR 데이터(케이스 목록·설정) 전체가 바뀌므로
        // 케이스 페이지를 서버에서 다시 그린다. 오버레이는 새 문서 로드로 사라진다.
        window.location.href = '/cases'
      } else {
        setSwitching(null)
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={pending || switching !== null}
        title={`${active.name} → ${next.name} 전환`}
        aria-label={`조직 전환 (현재 ${active.name})`}
        className={cn(
          'inline-flex items-center gap-1.5 h-9 pl-2.5 pr-3 rounded-md border border-border/70 bg-transparent text-foreground transition-colors hover:bg-accent disabled:opacity-50',
        )}
      >
        <Building2 size={15} className="shrink-0 text-muted-foreground" />
        <span className="max-w-[120px] truncate text-[13px] font-medium">{active.name}</span>
      </button>
      {switching !== null &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-3 bg-background/85 backdrop-blur-sm"
          >
            <Loader2 size={22} className="animate-spin text-muted-foreground" />
            <div className="text-[14px] font-medium text-foreground">
              {switching}
              {roParticle(switching)} 전환 중…
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
