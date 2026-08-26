'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DialogFooter } from '@/components/ui/dialog-footer'
import {
  SETTINGS_BOXED_INPUT_CLASS,
  SettingsAddButton,
  SettingsCard,
  SettingsChip,
  SettingsControlGroup,
} from './settings-layout'
import { saveDestinationOverridesAction } from '@/lib/actions/destination-overrides-action'
import { useDestinationOverrides } from '@/components/providers/destination-overrides-provider'
import {
  ALL_VACCINE_KEYS,
  ALL_EXTRA_FIELD_KEYS,
  VACCINE_KEY_LABELS,
  EXTRA_FIELD_KEY_LABELS,
  DEFAULT_VACCINE_KEYS,
  getHardcodedDestinationsAsCustom,
  isDestinationEqualToDefault,
  isSameAsHardcodedDestination,
  isValidDestinationId,
  suggestDestinationId,
  type CustomDestination,
  type DestinationVaccineEntry,
  type DestinationExtraFieldEntry,
  type SpeciesFilter,
} from '@petmove/domain'

type SpeciesTab = 'dog' | 'cat'

/**
 * 여행지별 표시정보 — 상세뷰 탭 안에 임베드되는 섹션.
 * 디폴트(코드) + 커스텀 여행지를 한 리스트로 보여주고, 클릭 시 모달로 편집.
 * 강아지/고양이 탭으로 절차정보 + 추가정보 항목을 종별로 설정.
 */
export function DestinationsArea() {
  const { config, setConfig } = useDestinationOverrides()

  const buildInitial = useMemo(() => {
    return () => {
      const hardcoded = getHardcodedDestinationsAsCustom()
      const customIds = new Set(config.custom.map((c) => c.id))
      const fromHardcoded = hardcoded.filter((h) => !customIds.has(h.id))
      return [...config.custom, ...fromHardcoded]
    }
  }, [config])

  const [list, setList] = useState<CustomDestination[]>(buildInitial)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  /** 검색에서 고른, 아직 목록에 없는 여행지 — 편집 모달의 시작값. */
  const [pendingNew, setPendingNew] = useState<CustomDestination | null>(null)
  const [saving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    setList(buildInitial())
  }, [config, buildInitial])

  const editingValue = editingId
    ? list.find((d) => d.id === editingId) ?? null
    : null

  function persist(next: CustomDestination[]) {
    setList(next)
    setError(null)
    startSaving(async () => {
      // 검증
      for (const d of next) {
        if (!d.name.trim()) { setError('표시명이 비어있는 여행지가 있습니다'); return }
        if (!isValidDestinationId(d.id)) { setError(`'${d.name}' ID 형식이 잘못됨`); return }
        if (d.keywords.length === 0) { setError(`'${d.name}' 키워드를 1개 이상 입력`); return }
      }
      const ids = new Set<string>()
      for (const d of next) {
        if (ids.has(d.id)) { setError(`중복된 ID: '${d.id}'`); return }
        ids.add(d.id)
      }
      // 손대지 않은(코드와 동일한) 여행지는 저장하지 않는다 — 저장하면 그 여행지가 조직
      // 설정에 얼어붙어, 이후 코드 프로파일에 추가되는 필드가 영영 안 보인다.
      // (isSameAsHardcodedDestination 주석의 2026-08-24 '출발일' 사고 참조.)
      const toSave = next.filter((d) => !isSameAsHardcodedDestination(d))
      const r = await saveDestinationOverridesAction({ custom: toSave })
      if (!r.ok) { setError(r.error); return }
      setConfig(r.config)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
    })
  }

  function handleSaveOne(updated: CustomDestination) {
    const next = list.some((d) => d.id === updated.id)
      ? list.map((d) => (d.id === updated.id ? updated : d))
      : [updated, ...list]
    persist(next)
    setEditingId(null)
    setAdding(false)
    setPendingNew(null)
  }

  function handleDeleteOne(id: string) {
    persist(list.filter((d) => d.id !== id))
    setEditingId(null)
  }

  return (
    <SettingsCard
      title="여행지별 표시 항목"
      description="여행지에 따라 표시할 절차정보·추가정보 항목을 설정합니다."
    >
      {/* 여행지 칩 나열 폐기(2026-08-06 사용자 지시) — 이름만 늘어놓을 뿐 정보가 없었다.
          검색으로 여행지를 골라 바로 편집 모달로 들어간다. */}
      <DestinationSearchPicker
        list={list}
        disabled={saving}
        onPick={(d) => setEditingId(d.id)}
        onPickNew={(d) => { setPendingNew(d); setAdding(true) }}
      />

      <div className="flex items-center gap-md min-h-[20px] mt-2">
        {saving && <span className="text-sm text-muted-foreground">저장 중...</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
        {!saving && !error && savedFlash && <span className="text-sm text-pmw-positive">저장됨 ✓</span>}
      </div>

      {/* Edit existing */}
      {editingValue && (
        <DestinationEditModal
          initial={editingValue}
          existingIds={list.map((d) => d.id).filter((id) => id !== editingValue.id)}
          onSave={handleSaveOne}
          onClose={() => setEditingId(null)}
          onDelete={() => handleDeleteOne(editingValue.id)}
        />
      )}

      {/* 검색에서 새 여행지를 고른 경우 — 이미 이름·키워드가 정해져 있어 모달 내부 검색 단계를
          건너뛰고 바로 항목 편집으로 들어간다. */}
      {adding && pendingNew && (
        <DestinationEditModal
          initial={pendingNew}
          existingIds={list.map((d) => d.id)}
          onSave={handleSaveOne}
          onClose={() => { setAdding(false); setPendingNew(null) }}
        />
      )}
    </SettingsCard>
  )
}

