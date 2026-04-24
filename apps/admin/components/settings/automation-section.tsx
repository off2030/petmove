'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import {
  listOrgAutoFillRules,
  createOrgAutoFillRule,
  updateOrgAutoFillRule,
  deleteOrgAutoFillRule,
  type AutoFillRule,
  type AutoFillRuleInput,
} from '@/lib/actions/org-auto-fill-rules'
import { SectionHeader } from '@/components/ui/section-header'
import { cn } from '@/lib/utils'

const DESTINATION_OPTIONS: { key: string; label: string }[] = [
  { key: 'hawaii', label: '하와이' },
  { key: 'australia', label: '호주' },
  { key: 'new_zealand', label: '뉴질랜드' },
  { key: 'japan', label: '일본' },
  { key: 'eu', label: '유럽연합' },
  { key: 'uk', label: '영국' },
  { key: 'switzerland', label: '스위스' },
  { key: 'usa', label: '미국' },
  { key: 'singapore', label: '싱가포르' },
  { key: 'hongkong', label: '홍콩' },
  { key: 'thailand', label: '태국' },
  { key: 'philippines', label: '필리핀' },
  { key: 'indonesia', label: '인도네시아' },
  { key: 'turkey', label: '터키' },
  { key: 'mexico', label: '멕시코' },
  { key: 'russia', label: '러시아' },
  { key: 'uae', label: '아랍에미리트' },
  { key: 'guam', label: '괌' },
  { key: 'brazil', label: '브라질' },
  { key: '아일랜드', label: '아일랜드' },
  { key: '몰타', label: '몰타' },
  { key: '노르웨이', label: '노르웨이' },
  { key: '핀란드', label: '핀란드' },
]

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
  { key: 'civ_dates[0]', label: 'CIV 1차' },
  { key: 'civ_dates[1]', label: 'CIV 2차' },
  { key: 'kennel_cough_dates[0]', label: '켄넬코프 1차' },
  { key: 'internal_parasite_dates', label: '내부구충' },
  { key: 'external_parasite_dates', label: '외부구충' },
  { key: 'heartworm_dates', label: '심장사상충' },
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

  // Group by destination
  const grouped = new Map<string, AutoFillRule[]>()
  for (const r of rules) {
    if (!grouped.has(r.destination_key)) grouped.set(r.destination_key, [])
    grouped.get(r.destination_key)!.push(r)
  }
  const sortedDests = Array.from(grouped.keys()).sort((a, b) => destLabel(a).localeCompare(destLabel(b), 'ko'))

  return (
    <div className="max-w-5xl pb-2xl">
      <header className="pb-xl">
        <SectionHeader>자동화</SectionHeader>
        <p className="pmw-st__sec-lead mt-2">
          목적지·종별 자동 채움 규칙. 트리거 필드에 날짜가 입력되면 타겟 필드가 오프셋 기준으로 자동으로 채워집니다.
        </p>
        {error && (
          <p className="mt-2 font-serif text-[13px] text-destructive">{error}</p>
        )}
      </header>

      {loading ? (
        <p className="font-serif italic text-[14px] text-muted-foreground">불러오는 중…</p>
      ) : rules.length === 0 ? (
        <p className="font-serif italic text-[14px] text-muted-foreground/60 mb-md">
          아직 등록된 규칙이 없습니다.
        </p>
      ) : (
        sortedDests.map((dk) => (
          <section key={dk} className="mb-xl">
            <div className="flex items-baseline gap-2 pb-2 border-b border-border/70">
              <span className="font-serif text-[15px] text-foreground">{destLabel(dk)}</span>
              <span className="opacity-60 text-muted-foreground">·</span>
              <span className="opacity-60 text-muted-foreground text-[13px]">{grouped.get(dk)!.length}</span>
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
                  'grid grid-cols-[24px_56px_1fr_auto] items-center gap-md py-3 border-b border-dotted border-border/60 hover:bg-accent transition-colors group',
                  isAdmin && 'cursor-pointer',
                )}
              >
                <CheckBox checked={r.enabled} />
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
          </section>
        ))
      )}

      {isAdmin && (
        <div className="flex items-center justify-between pt-md border-t border-border/60">
          <button
            type="button"
            onClick={handleRestore}
            disabled={pending || deletedStack.length === 0}
            title={
              deletedStack.length > 0
                ? `최근 삭제: ${destLabel(deletedStack[0].rule.destination_key)} · ${fieldLabel(deletedStack[0].rule.trigger_field)} → ${fieldLabel(deletedStack[0].rule.target_field)}`
                : '최근 삭제한 규칙이 없습니다'
            }
            className="inline-flex items-center gap-1 pmw-st__btn px-3 py-1 rounded-full border border-border/60 hover:bg-muted/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw className="h-3 w-3" />
            삭제 복원{deletedStack.length > 0 ? ` (${deletedStack.length})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="inline-flex items-center gap-1 pmw-st__btn px-3 py-1 rounded-full border border-border/60 hover:bg-muted/40 transition-colors"
          >
            <Plus className="h-3 w-3" />
            규칙 추가
          </button>
        </div>
      )}

      {!isAdmin && (
        <p className="pt-md border-t border-border/60 pmw-st__sec-lead">
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
    </div>
  )
}

/* ── Custom Editorial CheckBox (verification 탭과 동일 패턴) ── */

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-4 w-4 items-center justify-center rounded-sm border transition-colors',
        checked ? 'border-foreground/60 bg-foreground/5' : 'border-border/70 bg-transparent',
      )}
    >
      {checked && <Check className="h-3 w-3 text-foreground" strokeWidth={2.5} />}
    </span>
  )
}

/* ── Custom Editorial Dropdown ── */

function EditorialSelect({
  value,
  options,
  onChange,
  placeholder = '선택',
}: {
  value: string
  options: { key: string; label: string }[]
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = options.find((o) => o.key === value)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full inline-flex items-center justify-between gap-2 h-9 rounded-md border border-border/60 bg-background px-3 font-serif text-[14px] hover:border-foreground/40 transition-colors"
      >
        <span className={cn(!current && 'text-muted-foreground/60')}>{current?.label ?? placeholder}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto rounded-sm border border-border/70 bg-popover shadow-md py-1 z-30"
        >
          {options.map((o) => {
            const active = o.key === value
            return (
              <li key={o.key}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.key)
                    setOpen(false)
                  }}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-[14px] hover:bg-accent/40 transition-colors',
                    active ? 'font-serif text-foreground' : 'font-serif text-muted-foreground',
                  )}
                >
                  {o.label}
                </button>
              </li>
            )
          })}
        </ul>
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
      <div className="bg-background rounded-sm border border-border/60 shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border/60 px-lg py-3">
          <h3 className="font-serif text-[17px]">{initial ? '규칙 수정' : '규칙 추가'}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-lg py-md space-y-md">
          <Field label="목적지">
            <EditorialSelect value={destination} onChange={setDestination} options={DESTINATION_OPTIONS} />
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
              className="w-full font-mono text-[14px] bg-transparent outline-none border-b border-border/60 focus:border-foreground/40 pb-1"
            />
          </Field>
          <div className="flex items-center gap-md pt-1">
            <button
              type="button"
              onClick={() => setOverwrite((v) => !v)}
              className="inline-flex items-center gap-2 font-serif text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckBox checked={overwrite} />
              기존 값 덮어쓰기
            </button>
            <button
              type="button"
              onClick={() => setEnabled((v) => !v)}
              className="inline-flex items-center gap-2 font-serif text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckBox checked={enabled} />
              활성
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-sm border-t border-border/60 px-lg py-3">
          <button type="button" onClick={onClose} className="px-md py-1.5 text-sm font-serif text-muted-foreground hover:text-foreground" disabled={pending}>
            취소
          </button>
          <button type="button" onClick={submit} disabled={pending} className="px-md py-1.5 text-sm font-serif rounded-full border border-border/60 hover:bg-muted/40 transition-colors disabled:opacity-40">
            {initial ? '저장' : '추가'}
          </button>
        </div>
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
        {hint && <span className="font-serif italic text-[12px] text-muted-foreground/60">{hint}</span>}
      </span>
      {children}
    </label>
  )
}
