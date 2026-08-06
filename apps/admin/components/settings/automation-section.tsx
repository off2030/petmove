'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import {
  listOrgAutoFillRules,
  createOrgAutoFillRule,
  updateOrgAutoFillRule,
  deleteOrgAutoFillRule,
  type AutoFillRule,
  type AutoFillRuleInput,
} from '@/lib/actions/org-auto-fill-rules'
import {
  SettingsActionButton,
  SettingsCard,
  SettingsCheckBox,
  SettingsFilterPills,
  SettingsFooter,
  SettingsSearchInput,
  SettingsShell,
  SettingsSection,
  SettingsSubsectionTitle,
} from './settings-layout'
import { DialogFooter } from '@/components/ui/dialog-footer'
import { cn } from '@/lib/utils'
import { DESTINATION_OVERRIDES } from '@petmove/domain'

// 여행지 목록은 도메인 단일 출처(DESTINATION_OVERRIDES)에서 파생 — 첫 keyword 가 한글
// 정식 명칭 컨벤션. 예전 손 목록은 20개에서 멈춰 있어서 뒤에 추가된 여행지(south_africa 등)의
// 규칙이 그룹 제목에 raw 키로 뜨고 한글 검색에도 안 잡혔다(2026-08-05 사용자 발견).
const DESTINATION_OPTIONS: { key: string; label: string }[] = Object.entries(DESTINATION_OVERRIDES)
  .map(([key, o]) => ({ key, label: o.keywords[0] ?? key }))
  .sort((a, b) => a.label.localeCompare(b.label, 'ko'))

const SPECIES_OPTIONS: { key: string; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'dog', label: '강아지' },
  { key: 'cat', label: '고양이' },
]

const FIELD_OPTIONS: { key: string; label: string }[] = [
  { key: 'departure_date', label: '출국일' },
  { key: 'vet_visit_date', label: '내원일' },
  { key: 'rabies_dates[0]', label: '광견병 1차' },
  { key: 'rabies_dates[1]', label: '광견병 2차' },
  { key: 'general_vaccine_dates[0]', label: '종합백신 1차' },
  { key: 'general_vaccine_dates[1]', label: '종합백신 2차' },
  { key: 'civ_dates[0]', label: '독감 1차' },
  { key: 'civ_dates[1]', label: '독감 2차' },
  { key: 'kennel_cough_dates[0]', label: '켄넬코프 1차' },
  { key: 'infectious_disease_records', label: '전염병검사일' },
  { key: 'internal_parasite_dates', label: '내부구충' },
  { key: 'external_parasite_dates', label: '외부구충' },
  { key: 'heartworm_dates', label: '심장사상충' },
  { key: 'entry_date', label: '입국일 (통합)' },
  { key: 'return_date', label: '귀국일' },
]

function destLabel(key: string): string {
  return DESTINATION_OPTIONS.find((d) => d.key === key)?.label ?? key
}
function speciesLabel(key: string): string {
  return SPECIES_OPTIONS.find((s) => s.key === key)?.label ?? key
}
function fieldLabel(key: string): string {
  return FIELD_OPTIONS.find((f) => f.key === key)?.label ?? key
}

function formatOffsets(offsets: number[]): string {
  return offsets.map((d) => (d === 0 ? '당일' : d > 0 ? `+${d}일` : `${d}일`)).join(', ')
}

interface DeletedRecord {
  rule: AutoFillRule
  at: number
}

type StatusFilter = 'all' | 'enabled' | 'disabled'

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'enabled', label: '활성' },
  { value: 'disabled', label: '비활성' },
]

