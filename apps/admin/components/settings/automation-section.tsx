'use client'

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X } from 'lucide-react'
import {
  listOrgAutoFillRules,
  createOrgAutoFillRule,
  updateOrgAutoFillRule,
  deleteOrgAutoFillRule,
  type AutoFillRule,
} from '@/lib/actions/org-auto-fill-rules'
import { cn } from '@/lib/utils'

// 목적지 옵션 — destination-config.ts 의 key 와 일치
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
]

const SPECIES_OPTIONS: { key: string; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'dog', label: '강아지' },
  { key: 'cat', label: '고양이' },
]

// 트리거/타겟으로 사용 가능한 필드. label 은 UI 표시용.
// 배열 필드는 "[0]" 같은 인덱스 suffix 로 특정 차수 지정 가능.
const FIELD_OPTIONS: { key: string; label: string; array?: boolean }[] = [
  { key: 'departure_date', label: '출국일' },
  { key: 'vet_visit_date', label: '내원일' },
  { key: 'rabies_dates[0]', label: '광견병 1차' },
  { key: 'rabies_dates[1]', label: '광견병 2차' },
  { key: 'general_vaccine_dates[0]', label: '종합백신 1차' },
  { key: 'general_vaccine_dates[1]', label: '종합백신 2차' },
  { key: 'civ_dates[0]', label: 'CIV 1차' },
  { key: 'civ_dates[1]', label: 'CIV 2차' },
  { key: 'kennel_cough_dates[0]', label: '켄넬코프 1차' },
  { key: 'internal_parasite_dates', label: '내부구충', array: true },
  { key: 'external_parasite_dates', label: '외부구충', array: true },
  { key: 'heartworm_dates', label: '심장사상충', array: true },
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

export function AutomationSection({ isAdmin = false }: { isAdmin?: boolean }) {
  const [rules, setRules] = useState<AutoFillRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<AutoFillRule | 'new' | null>(null)

  async function refresh() {
    const r = await listOrgAutoFillRules()
    if (r.ok) setRules(r.value)
    else setError(r.error)
    setLoading(false)
  }

  useEffect(() => {
    refresh()
  }, [])

  function handleSave(input: Partial<AutoFillRule>) {
    startTransition(async () => {
      if (editing === 'new') {
        const r = await createOrgAutoFillRule({
          destination_key: input.destination_key!,
          trigger_field: input.trigger_field!,
          target_field: input.target_field!,
          offsets_days: input.offsets_days!,
          overwrite_existing: input.overwrite_existing ?? false,
          enabled: input.enabled ?? true,
          display_order: rules.filter((r) => r.destination_key === input.destination_key).length,
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

  function handleDelete(id: string) {
    if (!confirm('이 규칙을 삭제하시겠습니까?')) return
    startTransition(async () => {
      const r = await deleteOrgAutoFillRule(id)
      if (!r.ok) { setError(r.error); return }
      setError(null)
      await refresh()
    })
  }

  function handleToggle(rule: AutoFillRule) {
    startTransition(async () => {
      await updateOrgAutoFillRule(rule.id, { enabled: !rule.enabled })
      await refresh()
    })
  }

  // Group by destination_key
  const grouped = new Map<string, AutoFillRule[]>()
  for (const r of rules) {
    if (!grouped.has(r.destination_key)) grouped.set(r.destination_key, [])
    grouped.get(r.destination_key)!.push(r)
  }
  const sortedDests = Array.from(grouped.keys()).sort((a, b) => destLabel(a).localeCompare(destLabel(b), 'ko'))

  return (
    <div className="max-w-5xl pb-2xl">
      <header className="pb-xl">
        <h2 className="font-serif text-[28px] leading-tight text-foreground">자동화</h2>
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
                className={cn(
                  'grid grid-cols-[auto_1fr_auto] items-center gap-md py-3 border-b border-dotted border-border/60',
                  !r.enabled && 'opacity-50',
                )}
              >
                <span className="font-mono text-[10.5px] uppercase tracking-[0.6px] text-muted-foreground/80 min-w-[40px]">
                  {speciesLabel(r.species_filter ?? 'all')}
                </span>
                <span className="font-serif text-[15px]">
                  <span className="text-foreground">{fieldLabel(r.trigger_field)}</span>
                  <span className="text-muted-foreground/60 mx-2">→</span>
                  <span className="text-foreground">{fieldLabel(r.target_field)}</span>
                  <span className="font-mono text-[12px] text-muted-foreground/80 ml-2">
                    · {formatOffsets(r.offsets_days)}
                  </span>
                </span>
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggle(r)}
                      className="font-serif italic text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                      disabled={pending}
                    >
                      {r.enabled ? '켜짐' : '꺼짐'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(r)}
                      className="font-serif italic text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      편집
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id)}
                      className="font-serif italic text-[12px] text-muted-foreground/60 hover:text-destructive transition-colors"
                      disabled={pending}
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>
            ))}
          </section>
        ))
      )}

      {isAdmin && (
        <div className="flex items-center justify-end pt-md border-t border-border/60">
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

function RuleEditModal({
  initial,
  pending,
  onClose,
  onSave,
}: {
  initial: AutoFillRule | null
  pending: boolean
  onClose: () => void
  onSave: (input: Partial<AutoFillRule>) => void
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
            <select value={destination} onChange={(e) => setDestination(e.target.value)} className={selectCls}>
              {DESTINATION_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="종">
            <select value={species} onChange={(e) => setSpecies(e.target.value)} className={selectCls}>
              {SPECIES_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="트리거 필드">
            <select value={trigger} onChange={(e) => setTrigger(e.target.value)} className={selectCls}>
              {FIELD_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="타겟 필드">
            <select value={target} onChange={(e) => setTarget(e.target.value)} className={selectCls}>
              {FIELD_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
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
          <div className="flex items-center gap-md">
            <label className="inline-flex items-center gap-sm font-serif text-[13px] text-muted-foreground">
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
              기존 값 덮어쓰기
            </label>
            <label className="inline-flex items-center gap-sm font-serif text-[13px] text-muted-foreground">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              활성
            </label>
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

const selectCls = 'w-full px-sm py-1.5 text-sm rounded-md border border-border/60 bg-background'

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
