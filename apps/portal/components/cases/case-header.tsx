'use client'

import { useEffect, useRef, useState } from 'react'
import { OtherCasesRow } from '@/components/cases/other-cases-row'
import { PetAvatar } from '@/components/cases/pet-avatar'
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
  const probeRef = useRef<HTMLDivElement>(null)
  const [wrapped, setWrapped] = useState(false)

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
  }, [petName, fromCity, toCity, tripType, cases.length])

  const leftGroup = (
    <>
      <span style={{ alignSelf: 'center' }}>
        <PetAvatar size={36} />
      </span>
      <h1 style={{ ...serif, fontSize: 28, lineHeight: 1.12, margin: 0, color: ink }}>
        {petName}
      </h1>
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
        <span>{fromCity}</span>
        <span style={{ color: ink3 }}>{tripType === 'round' ? '⇄' : '→'}</span>
        <span>{toCity}</span>
      </div>
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
    </div>
  )
}
