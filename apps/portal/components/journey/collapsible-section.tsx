'use client'


import { C } from '@/lib/palette'
import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * 입력 카드의 '세부 정보' 접기 — 주필드만 항상 노출하고 보조 입력을 접는다.
 * 항공권·광견병·종합백신 등에서 공유(동일 시각: 점선 박스 + SVG 셰브런).
 *
 * defaultOpen: 보통 '이미 입력된 값이 있으면 펼침'을 호출 측에서 계산해 넘긴다
 * (빈 입력은 닫힘으로 깔끔하게, 기존 데이터는 가려지지 않게).
 *
 * 주의: defaultOpen 은 '병원 지정 약품' 같은 값이 비동기(약품 카탈로그 로딩)로 늦게
 * 도착하면 mount 이후에 false→true 로 바뀐다. useState 는 첫 렌더값만 잡으므로,
 * 그 전환을 감지해 한 번 자동으로 펼친다(사용자가 직접 접은 뒤엔 다시 강제하지 않음).
 */


export function CollapsibleSection({
  label,
  defaultOpen = false,
  children,
}: {
  label: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  // defaultOpen 이 false→true 로 바뀌는 순간(늦게 도착한 데이터)에만 1회 펼친다.
  const prevDefaultOpen = useRef(defaultOpen)
  useEffect(() => {
    if (defaultOpen && !prevDefaultOpen.current) setOpen(true)
    prevDefaultOpen.current = defaultOpen
  }, [defaultOpen])
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        // 고객앱 미리보기(읽기 전용)에서도 펼침/접힘은 동작해야 함 — globals.css 의 .pm-preview-ro 예외.
        data-preview-allow=""
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '12px 16px',
          borderRadius: 12,
          // 점선 테두리 — '+ 추가' 버튼과 같은 시각 언어로 '눌러서 펼치는 영역'임을 알린다.
          border: `1px dashed ${C.line}`,
          background: 'transparent',
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 500,
          color: C.ink2,
          cursor: 'pointer',
        }}
      >
        <span>{label}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          style={{
            color: C.ink3,
            flexShrink: 0,
            transition: 'transform .15s',
            transform: open ? 'rotate(180deg)' : 'none',
          }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  )
}
