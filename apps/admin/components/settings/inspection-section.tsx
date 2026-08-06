'use client'

import { useState, useTransition } from 'react'
import { Plus, X } from 'lucide-react'
import { useCases } from '@/components/cases/cases-context'
import { TodoColumnsToggle } from './todo-columns-toggle'
import { LabPillSelect, LabPillMultiSelect } from '@/components/ui/lab-pill-select'
import {
  SettingsActionButton,
  SettingsAddButton,
  SettingsCard,
  SettingsChip,
  SettingsControlGroup,
  SettingsShell,
  SettingsSection,
  SettingsField,
  SettingsFooter,
  SettingsSaveButton,
} from './settings-layout'
import { MappingEditModal, MappingRow } from './mapping-row'
import { labColor } from '@/lib/lab-color'
import { cn } from '@/lib/utils'
import { saveInspectionConfigAction } from '@/lib/actions/inspection-config-action'
import {
  DEFAULT_INSPECTION_CONFIG,
  INFECTIOUS_LABS,
  TITER_LABS,
  type InspectionConfig,
  type InspectionLabOption,
  type InspectionLabRule,
} from '@petmove/domain'

/** 검사기관 칩의 글꼴 — 코드성 식별자라 mono·대문자. 크기는 규격에서 물려받는다. */
const LAB_CHIP_FONT = 'font-mono uppercase tracking-[1px]'

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
  const visibleValues = [...visibleDefaults.map(d => d.value), ...customLabs.map(c => c.value)]

  function submit() {
    const rawValue = valueInput.trim().toLowerCase().replace(/\s+/g, '_')
    const rawLabel = labelInput.trim()
    if (!rawValue || !rawLabel) {
      setError('식별자와 표시명을 모두 입력하세요')
      return
    }
    if (visibleValues.includes(rawValue)) {
      setError('이미 존재하는 식별자입니다')
      return
    }
    // 삭제했던 내장 기관과 같은 식별자로 추가하면 — 새 기관을 만들지 않고 원래 기관을
    // 되살린다(서식·규칙 연동 보존). 표시명이 다르면 override 로 반영.
    const hiddenMatch = defaults.find(d => d.value === rawValue && hiddenSet.has(d.value))
    if (hiddenMatch) {
      onHiddenChange(hidden.filter(x => x !== rawValue))
      if (rawLabel !== hiddenMatch.label) onOverridesChange({ ...overrides, [rawValue]: rawLabel })
    } else {
      onCustomLabsChange([...customLabs, { value: rawValue, label: rawLabel }])
    }
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

  return (
    <SettingsField label="기관 목록" align="start">
      <SettingsControlGroup size="sm" wrap>
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
            <SettingsChip
              key={lab.value}
              tone="plain"
              className={cn(LAB_CHIP_FONT, tone ? cn(tone.bg, tone.text) : 'bg-muted/60 text-muted-foreground')}
              title={referenced ? `${lab.value} — 사용 중(규칙·기본 검사기관)이라 삭제 불가. 클릭해 표시명 수정` : `${lab.value} — 클릭해 표시명 수정`}
              onRemove={referenced ? undefined : () => remove(lab.value, lab.isCustom)}
              removeLabel={`${lab.label} 삭제`}
            >
              <button
                type="button"
                onClick={() => startEdit(lab.value, lab.label)}
                className="hover:underline decoration-dotted underline-offset-2"
                aria-label={`${lab.label} 표시명 수정`}
              >
                {lab.label}
              </button>
            </SettingsChip>
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
          <SettingsAddButton
            onClick={() => setAdding(true)}
            className={LAB_CHIP_FONT}
            title="검사기관 추가"
          >
            <Plus size={11} />
            추가
          </SettingsAddButton>
        )}
        {error && (
          <span className="w-full font-serif text-[12px] text-destructive mt-1">
            {error}
          </span>
        )}
      </SettingsControlGroup>
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
  footer,
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
  /** 카드 하단 저장 영역 — 광견병·전염병 카드가 같은 config 를 저장하므로 양쪽에 동일하게 붙는다. */
  footer?: React.ReactNode
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

  // 매핑 추가 팝업 / 편집 중인 행 idx.
  const [addOpen, setAddOpen] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

  function removeRule(idx: number) {
    onRulesChange(rules.filter((_, i) => i !== idx))
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

      {/* 여행지 → 검사기관 매핑 — 목록은 읽기 전용 한 줄, 편집·삭제는 팝업 (2026-08-06).
          목록에 ✕ 를 두지 않아 스치는 클릭으로 매핑이 사라지지 않는다. */}
      <SettingsField label="여행지별 검사기관" align="start">
        <div className="min-w-0">
          {rules.length === 0 && (
            <p className="py-1 pmw-st__btn-ghost">
              {hasDefault
                ? '매핑 없음 — 모든 케이스가 기본 검사기관으로 지정됩니다.'
                : '매핑 없음.'}
            </p>
          )}
          {rules.map((r, i) => (
            <MappingRow key={i} countries={r.countries} onEdit={() => setEditingIdx(i)}>
              {r.labs.map((v) => {
                const tone = labColor(v)
                return (
                  <SettingsChip
                    key={v}
                    tone="plain"
                    className={cn(
                      LAB_CHIP_FONT,
                      tone ? cn(tone.bg, tone.text) : 'bg-muted/60 text-muted-foreground',
                    )}
                  >
                    {labs.find((l) => l.value === v)?.label ?? v}
                  </SettingsChip>
                )
              })}
            </MappingRow>
          ))}
          <SettingsControlGroup size="sm" className="pt-2">
            <SettingsAddButton onClick={() => setAddOpen(true)}>＋ 매핑 추가</SettingsAddButton>
          </SettingsControlGroup>
        </div>
      </SettingsField>

      {editingIdx !== null && rules[editingIdx] && (
        <MappingAddModal
          labs={labs}
          initial={rules[editingIdx]}
          onClose={() => setEditingIdx(null)}
          onSubmit={(rule) => {
            onRulesChange(rules.map((r, i) => (i === editingIdx ? rule : r)))
            setEditingIdx(null)
          }}
          onDelete={() => {
            removeRule(editingIdx)
            setEditingIdx(null)
          }}
        />
      )}

      {addOpen && (
        <MappingAddModal
          labs={labs}
          onClose={() => setAddOpen(false)}
          onSubmit={(rule) => {
            onRulesChange([...rules, rule])
            setAddOpen(false)
          }}
        />
      )}

      {footer}
    </SettingsCard>
  )
}

