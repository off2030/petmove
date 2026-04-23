'use client'

import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { useCases } from '@/components/cases/cases-context'
import { saveInspectionConfigAction } from '@/lib/actions/inspection-config-action'
import {
  DEFAULT_INSPECTION_CONFIG,
  EU_COUNTRIES,
  INFECTIOUS_LABS,
  TITER_LABS,
  type InspectionConfig,
  type InspectionLabRule,
} from '@petmove/domain'

function labLabel(labs: { value: string; label: string }[], value: string): string {
  return labs.find(l => l.value === value)?.label ?? value
}

function ruleDisplayName(rule: InspectionLabRule): string {
  if (rule.label) return rule.label
  return rule.countries.join(', ')
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every(x => s.has(x))
}

function SectionBlock({
  title,
  description,
  labs,
  defaultLab,
  rules,
  onDefaultChange,
  onRulesChange,
  showEuPreset,
  singleLab,
}: {
  title: string
  description: string
  labs: { value: string; label: string }[]
  defaultLab?: string
  rules: InspectionLabRule[]
  onDefaultChange?: (lab: string) => void
  onRulesChange: (next: InspectionLabRule[]) => void
  showEuPreset?: boolean
  /** true면 한 규칙당 검사기관 1개만 선택 가능 (광견병항체용). */
  singleLab?: boolean
}) {
  const hasDefault = defaultLab !== undefined && !!onDefaultChange

  // Add-new state
  const [countriesInput, setCountriesInput] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [selectedLabs, setSelectedLabs] = useState<string[]>(labs[0] ? [labs[0].value] : [])

  function parseCountries(raw: string): string[] {
    return Array.from(new Set(raw.split(',').map(s => s.trim()).filter(Boolean)))
  }

  function addRule() {
    const countries = parseCountries(countriesInput)
    if (countries.length === 0 || selectedLabs.length === 0) return
    const label = labelInput.trim() || undefined
    const newRule: InspectionLabRule = label
      ? { label, countries, labs: [...selectedLabs] }
      : { countries, labs: [...selectedLabs] }
    onRulesChange([...rules, newRule])
    setCountriesInput('')
    setLabelInput('')
    setSelectedLabs(labs[0] ? [labs[0].value] : [])
  }

  function addEuPreset() {
    // 중복된 EU 그룹은 만들지 않음: label='유럽연합' 규칙이 이미 있으면 스킵.
    if (rules.some(r => r.label === '유럽연합' || sameSet(r.countries, EU_COUNTRIES))) return
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

  function addRuleLab(idx: number, labValue: string) {
    onRulesChange(rules.map((r, i) => {
      if (i !== idx) return r
      if (r.labs.includes(labValue)) return r
      return { ...r, labs: [...r.labs, labValue] }
    }))
  }

  function removeRuleLab(idx: number, labValue: string) {
    onRulesChange(rules.map((r, i) => {
      if (i !== idx) return r
      const next = r.labs.filter(l => l !== labValue)
      if (next.length === 0) return r // 최소 1개 유지
      return { ...r, labs: next }
    }))
  }

  function addNewLab(labValue: string) {
    setSelectedLabs(prev => prev.includes(labValue) ? prev : [...prev, labValue])
  }

  function removeNewLab(labValue: string) {
    setSelectedLabs(prev => {
      const next = prev.filter(l => l !== labValue)
      return next.length === 0 ? prev : next
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-serif text-[17px] text-foreground pb-2 border-b border-border/60">{title}</h3>
        <p className="text-sm text-muted-foreground mt-sm">{description}</p>
      </div>

      {/* Default */}
      {hasDefault && (
        <div className="flex items-center gap-sm">
          <span className="text-sm w-24">기본 검사기관</span>
          <select
            value={defaultLab}
            onChange={(e) => onDefaultChange!(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          >
            {labs.map(l => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">규칙에 매칭되지 않으면 이 기관이 사용됩니다.</span>
        </div>
      )}

      {/* Rules list */}
      <div>
        <div className="text-sm mb-2">국가별 규칙</div>
        {rules.length === 0 ? (
          <div className="text-sm text-muted-foreground/60 italic">
            {hasDefault
              ? '추가된 규칙 없음 — 모든 케이스가 기본 검사기관으로 자동 지정됩니다.'
              : '추가된 규칙 없음.'}
          </div>
        ) : (
          <ul className="space-y-2">
            {rules.map((r, i) => (
              <li key={i} className="flex items-start gap-sm rounded-md border border-border/50 bg-background p-sm">
                {/* Countries */}
                <div className="flex-1 min-w-0">
                  {r.label && (
                    <div className="text-sm font-medium mb-1">{r.label}</div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {r.countries.map(c => (
                      <span key={c} className="inline-flex items-center rounded bg-muted/70 px-1.5 py-0.5 text-xs">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Labs: single dropdown | multi chips+add */}
                <div className="min-w-[160px] pt-0.5">
                  {singleLab ? (
                    <select
                      value={r.labs[0] ?? ''}
                      onChange={(e) => setRuleLab(i, e.target.value)}
                      className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                    >
                      {labs.map(l => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1">
                      {r.labs.map(labVal => (
                        <span key={labVal} className="inline-flex items-center gap-1 rounded bg-primary/15 text-primary px-1.5 py-0.5 text-xs font-medium">
                          {labLabel(labs, labVal)}
                          {r.labs.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeRuleLab(i, labVal)}
                              className="hover:text-red-500 transition-colors"
                              title="제거"
                            >
                              <X size={10} />
                            </button>
                          )}
                        </span>
                      ))}
                      {labs.some(l => !r.labs.includes(l.value)) && (
                        <select
                          value=""
                          onChange={(e) => { if (e.target.value) addRuleLab(i, e.target.value) }}
                          className="h-6 rounded border border-dashed border-border bg-background px-1 text-xs text-muted-foreground outline-none focus:border-primary"
                        >
                          <option value="">+ 추가</option>
                          {labs.filter(l => !r.labs.includes(l.value)).map(l => (
                            <option key={l.value} value={l.value}>{l.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => removeRule(i)}
                  className="text-muted-foreground/60 hover:text-red-500 transition-colors pt-1"
                  title="규칙 제거"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Add new rule */}
        <div className="mt-3 rounded-md border border-dashed border-border/60 p-sm space-y-2">
          <div className="flex items-center gap-xs">
            <span className="text-xs text-muted-foreground w-24 shrink-0">그룹명 (선택)</span>
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder="예: 유럽연합"
              className="flex-1 h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex items-start gap-xs">
            <span className="text-xs text-muted-foreground w-24 shrink-0 pt-1.5">국가명</span>
            <textarea
              value={countriesInput}
              onChange={(e) => setCountriesInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  addRule()
                }
              }}
              placeholder="쉼표로 구분 (예: 독일, 프랑스)"
              rows={1}
              className="flex-1 min-h-8 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary resize-y"
            />
          </div>
          <div className="flex items-start gap-xs">
            <span className="text-xs text-muted-foreground w-24 shrink-0 pt-1.5">검사기관</span>
            <div className="flex-1">
              {singleLab ? (
                <select
                  value={selectedLabs[0] ?? ''}
                  onChange={(e) => setSelectedLabs([e.target.value])}
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                >
                  {labs.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              ) : (
                <div className="flex flex-wrap items-center gap-1">
                  {selectedLabs.map(labVal => (
                    <span key={labVal} className="inline-flex items-center gap-1 rounded bg-primary/15 text-primary px-1.5 py-0.5 text-xs font-medium">
                      {labLabel(labs, labVal)}
                      {selectedLabs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeNewLab(labVal)}
                          className="hover:text-red-500 transition-colors"
                          title="제거"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </span>
                  ))}
                  {labs.some(l => !selectedLabs.includes(l.value)) && (
                    <select
                      value=""
                      onChange={(e) => { if (e.target.value) addNewLab(e.target.value) }}
                      className="h-6 rounded border border-dashed border-border bg-background px-1 text-xs text-muted-foreground outline-none focus:border-primary"
                    >
                      <option value="">+ 추가</option>
                      {labs.filter(l => !selectedLabs.includes(l.value)).map(l => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-xs">
              {showEuPreset && (
                <button
                  type="button"
                  onClick={addEuPreset}
                  className="text-xs px-2 py-1 rounded-md border border-border bg-card hover:bg-accent transition-colors"
                  title={`유럽연합 27개국을 기본 labs=${labLabel(labs, labs[0]?.value ?? '')} 로 추가`}
                >
                  + 유럽연합 추가
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={addRule}
              disabled={!countriesInput.trim() || selectedLabs.length === 0}
              className="h-8 px-md rounded-md border border-border bg-card text-sm hover:bg-accent transition-colors disabled:opacity-40"
            >
              추가
            </button>
          </div>
        </div>
      </div>
    </div>
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
    <div className="space-y-lg max-w-3xl">
      <SectionBlock
        title="광견병항체검사"
        description="국가(또는 국가 그룹)별 항체검사 의뢰 기관. 규칙에 매칭되지 않으면 기본 검사기관으로 처리됩니다."
        labs={TITER_LABS}
        defaultLab={draft.titerDefault}
        rules={draft.titerRules}
        onDefaultChange={(lab) => setDraft({ ...draft, titerDefault: lab })}
        onRulesChange={(titerRules) => setDraft({ ...draft, titerRules })}
        showEuPreset
        singleLab
      />

      <SectionBlock
        title="전염병검사"
        description="국가(또는 국가 그룹)별 전염병검사 의뢰 기관. 검사기관을 여러 개 지정하면 상세페이지에서 검사일 등록 시 기관별로 기록이 하나씩 생성됩니다."
        labs={INFECTIOUS_LABS}
        rules={draft.infectiousRules}
        onRulesChange={(infectiousRules) => setDraft({ ...draft, infectiousRules })}
      />

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={resetToDefaults}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          기본값으로 되돌리기
        </button>
        <div className="flex items-center gap-xs">
          {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="h-9 px-md rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
