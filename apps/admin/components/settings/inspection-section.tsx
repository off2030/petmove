'use client'

import { useState, useTransition } from 'react'
import { Plus, X } from 'lucide-react'
import { useCases } from '@/components/cases/cases-context'
import { DestinationPicker } from '@/components/ui/destination-picker'
import { LabPillSelect, LabPillMultiSelect } from '@/components/ui/lab-pill-select'
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

/** Editorial small-cap section label — profile/company 와 동일 스타일. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <span className="font-serif text-[13px] text-muted-foreground/80">
        {children}
      </span>
    </div>
  )
}

/** 신고 탭과 동일 — 얇은 border + sans 12px. */
function DestinationPill({ name }: { name: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-sans text-[12px] whitespace-nowrap"
      style={{
        borderColor: 'var(--pmw-border-warm)',
        color: 'var(--pmw-near-black)',
      }}
    >
      {name}
    </span>
  )
}

function OverflowPill({ count }: { count: number }) {
  return (
    <span
      className="inline-flex items-center rounded-sm border px-2 py-0.5 font-sans text-[12px]"
      style={{
        borderColor: 'var(--pmw-border-warm)',
        color: 'var(--pmw-near-black)',
      }}
    >
      +{count}개국
    </span>
  )
}

/** "기관 목록" 행: 기본/사용자 정의 기관을 작은 tone chip 으로 나열 + 추가/제거. */
function LabsAdminRow({
  defaults,
  customLabs,
  onCustomLabsChange,
  referencedValues,
}: {
  defaults: InspectionLabOption[]
  customLabs: InspectionLabOption[]
  onCustomLabsChange: (next: InspectionLabOption[]) => void
  referencedValues: Set<string>
}) {
  const [adding, setAdding] = useState(false)
  const [valueInput, setValueInput] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [error, setError] = useState<string | null>(null)

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

  function removeCustom(value: string) {
    if (referencedValues.has(value)) return
    onCustomLabsChange(customLabs.filter(l => l.value !== value))
  }

  function chipCls(tone: ReturnType<typeof labColor>, isCustom: boolean): string {
    const base = 'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-[1px] whitespace-nowrap'
    if (tone) return cn(base, tone.bg, tone.text)
    if (isCustom) return cn(base, 'bg-muted/50 text-muted-foreground')
    return cn(base, 'bg-muted/60 text-muted-foreground')
  }

  return (
    <div className="grid grid-cols-[160px_1fr] items-start gap-md py-3 border-b border-border/60">
      <span className="font-serif text-[13px] text-muted-foreground pt-1">기관 목록</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {defaults.map(d => {
          const tone = labColor(d.value)
          return (
            <span key={d.value} className={chipCls(tone, false)} title={d.value}>
              {d.label}
            </span>
          )
        })}
        {customLabs.map(c => {
          const tone = labColor(c.value)
          const referenced = referencedValues.has(c.value)
          return (
            <span
              key={c.value}
              className={cn(chipCls(tone, true), 'group/lab relative pr-1')}
              title={referenced ? `${c.value} (사용 중 — 제거 불가)` : c.value}
            >
              {c.label}
              {!referenced && (
                <button
                  type="button"
                  onClick={() => removeCustom(c.value)}
                  className="ml-1 opacity-40 group-hover/lab:opacity-80 hover:!opacity-100 transition-opacity"
                  aria-label={`${c.label} 제거`}
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
              className="pmw-st__input bg-transparent outline-none border-b border-border/60 w-[120px] text-[12px] px-1 py-0.5"
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
              className="pmw-st__input bg-transparent outline-none border-b border-border/60 w-[120px] text-[12px] px-1 py-0.5"
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
            className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 border border-dashed border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors font-mono text-[11px] uppercase tracking-[1px]"
            title="검사기관 추가"
          >
            <Plus size={11} />
            추가
          </button>
        )}
        {error && (
          <span className="w-full font-serif italic text-[12px] text-destructive mt-1">
            {error}
          </span>
        )}
      </div>
    </div>
  )
}

function SectionBlock({
  title,
  defaultLabs,
  customLabs,
  onCustomLabsChange,
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
  onCustomLabsChange: (next: InspectionLabOption[]) => void
  defaultLab?: string
  rules: InspectionLabRule[]
  onDefaultChange?: (lab: string) => void
  onRulesChange: (next: InspectionLabRule[]) => void
  showEuPreset?: boolean
  singleLab?: boolean
}) {
  const hasDefault = defaultLab !== undefined && !!onDefaultChange
  const labs: InspectionLabOption[] = [...defaultLabs, ...customLabs]

  // Add-new state
  const [countries, setCountries] = useState<string[]>([])
  const [labelInput, setLabelInput] = useState('')
  const [selectedLabs, setSelectedLabs] = useState<string[]>([])

  // 규칙 편집 상태 — 목적지 목록 편집 중인 row idx.
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  function addRule() {
    if (countries.length === 0 || selectedLabs.length === 0) return
    const label = labelInput.trim() || undefined
    const newRule: InspectionLabRule = label
      ? { label, countries, labs: [...selectedLabs] }
      : { countries, labs: [...selectedLabs] }
    onRulesChange([...rules, newRule])
    setCountries([])
    setLabelInput('')
    setSelectedLabs([])
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
    <section className="mb-xl">
      {/* Section label */}
      <SectionLabel>{title}</SectionLabel>
      <div className="border-t border-border/70" />

      {/* 기관 목록 (기본 + 사용자 정의) + 추가 */}
      <LabsAdminRow
        defaults={defaultLabs}
        customLabs={customLabs}
        onCustomLabsChange={onCustomLabsChange}
        referencedValues={referencedValues}
      />

      {/* Default lab */}
      {hasDefault && (
        <div className="grid grid-cols-[160px_1fr] items-center gap-md py-3 border-b border-border/60">
          <span className="font-serif text-[13px] text-muted-foreground">기본 검사기관</span>
          <LabPillSelect
            value={defaultLab}
            onChange={onDefaultChange!}
            options={labs}
            aria-label="기본 검사기관"
          />
        </div>
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
                className="grid grid-cols-[1fr_auto_auto] items-start gap-md py-3 border-b border-border/60"
              >
                {/* Left: group label + destination pills (click to edit) */}
                {editingIdx === i ? (
                  <div className="min-w-0 space-y-1.5">
                    <input
                      type="text"
                      value={r.label ?? ''}
                      onChange={(e) => setRuleLabel(i, e.target.value)}
                      placeholder="그룹명 (선택사항)"
                      className="pmw-st__input bg-transparent outline-none border-b border-border/60 font-serif italic text-[15px] px-0.5 py-0.5 w-full max-w-[240px]"
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
                        편집 완료
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

      {/* Add new rule — bordered card with separated input rows */}
      <div className="mt-md border border-border/60 rounded-sm bg-muted/30">
        <div className="grid grid-cols-[120px_1fr] items-center gap-md px-lg py-3 border-b border-border/40">
          <span className="font-serif text-[13px] text-muted-foreground/80">그룹명</span>
          <input
            type="text"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            placeholder="예: 유럽연합 (선택사항)"
            className="font-serif text-[15px] bg-transparent outline-none border-b border-transparent focus:border-foreground/40 w-full pb-1 transition-colors"
          />
        </div>
        <div className="grid grid-cols-[120px_1fr] items-start gap-md px-lg py-3 border-b border-border/40">
          <span className="font-serif text-[13px] text-muted-foreground/80 pt-1.5">목적지</span>
          <DestinationPicker
            values={countries}
            onChange={setCountries}
            placeholder="목적지 검색 (예: 독일, DE)"
            aria-label="목적지"
            variant="underline"
          />
        </div>
        <div className="grid grid-cols-[120px_1fr] items-center gap-md px-lg py-3">
          <span className="font-serif text-[13px] text-muted-foreground/80">검사기관</span>
          <div>
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
        <div className="flex items-center justify-between px-lg py-2.5 border-t border-border/40 bg-background/50">
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
            onClick={addRule}
            disabled={countries.length === 0 || selectedLabs.length === 0}
            className="pmw-st__btn px-md py-1 rounded-full border border-border/60 hover:bg-muted/40 transition-colors disabled:opacity-40"
          >
            규칙 추가
          </button>
        </div>
      </div>
    </section>
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
    <div className="max-w-5xl pb-2xl">
      {/* Editorial header */}
      <header className="pb-xl">
        <h2 className="font-serif text-[28px] leading-tight text-foreground">검사</h2>
        <p className="pmw-st__sec-lead mt-2">
          목적지별 광견병항체검사·전염병검사 의뢰 기관을 매핑합니다. 케이스 등록 시 자동 적용됩니다.
        </p>
      </header>

      <SectionBlock
        title="광견병항체검사"
        defaultLabs={TITER_LABS}
        customLabs={draft.customTiterLabs ?? []}
        onCustomLabsChange={(customTiterLabs) =>
          setDraft({
            ...draft,
            customTiterLabs: customTiterLabs.length > 0 ? customTiterLabs : undefined,
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
        onCustomLabsChange={(customInfectiousLabs) =>
          setDraft({
            ...draft,
            customInfectiousLabs: customInfectiousLabs.length > 0 ? customInfectiousLabs : undefined,
          })
        }
        rules={draft.infectiousRules}
        onRulesChange={(infectiousRules) => setDraft({ ...draft, infectiousRules })}
      />

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-lg border-t border-border/60">
        <button
          type="button"
          onClick={resetToDefaults}
          className="pmw-st__btn-ghost hover:text-foreground transition-colors"
        >
          기본값으로 되돌리기
        </button>
        <div className="flex items-center gap-md">
          {msg && <span className="pmw-st__sec-lead">{msg}</span>}
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="font-serif text-[14px] h-8 px-md rounded-full bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? '저장 중…' : '변경사항 저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
