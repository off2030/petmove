'use client'

import { useEffect, useRef, useState } from 'react'
import { OtherCasesRow } from '@/components/cases/other-cases-row'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { pageTitle } from '@/lib/tokens'

type Tab = 'journey' | 'docs'

/**
 * 일정/서류 페이지 공통 헤더.
 *
 * 레이아웃:
 *  - 한 줄에 들어가면: [이름] [route] ─────── [OtherCasesRow]  (우측 정렬)
 *  - 안 들어가면 (wrap):  [OtherCasesRow]
 *                          [이름] [route]            (column, 스위처 위로)
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
  petNameEn,
  ink3,
}: {
  caseId: string
  tab: Tab
  petName: string
  /** 로마자 표기 — 여권식 병기(일정 탭). admin 생성 케이스는 null 가능 → 이름 단독. */
  petNameEn?: string | null
  ink3: string
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
  }, [petName, cases.length])

  // 좌측 장식 아바타(36px)는 제거 — 다마리에선 우측 스위처의 활성 아바타와 중복,
  // 한 마리에선 히어로 사진 카드가 화면의 얼굴 역할.
  // 제목 = 여권식 병기 "이름 · NAME"(한글 크게 + 로마자 소문자 캡션) — 두 탭 동일
  // (2026-07-12 사용자 확정: 서류도 준비와 같은 헤더). 영문 없으면 이름 단독.
  // 서류 탭엔 여행지 표시 없음(사용자 확정) — 여행지 전환은 준비 탭 히어로 칩이 담당,
  // 하단 탭 이동 시 ?dest 가 케이스별로 유지돼 서류 탭이 따라간다(bottom-nav).
  const nameEn = petNameEn?.trim() || null
  const leftGroup = (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 12,
          flexWrap: 'wrap',
          minWidth: 0,
        }}
      >
        <h1 style={pageTitle}>{petName}</h1>
        {nameEn && (
          <span
            aria-hidden
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: ink3,
            }}
          >
            {nameEn}
          </span>
        )}
      </div>
    </>
  )

  return (
    // 위 공백 없음 — 상단 바→제목 간격은 페이지 컨테이너의 PAGE_TOP(32) 하나가 담당.
    <div style={{ position: 'relative' }}>
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
            alignItems: 'center',
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
            alignItems: 'center',
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
