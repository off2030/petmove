'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { BottomSheet } from '@/components/fields/bottom-sheet'
import { OtherCasesRow } from '@/components/cases/other-cases-row'
import { PetAvatar } from '@/components/cases/pet-avatar'
import { PetAvatarDisplay } from '@/components/me/pet-avatar-display'
import { useCases } from '@/components/portal-shell/case-data-provider'

type Tab = 'journey' | 'docs'

/**
 * 일정/서류 페이지 공통 헤더.
 *
 * 레이아웃:
 *  - 한 줄에 들어가면: [PetAvatar 36] [이름] [route] ─────── [OtherCasesRow]  (우측 정렬)
 *  - 안 들어가면 (wrap):  [OtherCasesRow]
 *                          [PetAvatar 36] [이름] [route]            (column, 아바타 위로)
 *
 * 감지 방법: 보이지 않는 probe DOM 한 벌을 항상 row+flexWrap 으로 두고, probe 안
 * 두 자식(좌측 그룹 / OtherCasesRow) 의 offsetTop 을 비교한다. wrap 됐으면 둘째
 * 자식의 offsetTop 이 첫째보다 크다. ResizeObserver 로 폭/콘텐츠 변화 시 재측정.
 *
 * 실제 표시 DOM 은 측정 결과(wrapped) 에 따라 row/column 으로 분기 — probe 와
 * 분리돼 있어 wrapped 토글이 측정에 영향을 주지 않음 (= 무한 루프 없음).
 */
export function CaseHeader({
  caseId,
  tab,
  petName,
  fromCity,
  toCity,
  tripType,
  ink,
  ink2,
  ink3,
  serif,
}: {
  caseId: string
  tab: Tab
  petName: string
  fromCity: string
  toCity: string
  tripType: string
  ink: string
  ink2: string
  ink3: string
  serif: React.CSSProperties
}) {
  const { cases } = useCases()
  const router = useRouter()
  const searchParams = useSearchParams()
  const caseIndex = cases.findIndex((c) => c.id === caseId)
  const case_ = caseIndex >= 0 ? cases[caseIndex] : null
  const probeRef = useRef<HTMLDivElement>(null)
  const [wrapped, setWrapped] = useState(false)
  const [destSheetOpen, setDestSheetOpen] = useState(false)

  // 목적지 토큰 — 2개 이상이면 라우트(예: 한국 ⇄ 일본)를 눌러 활성 목적지를 전환한다.
  // (목적지 추가/삭제·왕복편도는 동물 상세의 DestinationChips 전용 — 여기선 '전환'만.)
  const tokens = (case_?.destination ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  const multiDest = tokens.length > 1
  const activeDest = searchParams.get('dest') ?? tokens[0] ?? ''
  const tripTypeRaw = (case_?.data as Record<string, unknown> | null | undefined)?.trip_type
  const tripTypeByDest =
    tripTypeRaw && typeof tripTypeRaw === 'object' && !Array.isArray(tripTypeRaw)
      ? (tripTypeRaw as Record<string, 'round' | 'one_way'>)
      : {}

  function selectDest(dest: string) {
    setDestSheetOpen(false)
    const params = new URLSearchParams(searchParams.toString())
    params.set('dest', dest)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  useEffect(() => {
    const el = probeRef.current
    if (!el) return

    const measure = () => {
      const children = Array.from(el.children) as HTMLElement[]
      if (children.length < 2) {
        setWrapped(false)
        return
      }
      const firstTop = children[0].offsetTop
      const lastTop = children[children.length - 1].offsetTop
      setWrapped(lastTop > firstTop + 5)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [petName, fromCity, toCity, tripType, cases.length, tokens.length])

  const routeContent = (
    <>
      <span>{fromCity}</span>
      <span style={{ color: ink3 }}>{tripType === 'round' ? '⇄' : '→'}</span>
      <span>{toCity}</span>
      {multiDest && (
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke={ink3}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          style={{
            flexShrink: 0,
            marginLeft: 1,
            transform: destSheetOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform .18s',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      )}
    </>
  )

  // 라우트(출발 ⇄ 목적지). 목적지 2개 이상이면 버튼(꺾쇠 + 바텀시트), 1개면 평문.
  const routeEl = multiDest ? (
    <button
      type="button"
      onClick={() => setDestSheetOpen(true)}
      aria-haspopup="dialog"
      aria-expanded={destSheetOpen}
      aria-label="목적지 전환"
      style={{
        fontSize: 12,
        color: ink2,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        transform: 'translateY(-2px)',
        background: 'transparent',
        border: 'none',
        padding: 0,
        margin: 0,
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
    >
      {routeContent}
    </button>
  ) : (
    <div
      style={{
        fontSize: 12,
        color: ink2,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        transform: 'translateY(-2px)',
      }}
    >
      {routeContent}
    </div>
  )

  const leftGroup = (
    <>
      <span style={{ alignSelf: 'center' }}>
        {case_ ? (
          <PetAvatarDisplay case_={case_} index={caseIndex} size={36} />
        ) : (
          <PetAvatar size={36} />
        )}
      </span>
      <h1 style={{ ...serif, fontSize: 28, lineHeight: 1.12, margin: 0, color: ink }}>
        {petName}
      </h1>
      {routeEl}
    </>
  )

  return (
    <div style={{ position: 'relative', paddingTop: 8 }}>
      {/* 측정 probe — 항상 row + wrap. 시각/이벤트 차단. */}
      <div
        ref={probeRef}
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          visibility: 'hidden',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 12,
            flexWrap: 'wrap',
            minWidth: 0,
          }}
        >
          {leftGroup}
        </div>
        <OtherCasesRow currentCaseId={caseId} tab={tab} />
      </div>

      {/* 실제 표시 */}
      <div
        style={{
          display: 'flex',
          flexDirection: wrapped ? 'column' : 'row',
          alignItems: wrapped ? 'flex-start' : 'center',
          gap: wrapped ? 16 : 12,
        }}
      >
        {wrapped && <OtherCasesRow currentCaseId={caseId} tab={tab} />}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 12,
            flexWrap: 'wrap',
            flex: wrapped ? undefined : 1,
            width: wrapped ? '100%' : undefined,
            minWidth: 0,
          }}
        >
          {leftGroup}
        </div>
        {!wrapped && <OtherCasesRow currentCaseId={caseId} tab={tab} />}
      </div>
      {multiDest && (
        <BottomSheet
          open={destSheetOpen}
          onClose={() => setDestSheetOpen(false)}
          title="목적지"
        >
          <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 4 }}>
            {tokens.map((t) => {
              const isActive = t === activeDest
              const arrow = (tripTypeByDest[t] ?? 'round') === 'round' ? '⇄' : '→'
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => selectDest(t)}
                  aria-pressed={isActive}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    width: '100%',
                    padding: '15px 0',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '.5px solid var(--pm-line)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 16,
                      color: isActive ? ink : ink2,
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    <span>{fromCity}</span>
                    <span style={{ color: ink3 }}>{arrow}</span>
                    <span>{t}</span>
                  </span>
                  {isActive && (
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={ink}
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      style={{ flexShrink: 0 }}
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        </BottomSheet>
      )}
    </div>
  )
}
