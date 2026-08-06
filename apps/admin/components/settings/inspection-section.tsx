'use client'

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X } from 'lucide-react'
import { useCases } from '@/components/cases/cases-context'
import { TodoColumnsToggle } from './todo-columns-toggle'
import { DestinationPicker } from '@/components/ui/destination-picker'
import { LabPillSelect, LabPillMultiSelect } from '@/components/ui/lab-pill-select'
import { PillButton } from '@petmove/ui'
import { DialogFooter } from '@/components/ui/dialog-footer'
import {
  SettingsActionButton,
  SettingsCard,
  SettingsShell,
  SettingsSection,
  SettingsField,
  SettingsFooter,
} from './settings-layout'
import { DestinationPill, OverflowPill } from './destination-pills'
import { labColor } from '@/lib/lab-color'
import { cn } from '@/lib/utils'
import { saveInspectionConfigAction } from '@/lib/actions/inspection-config-action'
import {
  DEFAULT_INSPECTION_CONFIG,
  EU_COUNTRIES,
  INFECTIOUS_LABS,
  TITER_LABS,
  type InspectionConfig,
  type InspectionLabOption,
  type InspectionLabRule,
} from '@petmove/domain'

const COUNTRY_PREVIEW_MAX = 4

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every(x => s.has(x))
}

/**
 * "기관 목록" 행 — 기본·사용자 정의 기관 전체 CRUD (2026-08-06).
 * 칩 클릭=표시명 수정, ✕=삭제(기본 기관은 숨김 처리 — 과거 데이터 표시는 유지),
 * 사용 중(규칙·기본 검사기관 참조) 기관은 삭제 불가. 숨긴 기본 기관은 아래에서 복원.
 */
