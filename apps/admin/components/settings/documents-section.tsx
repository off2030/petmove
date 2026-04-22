'use client'

import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { useCases } from '@/components/cases/cases-context'
import { saveCertConfigAction } from '@/lib/actions/cert-config-action'
import {
  ALL_CERTS,
  DEFAULT_CERT_CONFIG,
  type CertConfig,
  type CertRule,
} from '@petmove/domain'

function certLabel(key: string): string {
  return ALL_CERTS.find(c => c.key === key)?.label ?? key
}

function CertMultiSelect({
  selected,
  onAdd,
  onRemove,
  minOne = false,
}: {
  selected: string[]
  onAdd: (key: string) => void
  onRemove: (key: string) => void
  /** true면 마지막 1개는 제거 불가. */
  minOne?: boolean
}) {
  const remaining = ALL_CERTS.filter(c => !selected.includes(c.key))
  return (
    <div className="flex flex-wrap items-center gap-1">
      {selected.map(key => (
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded bg-primary/15 text-primary px-1.5 py-0.5 text-xs font-medium"
        >
          {certLabel(key)}
          {(!minOne || selected.length > 1) && (
            <button
              type="button"
              onClick={() => onRemove(key)}
              className="hover:text-red-500 transition-colors"
              title="제거"
            >
              <X size={10} />
            </button>
          )}
        </span>
      ))}
      {remaining.length > 0 && (
        <select
          value=""
          onChange={(e) => { if (e.target.value) onAdd(e.target.value) }}
          className="h-6 rounded border border-dashed border-border bg-background px-1 text-xs text-muted-foreground outline-none focus:border-primary"
        >
          <option value="">+ 추가</option>
          {remaining.map(c => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      )}
    </div>
  )
}

export function DocumentsSection() {
  const { certConfig, setCertConfig } = useCases()
  const [draft, setDraft] = useState<CertConfig>(certConfig)
  const [saving, startSave] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  // 새 규칙 추가 입력 상태
  const [countriesInput, setCountriesInput] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [newCerts, setNewCerts] = useState<string[]>([])

  const dirty = JSON.stringify(draft) !== JSON.stringify(certConfig)

  function save() {
    startSave(async () => {
      const r = await saveCertConfigAction(draft)
      if (r.ok) {
        setCertConfig(r.config)
        setDraft(r.config)
        setMsg('저장되었습니다.')
        setTimeout(() => setMsg(null), 2500)
      } else {
        setMsg('저장 실패: ' + r.error)
      }
    })
  }

  function resetToDefaults() {
    setDraft(DEFAULT_CERT_CONFIG)
  }

  // ── 디폴트 증명서 조작 ──
  function addDefaultCert(key: string) {
    if (draft.defaultCerts.includes(key)) return
    setDraft({ ...draft, defaultCerts: [...draft.defaultCerts, key] })
  }
  function removeDefaultCert(key: string) {
    const next = draft.defaultCerts.filter(k => k !== key)
    if (next.length === 0) return
    setDraft({ ...draft, defaultCerts: next })
  }

  // ── 규칙 조작 ──
  function setRules(rules: CertRule[]) {
    setDraft({ ...draft, rules })
  }
  function removeRule(idx: number) {
    setRules(draft.rules.filter((_, i) => i !== idx))
  }
  function addCertToRule(idx: number, key: string) {
    setRules(draft.rules.map((r, i) => {
      if (i !== idx) return r
      if (r.certs.includes(key)) return r
      return { ...r, certs: [...r.certs, key] }
    }))
  }
  function removeCertFromRule(idx: number, key: string) {
    setRules(draft.rules.map((r, i) => {
      if (i !== idx) return r
      const next = r.certs.filter(c => c !== key)
      if (next.length === 0) return r
      return { ...r, certs: next }
    }))
  }

  // ── 새 규칙 추가 ──
  function parseCountries(raw: string): string[] {
    return Array.from(new Set(raw.split(',').map(s => s.trim()).filter(Boolean)))
  }
  function addRule() {
    const countries = parseCountries(countriesInput)
    if (countries.length === 0 || newCerts.length === 0) return
    const label = labelInput.trim() || undefined
    const rule: CertRule = label
      ? { label, countries, certs: [...newCerts] }
      : { countries, certs: [...newCerts] }
    setRules([...draft.rules, rule])
    setCountriesInput('')
    setLabelInput('')
    setNewCerts([])
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* 디폴트 증명서 */}
      <div className="border border-border/60 rounded-lg p-md space-y-3">
        <div>
          <h4 className="font-medium text-base">기본 증명서</h4>
          <p className="text-sm text-muted-foreground mt-1">
            모든 국가의 상세페이지에 표시됩니다. 국가별 규칙은 이 목록에 추가로 붙습니다.
          </p>
        </div>
        <CertMultiSelect
          selected={draft.defaultCerts}
          onAdd={addDefaultCert}
          onRemove={removeDefaultCert}
          minOne
        />
      </div>

      {/* 국가별 규칙 */}
      <div className="border border-border/60 rounded-lg p-md space-y-4">
        <div>
          <h4 className="font-medium text-base">국가별 추가 증명서</h4>
          <p className="text-sm text-muted-foreground mt-1">
            해당 국가(또는 국가 그룹)가 목적지인 경우 기본 증명서에 더해 표시됩니다.
          </p>
        </div>

        {draft.rules.length === 0 ? (
          <div className="text-sm text-muted-foreground/60 italic">추가된 규칙 없음.</div>
        ) : (
          <ul className="space-y-2">
            {draft.rules.map((r, i) => (
              <li key={i} className="flex items-start gap-sm rounded-md border border-border/50 bg-background p-sm">
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

                <div className="min-w-[200px] pt-0.5">
                  <CertMultiSelect
                    selected={r.certs}
                    onAdd={(k) => addCertToRule(i, k)}
                    onRemove={(k) => removeCertFromRule(i, k)}
                    minOne
                  />
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

        {/* 새 규칙 추가 */}
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
              placeholder="쉼표로 구분 (예: 독일, 프랑스)"
              rows={1}
              className="flex-1 min-h-8 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary resize-y"
            />
          </div>
          <div className="flex items-start gap-xs">
            <span className="text-xs text-muted-foreground w-24 shrink-0 pt-1.5">추가 증명서</span>
            <div className="flex-1">
              <CertMultiSelect
                selected={newCerts}
                onAdd={(k) => setNewCerts(prev => prev.includes(k) ? prev : [...prev, k])}
                onRemove={(k) => setNewCerts(prev => prev.filter(c => c !== k))}
              />
            </div>
          </div>
          <div className="flex items-center justify-end pt-1">
            <button
              type="button"
              onClick={addRule}
              disabled={!countriesInput.trim() || newCerts.length === 0}
              className="h-8 px-md rounded-md border border-border bg-card text-sm hover:bg-accent transition-colors disabled:opacity-40"
            >
              추가
            </button>
          </div>
        </div>
      </div>

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
