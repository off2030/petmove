'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { SETTINGS_ACTION_BUTTON_CLASS } from './settings-layout'

declare global {
  interface Window {
    daum: {
      Postcode: new (opts: {
        oncomplete: (data: DaumPostcodeResult) => void
        width?: string
        height?: string
      }) => { embed: (el: HTMLElement) => void }
    }
  }
}

interface DaumPostcodeResult {
  roadAddress: string
  roadAddressEnglish: string
  jibunAddress: string
  zonecode: string
  buildingName: string
  apartment: string
  sido: string
  sigungu: string
  bname: string
  roadname: string
}

export interface CompanyAddressResult {
  /** 한국주소 — "(우편번호) 도로명주소" 형식 */
  address_ko: string
  /** 영문주소 — Daum 의 roadAddressEnglish 그대로 */
  address_en: string
  /** 우편번호만 분리 */
  postal_code: string
}

/**
 * 설정 > 회사 정보 의 주소 검색 버튼.
 * Daum Postcode 모달을 띄우고 결과를 onSelected 로 콜백.
 * 호출자는 콜백에서 한 번에 address_ko/address_en/postal_code 업데이트.
 *
 * 케이스 상세의 AddressField 와 검색 UX 동일 — 모달, 자동 입력 흐름 일치.
 * 주소 분해(city/province 등) 는 케이스용이라 여기선 생략 — 회사 주소는 PDF 매핑이
 * vet:address_en / vet:postal_code 만 쓰므로 분리 컴포넌트 불필요.
 */
export function CompanyAddressSearch({
  onSelected,
  disabled,
  className,
}: {
  onSelected: (result: CompanyAddressResult) => void
  disabled?: boolean
  className?: string
}) {
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.daum?.Postcode) {
      setScriptLoaded(true)
      return
    }
    const script = document.createElement('script')
    script.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
    script.async = true
    script.onload = () => setScriptLoaded(true)
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!showModal) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowModal(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showModal])

  function handleSearch() {
    if (!scriptLoaded || !window.daum?.Postcode) return
    setShowModal(true)
    setTimeout(() => {
      if (!modalRef.current) return
      new window.daum.Postcode({
        width: '100%',
        height: '100%',
        oncomplete(data: DaumPostcodeResult) {
          setShowModal(false)
          // 한국주소에는 (zonecode) prefix 안 붙임 — 우편번호는 별도 필드로 저장.
          onSelected({
            address_ko: data.roadAddress,
            address_en: data.roadAddressEnglish ?? '',
            postal_code: data.zonecode ?? '',
          })
        },
      }).embed(modalRef.current)
    }, 50)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleSearch}
        disabled={!scriptLoaded || disabled}
        className={cn(
          SETTINGS_ACTION_BUTTON_CLASS,
          'shrink-0 border-pmw-accent bg-pmw-accent/15 text-pmw-accent-strong hover:bg-pmw-accent/25 hover:border-pmw-accent',
          className,
        )}
      >
        주소검색
      </button>
      {showModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowModal(false)} />
          <div className="relative bg-background rounded-lg shadow-lg overflow-hidden" style={{ width: '500px', height: '500px' }}>
            <div className="flex items-center justify-between px-md py-2 border-b border-border/80">
              <span className="text-sm font-medium">주소 검색</span>
              <button type="button" onClick={() => setShowModal(false)}
                className="text-sm text-muted-foreground hover:text-foreground">
                닫기
              </button>
            </div>
            <div ref={modalRef} style={{ height: 'calc(100% - 41px)' }} />
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