function LabsAdminRow({
  defaults,
  customLabs,
  hidden,
  overrides,
  onCustomLabsChange,
  onHiddenChange,
  onOverridesChange,
  referencedValues,
}: {
  defaults: InspectionLabOption[]
  customLabs: InspectionLabOption[]
  hidden: string[]
  overrides: Record<string, string>
  onCustomLabsChange: (next: InspectionLabOption[]) => void
  onHiddenChange: (next: string[]) => void
  onOverridesChange: (next: Record<string, string>) => void
  referencedValues: Set<string>
}) {
  const [adding, setAdding] = useState(false)
  const [valueInput, setValueInput] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  const hiddenSet = new Set(hidden)
  const visibleDefaults = defaults
    .filter(d => !hiddenSet.has(d.value))
    .map(d => ({ value: d.value, label: overrides[d.value] ?? d.label, isCustom: false }))
  const visibleCustoms = customLabs.map(c => ({ ...c, isCustom: true }))
  const allValues = [...defaults.map(d => d.value), ...customLabs.map(c => c.value)]

  function submit() {
    const rawValue = valueInput.trim().toLowerCase().replace(/\s+/g, '_')
    const rawLabel = labelInput.trim()
    if (!rawValue || !rawLabel) {
      setError('식별자와 표시명을 모두 입력하세요')
      return
    }
    if (allValues.includes(rawValue)) {
      setError('이미 존재하는 식별자입니다')
      return
    }
    onCustomLabsChange([...customLabs, { value: rawValue, label: rawLabel }])
    setValueInput('')
    setLabelInput('')
    setError(null)
    setAdding(false)
  }

  function remove(value: string, isCustom: boolean) {
    if (referencedValues.has(value)) return
    if (isCustom) onCustomLabsChange(customLabs.filter(l => l.value !== value))
    else onHiddenChange([...hidden, value])
  }

  function startEdit(value: string, currentLabel: string) {
    setEditing(value)
    setEditLabel(currentLabel)
    setError(null)
  }

  function commitEdit() {
    if (!editing) return
    const label = editLabel.trim()
    if (!label) { setError('표시명을 입력하세요'); return }
    const isCustom = customLabs.some(c => c.value === editing)
    if (isCustom) {
      onCustomLabsChange(customLabs.map(c => (c.value === editing ? { ...c, label } : c)))
    } else {
      const original = defaults.find(d => d.value === editing)?.label
      const next = { ...overrides }
      if (label === original) delete next[editing]
      else next[editing] = label
      onOverridesChange(next)
    }
    setEditing(null)
    setError(null)
  }

  function chipCls(tone: ReturnType<typeof labColor>): string {
    const base = 'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-[1px] whitespace-nowrap'
    if (tone) return cn(base, tone.bg, tone.text)
    return cn(base, 'bg-muted/60 text-muted-foreground')
  }

  return (
    <SettingsField label="기관 목록" align="start">
      <div className="flex flex-wrap items-center gap-1.5">
        {[...visibleDefaults, ...visibleCustoms].map(lab => {
          const tone = labColor(lab.value)
          const referenced = referencedValues.has(lab.value)
          if (editing === lab.value) {
            return (
              <span key={lab.value} className="inline-flex items-center gap-1.5">
                <input
                  type="text"
                  value={editLabel}
                  onChange={(e) => { setEditLabel(e.target.value); setError(null) }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
                    if (e.key === 'Escape') { e.preventDefault(); setEditing(null); setError(null) }
                  }}
                  className="pmw-st__input bg-transparent outline-none border-b border-border/80 w-[140px] text-[12px] px-1 py-0.5"
                  autoFocus
                />
                <button type="button" onClick={commitEdit} className="pmw-st__btn-ghost text-[11px] hover:text-foreground">저장</button>
                <button type="button" onClick={() => { setEditing(null); setError(null) }} className="pmw-st__btn-ghost text-[11px] hover:text-foreground">취소</button>
              </span>
            )
          }
          return (
            <span
              key={lab.value}
              className={cn(chipCls(tone), 'group/lab relative pr-1')}
              title={referenced ? `${lab.value} — 사용 중(규칙·기본 검사기관)이라 삭제 불가. 클릭해 표시명 수정` : `${lab.value} — 클릭해 표시명 수정`}
            >
              <button
                type="button"
                onClick={() => startEdit(lab.value, lab.label)}
                className="hover:underline decoration-dotted underline-offset-2"
                aria-label={`${lab.label} 표시명 수정`}
              >
                {lab.label}
              </button>
              {!referenced && (
                <button
                  type="button"
                  onClick={() => remove(lab.value, lab.isCustom)}
                  className="ml-1 opacity-40 group-hover/lab:opacity-80 hover:!opacity-100 transition-opacity"
                  aria-label={`${lab.label} 삭제`}
                  tabIndex={-1}
                >
                  <X size={10} />
                </button>
              )}
            </span>
          )
        })}
        {adding ? (
          <div className="flex items-center gap-1.5 ml-1">
            <input
              type="text"
              value={valueInput}
              onChange={(e) => { setValueInput(e.target.value); setError(null) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); submit() }
                if (e.key === 'Escape') { e.preventDefault(); setAdding(false); setError(null) }
              }}
              placeholder="식별자 (mylab)"
              className="pmw-st__input bg-transparent outline-none border-b border-border/80 w-[120px] text-[12px] px-1 py-0.5"
              autoFocus
            />
            <input
              type="text"
              value={labelInput}
              onChange={(e) => { setLabelInput(e.target.value); setError(null) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); submit() }
                if (e.key === 'Escape') { e.preventDefault(); setAdding(false); setError(null) }
              }}
              placeholder="표시명 (MyLab)"
              className="pmw-st__input bg-transparent outline-none border-b border-border/80 w-[120px] text-[12px] px-1 py-0.5"
            />
            <button
              type="button"
              onClick={submit}
              className="pmw-st__btn-ghost text-[11px] hover:text-foreground"
              title="추가"
            >
              추가
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setError(null); setValueInput(''); setLabelInput('') }}
              className="pmw-st__btn-ghost text-[11px] hover:text-foreground"
              title="취소"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 border border-dashed border-border/80 text-muted-foreground hover:text-foreground hover:border-border transition-colors font-mono text-[11px] uppercase tracking-[1px]"
            title="검사기관 추가"
          >
            <Plus size={11} />
            추가
          </button>
        )}
        {error && (
          <span className="w-full font-serif text-[12px] text-destructive mt-1">
            {error}
          </span>
        )}
        {hidden.length > 0 && (
          <div className="w-full mt-1 flex flex-wrap items-center gap-1.5">
            <span className="font-serif text-[12px] text-muted-foreground/60">삭제한 기본 기관:</span>
            {hidden.map(v => {
              const label = overrides[v] ?? defaults.find(d => d.value === v)?.label ?? v
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => onHiddenChange(hidden.filter(x => x !== v))}
                  title="클릭해 복원"
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 border border-dashed border-border/80 font-mono text-[11px] uppercase tracking-[1px] text-muted-foreground/60 line-through hover:text-foreground hover:no-underline transition-colors"
                >
                  {label}
                  <span className="font-sans normal-case tracking-normal no-underline">복원</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </SettingsField>
  )
}

function SectionBlock({
  title,
  defaultLabs,
  customLabs,
  hiddenLabs,
  labelOverrides,
  onCustomLabsChange,
  onHiddenChange,
  onOverridesChange,
  defaultLab,
  rules,
  onDefaultChange,
  onRulesChange,
  showEuPreset,
  singleLab,
}: {
  title: string
  defaultLabs: InspectionLabOption[]
  customLabs: InspectionLabOption[]
  hiddenLabs: string[]
  labelOverrides: Record<string, string>
  onCustomLabsChange: (next: InspectionLabOption[]) => void
  onHiddenChange: (next: string[]) => void
  onOverridesChange: (next: Record<string, string>) => void
  defaultLab?: string
  rules: InspectionLabRule[]
  onDefaultChange?: (lab: string) => void
  onRulesChange: (next: InspectionLabRule[]) => void
  showEuPreset?: boolean
  singleLab?: boolean
}) {
  const hasDefault = defaultLab !== undefined && !!onDefaultChange
  // 선택지 = 효과 목록(숨김 제외 + 표시명 override) — 상세페이지·검사 탭과 같은 단일 출처 규칙.
  const hiddenSet = new Set(hiddenLabs)
  const labs: InspectionLabOption[] = [
    ...defaultLabs
      .filter(l => !hiddenSet.has(l.value))
      .map(l => ({ value: l.value, label: labelOverrides[l.value] ?? l.label })),
    ...customLabs,
  ]

  // Add-rule modal state
  const [addOpen, setAddOpen] = useState(false)

  // 규칙 편집 상태 — 목적지 목록 편집 중인 row idx.
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  function commitNewRule(rule: InspectionLabRule) {
    onRulesChange([...rules, rule])
    setAddOpen(false)
  }

  const hasEuRule = rules.some(r => r.label === '유럽연합' || sameSet(r.countries, EU_COUNTRIES))

  function addEuPreset() {
    if (hasEuRule) return
    const newRule: InspectionLabRule = {
      label: '유럽연합',
      countries: [...EU_COUNTRIES],
      labs: labs[0] ? [labs[0].value] : [],
    }
    onRulesChange([...rules, newRule])
  }

  function removeRule(idx: number) {
    onRulesChange(rules.filter((_, i) => i !== idx))
  }

  function setRuleLab(idx: number, labValue: string) {
    onRulesChange(rules.map((r, i) => i === idx ? { ...r, labs: [labValue] } : r))
  }

  function setRuleLabs(idx: number, labValues: string[]) {
    onRulesChange(rules.map((r, i) => i === idx ? { ...r, labs: labValues } : r))
  }

  function setRuleCountries(idx: number, nextCountries: string[]) {
    onRulesChange(rules.map((r, i) => i === idx ? { ...r, countries: nextCountries } : r))
  }

  function setRuleLabel(idx: number, nextLabel: string) {
    const trimmed = nextLabel.trim()
    onRulesChange(rules.map((r, i) => {
      if (i !== idx) return r
      if (trimmed) return { ...r, label: trimmed }
      const { label: _unused, ...rest } = r
      void _unused
      return rest
    }))
  }

  // 현재 이 섹션에서 참조 중인 lab value — 사용자 정의 lab 제거 가능 여부 판정용.
  const referencedValues = new Set<string>()
  if (defaultLab) referencedValues.add(defaultLab)
  for (const r of rules) for (const l of r.labs) referencedValues.add(l)

  return (
    <SettingsCard title={title}>
      {/* 기관 목록 (기본 + 사용자 정의) + 추가 */}
      <LabsAdminRow
        defaults={defaultLabs}
        customLabs={customLabs}
        hidden={hiddenLabs}
        overrides={labelOverrides}
        onCustomLabsChange={onCustomLabsChange}
        onHiddenChange={onHiddenChange}
        onOverridesChange={onOverridesChange}
        referencedValues={referencedValues}
      />

      {/* Default lab */}
      {hasDefault && (
        <SettingsField label="기본 검사기관" align="center">
          <LabPillSelect
            value={defaultLab}
            onChange={onDefaultChange!}
            options={labs}
            aria-label="기본 검사기관"
          />
        </SettingsField>
      )}

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="py-3 pmw-st__btn-ghost">
          {hasDefault
            ? '추가된 규칙 없음 — 모든 케이스가 기본 검사기관으로 자동 지정됩니다.'
            : '추가된 규칙 없음.'}
        </div>
      ) : (
        <ul>
          {rules.map((r, i) => {
            const visibleCountries = r.countries.slice(0, COUNTRY_PREVIEW_MAX)
            const overflowCount = r.countries.length - visibleCountries.length
            return (
              <li
                key={i}
                className="grid grid-cols-[1fr_auto_auto] items-start gap-md py-3 border-b border-dotted border-border/80"
              >
                {/* Left: group label + destination pills (click to edit) */}
                {editingIdx === i ? (
                  <div className="min-w-0 space-y-1.5">
                    <input
                      type="text"
                      value={r.label ?? ''}
                      onChange={(e) => setRuleLabel(i, e.target.value)}
                      placeholder="그룹명 (선택사항)"
                      className="pmw-st__input bg-transparent outline-none border-b border-border/80 font-serif text-[15px] px-0.5 py-0.5 w-full max-w-[240px]"
                      style={{ color: 'var(--pmw-deep)' }}
                    />
                    <DestinationPicker
                      values={r.countries}
                      onChange={(next) => setRuleCountries(i, next)}
                      placeholder="목적지 검색 (예: 독일, DE)"
                      aria-label="목적지 편집"
                      variant="underline"
                    />
                    <div className="pt-0.5">
                      <button
                        type="button"
                        onClick={() => setEditingIdx(null)}
                        className="pmw-st__btn-ghost hover:text-foreground transition-colors text-[11px]"
                      >
                        저장
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="min-w-0 cursor-pointer group/row-edit"
                    onClick={() => setEditingIdx(i)}
                    title="목적지 편집"
                  >
                    {r.label && (
                      <div className="font-serif text-[13px] text-muted-foreground mb-1.5 group-hover/row-edit:underline decoration-dotted underline-offset-2">
                        {r.label}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {visibleCountries.map(c => (
                        <DestinationPill key={c} name={c} />
                      ))}
                      {overflowCount > 0 && <OverflowPill count={overflowCount} />}
                    </div>
                  </div>
                )}

                {/* Right: labs */}
                <div className="flex items-start justify-end">
                  {singleLab ? (
                    <LabPillSelect
                      value={r.labs[0] ?? ''}
                      onChange={(v) => setRuleLab(i, v)}
                      options={labs}
                      aria-label="검사기관"
                    />
                  ) : (
                    <LabPillMultiSelect
                      values={r.labs}
                      onChange={(next) => setRuleLabs(i, next)}
                      options={labs}
                      minSelection={1}
                      placeholder="검사기관 선택"
                      aria-label="검사기관"
                    />
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => removeRule(i)}
                  className="text-muted-foreground/50 hover:text-foreground transition-colors pt-0.5"
                  title="규칙 제거"
                >
                  <X size={14} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Add new rule — modal trigger */}
      <div className="mt-md flex items-center justify-between">
        <div>
          {showEuPreset && !hasEuRule && (
            <button
              type="button"
              onClick={addEuPreset}
              className="pmw-st__btn-ghost hover:text-foreground transition-colors"
              title={`유럽연합 ${EU_COUNTRIES.length}개국 프리셋 추가`}
            >
              + 유럽연합 프리셋
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1 pmw-st__btn px-3 py-1 rounded-full border border-border/80 hover:bg-muted/40 transition-colors"
        >
          <Plus className="h-3 w-3" />
          규칙 추가
        </button>
      </div>

      {addOpen && (
        <RuleAddModal
          labs={labs}
          singleLab={!!singleLab}
          onClose={() => setAddOpen(false)}
          onSubmit={commitNewRule}
        />
      )}
    </SettingsCard>
  )
}

/* ── Rule Add Modal: Step 1 (목적지 vs 그룹) → Step 2 (form) ── */

function RuleAddModal({
  labs,
  singleLab,
  onClose,
  onSubmit,
}: {
  labs: InspectionLabOption[]
  singleLab: boolean
  onClose: () => void
  onSubmit: (rule: InspectionLabRule) => void
}) {
  const [mode, setMode] = useState<'single' | 'group' | null>(null)
  const [label, setLabel] = useState('')
  const [countries, setCountries] = useState<string[]>([])
  const [selectedLabs, setSelectedLabs] = useState<string[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (mode) setMode(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, onClose])

  if (!mounted) return null

  const canSubmit = countries.length > 0 && selectedLabs.length > 0 && (mode === 'single' || (mode === 'group' && countries.length >= 1))

  function submit() {
    if (!canSubmit) return
    const trimmedLabel = label.trim()
    const rule: InspectionLabRule = mode === 'group' && trimmedLabel
      ? { label: trimmedLabel, countries, labs: [...selectedLabs] }
      : { countries, labs: [...selectedLabs] }
    onSubmit(rule)
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-background rounded-sm border border-border/80 shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border/80 px-lg py-3">
          <div className="flex items-baseline gap-2">
            {mode && (
              <button
                type="button"
                onClick={() => setMode(null)}
                className="font-serif text-[15px] text-muted-foreground hover:text-foreground transition-colors"
              >
                규칙 추가
              </button>
            )}
            {mode && <span className="font-serif text-[15px] text-muted-foreground/60">›</span>}
            <h3 className="font-serif text-[15px] text-foreground">
              {mode === 'single' ? '목적지 추가' : mode === 'group' ? '그룹 추가' : '규칙 추가'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-lg py-md">
          {!mode && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setMode('single')}
                className="w-full text-left px-md py-3 rounded-md border border-border/80 hover:bg-muted/40 transition-colors"
              >
                <div className="font-serif text-[15px] text-foreground">목적지 추가</div>
                <div className="pmw-st__sec-lead mt-1">한 개의 목적지에 검사기관을 매핑합니다.</div>
              </button>
              <button
                type="button"
                onClick={() => setMode('group')}
                className="w-full text-left px-md py-3 rounded-md border border-border/80 hover:bg-muted/40 transition-colors"
              >
                <div className="font-serif text-[15px] text-foreground">그룹 추가</div>
                <div className="pmw-st__sec-lead mt-1">여러 목적지를 한 그룹으로 묶어 같은 검사기관을 매핑합니다.</div>
              </button>
            </div>
          )}

          {mode && (
            <div className="space-y-md">
              {mode === 'group' && (
                <div>
                  <label className="font-serif text-[13px] text-muted-foreground/80 block mb-1">그룹명</label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="예: 유럽연합"
                    autoFocus
                    className="w-full font-serif text-[15px] bg-transparent outline-none border-b border-border/80 focus:border-foreground/40 pb-1 transition-colors"
                  />
                </div>
              )}
              <div>
                <label className="font-serif text-[13px] text-muted-foreground/80 block mb-1">
                  {mode === 'single' ? '목적지' : '목적지 (여러 개 선택)'}
                </label>
                <DestinationPicker
                  values={countries}
                  onChange={(next) => {
                    if (mode === 'single' && next.length > 1) {
                      setCountries([next[next.length - 1]])
                    } else {
                      setCountries(next)
                    }
                  }}
                  placeholder="검색 (예: 독일, DE)"
                  aria-label="목적지"
                  variant="underline"
                />
              </div>
              <div>
                <label className="font-serif text-[13px] text-muted-foreground/80 block mb-1">검사기관</label>
                {singleLab ? (
                  <LabPillSelect
                    value={selectedLabs[0] ?? ''}
                    onChange={(v) => setSelectedLabs(v ? [v] : [])}
                    options={labs}
                    placeholder="검사기관 선택"
                    aria-label="검사기관"
                  />
                ) : (
                  <LabPillMultiSelect
                    values={selectedLabs}
                    onChange={setSelectedLabs}
                    options={labs}
                    placeholder="검사기관 선택"
                    aria-label="검사기관"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {mode && (
          <DialogFooter
            bordered
            onCancel={onClose}
            onPrimary={submit}
            primaryLabel="추가"
            primaryDisabled={!canSubmit}
          />
        )}
      </div>
    </div>,
    document.body,
  )
}

export function InspectionSection() {
  const { inspectionConfig, setInspectionConfig } = useCases()
  const [draft, setDraft] = useState<InspectionConfig>(inspectionConfig)
  const [saving, startSave] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const dirty = JSON.stringify(draft) !== JSON.stringify(inspectionConfig)

  function save() {
    startSave(async () => {
      const r = await saveInspectionConfigAction(draft)
      if (r.ok) {
        setInspectionConfig(r.config)
        setDraft(r.config)
        setMsg('저장되었습니다.')
        setTimeout(() => setMsg(null), 2500)
      } else {
        setMsg('저장 실패: ' + r.error)
      }
    })
  }

  function resetToDefaults() {
    setDraft(DEFAULT_INSPECTION_CONFIG)
  }

  return (
    <SettingsShell size="lg">
      <SettingsSection title="검사">
        <div className="space-y-lg">
        <SettingsCard
          title="표시 항목 설정"
          description="검사 탭 테이블에 표시할 항목을 선택합니다."
        >
          <TodoColumnsToggle tabId="inspection" bare />
        </SettingsCard>

        <SectionBlock
          title="광견병항체검사"
          defaultLabs={TITER_LABS}
          customLabs={draft.customTiterLabs ?? []}
          hiddenLabs={draft.hiddenTiterLabs ?? []}
          labelOverrides={draft.titerLabelOverrides ?? {}}
          onCustomLabsChange={(customTiterLabs) =>
            setDraft({
              ...draft,
              customTiterLabs: customTiterLabs.length > 0 ? customTiterLabs : undefined,
            })
          }
          onHiddenChange={(hiddenTiterLabs) =>
            setDraft({
              ...draft,
              hiddenTiterLabs: hiddenTiterLabs.length > 0 ? hiddenTiterLabs : undefined,
            })
          }
          onOverridesChange={(titerLabelOverrides) =>
            setDraft({
              ...draft,
              titerLabelOverrides: Object.keys(titerLabelOverrides).length > 0 ? titerLabelOverrides : undefined,
            })
          }
          defaultLab={draft.titerDefault}
          rules={draft.titerRules}
          onDefaultChange={(lab) => setDraft({ ...draft, titerDefault: lab })}
          onRulesChange={(titerRules) => setDraft({ ...draft, titerRules })}
          showEuPreset
          singleLab
        />

        <SectionBlock
          title="전염병검사"
          defaultLabs={INFECTIOUS_LABS}
          customLabs={draft.customInfectiousLabs ?? []}
          hiddenLabs={draft.hiddenInfectiousLabs ?? []}
          labelOverrides={draft.infectiousLabelOverrides ?? {}}
          onCustomLabsChange={(customInfectiousLabs) =>
            setDraft({
              ...draft,
              customInfectiousLabs: customInfectiousLabs.length > 0 ? customInfectiousLabs : undefined,
            })
          }
          onHiddenChange={(hiddenInfectiousLabs) =>
            setDraft({
              ...draft,
              hiddenInfectiousLabs: hiddenInfectiousLabs.length > 0 ? hiddenInfectiousLabs : undefined,
            })
          }
          onOverridesChange={(infectiousLabelOverrides) =>
            setDraft({
              ...draft,
              infectiousLabelOverrides: Object.keys(infectiousLabelOverrides).length > 0 ? infectiousLabelOverrides : undefined,
            })
          }
          rules={draft.infectiousRules}
          onRulesChange={(infectiousRules) => setDraft({ ...draft, infectiousRules })}
        />
        </div>

        {/* Footer actions — 두 카드(광견병·전염병) 공통 저장 */}
        <SettingsFooter className="justify-between mt-lg border-t-0">
          <SettingsActionButton onClick={resetToDefaults}>
            기본값으로 되돌리기
          </SettingsActionButton>
          <div className="flex items-center gap-md">
            {msg && <span className="pmw-st__sec-lead">{msg}</span>}
            <PillButton variant="solid" onClick={save} disabled={!dirty || saving}>
              {saving ? '저장 중…' : '변경사항 저장'}
            </PillButton>
          </div>
        </SettingsFooter>
      </SettingsSection>
    </SettingsShell>
  )
}
