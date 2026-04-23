'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { renderFieldValue } from '@/lib/fields'
import type { FieldSpec } from '@/lib/fields'
import { updateCaseField } from '@/lib/actions/cases'
import { CopyButton } from './copy-button'
import { useCases } from './cases-context'

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

export function AddressField({
  caseId,
  krSpec,
  enSpec,
  krRaw,
  enRaw,
  zipcode,
}: {
  caseId: string
  krSpec: FieldSpec
  enSpec: FieldSpec | undefined
  krRaw: unknown
  enRaw: unknown
  /** data.address_zipcode — shown as a separate chip next to the address.
   *  Falls back to the legacy "(XXXXX) ..." prefix embedded in krRaw. */
  zipcode: string | null
}) {
  const { updateLocalCaseField } = useCases()
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const [saving, startSave] = useTransition()
  const composingRef = useRef(false)
  const [showModal, setShowModal] = useState(false)
  const [editingKr, setEditingKr] = useState(false)
  const [editingEn, setEditingEn] = useState(false)
  const [krVal, setKrVal] = useState('')
  const [enVal, setEnVal] = useState('')
  const [detailAddr, setDetailAddr] = useState('')
  const [enError, setEnError] = useState<string | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLInputElement>(null)
  const krInputRef = useRef<HTMLInputElement>(null)
  const enInputRef = useRef<HTMLInputElement>(null)

  const krDisplay = renderFieldValue(krSpec, krRaw)
  const enDisplay = enSpec ? renderFieldValue(enSpec, enRaw) : '—'
  const krEmpty = krDisplay === '—'
  const enEmpty = enDisplay === '—'

  // Prefer explicit data.address_zipcode; fall back to the "(XXXXX) ..." prefix
  // that legacy saves baked into the address string.
  const legacyZipMatch = typeof krRaw === 'string' ? krRaw.match(/^\((\d{4,6})\)/) : null
  const zipDisplay = (zipcode && zipcode.trim()) || legacyZipMatch?.[1] || null

  useEffect(() => {
    setShowModal(false)
    setShowDetail(false)
    setEditingKr(false)
    setEditingEn(false)
  }, [caseId])

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

  // Close modal on Escape
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
    setEditingKr(false)
    setEditingEn(false)
    setShowModal(true)

    setTimeout(() => {
      if (!modalRef.current) return
      new window.daum.Postcode({
        width: '100%',
        height: '100%',
        oncomplete(data: DaumPostcodeResult) {
          const kr = data.roadAddress
          const en = data.roadAddressEnglish
          const krWithZip = data.zonecode ? `(${data.zonecode}) ${kr}` : kr
          setShowModal(false)

          // Parse English address into components for future document automation.
          // Daum's roadAddressEnglish may or may not include "Republic of Korea"
          // at the end — strip it before picking city/province so we don't end
          // up with city="Republic of Korea".
          const country = 'Republic of Korea'
          const rawParts = en.split(',').map((s: string) => s.trim()).filter(Boolean)
          const enParts = rawParts.length > 0 && /^republic of korea$/i.test(rawParts[rawParts.length - 1])
            ? rawParts.slice(0, -1)
            : rawParts
          // After stripping country: last segment = city (Seoul/Busan/...) or province
          // (Gyeonggi-do/...) for provincial addresses. Prefer a "*-si" or plain
          // city name over a "*-do" province suffix.
          const last = enParts[enParts.length - 1] ?? ''
          const secondLast = enParts[enParts.length - 2] ?? ''
          const isProvince = /-do$/i.test(last)
          const city = isProvince && secondLast ? secondLast : last
          const province = isProvince ? last : secondLast

          startSave(async () => {
            // Main addresses
            const r1 = await updateCaseField(caseId, 'data', krSpec.key, krWithZip)
            if (r1.ok) updateLocalCaseField(caseId, 'data', krSpec.key, krWithZip)
            if (enSpec && en) {
              const r2 = await updateCaseField(caseId, 'data', enSpec.key, en)
              if (r2.ok) updateLocalCaseField(caseId, 'data', enSpec.key, en)
            }
            // Address components (hidden from UI, used for document generation)
            const components: Record<string, string> = {
              address_zipcode: data.zonecode,
              address_city: city,
              address_province: province,
              address_country: country,
              address_sido: data.sido,
              address_sigungu: data.sigungu,
            }
            for (const [key, val] of Object.entries(components)) {
              if (val) {
                const r = await updateCaseField(caseId, 'data', key, val)
                if (r.ok) updateLocalCaseField(caseId, 'data', key, val)
              }
            }
          })

          setDetailAddr('')
          setShowDetail(true)
          setTimeout(() => detailRef.current?.focus(), 100)
        },
      }).embed(modalRef.current)
    }, 50)
  }

  function handleDetailSave() {
    const detail = detailAddr.trim()
    if (!detail) { setShowDetail(false); return }
    const currentKr = String(krRaw ?? '')
    const full = currentKr ? `${currentKr} ${detail}` : detail
    startSave(async () => {
      const r = await updateCaseField(caseId, 'data', krSpec.key, full)
      if (r.ok) updateLocalCaseField(caseId, 'data', krSpec.key, full)
      setShowDetail(false)
    })
  }

  function startEditKr() {
    setKrVal(String(krRaw ?? ''))
    setEditingKr(true)
    setTimeout(() => krInputRef.current?.focus(), 50)
  }
  function saveKr() {
    const v = krVal.trim() || null
    startSave(async () => {
      const r = await updateCaseField(caseId, 'data', krSpec.key, v)
      if (r.ok) updateLocalCaseField(caseId, 'data', krSpec.key, v)
      setEditingKr(false)
    })
  }
  function startEditEn() {
    setEnVal(String(enRaw ?? ''))
    setEditingEn(true)
    setTimeout(() => enInputRef.current?.focus(), 50)
  }
  function saveEn() {
    if (!enSpec) return
    const v = enVal.trim() || null
    startSave(async () => {
      const r = await updateCaseField(caseId, 'data', enSpec.key, v)
      if (r.ok) updateLocalCaseField(caseId, 'data', enSpec.key, v)
      setEditingEn(false)
    })
  }

  const inputClass =
    'flex-1 h-8 rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30'

  return (
    <>
      {/* Korean address */}
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-accent/60">
        <div className="pt-1 font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground">한국주소</div>
        <div className="flex items-center gap-sm min-w-0">
          {editingKr ? (
            <div className="flex items-center gap-sm flex-1">
              <input
                ref={krInputRef}
                type="text"
                value={krVal}
                onChange={(e) => setKrVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveKr()
                  if (e.key === 'Escape') setEditingKr(false)
                }}
                onBlur={() => setTimeout(() => setEditingKr(false), 150)}
                className={inputClass}
              />
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={saveKr} disabled={saving}
                className="shrink-0 inline-flex h-7 items-center rounded px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50">
                {saving ? '...' : '저장'}
              </button>
            </div>
          ) : (
            <div className="group/kr relative flex flex-wrap items-center gap-xs min-w-0 flex-1">
              <button type="button" onClick={krEmpty ? handleSearch : startEditKr}
                className={cn('text-left rounded-md px-2 py-1 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground transition-colors hover:bg-accent/60 cursor-text', krEmpty && 'text-muted-foreground/60')}>
                {krDisplay}
              </button>
              <button type="button" onClick={handleSearch} disabled={!scriptLoaded || saving}
                className="shrink-0 inline-flex h-7 items-center rounded px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 opacity-0 group-hover/kr:opacity-100">
                검색
              </button>
              <CopyButton value={krEmpty ? '' : krDisplay}
                className="opacity-0 group-hover/kr:opacity-100 shrink-0" />
              {zipDisplay && (
                <>
                  <span className="text-muted-foreground/30 select-none mx-2 hidden md:inline">|</span>
                  <div className="group/zip relative inline-flex items-baseline shrink-0 basis-full md:basis-auto">
                    <span className="font-sans text-[10px] uppercase tracking-[1px] text-muted-foreground mr-1">우편번호</span>
                    <span className="font-mono text-[12px] tracking-[0.5px] text-foreground">{zipDisplay}</span>
                    <CopyButton value={zipDisplay} className="ml-1 opacity-0 group-hover/zip:opacity-100" />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail address input */}
      {showDetail && (
        <div className="grid grid-cols-[140px_1fr_auto] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-accent/60">
          <div className="pt-1 font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground">상세 주소</div>
          <div className="flex items-center gap-sm">
            <input ref={detailRef} type="text" value={detailAddr} onChange={(e) => setDetailAddr(e.target.value)}
              placeholder="동/호수 입력"
              onKeyDown={(e) => { if (e.key === 'Enter') handleDetailSave(); if (e.key === 'Escape') setShowDetail(false) }}
              className={inputClass} />
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={handleDetailSave} disabled={saving}
              className="shrink-0 inline-flex h-7 items-center rounded px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50">
              {saving ? '...' : '저장'}
            </button>
          </div>
          <div />
        </div>
      )}

      {/* English address */}
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/60 transition-colors hover:bg-accent/60">
        <div className="pt-1 font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground">영문주소</div>
        <div className="min-w-0">
          {editingEn ? (
            <>
              <div className="flex items-center gap-sm">
                <input ref={enInputRef} type="text" value={enVal}
                  onChange={(e) => {
                    if (composingRef.current) { setEnVal(e.target.value); return }
                    setEnVal(e.target.value.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, ''))
                  }}
                  onCompositionStart={() => { composingRef.current = true }}
                  onCompositionEnd={(e) => {
                    composingRef.current = false
                    const raw = (e.target as HTMLInputElement).value
                    const filtered = raw.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '')
                    setEnVal(filtered)
                    if (raw !== filtered) {
                      setEnError('영문만 입력 가능합니다')
                      setTimeout(() => setEnError(null), 2000)
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEn(); if (e.key === 'Escape') setEditingEn(false) }}
                  onBlur={() => setTimeout(() => setEditingEn(false), 150)}
                  className={inputClass} />
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={saveEn} disabled={saving}
                  className="shrink-0 inline-flex h-7 items-center rounded px-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50">
                  {saving ? '...' : '저장'}
                </button>
              </div>
              {enError && <div className="mt-1 text-xs text-red-600">{enError}</div>}
            </>
          ) : (
            <div className="group/en relative w-fit">
              <button type="button" onClick={startEditEn}
                className={cn('text-left rounded-md px-2 py-1 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground transition-colors hover:bg-accent/60 cursor-text', enEmpty && 'text-muted-foreground/60')}>
                {enDisplay}
              </button>
              <CopyButton value={enEmpty ? '' : enDisplay}
                className="absolute left-full top-0.5 ml-1 z-10 opacity-0 group-hover/en:opacity-100" />
            </div>
          )}
        </div>
      </div>

      {/* Modal overlay for Daum Postcode search — rendered via portal because
          an ancestor (cases-app panel slider) uses `transform`, which would
          otherwise trap `position: fixed` inside the transformed container. */}
      {showModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowModal(false)} />
          <div className="relative bg-background rounded-lg shadow-lg overflow-hidden" style={{ width: '500px', height: '500px' }}>
            <div className="flex items-center justify-between px-md py-2 border-b border-border/50">
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