function searchTokens(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

function fieldOrder(key: string): number {
  const index = FIELD_OPTIONS.findIndex((f) => f.key === key)
  return index === -1 ? FIELD_OPTIONS.length : index
}

function destinationScopeOrder(key: string): number {
  return key === 'all' ? -1 : 0
}

function ruleSearchText(rule: AutoFillRule): string {
  return [
    rule.destination_key,
    destLabel(rule.destination_key),
    // 별칭까지 검색에 태운다 — '남아공'(정식 명칭은 남아프리카공화국) 같은 줄임말 검색용.
    ...(DESTINATION_OVERRIDES[rule.destination_key]?.keywords ?? []),
    rule.species_filter ?? 'all',
    speciesLabel(rule.species_filter ?? 'all'),
    rule.trigger_field,
    fieldLabel(rule.trigger_field),
    rule.target_field,
    fieldLabel(rule.target_field),
    formatOffsets(rule.offsets_days),
    rule.offsets_days.join(' '),
    rule.enabled ? '활성 enabled on' : '비활성 disabled off',
    rule.overwrite_existing ? '덮어쓰기 overwrite' : '',
  ].join(' ').toLowerCase()
}

export function AutomationSection({
  isAdmin = false,
  initialRules = null,
}: {
  isAdmin?: boolean
  initialRules?: AutoFillRule[] | null
}) {
  const [rules, setRules] = useState<AutoFillRule[]>(initialRules ?? [])
  const [loading, setLoading] = useState(initialRules == null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<AutoFillRule | 'new' | null>(null)
  const [deletedStack, setDeletedStack] = useState<DeletedRecord[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  async function refresh() {
    const r = await listOrgAutoFillRules()
    if (r.ok) setRules(r.value)
    else setError(r.error)
    setLoading(false)
  }

  useEffect(() => {
    if (initialRules == null) refresh()
  }, [initialRules])

  function handleSave(input: AutoFillRuleInput) {
    startTransition(async () => {
      if (editing === 'new') {
        const r = await createOrgAutoFillRule({
          ...input,
          display_order: rules.filter((x) => x.destination_key === input.destination_key).length,
        })
        if (!r.ok) { setError(r.error); return }
      } else if (editing) {
        const r = await updateOrgAutoFillRule(editing.id, input)
        if (!r.ok) { setError(r.error); return }
      }
      setError(null)
      setEditing(null)
      await refresh()
    })
  }

  function handleDelete(rule: AutoFillRule) {
    startTransition(async () => {
      const r = await deleteOrgAutoFillRule(rule.id)
      if (!r.ok) { setError(r.error); return }
      setError(null)
      // 복원 스택에 push
      setDeletedStack((prev) => [{ rule, at: Date.now() }, ...prev].slice(0, 10))
      await refresh()
    })
  }

  function handleRestore() {
    const top = deletedStack[0]
    if (!top) return
    startTransition(async () => {
      const r = await createOrgAutoFillRule({
        destination_key: top.rule.destination_key,
        species_filter: top.rule.species_filter,
        trigger_field: top.rule.trigger_field,
        target_field: top.rule.target_field,
        offsets_days: top.rule.offsets_days,
        overwrite_existing: top.rule.overwrite_existing,
        enabled: top.rule.enabled,
        display_order: top.rule.display_order,
      })
      if (!r.ok) { setError(r.error); return }
      setError(null)
      setDeletedStack((prev) => prev.slice(1))
      await refresh()
    })
  }

  function handleToggle(rule: AutoFillRule) {
    const next = !rule.enabled
    // 1) 즉시 로컬 갱신 — UI 는 바로 반응.
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: next } : r)))
    // 2) 서버 동기화는 백그라운드. 실패 시 롤백.
    void updateOrgAutoFillRule(rule.id, { enabled: next }).then((res) => {
      if (!res.ok) {
        setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: !next } : r)))
        setError(res.error)
      }
    })
  }

  const filteredRules = useMemo(() => {
    const tokens = searchTokens(query)
    return [...rules]
      .filter((rule) => {
        if (statusFilter === 'enabled' && !rule.enabled) return false
        if (statusFilter === 'disabled' && rule.enabled) return false
        if (tokens.length === 0) return true
        const text = ruleSearchText(rule)
        return tokens.every((token) => text.includes(token))
      })
      .sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
        const scope = destinationScopeOrder(a.destination_key) - destinationScopeOrder(b.destination_key)
        if (scope !== 0) return scope
        const dest = destLabel(a.destination_key).localeCompare(destLabel(b.destination_key), 'ko')
        if (dest !== 0) return dest
        const trigger = fieldOrder(a.trigger_field) - fieldOrder(b.trigger_field)
        if (trigger !== 0) return trigger
        const target = fieldLabel(a.target_field).localeCompare(fieldLabel(b.target_field), 'ko')
        if (target !== 0) return target
        return a.display_order - b.display_order
      })
  }, [query, rules, statusFilter])

  const grouped = useMemo(() => {
    const out = new Map<string, AutoFillRule[]>()
    for (const r of filteredRules) {
      if (!out.has(r.destination_key)) out.set(r.destination_key, [])
      out.get(r.destination_key)!.push(r)
    }
    return out
  }, [filteredRules])

  const sortedDests = Array.from(grouped.keys()).sort((a, b) => {
    const scope = destinationScopeOrder(a) - destinationScopeOrder(b)
    if (scope !== 0) return scope
    return destLabel(a).localeCompare(destLabel(b), 'ko')
  })

  return (
    <SettingsShell size="lg">
      <SettingsSection title="자동화">
        {error && (
          <p className="-mt-md mb-md font-serif text-[13px] text-destructive">{error}</p>
        )}

        <div className="mb-md space-y-2">
          <div className="flex items-center gap-sm">
            <SettingsSearchInput
              value={query}
              onChange={setQuery}
              placeholder="트리거, 대상 필드, 여행지 검색"
              className="flex-1"
            />
            {/* 추가 = 검색창 바로 우측 + 아이콘 (2026-08-06 사용자 지시).
                목록 위라 규칙이 쌓여도 스크롤 없이 닿는다. */}
            {isAdmin && (
              <SettingsActionButton
                onClick={() => setEditing('new')}
                title="규칙 추가"
                aria-label="규칙 추가"
                className="h-11 w-11 justify-center px-0 shrink-0"
              >
                <Plus className="h-4 w-4" />
              </SettingsActionButton>
            )}
            <SettingsFilterPills options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
          </div>
        </div>

        {loading ? (
          <p className="font-serif text-[14px] text-muted-foreground">불러오는 중…</p>
        ) : rules.length === 0 ? (
          <p className="font-serif text-[14px] text-muted-foreground/60 mb-md">
            아직 등록된 규칙이 없습니다.
          </p>
        ) : filteredRules.length === 0 ? (
          <p className="pmw-st__sec-lead py-md">검색 결과 없음.</p>
        ) : (
          <div className="space-y-lg">
          {sortedDests.map((dk) => (
            <SettingsCard key={dk}>
              <div className="flex items-baseline gap-2 pb-2 border-b border-border/80 mb-2">
                <SettingsSubsectionTitle>{destLabel(dk)}</SettingsSubsectionTitle>
                <span className="text-muted-foreground/60">·</span>
                <span className="font-serif text-[13px] text-muted-foreground/60">{grouped.get(dk)!.length}</span>
              </div>
              {grouped.get(dk)!.map((r) => (
                <div
                  key={r.id}
                  role={isAdmin ? 'button' : undefined}
                  tabIndex={isAdmin ? 0 : undefined}
                  onClick={isAdmin && !pending ? () => handleToggle(r) : undefined}
                  onKeyDown={isAdmin && !pending ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggle(r) }
                  } : undefined}
                  title={isAdmin ? (r.enabled ? '활성 — 클릭하여 비활성' : '비활성 — 클릭하여 활성') : undefined}
                  className={cn(
                    'grid grid-cols-[24px_56px_1fr_auto] items-center gap-md py-3 border-b border-dotted border-border/80 hover:bg-accent transition-colors group',
                    isAdmin && 'cursor-pointer',
                  )}
                >
                  <SettingsCheckBox checked={r.enabled} />
                  <span className={cn('font-mono text-[10.5px] uppercase tracking-[0.6px] text-muted-foreground/80', !r.enabled && 'opacity-50')}>
                    {speciesLabel(r.species_filter ?? 'all')}
                  </span>
                  <span className={cn('font-serif text-[15px]', !r.enabled && 'opacity-50')}>
                    <span className="text-foreground">{fieldLabel(r.trigger_field)}</span>
                    <span className="text-muted-foreground/60 mx-2">→</span>
                    <span className="text-foreground">{fieldLabel(r.target_field)}</span>
                    <span className="font-mono text-[12px] text-muted-foreground/80 ml-2">
                      · {formatOffsets(r.offsets_days)}
                    </span>
                  </span>
                  {isAdmin && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditing(r) }}
                        title="편집"
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDelete(r) }}
                        title="삭제"
                        disabled={pending}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </SettingsCard>
          ))}
          </div>
        )}
  
        {/* 삭제 복원은 실수 복구용 — 자주 쓰지 않으므로 하단 유지. */}
        {isAdmin && deletedStack.length > 0 && (
          <SettingsFooter className="mt-lg border-t-0">
            <SettingsActionButton
              onClick={handleRestore}
              disabled={pending}
              title={`최근 삭제: ${destLabel(deletedStack[0].rule.destination_key)} · ${fieldLabel(deletedStack[0].rule.trigger_field)} → ${fieldLabel(deletedStack[0].rule.target_field)}`}
            >
              <RotateCcw className="h-3 w-3" />
              삭제 복원 ({deletedStack.length})
            </SettingsActionButton>
          </SettingsFooter>
        )}
  
        {!isAdmin && (
          <p className="pt-md border-t border-border/80 pmw-st__sec-lead">
            자동화 규칙 편집은 관리자만 가능합니다.
          </p>
        )}
  
        {editing && (
          <RuleEditModal
            initial={editing === 'new' ? null : editing}
            pending={pending}
            onClose={() => setEditing(null)}
            onSave={handleSave}
          />
        )}
      </SettingsSection>
    </SettingsShell>
  )
}


