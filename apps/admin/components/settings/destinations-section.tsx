'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
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
  isValidDestinationId,
  suggestDestinationId,
  type CustomDestination,
  type DestinationVaccineEntry,
  type DestinationExtraFieldEntry,
  type SpeciesFilter,
} from '@petmove/domain'

type SpeciesTab = 'dog' | 'cat'

/**
 * 목적지별 표시정보 — 상세뷰 탭 안에 임베드되는 섹션.
 * 디폴트(코드) + 커스텀 목적지를 한 리스트로 보여주고, 클릭 시 모달로 편집.
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
        if (!d.name.trim()) { setError('표시명이 비어있는 목적지가 있습니다'); return }
        if (!isValidDestinationId(d.id)) { setError(`'${d.name}' ID 형식이 잘못됨`); return }
        if (d.keywords.length === 0) { setError(`'${d.name}' 키워드를 1개 이상 입력`); return }
      }
      const ids = new Set<string>()
      for (const d of next) {
        if (ids.has(d.id)) { setError(`중복된 ID: '${d.id}'`); return }
        ids.add(d.id)
      }
      const r = await saveDestinationOverridesAction({ custom: next })
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
  }

  function handleDeleteOne(id: string) {
    persist(list.filter((d) => d.id !== id))
    setEditingId(null)
  }

  function handleAddNew() {
    setAdding(true)
  }

  return (
    <section className="mt-2xl pt-xl border-t border-border/40">
      <div className="mb-md">
        <h3 className="font-serif text-[18px] text-foreground">목적지별 표시정보</h3>
        <p className="pmw-st__sec-lead mt-1">
          케이스 목적지에 따라 절차정보·추가정보 영역에 표시할 항목을 종별로 설정합니다. 항목을 클릭하여 편집하세요.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-md">
        {/* 디폴트(광견병+항체검사 만, extraFields/Section 없음) 와 동일한 목적지는 숨김. */}
        {list.filter((d) => !isDestinationEqualToDefault(d)).map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setEditingId(d.id)}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-card px-3 h-8 text-[13px] hover:border-foreground/40 transition-colors disabled:opacity-50"
          >
            {d.name || <span className="italic text-muted-foreground">이름 없음</span>}
          </button>
        ))}
        <button
          type="button"
          onClick={handleAddNew}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border/80 bg-card px-3 h-8 text-[13px] text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors disabled:opacity-50"
        >
          <Plus size={13} /> 추가
        </button>
      </div>
      <p className="pmw-st__sec-lead -mt-2 mb-md text-[12px] text-muted-foreground/70">
        디폴트(광견병 + 항체검사) 와 동일한 목적지는 자동으로 숨겨집니다. 추가 항목이 필요한 목적지만 표시됩니다.
      </p>

      <div className="flex items-center gap-md min-h-[20px]">
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

      {/* Add new */}
      {adding && (
        <DestinationEditModal
          initial={makeEmpty(list)}
          existingIds={list.map((d) => d.id)}
          isNew
          onSave={handleSaveOne}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  )
}

function makeEmpty(existing: CustomDestination[]): CustomDestination {
  let n = existing.length + 1
  let id = `custom_${n}`
  const ids = new Set(existing.map((d) => d.id))
  while (ids.has(id)) { n += 1; id = `custom_${n}` }
  return {
    id,
    name: '',
    keywords: [],
    vaccines: [{ key: 'rabies' }, { key: 'rabies_titer' }],
  }
}

/* ── Edit modal ────────────────────────────────────────────────────────── */