/* ── 여행지 검색 — 고르면 그 여행지의 표시 항목 편집으로 진입 ── */

function DestinationSearchPicker({
  list,
  disabled,
  onPick,
  onPickNew,
}: {
  list: CustomDestination[]
  disabled?: boolean
  /** 이미 목록에 있는 여행지 — 그대로 편집. */
  onPick: (d: CustomDestination) => void
  /** 목록에 없는 내장 여행지 — 편집 모달의 시작값으로 넘긴다. */
  onPickNew: (d: CustomDestination) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // 후보 = 저장된 목록 + 아직 손대지 않은 내장 여행지. 이름·키워드·id 로 검색.
  const options = useMemo(() => {
    const byId = new Map(list.map((d) => [d.id, d]))
    const merged = [...list]
    for (const h of getHardcodedDestinationsAsCustom()) {
      if (!byId.has(h.id)) merged.push(h)
    }
    const q = query.trim().toLowerCase()
    return merged
      .filter((d) => {
        if (!q) return true
        return (
          d.name.toLowerCase().includes(q) ||
          d.keywords.some((kw) => kw.toLowerCase().includes(q)) ||
          d.id.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .slice(0, 40)
  }, [list, query])

  const existingIds = useMemo(() => new Set(list.map((d) => d.id)), [list])

  function pick(d: CustomDestination) {
    setOpen(false)
    setQuery('')
    if (existingIds.has(d.id)) onPick(d)
    else onPickNew(d)
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        disabled={disabled}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && options[0]) { e.preventDefault(); pick(options[0]) }
          if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
        }}
        placeholder="여행지 검색 (예: 일본, japan)"
        aria-label="여행지 검색"
        className={SETTINGS_BOXED_INPUT_CLASS}
      />
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-30 max-h-72 overflow-auto rounded-md border border-border/80 bg-popover py-1 shadow-md scrollbar-minimal"
        >
          {options.length === 0 ? (
            <li className="px-md py-2 font-serif text-[13px] text-muted-foreground">
              일치하는 여행지가 없습니다
            </li>
          ) : (
            options.map((d) => {
              const customized = existingIds.has(d.id) && !isDestinationEqualToDefault(d)
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); pick(d) }}
                    className="w-full text-left px-md py-1.5 flex items-baseline gap-2 hover:bg-accent/60 transition-colors"
                  >
                    <span className="font-serif text-[14px] text-foreground">{d.name}</span>
                    {customized && (
                      <span className="font-mono text-[10px] uppercase tracking-[1px] text-muted-foreground/70">
                        설정됨
                      </span>
                    )}
                    <span className="ml-auto font-mono text-[11px] text-muted-foreground/60 truncate max-w-[45%]">
                      {d.keywords.filter((k) => k !== d.name).join(', ')}
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}

/* ── Edit modal ────────────────────────────────────────────────────────── */

function DestinationEditModal({
  initial,
  existingIds,
  onSave,
  onClose,
  onDelete,
}: {
  initial: CustomDestination
  existingIds: string[]
  onSave: (next: CustomDestination) => void
  onClose: () => void
  onDelete?: () => void
}) {
  const [draft, setDraft] = useState<CustomDestination>(initial)
  const [tab, setTab] = useState<SpeciesTab>('dog')
  const [error, setError] = useState<string | null>(null)
  // 여행지 선택은 카드의 검색이 끝낸다 — 모달은 항목 편집 전용(2026-08-06).
  // 이름 수정(쉼표로 매칭 키워드 추가)은 제목 클릭으로 계속 가능.
  const [editingTitle, setEditingTitle] = useState<boolean>(!initial.name)
  const titleInitial = [initial.name, ...initial.keywords.filter((k) => k !== initial.name)]
    .filter(Boolean)
    .join(', ')

  function handleTitleCommit(input: string) {
    const tokens = input.split(',').map((s) => s.trim()).filter(Boolean)
    if (tokens.length === 0) {
      setEditingTitle(false)
      return
    }
    const dedup = Array.from(new Set(tokens))
    const name = dedup[0]
    setDraft({
      ...draft,
      name,
      keywords: dedup,
      id:
        /^custom_\d+(_\d+)?$/.test(draft.id)
          ? suggestDestinationId(name) || draft.id
          : draft.id,
    })
    setEditingTitle(false)
  }

  // Compute species sets from current draft
  const dogVaccineSet = new Set(
    draft.vaccines.filter((v) => !v.species || v.species === 'dog').map((v) => v.key),
  )
  const catVaccineSet = new Set(
    draft.vaccines.filter((v) => !v.species || v.species === 'cat').map((v) => v.key),
  )
  // 추가정보 — 사용자 커스텀 순서를 보존하기 위해 array 로 유지 (Set 으로 변환하지 않음).
  const tabExtraKeys = (draft.extraFields ?? [])
    .filter((e) => !e.species || e.species === tab)
    .map((e) => e.key)

  function reconstructVaccines(dogSet: Set<string>, catSet: Set<string>): DestinationVaccineEntry[] {
    // 디폴트 항목(광견병+항체검사)은 항상 보존, species 필터 없이.
    return ALL_VACCINE_KEYS
      .filter((k) => DEFAULT_VACCINE_KEYS.includes(k) || dogSet.has(k) || catSet.has(k))
      .map((k) => {
        if (DEFAULT_VACCINE_KEYS.includes(k)) return { key: k }
        const inDog = dogSet.has(k)
        const inCat = catSet.has(k)
        if (inDog && inCat) return { key: k }
        return { key: k, species: inDog ? 'dog' : 'cat' }
      })
  }

  function toggleVaccine(key: string) {
    const dogSet = new Set(dogVaccineSet)
    const catSet = new Set(catVaccineSet)
    const target = tab === 'dog' ? dogSet : catSet
    if (target.has(key)) target.delete(key)
    else target.add(key)
    setDraft({ ...draft, vaccines: reconstructVaccines(dogSet, catSet) })
  }

  /**
   * 추가정보 토글 — 사용자 커스텀 순서 보존.
   * 기존 항목 in-place 수정/삭제, 신규는 마스터 순서(EXTRA_FIELD_DEFS) 의 자연스러운 위치에 삽입.
   */
  function toggleExtra(key: string) {
    const list = [...(draft.extraFields ?? [])]
    const idx = list.findIndex((e) => e.key === key)
    const opp: SpeciesFilter = tab === 'dog' ? 'cat' : 'dog'

    if (idx >= 0) {
      const cur = list[idx]
      const inThisTab = !cur.species || cur.species === tab
      if (inThisTab) {
        // 현재 탭에서 제거.
        if (cur.species) list.splice(idx, 1) // 단일 종이었으면 완전 삭제.
        else list[idx] = { ...cur, species: opp } // 양종 → 반대 종으로.
      } else {
        // 반대 탭에만 있던 항목 → 양종으로 확장.
        list[idx] = { key: cur.key }
      }
    } else {
      // 신규 추가 — 마스터 순서 기준 적절한 자리에 삽입 (사용자 기존 순서는 보존).
      const newIdx = ALL_EXTRA_FIELD_KEYS.indexOf(key)
      let insertAt = list.length
      for (let i = 0; i < list.length; i++) {
        if (ALL_EXTRA_FIELD_KEYS.indexOf(list[i].key) > newIdx) { insertAt = i; break }
      }
      list.splice(insertAt, 0, { key, species: tab as SpeciesFilter })
    }

    const out = { ...draft }
    if (list.length > 0) out.extraFields = list
    else delete out.extraFields
    setDraft(out)
  }

  /** 드래그 재정렬 — 현재 탭에서 보이는 항목들의 새 순서를 받아 전체 배열에 반영. */
  function reorderExtras(visibleKeysInNewOrder: string[]) {
    const list = draft.extraFields ?? []
    const result: DestinationExtraFieldEntry[] = []
    let visibleIdx = 0
    for (const e of list) {
      const isVisible = !e.species || e.species === tab
      if (isVisible) {
        const newKey = visibleKeysInNewOrder[visibleIdx++]
        const matched = list.find((x) => x.key === newKey)
        if (matched) result.push(matched)
      } else {
        result.push(e)
      }
    }
    setDraft({ ...draft, extraFields: result })
  }

  function handleSave() {
    setError(null)
    if (!draft.name.trim()) { setError('표시명을 입력하세요'); return }
    if (!isValidDestinationId(draft.id)) { setError('ID 형식이 잘못됨 (영소문자/숫자/_)'); return }
    if (draft.keywords.length === 0) { setError('키워드를 1개 이상 입력하세요'); return }
    if (existingIds.includes(draft.id)) { setError(`중복된 ID: '${draft.id}'`); return }
    onSave(draft)
  }

  if (typeof document === 'undefined') return null

  const activeVaccineSet = tab === 'dog' ? dogVaccineSet : catVaccineSet

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-md">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-lg border border-border/80 bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-md px-md py-3 border-b border-border/80">
          {editingTitle ? (
            <input
              type="text"
              defaultValue={titleInitial}
              autoFocus
              onBlur={(e) => handleTitleCommit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleTitleCommit((e.target as HTMLInputElement).value)
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setEditingTitle(false)
                }
              }}
              placeholder="예: 호주, australia"
              className={cn(SETTINGS_BOXED_INPUT_CLASS, 'flex-1 text-[18px]')}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              title="이름 수정 (쉼표로 매칭 키워드 추가 가능)"
              className="font-serif text-[18px] text-foreground hover:text-muted-foreground transition-colors text-left"
            >
              {draft.name || <span className="text-muted-foreground">이름 없음</span>}
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-md py-md space-y-md scrollbar-minimal">
          <>
          {/* 종 탭 */}
          <div className="flex items-center gap-1 border-b border-border/80">
            <SpeciesTabBtn active={tab === 'dog'} onClick={() => setTab('dog')}>
              강아지
            </SpeciesTabBtn>
            <SpeciesTabBtn active={tab === 'cat'} onClick={() => setTab('cat')}>
              고양이
            </SpeciesTabBtn>
          </div>

          {/* 절차정보 — 활성 항목만 chip 으로 노출 + "+ 추가" 로 미사용 항목 추가. */}
          <ModalSection label="절차정보">
            <ChipList
              activeKeys={Array.from(activeVaccineSet).filter((k) => !DEFAULT_VACCINE_KEYS.includes(k))}
              allKeys={ALL_VACCINE_KEYS.filter((k) => !DEFAULT_VACCINE_KEYS.includes(k)) as readonly string[]}
              labels={VACCINE_KEY_LABELS}
              onRemove={toggleVaccine}
              onAdd={toggleVaccine}
            />
          </ModalSection>

          {/* 추가정보 — 드래그로 순서 변경 가능. */}
          <ModalSection label="추가정보">
            <ChipList
              activeKeys={tabExtraKeys}
              allKeys={ALL_EXTRA_FIELD_KEYS as readonly string[]}
              labels={EXTRA_FIELD_KEY_LABELS}
              onRemove={toggleExtra}
              onAdd={toggleExtra}
              onReorder={reorderExtras}
            />
          </ModalSection>
          </>
        </div>

        {/* Footer — 표준 DialogFooter */}
        <DialogFooter
          bordered
          onCancel={onClose}
          onPrimary={handleSave}
          destructive={onDelete ? { onClick: onDelete } : undefined}
        />
        {error && <div className="px-lg pb-2 text-sm text-destructive">{error}</div>}
      </div>
    </div>,
    document.body,
  )
}

function ModalSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-[1.2px] text-muted-foreground/70 mb-2">
        {label}
      </div>
      {children}
    </div>
  )
}

function SpeciesTabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-2 font-serif text-[14px] transition-colors border-b-2 -mb-px',
        active
          ? 'border-foreground text-foreground'
          : 'border-transparent text-muted-foreground/70 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

/* ── TogglePillGrid: 모든 항목을 pill 로 노출, click 으로 ON/OFF 전환 ── */

/* ── ChipList: 활성 항목만 chip 으로 노출 + "+ 추가" 로 미사용 항목 추가 ── */

function ChipList({
  activeKeys,
  allKeys,
  labels,
  onRemove,
  onAdd,
  onReorder,
}: {
  activeKeys: string[]
  allKeys: readonly string[]
  labels: Record<string, string>
  onRemove: (key: string) => void
  onAdd: (key: string) => void
  /** 제공 시 드래그 재정렬 활성화. activeKeys 가 그대로 표시 순서가 됨. */
  onReorder?: (orderedKeys: string[]) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)

  // onReorder 가 있으면 activeKeys 순서를 그대로 사용. 없으면 마스터 순서로 정렬.
  const ordered = onReorder ? activeKeys : allKeys.filter((k) => activeKeys.includes(k))
  const inactive = allKeys.filter((k) => !activeKeys.includes(k))

  // portal 위치 계산: 버튼 아래에 띄우되, 화면 아래에 공간 부족하면 위로 flip.
  useEffect(() => {
    if (!menuOpen || !addBtnRef.current) return
    function reposition() {
      const btn = addBtnRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const menuH = menuRef.current?.offsetHeight ?? 240
      const margin = 8
      let top = rect.bottom + 4
      if (top + menuH > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - menuH - 4)
      }
      setMenuPos({ top, left: rect.left })
    }
    reposition()
    const id = window.requestAnimationFrame(reposition)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.cancelAnimationFrame(id)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (wrapRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  function handleDrop(targetIdx: number) {
    if (dragIdx === null || !onReorder) { setDragIdx(null); setDropIdx(null); return }
    if (dragIdx === targetIdx) { setDragIdx(null); setDropIdx(null); return }
    const next = [...ordered]
    const [moved] = next.splice(dragIdx, 1)
    // 드래그 항목 제거 후 인덱스 보정.
    const insertAt = dragIdx < targetIdx ? targetIdx - 1 : targetIdx
    next.splice(insertAt, 0, moved)
    onReorder(next)
    setDragIdx(null); setDropIdx(null)
  }

  return (
    <SettingsControlGroup size="sm" wrap className="gap-2" ref={wrapRef}>
      {ordered.map((k, i) => (
        <SettingsChip
          key={k}
          draggable={!!onReorder}
          onDragStart={onReorder ? (e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move' } : undefined}
          onDragOver={onReorder ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropIdx(i) } : undefined}
          onDragLeave={onReorder ? () => setDropIdx((cur) => (cur === i ? null : cur)) : undefined}
          onDrop={onReorder ? (e) => { e.preventDefault(); handleDrop(i) } : undefined}
          onDragEnd={onReorder ? () => { setDragIdx(null); setDropIdx(null) } : undefined}
          onRemove={() => onRemove(k)}
          removeLabel="삭제"
          className={cn(
            onReorder && 'cursor-grab active:cursor-grabbing select-none',
            dragIdx === i && 'opacity-40',
            dropIdx === i && dragIdx !== i && 'ring-2 ring-foreground/40 ring-offset-1 ring-offset-background',
          )}
        >
          {labels[k] ?? k}
        </SettingsChip>
      ))}
      {inactive.length > 0 && (
        <>
          <SettingsAddButton ref={addBtnRef} onClick={() => setMenuOpen((p) => !p)}>
            <Plus size={11} /> 추가
          </SettingsAddButton>
          {menuOpen && menuPos && typeof document !== 'undefined' && createPortal(
            <div
              ref={menuRef}
              style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
              className="z-50 min-w-[160px] max-h-60 overflow-auto scrollbar-minimal rounded-md border border-border bg-popover p-1 shadow-md"
            >
              {inactive.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    onAdd(k)
                    setMenuOpen(false)
                  }}
                  className="w-full text-left rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent transition-colors"
                >
                  {labels[k] ?? k}
                </button>
              ))}
            </div>,
            document.body,
          )}
        </>
      )}
    </SettingsControlGroup>
  )
}

/** 기존 import 호환용 alias — 외부에서 destinations-section 에서 가져갈 수도 있어 둠. */
export { DestinationsArea as DestinationsSection }
