'use client'

import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeftRight, Loader2 } from 'lucide-react'
import { switchActiveOrg } from '@/lib/actions/super-admin'
import { cn } from '@/lib/utils'

/**
 * 상단바 조직 스위처 (super_admin 전용). 다크모드 토글처럼 아이콘 한 번 클릭으로
 * 다음 조직으로 전환(조직 2개면 로잔 ⇄ 펫무브 토글). 드롭다운 없음.
 * 기존 "설정 → 운영 → 조직관리 → 임시보기" 경로 대체.
 *
 * 전환 방식(2026-08-05 속도 개선 D): hard reload 를 버리고 soft navigation.
 * 측정 결과 서버 몫은 0.4초(액션 0.1 + 레이아웃 fetch 0.3)뿐이고 체감 수 초는
 * JS 재다운로드·파싱·전체 하이드레이션(앱 재부팅) 비용이었다([layout-timing] 로그).
 *  - 액션이 impersonation 쿠키 교체 + revalidatePath('/', 'layout') → 서버 액션의
 *    revalidatePath 는 클라이언트 라우터 캐시(staleTimes 30분 포함)도 무효화한다.
 *  - router.push('/cases')(이미 /cases 면 refresh)로 새 RSC 페이로드만 받아온다.
 *  - 레이아웃의 key={orgId} 가 대시보드 클라이언트 트리를 리마운트해 이전 조직
 *    상태를 전부 버린다 — 정확성은 hard reload 와 동일, 앱 재부팅 비용만 제거.
 *
 * 전환 중에는 전체 화면 오버레이("OO(으)로 전환 중")를 띄운다(개선 A). 오버레이는
 * 새 orgId 로 트리가 리마운트되면서(스위처도 새로 마운트) 자연히 사라진다.
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
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  // 액션 왕복 + RSC 페이로드 수신 동안 오버레이 유지. 리마운트(key 교체)로 자연 소멸.
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
        // soft navigation — 액션의 revalidatePath 가 라우터 캐시를 비웠으므로
        // push/refresh 가 새 조직의 RSC 페이로드를 받아오고, 레이아웃 key={orgId}
        // 리마운트가 이전 조직 클라이언트 상태를 정리한다.
        if (pathname === '/cases') router.refresh()
        else router.push('/cases')
      } else {
        setSwitching(null)
      }
    })
  }

  return (
    <>
      {/* 아이콘 단독(⇄) — 상단바 아이콘 버튼(스킨 피커 등)과 동일 문법. 현재/다음
          조직은 툴팁(title)으로 안내 (2026-08-05 사용자 확정 ①안). */}
      <button
        type="button"
        onClick={toggle}
        disabled={pending || switching !== null}
        title={`${active.name} → ${next.name} 전환`}
        aria-label={`조직 전환 (현재 ${active.name})`}
        className={cn(
          'h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50',
        )}
      >
        <ArrowLeftRight size={18} />
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
