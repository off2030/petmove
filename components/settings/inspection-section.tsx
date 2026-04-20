'use client'

import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { useCases } from '@/components/cases/cases-context'
import { saveInspectionConfigAction } from '@/lib/actions/inspection-config-action'
import {
  DEFAULT_INSPECTION_CONFIG,
  INFECTIOUS_LABS,
  TITER_LABS,
  type InspectionConfig,
  type InspectionLabOverride,
} from '@/lib/inspection-config-defaults'

function labLabel(labs: { value: string; label: string }[], value: string): string {
  return labs.find(l => l.value === value)?.label ?? value
}

function SectionBlock({
  title,
  description,
  labs,
  defaultLab,
  overrides,
  onDefaultChange,
  onOverridesChange,
}: {
  title: string
  description: string
  labs: { value: string; label: string }[]
  defaultLab: string
  overrides: InspectionLabOverride[]
  onDefaultChange: (lab: string) => void
  onOverridesChange: (next: InspectionLabOverride[]) => void
}) {
  const [country, setCountry] = useState('')
  const [lab, setLab] = useState(labs[0]?.value ?? '')

  function addOverride() {
    const c = country.trim()
    if (!c || !lab) return
    const next = overrides.filter(o => o.country !== c)
    next.push({ country: c, lab })
    onOverridesChange(next)
    setCountry('')
  }

  function removeOverride(c: string) {
    onOverridesChange(overrides.filter(o => o.country !== c))
  }

  return (
    <div className="border border-border/60 rounded-lg p-md space-y-4">
      <div>
        <h4 className="font-medium text-base">{title}</h4>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>

      {/* Default */}
      <div className="flex items-center gap-sm">
        <span className="text-sm w-24">기본 검사기관</span>
        <select
          value={defaultLab}
          onChange={(e) => onDefaultChange(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
        >
          {labs.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">국가별 오버라이드가 없으면 이 기관이 사용됩니다.</span>
      </div>

      {/* Overrides list */}
      <div>
        <div className="text-sm mb-2">국가별 오버라이드</div>
        {overrides.length === 0 ? (
          <div className="text-sm text-muted-foreground/60 italic">추가된 국가 없음 — 모든 케이스가 기본 검사기관으로 자동 지정됩니다.</div>
        ) : (
          <ul className="space-y-1">
            {overrides.map(o => (
              <li key={o.country} className="flex items-center gap-sm">
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-sm min-w-[100px]">
                  {o.country}
                </span>
                <span className="text-muted-foreground text-sm">→</span>
                <select
                  value={o.lab}
                  onChange={(e) => onOverridesChange(overrides.map(ov => ov.country === o.country ? { ...ov, lab: e.target.value } : ov))}
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                >
                  {labs.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeOverride(o.country)}
                  className="text-muted-foreground/60 hover:text-red-500 transition-colors"
                  title="제거"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Add new */}
        <div className="flex gap-xs mt-3">
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOverride() } }}
            placeholder="국가명 (예: 영국)"
            className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
          />
          <select
            value={lab}
            onChange={(e) => setLab(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
          >
            {labs.map(l => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={addOverride}
            disabled={!country.trim()}
            className="h-9 px-md rounded-md border border-border bg-card text-sm hover:bg-accent transition-colors disabled:opacity-40"
          >
            추가
          </button>
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
    <div className="space-y-4 max-w-3xl">
      <SectionBlock
        title="광견병항체검사"
        description="국가별로 항체검사를 의뢰할 검사기관을 지정합니다. 지정 안 된 국가는 기본 검사기관으로 처리됩니다."
        labs={TITER_LABS}
        defaultLab={draft.titerDefault}
        overrides={draft.titerOverrides}
        onDefaultChange={(lab) => setDraft({ ...draft, titerDefault: lab })}
        onOverridesChange={(titerOverrides) => setDraft({ ...draft, titerOverrides })}
      />

      <SectionBlock
        title="전염병검사"
        description="국가별 전염병검사 의뢰 기관. 뉴질랜드는 APQA HQ + VBDDL 이중 검사로 특수 처리됩니다(설정과 무관)."
        labs={INFECTIOUS_LABS}
        defaultLab={draft.infectiousDefault}
        overrides={draft.infectiousOverrides}
        onDefaultChange={(lab) => setDraft({ ...draft, infectiousDefault: lab })}
        onOverridesChange={(infectiousOverrides) => setDraft({ ...draft, infectiousOverrides })}
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
