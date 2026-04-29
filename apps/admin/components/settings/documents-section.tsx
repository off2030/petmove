'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Plus, X } from 'lucide-react'
import { useCases } from '@/components/cases/cases-context'
import { DestinationPicker } from '@/components/ui/destination-picker'
import { PillButton } from '@/components/ui/pill-button'
import { SectionHeader } from '@/components/ui/section-header'
import { DialogFooter } from '@/components/ui/dialog-footer'
import { saveCertConfigAction } from '@/lib/actions/cert-config-action'
import { cn } from '@/lib/utils'
import {
  ALL_CERTS,
  DEFAULT_CERT_CONFIG,
  type CertConfig,
  type CertRule,
} from '@petmove/domain'

function certLabel(key: string): string {
  return ALL_CERTS.find(c => c.key === key)?.label ?? key
}

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

/** Editorial 증명서 multi-select — 검사 탭의 LabPillMultiSelect 와 동일 패턴, 색조 없는 bordered chip. */
function CertMultiSelect({
  selected,
  onAdd,
  onRemove,
  minOne = false,
  triggerLabel = '증명서 추가',
}: {
  selected: string[]
  onAdd: (key: string) => void
  onRemove: (key: string) => void
  /** true면 마지막 1개는 제거 불가. */
  minOne?: boolean
  triggerLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const remaining = ALL_CERTS.filter(c => !selected.includes(c.key))

  return (
    <div ref={ref} className="relative inline-block">
      <div className="flex flex-wrap items-center gap-1.5">
        {selected.map(key => {
          const removable = !minOne || selected.length > 1
          return (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-sans text-[12px] whitespace-nowrap"
              style={{
                borderColor: 'var(--pmw-border-warm)',
                color: 'var(--pmw-near-black)',
              }}
            >
              {certLabel(key)}
              {removable && (
                <button
                  type="button"
                  onClick={() => onRemove(key)}
                  className="text-muted-foreground/50 hover:text-foreground transition-colors"
                  aria-label={`${certLabel(key)} 제거`}
                  tabIndex={-1}
                >
                  <X size={12} />
                </button>
              )}
            </span>
          )
        })}
        {remaining.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="inline-flex items-center gap-1 rounded-sm border border-dashed border-border/80 px-2 py-0.5 font-sans text-[12px] text-muted-foreground hover:text-foreground hover:border-border transition-colors"
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <Plus size={11} />
            {triggerLabel}
            <ChevronDown size={11} className="opacity-60" />
          </button>
        )}
      </div>

      {open && remaining.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 top-full mt-1 z-50 min-w-[180px] max-h-72 overflow-auto rounded-sm py-1 shadow-md pointer-events-none"
          style={{
            backgroundColor: 'var(--pmw-paper)',
            border: '1px solid var(--pmw-border-warm)',
          }}
        >
          {remaining.map(c => (
            <li
              key={c.key}
              role="option"
              onMouseDown={(e) => {
                e.preventDefault()
                onAdd(c.key)
                setOpen(false)
              }}
              className="pointer-events-auto cursor-pointer px-md py-1.5 font-sans text-[13px] select-none transition-colors hover:bg-accent/60"
              style={{ color: 'var(--pmw-near-black)' }}
            >
              {c.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const COUNTRY_PREVIEW_MAX = 4

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

export function DocumentsSection() {
  const { certConfig, setCertConfig } = useCases()
  const [draft, setDraft] = useState<CertConfig>(certConfig)
  const [saving, startSave] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  // 새 규칙 추가 입력 상태
  const [addOpen, setAddOpen] = useState(false)

  // 규칙 편집 상태 — 목적지 목록 편집 중인 row idx.
  const [editingIdx, setEditingIdx] = useState<number | null>(null)

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
  function setRuleCountries(idx: number, nextCountries: string[]) {
    setRules(draft.rules.map((r, i) => i === idx ? { ...r, countries: nextCountries } : r))
  }
  function setRuleLabel(idx: number, nextLabel: string) {
    const trimmed = nextLabel.trim()
    setRules(draft.rules.map((r, i) => {
      if (i !== idx) return r
      if (trimmed) return { ...r, label: trimmed }
      const { label: _unused, ...rest } = r
      void _unused
      return rest
    }))
  }

  // ── 새 규칙 추가 (모달에서 호출) ──
  function commitNewRule(rule: CertRule) {
    setRules([...draft.rules, rule])
    setAddOpen(false)
  }

  return (
    <div className="max-w-5xl pb-2xl">
      {/* Editorial header */}
      <header className="pb-xl">
        <SectionHeader>서류</SectionHeader>
        <p className="pmw-st__sec-lead mt-2">
          케이스 상세페이지에 표시되는 증명서 구성을 관리합니다. 기본 증명서는 모든 케이스에 공통이며, 국가별 규칙은 목적지에 따라 추가됩니다.
        </p>
      </header>

      {/* 기본 증명서 */}
      <section className="mb-xl">
        <SectionLabel>기본 증명서</SectionLabel>
        <div className="border-t border-border/80 pt-3 space-y-2">
          <p className="font-serif italic text-[13px] text-muted-foreground">
            모든 국가의 상세페이지에 표시됩니다. 국가별 규칙은 이 목록에 추가로 붙습니다.
          </p>
          <CertMultiSelect
            selected={draft.defaultCerts}
            onAdd={addDefaultCert}
            onRemove={removeDefaultCert}
            minOne
          />
        </div>
      </section>

      {/* 국가별 규칙 */}
      <section className="mb-xl">
        <SectionLabel>국가별 추가 증명서</SectionLabel>
        <div className="border-t border-border/80 pt-3 mb-3">
          <p className="font-serif italic text-[13px] text-muted-foreground">
            해당 국가(또는 국가 그룹)가 목적지인 경우 기본 증명서에 더해 표시됩니다.
          </p>
        </div>

        {draft.rules.length === 0 ? (
          <div className="py-3 pmw-st__btn-ghost">추가된 규칙 없음.</div>
        ) : (
          <ul>
            {draft.rules.map((r, i) => {
              const visibleCountries = r.countries.slice(0, COUNTRY_PREVIEW_MAX)
              const overflowCount = r.countries.length - visibleCountries.length
              return (
                <li
                  key={i}
                  className="grid grid-cols-[1fr_auto_auto] items-start gap-md py-3 border-b border-border/80"
                >
                  {/* Left: group label + destination pills (click to edit) */}
                  {editingIdx === i ? (
                    <div className="min-w-0 space-y-1.5">
                      <input
                        type="text"
                        value={r.label ?? ''}
                        onChange={(e) => setRuleLabel(i, e.target.value)}
                        placeholder="그룹명 (선택사항)"
                        className="pmw-st__input bg-transparent outline-none border-b border-border/80 font-serif italic text-[15px] px-0.5 py-0.5 w-full max-w-[240px]"
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

                  {/* Right: certs */}
                  <div className="flex items-start justify-end">
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
        <div className="mt-md flex items-center justify-end">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1 pmw-st__btn px-3 py-1 rounded-full border border-border/80 hover:bg-muted/40 transition-colors"
          >
            <Plus className="h-3 w-3" />
            규칙 추가
          </button>
        </div>
      </section>

      {addOpen && (
        <CertRuleAddModal
          onClose={() => setAddOpen(false)}
          onSubmit={commitNewRule}
        />
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-lg border-t border-border/80">
        <button
          type="button"
          onClick={resetToDefaults}
          className="pmw-st__btn-ghost hover:text-foreground transition-colors"
        >
          기본값으로 되돌리기
        </button>
        <div className="flex items-center gap-md">
          {msg && <span className="pmw-st__sec-lead">{msg}</span>}
          <PillButton variant="solid" onClick={save} disabled={!dirty || saving}>
            {saving ? '저장 중…' : '변경사항 저장'}
          </PillButton>
        </div>
      </div>
    </div>
  )
}

/* ── Cert Rule Add Modal: Step 1 (목적지 vs 그룹) → Step 2 (form) ── */

function CertRuleAddModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (rule: CertRule) => void
}) {
  const [mode, setMode] = useState<'single' | 'group' | null>(null)
  const [label, setLabel] = useState('')
  const [countries, setCountries] = useState<string[]>([])
  const [certs, setCerts] = useState<string[]>([])
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

  const canSubmit = countries.length > 0 && certs.length > 0

  function submit() {
    if (!canSubmit) return
    const trimmedLabel = label.trim()
    const rule: CertRule = mode === 'group' && trimmedLabel
      ? { label: trimmedLabel, countries, certs: [...certs] }
      : { countries, certs: [...certs] }
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
                <div className="pmw-st__sec-lead mt-1">한 개의 목적지에 추가 증명서를 매핑합니다.</div>
              </button>
              <button
                type="button"
                onClick={() => setMode('group')}
                className="w-full text-left px-md py-3 rounded-md border border-border/80 hover:bg-muted/40 transition-colors"
              >
                <div className="font-serif text-[15px] text-foreground">그룹 추가</div>
                <div className="pmw-st__sec-lead mt-1">여러 목적지를 한 그룹으로 묶어 같은 증명서를 매핑합니다.</div>
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
                <label className="font-serif text-[13px] text-muted-foreground/80 block mb-1">추가 증명서</label>
                <CertMultiSelect
                  selected={certs}
                  onAdd={(k) => setCerts(prev => prev.includes(k) ? prev : [...prev, k])}
                  onRemove={(k) => setCerts(prev => prev.filter(c => c !== k))}
                />
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