/* ── Custom Editorial Dropdown ── */

function EditorialSelect({
  value,
  options,
  onChange,
  placeholder = '선택',
  searchable = false,
}: {
  value: string
  options: { key: string; label: string }[]
  onChange: (v: string) => void
  placeholder?: string
  searchable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActiveIdx(0)
      return
    }
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    if (searchable) inputRef.current?.focus()
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, searchable])

  const current = options.find((o) => o.key === value)

  const filtered = searchable && query
    ? options.filter((o) => {
        const q = query.toLowerCase()
        return o.label.toLowerCase().includes(q) || o.key.toLowerCase().includes(q)
      })
    : options

  function commit(idx: number) {
    const o = filtered[idx]
    if (!o) return
    onChange(o.key)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full inline-flex items-center justify-between gap-2 h-9 rounded-md border border-border/80 bg-background px-3 font-serif text-[14px] hover:border-foreground/40 transition-colors"
      >
        <span className={cn(!current && 'text-muted-foreground/60')}>{current?.label ?? placeholder}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 rounded-sm border border-border/80 bg-popover shadow-md z-30">
          {searchable && (
            <div className="border-b border-border/80 px-2 py-1.5">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveIdx(0) }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setActiveIdx((i) => Math.max(i - 1, 0))
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    commit(activeIdx)
                  }
                }}
                placeholder="검색…"
                className="w-full bg-transparent outline-none font-serif text-[13px] px-1 py-0.5 placeholder:text-muted-foreground/50"
              />
            </div>
          )}
          <ul
            role="listbox"
            className="max-h-60 overflow-y-auto py-1"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-1.5 font-serif text-[13px] text-muted-foreground/50">결과 없음</li>
            )}
            {filtered.map((o, i) => {
              const active = o.key === value
              const highlighted = searchable && i === activeIdx
              return (
                <li key={o.key}>
                  <button
                    type="button"
                    onClick={() => commit(i)}
                    onMouseEnter={() => searchable && setActiveIdx(i)}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-[14px] transition-colors',
                      highlighted ? 'bg-accent/40' : 'hover:bg-accent/40',
                      active ? 'font-serif text-foreground' : 'font-serif text-muted-foreground',
                    )}
                  >
                    {o.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ── Edit Modal ── */

function RuleEditModal({
  initial,
  pending,
  onClose,
  onSave,
}: {
  initial: AutoFillRule | null
  pending: boolean
  onClose: () => void
  onSave: (input: AutoFillRuleInput) => void
}) {
  const [destination, setDestination] = useState(initial?.destination_key ?? 'hawaii')
  const [species, setSpecies] = useState(initial?.species_filter ?? 'all')
  const [trigger, setTrigger] = useState(initial?.trigger_field ?? 'departure_date')
  const [target, setTarget] = useState(initial?.target_field ?? 'vet_visit_date')
  const [offsetsText, setOffsetsText] = useState((initial?.offsets_days ?? [0]).join(', '))
  const [overwrite, setOverwrite] = useState(initial?.overwrite_existing ?? false)
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function parseOffsets(s: string): number[] {
    return s.split(',').map((t) => Number(t.trim())).filter((n) => !Number.isNaN(n))
  }

  function submit() {
    const offsets = parseOffsets(offsetsText)
    if (offsets.length === 0) return
    onSave({
      destination_key: destination,
      species_filter: species,
      trigger_field: trigger,
      target_field: target,
      offsets_days: offsets,
      overwrite_existing: overwrite,
      enabled,
    })
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-background rounded-sm border border-border/80 shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border/80 px-lg py-3">
          <h3 className="font-serif text-[17px]">{initial ? '규칙 수정' : '규칙 추가'}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-lg py-md space-y-md">
          <Field label="여행지">
            {/* 레거시 규칙은 destination_key 가 한글 자유 문자열('아일랜드' 등)일 수 있다 —
                파생 목록에 없으면 현재 값을 옵션으로 붙여, 수정 화면에서 여행지가 빈 값/
                다른 값으로 튀지 않게 한다. */}
            <EditorialSelect
              value={destination}
              onChange={setDestination}
              options={
                DESTINATION_OPTIONS.some((o) => o.key === destination)
                  ? DESTINATION_OPTIONS
                  : [{ key: destination, label: destLabel(destination) }, ...DESTINATION_OPTIONS]
              }
              searchable
            />
          </Field>
          <Field label="종">
            <EditorialSelect value={species} onChange={setSpecies} options={SPECIES_OPTIONS} />
          </Field>
          <Field label="트리거 필드">
            <EditorialSelect value={trigger} onChange={setTrigger} options={FIELD_OPTIONS} />
          </Field>
          <Field label="타겟 필드">
            <EditorialSelect value={target} onChange={setTarget} options={FIELD_OPTIONS} />
          </Field>
          <Field label="오프셋 (일, 쉼표 구분)" hint="예: -2 / 0 / 0, -29 / 14">
            <input
              type="text"
              value={offsetsText}
              onChange={(e) => setOffsetsText(e.target.value)}
              placeholder="0, -29"
              className="w-full font-mono text-[14px] bg-transparent outline-none border-b border-border/80 focus:border-foreground/40 pb-1"
            />
          </Field>
          <div className="flex items-center gap-md pt-1">
            <button
              type="button"
              onClick={() => setOverwrite((v) => !v)}
              className="inline-flex items-center gap-2 font-serif text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <SettingsCheckBox checked={overwrite} />
              기존 값 덮어쓰기
            </button>
            <button
              type="button"
              onClick={() => setEnabled((v) => !v)}
              className="inline-flex items-center gap-2 font-serif text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <SettingsCheckBox checked={enabled} />
              활성
            </button>
          </div>
        </div>

        <DialogFooter
          bordered
          onCancel={onClose}
          onPrimary={submit}
          primaryLabel={initial ? '저장' : '추가'}
          saving={pending}
        />
      </div>
    </div>,
    document.body,
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="font-serif text-[13px] text-muted-foreground/80 flex items-baseline gap-sm">
        {label}
        {hint && <span className="font-serif text-[12px] text-muted-foreground/60">{hint}</span>}
      </span>
      {children}
    </label>
  )
}