function DestinationEditModal({
  initial,
  existingIds,
  isNew,
  onSave,
  onClose,
  onDelete,
}: {
  initial: CustomDestination
  existingIds: string[]
  isNew?: boolean
  onSave: (next: CustomDestination) => void
  onClose: () => void
  onDelete?: () => void
}) {
  const [draft, setDraft] = useState<CustomDestination>(initial)
  const [tab, setTab] = useState<SpeciesTab>('dog')
  const [error, setError] = useState<string | null>(null)
  // 새 목적지(이름 비어있음) 면 타이틀이 input 으로 시작.
  const [editingTitle, setEditingTitle] = useState<boolean>(!initial.name)
  // 새 추가 모드: 목적지 미선택 상태(draft.name 비어있음) 면 dropdown 노출, 선택되면 닫힘.
  const [searchOpen, setSearchOpen] = useState<boolean>(!!isNew && !initial.name)
  const [searchQuery, setSearchQuery] = useState('')
  const titleInitial = [initial.name, ...initial.keywords.filter((k) => k !== initial.name)]
    .filter(Boolean)
    .join(', ')

  // 검색 후보: 하드코딩 destinations 중 사용자 custom 에 없는 것들.
  const suggestions = useMemo(() => {
    const hardcoded = getHardcodedDestinationsAsCustom()
    const taken = new Set(existingIds)
    const q = searchQuery.trim().toLowerCase()
    return hardcoded
      .filter((h) => !taken.has(h.id))
      .filter((h) => {
        if (!q) return true
        return (
          h.name.toLowerCase().includes(q) ||
          h.keywords.some((kw) => kw.toLowerCase().includes(q)) ||
          h.id.toLowerCase().includes(q)
        )
      })
  }, [existingIds, searchQuery])

  function handlePickSuggestion(s: CustomDestination) {
    setDraft({
      ...s,
      // 새 적용 시 vaccines 배열 보존(기본 species 필터 포함).
    })
    setSearchOpen(false)
    setSearchQuery('')
  }

  function handlePickFreeText() {
    const text = searchQuery.trim()
    if (!text) return
    const tokens = text.split(',').map((s) => s.trim()).filter(Boolean)
    const name = tokens[0]
    const keywords = Array.from(new Set(tokens))
    setDraft({
      ...draft,
      name,
      keywords,
      id: suggestDestinationId(name) || draft.id,
    })
    setSearchOpen(false)
    setSearchQuery('')
  }

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
          {searchOpen ? (
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (suggestions.length > 0) handlePickSuggestion(suggestions[0])
                    else handlePickFreeText()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    onClose()
                  }
                }}
                placeholder="목적지 검색 (예: 일본, japan)"
                className="w-full h-9 rounded-md border border-border/80 bg-background px-2 font-serif text-[16px] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
              />
              <div className="absolute left-0 right-0 top-full mt-1 z-10 max-h-72 overflow-auto rounded-md border border-border/80 bg-popover shadow-md scrollbar-minimal">
                {suggestions.length === 0 && !searchQuery.trim() && (
                  <div className="px-2 py-2 text-[13px] italic text-muted-foreground">검색어를 입력하거나 항목을 선택하세요</div>
                )}
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handlePickSuggestion(s)}
                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent transition-colors flex items-baseline gap-2"
                  >
                    <span className="font-serif text-foreground">{s.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground/60">{s.keywords.filter((k) => k !== s.name).join(', ')}</span>
                  </button>
                ))}
                {searchQuery.trim() && (
                  <button
                    type="button"
                    onClick={handlePickFreeText}
                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent transition-colors border-t border-border/40 text-muted-foreground"
                  >
                    "{searchQuery.trim()}" 직접 입력
                  </button>
                )}
              </div>
            </div>
          ) : editingTitle ? (
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
              className="flex-1 h-9 rounded-md border border-border/80 bg-background px-2 font-serif text-[18px] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              title="이름 수정 (쉼표로 매칭 키워드 추가 가능)"
              className="font-serif text-[18px] text-foreground hover:text-muted-foreground transition-colors text-left"
            >
              {draft.name || <span className="italic text-muted-foreground">이름 없음</span>}
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-md py-md space-y-md scrollbar-minimal">
          {searchOpen && (
            <p className="text-[13px] italic text-muted-foreground/70">
              위에서 목적지를 선택하면 항목 편집 영역이 나타납니다.
            </p>
          )}
          {!searchOpen && (
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
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-md py-2 border-t border-border/80 bg-background/95">
          <button
            type="button"
            onClick={handleSave}
            className="h-7 px-3 rounded-full bg-pmw-accent text-pmw-accent-foreground text-[13px] hover:opacity-90 transition-opacity"
          >
            저장
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-7 px-3 rounded-full border border-border/80 bg-card text-[13px] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
          >
            취소
          </button>
          {error && <span className="text-sm text-destructive">{error}</span>}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              title="목적지 삭제"
              className="ml-auto inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
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
    <div className="flex flex-wrap items-center gap-2" ref={wrapRef}>
      {ordered.map((k, i) => (
        <span
          key={k}
          draggable={!!onReorder}
          onDragStart={onReorder ? (e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move' } : undefined}
          onDragOver={onReorder ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropIdx(i) } : undefined}
          onDragLeave={onReorder ? () => setDropIdx((cur) => (cur === i ? null : cur)) : undefined}
          onDrop={onReorder ? (e) => { e.preventDefault(); handleDrop(i) } : undefined}
          onDragEnd={onReorder ? () => { setDragIdx(null); setDropIdx(null) } : undefined}
          className={cn(
            "group/chip inline-flex items-center gap-1 rounded-full border border-foreground/30 bg-transparent px-2.5 py-0.5 font-serif text-[13px] text-foreground transition-all",
            onReorder && 'cursor-grab active:cursor-grabbing select-none',
            dragIdx === i && 'opacity-40',
            dropIdx === i && dragIdx !== i && 'ring-2 ring-foreground/40 ring-offset-1 ring-offset-background',
          )}
        >
          {labels[k] ?? k}
          <button
            type="button"
            onClick={() => onRemove(k)}
            title="삭제"
            className="rounded-full p-0.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      {inactive.length > 0 && (
        <>
          <button
            ref={addBtnRef}
            type="button"
            onClick={() => setMenuOpen((p) => !p)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-foreground/30 bg-card px-2.5 py-0.5 font-serif text-[13px] text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors"
          >
            <Plus size={11} /> 추가
          </button>
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
    </div>
  )
}

/** 기존 import 호환용 alias — 외부에서 destinations-section 에서 가져갈 수도 있어 둠. */
export { DestinationsArea as DestinationsSection }
