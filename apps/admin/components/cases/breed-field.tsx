'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { persistField } from '@/lib/toast-bus'
import { CopyButton } from './copy-button'
import { useCases } from './cases-context'
import { useDetailViewSettings } from '@/components/providers/detail-view-settings-provider'
import type { CaseRow } from '@petmove/domain'
import { SectionLabel } from '@/components/ui/section-label'
import breedsData from '@petmove/domain/data/breeds.json'

interface Breed {
  ko: string
  en: string
  type: 'dog' | 'cat'
  alias?: string[]
}

const ALL_BREEDS = breedsData as Breed[]

/**
 * Searchable breed selector. Type Korean or English to filter.
 * Selecting a breed fills both breed (ko) and breed_en automatically.
 * "기타" option allows free text input.
 */
export function BreedField({ caseId, caseRow }: { caseId: string; caseRow: CaseRow }) {
  const { updateLocalCaseField } = useCases()
  const { settings: detailViewSettings } = useDetailViewSettings()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const breedKo = (data.breed as string) ?? ''
  const breedEn = (data.breed_en as string) ?? ''
  const species = (data.species as string) ?? '' // 'dog'·'cat' 또는 직접 입력한 종
  // 프리셋 품종 목록은 개/고양이만 있다. 그 외 종은 검색 대신 직접 입력만 가능.
  const isPresetSpecies = species === 'dog' || species === 'cat'

  // 직접 입력은 한·영에 같은 값이 들어가므로 병기(A | A)는 무의미 — 한 번만 표시.
  const bilingual = detailViewSettings.breed_bilingual && breedKo && breedEn && breedKo !== breedEn
  // 한영 병기 OFF 의 디폴트는 "영문만" — 영문 우선, 영문 없을 때만 한글 폴백.
  const fallback = breedEn || breedKo || ''
  const isEmpty = !bilingual && !fallback
  const copyText = bilingual ? `${breedKo} | ${breedEn}` : (isEmpty ? '' : fallback)
  const display = bilingual ? (
    <>
      <span className="text-muted-foreground">{breedKo}</span>
      <span className="text-muted-foreground/30 mx-1.5 select-none">|</span>
      <span className="italic text-foreground">{breedEn}</span>
    </>
  ) : isEmpty ? (
    <span className="inline-block min-w-[2.5rem] select-none text-muted-foreground/40" aria-hidden>—</span>
  ) : (
    fallback
  )

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  type PopupPos =
    | { left: number; top: number; width: number; maxHeight: number }
    | { left: number; bottom: number; width: number; maxHeight: number }
  const [popupPos, setPopupPos] = useState<PopupPos | null>(null)

  // Filter breeds by species and query
  const filtered = ALL_BREEDS.filter((b) => {
    if (species && b.type !== species) return false
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return b.ko.toLowerCase().includes(q) || b.en.toLowerCase().includes(q) || (b.alias ?? []).some(a => a.toLowerCase().includes(q))
  })

  // Reset on case change
  useEffect(() => {
    setOpen(false)
    setQuery('')
  }, [caseId])

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open])

  // Close on click outside — trigger(containerRef) 또는 portal 팝업(popupRef) 안쪽이면 유지.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      const t = e.target as Node
      if (containerRef.current?.contains(t)) return
      if (popupRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // 팝업 위치 측정 — fixed 로 띄워 부모 overflow:auto 클리핑 우회.
  useEffect(() => {
    if (!open) return
    function measure() {
      const trigger = containerRef.current?.querySelector('button')
      const rect = trigger?.getBoundingClientRect()
      if (!rect) return
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 288 - 8))
      const gap = 4
      const above = rect.top - 8 - gap
      const below = window.innerHeight - rect.bottom - 8 - gap
      if (below >= above) {
        setPopupPos({ left, top: rect.bottom + gap, width: 288, maxHeight: Math.max(180, below) })
      } else {
        setPopupPos({ left, bottom: window.innerHeight - rect.top + gap, width: 288, maxHeight: Math.max(180, above) })
      }
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open])

  function selectBreed(breed: Breed) {
    setOpen(false)
    setQuery('')
    // Optimistic — UI 즉시 반영.
    updateLocalCaseField(caseId, 'data', 'breed', breed.ko)
    updateLocalCaseField(caseId, 'data', 'breed_en', breed.en)
    void persistField('품종', async () => {
      const r1 = await updateCaseField(caseId, 'data', 'breed', breed.ko)
      if (!r1.ok) return r1
      return updateCaseField(caseId, 'data', 'breed_en', breed.en)
    })
  }

  // 개/고양이 프리셋에 없는 품종(다른 종·품종 미상)은 직접 입력.
  // 입력값을 breed·breed_en 양쪽에 같이 쓴다:
  //  - 이전 품종의 영문명(예: Maltese)이 남아 표시·PDF 에 계속 나오는 것 방지
  //  - PDF 는 품종을 breed_en 에서 뽑으므로, 비워두면 증명서 칸이 빈 채로 나가고
  //    발급 전 "비어 있는 정보" 경고에도 걸린다
  // 영문 증명서용이라 영문 입력이 맞지만, 한글을 넣어도 빈칸보다는 낫다.
  function selectFreeTextBreed(text: string) {
    setOpen(false)
    setQuery('')
    updateLocalCaseField(caseId, 'data', 'breed', text)
    updateLocalCaseField(caseId, 'data', 'breed_en', text)
    void persistField('품종', async () => {
      const r1 = await updateCaseField(caseId, 'data', 'breed', text)
      if (!r1.ok) return r1
      return updateCaseField(caseId, 'data', 'breed_en', text)
    })
  }

  return (
    <div data-field="breed" className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors last:border-0">
      <SectionLabel className="pt-1">
        품종
      </SectionLabel>
      <div ref={containerRef} className="relative min-w-0">
        {/* Display / trigger */}
        <div className="group/val relative w-fit">
          <button
            type="button"
            onClick={() => { setOpen(!open); setQuery('') }}
            className={cn(
              'text-left rounded-md px-2 py-1 -mx-2 font-serif text-[17px] font-medium tracking-[-0.1px] text-foreground transition-colors hover:bg-accent/60 cursor-pointer',
              isEmpty && 'text-muted-foreground/60',
            )}
          >
            {display}
          </button>
          <CopyButton
            value={copyText}
            className="absolute left-full top-0.5 ml-1 z-10 opacity-0 group-hover/val:opacity-100"
          />
        </div>

        {/* Dropdown — portal 로 띄워 overflow:auto 클리핑 우회 */}
        {open && popupPos && typeof document !== 'undefined' && createPortal(
          <div
            ref={popupRef}
            style={{
              position: 'fixed',
              left: popupPos.left,
              top: 'top' in popupPos ? popupPos.top : undefined,
              bottom: 'bottom' in popupPos ? popupPos.bottom : undefined,
              width: popupPos.width,
              maxHeight: popupPos.maxHeight,
            }}
            className="z-50 flex flex-col rounded-md border border-border/80 bg-background shadow-md overflow-hidden"
          >
            {/* Search input */}
            <div className="shrink-0 p-2 border-b border-border/30">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHighlightIdx(0) }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setOpen(false)
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1))
                    // Scroll into view
                    setTimeout(() => {
                      listRef.current?.children[Math.min(highlightIdx + 1, filtered.length - 1)]
                        ?.scrollIntoView({ block: 'nearest' })
                    }, 0)
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setHighlightIdx((i) => Math.max(i - 1, 0))
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (filtered.length > 0) selectBreed(filtered[highlightIdx])
                    else if (query.trim()) selectFreeTextBreed(query.trim())
                  }
                }}
                placeholder={isPresetSpecies ? '품종 검색 (한글/영문) — 목록에 없으면 직접 입력' : '품종 직접 입력'}
                className="w-full h-8 rounded border border-border/80 bg-background px-2 text-sm focus-visible:outline-none"
              />
            </div>
            {/* Options list */}
            <ul ref={listRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal py-1">
              {filtered.length === 0 && !query.trim() ? (
                // 개/고양이 외 종은 프리셋이 없어 항상 여기로 온다 — 필드가 죽은 것처럼
                // 보이지 않도록 직접 입력을 안내.
                <li className="px-sm py-2 text-sm text-muted-foreground">
                  {isPresetSpecies ? '검색 결과 없음' : '위에 품종을 입력하세요'}
                </li>
              ) : (
                filtered.map((b, i) => (
                  <li key={`${b.type}:${b.en}:${b.ko}`}>
                    <button
                      type="button"
                      onClick={() => selectBreed(b)}
                      className={cn(
                        'w-full text-left px-sm py-1.5 text-sm transition-colors',
                        i === highlightIdx ? 'bg-accent' : 'hover:bg-accent/60',
                      )}
                    >
                      <span>{b.ko}</span>
                      <span className="ml-2 text-muted-foreground">{b.en}</span>
                    </button>
                  </li>
                ))
              )}
              {query.trim() && (
                <li>
                  <button
                    type="button"
                    onClick={() => selectFreeTextBreed(query.trim())}
                    className="w-full text-left px-sm py-1.5 text-sm text-muted-foreground hover:bg-accent/60 transition-colors border-t border-border/40"
                  >
                    &ldquo;{query.trim()}&rdquo; 직접 입력
                  </button>
                </li>
              )}
            </ul>
          </div>,
          document.body,
        )}
      </div>
    </div>
  )
}
