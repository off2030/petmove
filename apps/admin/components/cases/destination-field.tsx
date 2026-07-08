'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Trash2, Archive } from 'lucide-react'
import { SectionLabel } from '@/components/ui/section-label'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { persistField } from '@/lib/toast-bus'
import { markJourneyCompleteAdmin } from '@/lib/actions/journey-complete'
import { useCases } from './cases-context'
import destsData from '@petmove/domain/data/destinations.json'
import { destCode } from '@/lib/country-code'
import { resolveActiveDestination, getTripType } from '@petmove/domain'
import { useSectionEditMode } from './section-edit-mode-context'
import { useConfirm } from '@petmove/ui'

interface Dest {
  ko: string
  en: string
  alias?: string[]
}

const ALL_DESTS = destsData as Dest[]

/** Parse comma-separated destination string into array */
function parseDests(raw: string | null): string[] {
  if (!raw) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

/** Join destination array back to string */
function joinDests(arr: string[]): string | null {
  return arr.length > 0 ? arr.join(', ') : null
}

type TripType = 'round' | 'one_way'

export function DestinationField({ caseId, destination }: { caseId: string; destination: string | null }) {
  const { cases, updateLocalCaseField, activeDestination, setActiveDestination } = useCases()
  const editMode = useSectionEditMode()
  const confirm = useConfirm()

  const selected = parseDests(destination)
  const multi = selected.length > 1

  // 목적지별 왕복/편도 토글 — case.data.trip_type 객체에 저장. 디폴트 round.
  const currentCase = cases.find(c => c.id === caseId)
  const tripTypeMap =
    ((currentCase?.data as Record<string, unknown> | undefined)?.trip_type as
      | Record<string, TripType>
      | undefined) ?? {}
  const targetDest = resolveActiveDestination(destination, activeDestination)
  const tripType: TripType = getTripType(currentCase?.data, targetDest)

  async function setTripType(value: TripType) {
    if (!targetDest) return
    const next: Record<string, TripType> = { ...tripTypeMap, [targetDest]: value }
    updateLocalCaseField(caseId, 'data', 'trip_type', next)
    await persistField('여정 유형', () => updateCaseField(caseId, 'data', 'trip_type', next))
  }

  // 동시 진행 — 같은 보호자의 다른 동물 케이스에 절차·추가 정보를 함께 반영. 디폴트 on.
  const coProgress =
    ((currentCase?.data as Record<string, unknown> | undefined)?.co_progress) !== false
  // 토글은 같은 보호자가 동물 ≥2 마리를 준비할 때만 노출 — 형제가 없으면 동기화할
  // 대상이 없어 무의미하다. 형제 판정 기준은 DB 트리거 cases_sync_co_progress 와 동일
  // (이메일 우선 + 이름·전화 폴백): 이메일이 양쪽에 있고 일치하거나, 이름+전화가 양쪽에
  // 있고 일치하면 형제.
  const currentEmail = String(
    (currentCase?.data as Record<string, unknown> | undefined)?.email ?? '',
  ).trim().toLowerCase()
  const currentName = (currentCase?.customer_name ?? '').trim()
  const currentPhone = String(
    (currentCase?.data as Record<string, unknown> | undefined)?.phone ?? '',
  ).replace(/\D/g, '')
  const hasSibling =
    (currentEmail !== '' || (currentName !== '' && currentPhone !== '')) &&
    cases.some((c) => {
      if (c.id === caseId) return false
      const cEmail = String((c.data as Record<string, unknown> | undefined)?.email ?? '')
        .trim()
        .toLowerCase()
      if (currentEmail !== '' && cEmail !== '' && cEmail === currentEmail) return true
      const cName = (c.customer_name ?? '').trim()
      const cPhone = String((c.data as Record<string, unknown> | undefined)?.phone ?? '').replace(
        /\D/g,
        '',
      )
      return currentName !== '' && currentPhone !== '' && cName === currentName && cPhone === currentPhone
    })
  async function setCoProgress(value: boolean) {
    updateLocalCaseField(caseId, 'data', 'co_progress', value)
    await persistField('동시 진행', () => updateCaseField(caseId, 'data', 'co_progress', value))
  }

  // Display: show English names
  const display = selected.length > 0
    ? selected.map(ko => {
        const matched = ALL_DESTS.find(d => d.ko === ko)
        return matched ? matched.en : ko
      }).join(', ')
    : '—'

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const chipRowRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  type PopupPos =
    | { left: number; top: number; maxHeight: number }
    | { left: number; bottom: number; maxHeight: number }
  const [popupPos, setPopupPos] = useState<PopupPos | null>(null)

  const filtered = ALL_DESTS.filter((d) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return d.ko.toLowerCase().includes(q) || d.en.toLowerCase().includes(q) || (d.alias ?? []).some(a => a.toLowerCase().includes(q))
  })

  useEffect(() => { setOpen(false); setQuery('') }, [caseId])
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus() }, [open])
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
  // containerRef(목적지 값 영역) 바로 아래 — 칩이 없으면 그 자리에, 칩이 있으면 칩 아래.
  useEffect(() => {
    if (!open) return
    function measure() {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 256 - 8))
      const gap = 4
      const above = rect.top - 8 - gap
      const below = window.innerHeight - rect.bottom - 8 - gap
      if (below >= above) {
        setPopupPos({ left, top: rect.bottom + gap, maxHeight: Math.max(220, below) })
      } else {
        setPopupPos({ left, bottom: window.innerHeight - rect.top + gap, maxHeight: Math.max(220, above) })
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

  async function toggleDest(dest: Dest) {
    let next: string[]
    if (selected.includes(dest.ko)) {
      next = selected.filter(s => s !== dest.ko)
    } else {
      next = [...selected, dest.ko]
    }
    const val = joinDests(next)
    // Optimistic update first
    updateLocalCaseField(caseId, 'column', 'destination', val)
    await persistField('목적지', () => updateCaseField(caseId, 'column', 'destination', val))
  }

  async function removeDest(ko: string) {
    const ok = await confirm({
      message: `목적지 "${ko}"를 삭제하시겠습니까?`,
      okLabel: '삭제',
      variant: 'destructive',
    })
    if (!ok) return
    const next = selected.filter(s => s !== ko)
    const val = joinDests(next)
    updateLocalCaseField(caseId, 'column', 'destination', val)
    await persistField('목적지', () => updateCaseField(caseId, 'column', 'destination', val))
  }

  // 스태프 수동 전환 — 완료된(혹은 다녀온) 여정을 '지난 여정'으로 보관. 삭제와 달리
  // by_dest 요약을 past_journeys 로 남기고 목적지에서 뺀다. (design journey-lifecycle §4·§5)
  async function demoteToPast(ko: string) {
    const ok = await confirm({
      message: `"${ko}" 여정을 완료해 '지난 여정'으로 보관할까요?`,
      okLabel: '지난 여정으로',
    })
    if (!ok) return
    const res = await markJourneyCompleteAdmin(caseId, ko, 'done')
    if (res.ok) {
      // 칩에서 즉시 제거(낙관적) — past_journeys 표시는 realtime 으로 갱신.
      updateLocalCaseField(caseId, 'column', 'destination', joinDests(selected.filter((s) => s !== ko)))
    }
  }

  async function reorderDests(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return
    if (fromIdx < 0 || fromIdx >= selected.length) return
    if (toIdx < 0 || toIdx >= selected.length) return
    const next = selected.slice()
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    const val = joinDests(next)
    updateLocalCaseField(caseId, 'column', 'destination', val)
    await persistField('목적지', () => updateCaseField(caseId, 'column', 'destination', val))
  }

  // 포인터 기반 드래그 재정렬 — 네이티브 HTML5 DnD 는 칩 본문 버튼이 mousedown 을
  // 가로채 시작이 안 되고 환경 편차도 커서 포인터 이벤트로 직접 구현(dnd-kit 방식).
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const dragRef = useRef<{ from: number; over: number } | null>(null)

  /** 현재 포인터 좌표 아래의 칩 인덱스 (없으면 가장 가까운 칩). */
  function chipIndexAtPoint(x: number, y: number): number | null {
    const row = chipRowRef.current
    if (!row) return null
    const els = Array.from(row.querySelectorAll<HTMLElement>('[data-dest-idx]'))
    let best: number | null = null
    let bestDist = Infinity
    for (const el of els) {
      const r = el.getBoundingClientRect()
      const i = Number(el.dataset.destIdx)
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i
      const cx = (r.left + r.right) / 2
      const cy = (r.top + r.bottom) / 2
      const d = Math.hypot(x - cx, y - cy)
      if (d < bestDist) { bestDist = d; best = i }
    }
    return best
  }

  // 칩 전체가 드래그 영역. 탭(이동<임계)=활성 목적지 전환, 드래그(이동≥임계, 편집모드)=순서 변경.
  // 전역(document) 리스너로 추적 — 리렌더(realtime 구독 등)·포인터 캡처 상실과 무관하게 끝까지
  // 따라간다. 보관/삭제 버튼 위 누름은 무시(그쪽 클릭이 처리).
  const DRAG_THRESHOLD = 5
  function onChipPointerDown(idx: number, ko: string, e: React.PointerEvent) {
    if (!multi) return
    if ((e.target as HTMLElement).closest('[data-chip-action]')) return
    const startX = e.clientX
    const startY = e.clientY
    let dragging = false
    dragRef.current = { from: idx, over: idx }

    const handleMove = (ev: PointerEvent) => {
      if (!dragRef.current) return
      if (!dragging) {
        if (!editMode) return // 읽기 모드 — 드래그 비활성(탭만)
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return
        dragging = true
        setDragIdx(idx)
      }
      ev.preventDefault()
      const over = chipIndexAtPoint(ev.clientX, ev.clientY)
      if (over !== null && over !== dragRef.current.over) {
        dragRef.current.over = over
        setOverIdx(over)
      }
    }
    const handleUp = () => {
      const st = dragRef.current
      dragRef.current = null
      document.removeEventListener('pointermove', handleMove)
      document.removeEventListener('pointerup', handleUp)
      document.removeEventListener('pointercancel', handleUp)
      setDragIdx(null)
      setOverIdx(null)
      if (dragging) {
        if (st && st.over !== st.from) void reorderDests(st.from, st.over)
      } else {
        setActiveDestination(ko) // 탭 — 활성 목적지 전환
      }
    }
    document.addEventListener('pointermove', handleMove)
    document.addEventListener('pointerup', handleUp)
    document.addEventListener('pointercancel', handleUp)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors last:border-0">
      <div className="flex items-center gap-[6px] pt-1">
        <SectionLabel
          onClick={editMode ? () => { setOpen(true); setQuery(''); setHighlightIdx(0) } : undefined}
          title={editMode ? '목적지 추가' : undefined}
        >
          목적지
        </SectionLabel>
      </div>
      <div ref={containerRef} className="relative min-w-0 flex flex-col md:flex-row items-start gap-md">
        <div className="flex-1 min-w-0">
        {selected.length > 0 ? (
          <div ref={chipRowRef} className="group/val flex items-center gap-md flex-nowrap overflow-x-auto scrollbar-minimal md:flex-wrap md:overflow-x-visible">
            {selected.map((ko, idx) => {
              const code = destCode(ko)
              const isActive = multi && (activeDestination ?? selected[0]) === ko
              const isDragOver = multi && editMode && overIdx === idx && dragIdx !== null && dragIdx !== idx
              return (
                <span
                  key={ko}
                  data-dest-idx={idx}
                  // 칩 전체가 드래그/탭 영역. 네이티브 드래그(텍스트·SVG)는 차단해 포인터 스트림 유지.
                  onPointerDown={(e) => onChipPointerDown(idx, ko, e)}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  role={multi ? 'button' : undefined}
                  tabIndex={multi ? 0 : undefined}
                  onKeyDown={
                    multi
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setActiveDestination(ko)
                          }
                        }
                      : undefined
                  }
                  title={
                    multi
                      ? editMode
                        ? '클릭하여 활성 · 드래그하여 순서 변경'
                        : '클릭하여 이 국가 항목 보기'
                      : undefined
                  }
                  className={cn(
                    'group/chip shrink-0 inline-flex items-baseline gap-1.5 rounded-full px-2.5 py-0.5 transition-all select-none',
                    'bg-pmw-tag text-pmw-tag-foreground',
                    multi && editMode && 'cursor-grab active:cursor-grabbing',
                    multi && !editMode && 'cursor-pointer',
                    multi && isActive && 'ring-1 ring-pmw-accent/45',
                    dragIdx === idx && 'opacity-30',
                    isDragOver && 'ring-2 ring-pmw-tag-foreground/50',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex items-baseline gap-1.5 transition-opacity',
                      multi && !isActive && 'opacity-55 group-hover/chip:opacity-90',
                    )}
                  >
                    {code && (
                      <span className="font-mono text-[13px] uppercase tracking-[1px] text-pmw-code">
                        {code}
                      </span>
                    )}
                    <span className="font-serif text-[15px] text-pmw-tag-foreground">
                      {ko}
                    </span>
                  </span>
                  {editMode && (
                    <>
                      <button
                        type="button"
                        data-chip-action
                        onClick={(e) => { e.stopPropagation(); demoteToPast(ko) }}
                        className="shrink-0 inline-flex items-center justify-center rounded-md p-1 text-pmw-tag-foreground/60 hover:text-pmw-accent hover:bg-pmw-accent/10 transition-colors opacity-0 group-hover/chip:opacity-70 hover:!opacity-100"
                        title="지난 여정으로 보관"
                      >
                        <Archive size={12} className="pointer-events-none" />
                      </button>
                      <button
                        type="button"
                        data-chip-action
                        onClick={(e) => { e.stopPropagation(); removeDest(ko) }}
                        className="shrink-0 inline-flex items-center justify-center rounded-md p-1 text-pmw-tag-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/chip:opacity-70 hover:!opacity-100"
                        title="목적지 삭제"
                      >
                        <Trash2 size={12} className="pointer-events-none" />
                      </button>
                    </>
                  )}
                </span>
              )
            })}
          </div>
        ) : (
          editMode ? (
            <button type="button" onClick={() => { setOpen(true); setQuery(''); setHighlightIdx(0) }}
              className="text-left rounded-md px-2 py-1 -mx-2 transition-colors hover:bg-accent/40 hover:ring-1 hover:ring-inset hover:ring-border cursor-pointer text-muted-foreground/40 select-none">
              —
            </button>
          ) : (
            <span className="text-muted-foreground/40 select-none" aria-hidden>—</span>
          )
        )}

        {open && popupPos && typeof document !== 'undefined' && createPortal(
          <div
            ref={popupRef}
            style={{
              position: 'fixed',
              left: popupPos.left,
              top: 'top' in popupPos ? popupPos.top : undefined,
              bottom: 'bottom' in popupPos ? popupPos.bottom : undefined,
              width: 256,
              maxHeight: popupPos.maxHeight,
            }}
            className="z-50 flex flex-col rounded-md border border-border/80 bg-background shadow-md overflow-hidden"
          >
            <div className="shrink-0 p-2 border-b border-border/30">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHighlightIdx(0) }}
                onKeyDown={async (e) => {
                  if (e.key === 'Escape') setOpen(false)
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setHighlightIdx(i => Math.min(i + 1, filtered.length - 1))
                    setTimeout(() => {
                      listRef.current?.children[Math.min(highlightIdx + 1, filtered.length - 1)]?.scrollIntoView({ block: 'nearest' })
                    }, 0)
                  }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)) }
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (filtered.length > 0) {
                      await toggleDest(filtered[highlightIdx])
                      setOpen(false); setQuery('')
                    }
                  }
                }}
                placeholder="국가 검색 (한글/영문)"
                className="w-full h-8 rounded border border-border/80 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
              />
            </div>
            <ul ref={listRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal py-1">
              {filtered.length === 0 ? (
                <li className="px-sm py-2 text-sm text-muted-foreground">검색 결과 없음</li>
              ) : (
                filtered.map((d, i) => {
                  const isSelected = selected.includes(d.ko)
                  return (
                    <li key={d.ko}>
                      <button
                        type="button"
                        onClick={async () => { await toggleDest(d); setOpen(false); setQuery('') }}
                        className={cn(
                          'w-full text-left px-sm py-1.5 text-sm transition-colors',
                          i === highlightIdx ? 'bg-accent' : 'hover:bg-accent/60',
                          isSelected && 'font-medium',
                        )}
                      >
                        {isSelected && <span className="mr-1">✓</span>}
                        <span>{d.ko}</span>
                        <span className="ml-2 text-muted-foreground">{d.en}</span>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>
            <div className="shrink-0 border-t border-border/30 py-1 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-sm py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                닫기
              </button>
            </div>
          </div>,
          document.body,
        )}
        </div>
        {selected.length > 0 && (targetDest || hasSibling) && (
          <div className="flex items-start gap-md">
        {targetDest && (
          <div
            className="shrink-0 inline-flex items-center rounded-full bg-pmw-tag/30 p-0.5 font-serif text-[12px] leading-none mt-0.5"
            title={multi ? `${targetDest} 여행 유형` : '여행 유형'}
          >
            <button
              type="button"
              onClick={() => setTripType('round')}
              className={cn(
                'px-2.5 py-0.5 rounded-full transition-all',
                tripType === 'round'
                  ? 'bg-pmw-tag text-pmw-tag-foreground'
                  : 'text-pmw-tag-foreground/55 hover:text-pmw-tag-foreground',
              )}
            >
              왕복
            </button>
            <button
              type="button"
              onClick={() => setTripType('one_way')}
              className={cn(
                'px-2.5 py-0.5 rounded-full transition-all',
                tripType === 'one_way'
                  ? 'bg-pmw-tag text-pmw-tag-foreground'
                  : 'text-pmw-tag-foreground/55 hover:text-pmw-tag-foreground',
              )}
            >
              편도
            </button>
          </div>
        )}
        {hasSibling && (
          <div
            className="shrink-0 inline-flex items-center gap-1.5 font-serif text-[12px] mt-0.5"
            title={
              coProgress
                ? '동시 진행 켜짐 — 같은 보호자의 다른 동물에도 절차·추가 정보가 함께 입력됩니다'
                : '동시 진행 꺼짐 — 이 동물만 따로 입력됩니다'
            }
          >
            <span className="text-muted-foreground">동시 진행</span>
            <button
              type="button"
              onClick={() => setCoProgress(!coProgress)}
              aria-pressed={coProgress}
              className={cn(
                'inline-flex h-5 w-9 items-center rounded-full transition-colors',
                coProgress ? 'bg-pmw-accent' : 'bg-muted-foreground/30',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-background shadow-sm transition-transform',
                  coProgress ? 'translate-x-4' : 'translate-x-0.5',
                )}
              />
            </button>
          </div>
        )}
          </div>
        )}
      </div>
    </div>
  )
}