/* ── 매핑 추가·편집 팝업 — 공용 MappingEditModal 위에 검사기관 선택만 얹는다 ── */

function MappingAddModal({
  labs,
  initial,
  onClose,
  onSubmit,
  onDelete,
}: {
  labs: InspectionLabOption[]
  /** 있으면 편집 모드 — 없으면 추가. */
  initial?: InspectionLabRule
  onClose: () => void
  onSubmit: (rule: InspectionLabRule) => void
  onDelete?: () => void
}) {
  const [countries, setCountries] = useState<string[]>(initial?.countries ?? [])
  const [selectedLabs, setSelectedLabs] = useState<string[]>(initial?.labs ?? [])

  const canSubmit = countries.length > 0 && selectedLabs.length > 0

  function submit() {
    if (!canSubmit) return
    onSubmit({ countries, labs: [...selectedLabs] })
  }

  return (
    <MappingEditModal
      title={initial ? '매핑 편집' : '매핑 추가'}
      countries={countries}
      onCountriesChange={setCountries}
      resultLabel="검사기관"
      canSubmit={canSubmit}
      onSubmit={submit}
      onDelete={onDelete}
      onClose={onClose}
    >
      <LabPillMultiSelect
        values={selectedLabs}
        onChange={setSelectedLabs}
        options={labs}
        placeholder="검사기관 선택"
        aria-label="검사기관"
      />
    </MappingEditModal>
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

  // 저장 영역 — 두 카드가 같은 config 를 저장하므로 동일 노드를 양쪽 하단에 배치.
  const saveFooter = (
    <SettingsFooter className="justify-between">
      <SettingsActionButton onClick={resetToDefaults}>
        기본값으로 되돌리기
      </SettingsActionButton>
      <div className="flex items-center gap-md">
        {msg && <span className="pmw-st__sec-lead">{msg}</span>}
        <SettingsSaveButton onClick={save} disabled={!dirty || saving}>
          {saving ? '저장 중…' : '저장'}
        </SettingsSaveButton>
      </div>
    </SettingsFooter>
  )

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

        {/* 광견병·전염병은 서로 다른 설정이라 카드도 각각 (2026-08-06 사용자 지시).
            둘 다 같은 inspection_config 를 저장하므로 저장 영역(saveFooter)이 양쪽 카드
            하단에 동일하게 붙는다 — 어느 쪽을 눌러도 탭 전체 변경이 함께 저장된다. */}
        <SectionBlock
          title="광견병항체검사"
          footer={saveFooter}
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
        />

        <SectionBlock
          title="전염병검사"
          footer={saveFooter}
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
      </SettingsSection>
    </SettingsShell>
  )
}
