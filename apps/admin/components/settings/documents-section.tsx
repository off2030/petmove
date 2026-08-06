'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Plus, X } from 'lucide-react'
import { useCases } from '@/components/cases/cases-context'
import { DestinationPicker } from '@/components/ui/destination-picker'
import { PillButton } from '@petmove/ui'
import { DialogFooter } from '@/components/ui/dialog-footer'
import {
  SettingsActionButton,
  SettingsCard,
  SettingsField,
  SettingsFooter,
} from './settings-layout'
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
              aria-selected={false}
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

export function DocumentsSection() {
  const { certConfig, setCertConfig } = useCases()
  const [draft, setDraft] = useState<CertConfig>(certConfig)
  const [saving, startSave] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  // 매핑 추가 팝업 열림 여부.
  const [addOpen, setAddOpen] = useState(false)

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

  // ── 새 매핑 추가 (팝업에서 호출) ──
  function commitNewRule(rule: CertRule) {
    setRules([...draft.rules, rule])
    setAddOpen(false)
  }

  return (
    <SettingsCard title="증명서">
      {/* 기본 증명서 */}
      <SettingsField label="기본 증명서" align="start">
        <div className="min-w-0 space-y-2">
          <p className="font-serif text-[13px] text-muted-foreground">
            모든 여행지에 표시됩니다.
          </p>
          <CertMultiSelect
            selected={draft.defaultCerts}
            onAdd={addDefaultCert}
            onRemove={removeDefaultCert}
            minOne
          />
        </div>
      </SettingsField>

      {/* 여행지 → 증명서 매핑 — 검사 탭(inspection-section)과 동일 구조:
          행마다 여행지·증명서 모두 복수 선택, 항상 즉시 편집, 추가는 팝업 (2026-08-06). */}
      <SettingsField label="여행지별 추가 증명서" align="start">
        <div className="min-w-0">
          <p className="font-serif text-[13px] text-muted-foreground mb-2">
            기본 증명서에 더해 표시됩니다.
          </p>
          {draft.rules.length === 0 && (
            <p className="py-1 pmw-st__btn-ghost">매핑 없음.</p>
          )}
          {draft.rules.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_auto_auto] items-start gap-md py-2 border-b border-dotted border-border/80"
            >
              <DestinationPicker
                values={r.countries}
                onChange={(next) => setRuleCountries(i, next)}
                placeholder="여행지 검색"
                aria-label="여행지"
                variant="underline"
              />
              <div className="pt-1">
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
                className="text-muted-foreground/50 hover:text-foreground transition-colors pt-1.5"
                title="매핑 삭제"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1 rounded-sm border border-dashed px-2 py-1 font-sans text-[13px] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
              style={{ borderColor: 'var(--pmw-border-warm)' }}
            >
              ＋ 매핑 추가
            </button>
          </div>
        </div>
      </SettingsField>

      {addOpen && (
        <CertMappingAddModal
          onClose={() => setAddOpen(false)}
          onSubmit={commitNewRule}
        />
      )}

      {/* Footer actions */}
      <SettingsFooter className="justify-between">
        <SettingsActionButton onClick={resetToDefaults}>
          기본값으로 되돌리기
        </SettingsActionButton>
        <div className="flex items-center gap-md">
          {msg && <span className="pmw-st__sec-lead">{msg}</span>}
          <PillButton variant="solid" onClick={save} disabled={!dirty || saving}>
            {saving ? '저장 중…' : '저장'}
          </PillButton>
        </div>
      </SettingsFooter>
    </SettingsCard>
  )
}

/* ── 매핑 추가 팝업 — 여행지·증명서 모두 복수 선택 후 확정 (검사 탭과 동일 구조) ── */

function CertMappingAddModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void
  onSubmit: (rule: CertRule) => void
}) {
  const [countries, setCountries] = useState<string[]>([])
  const [certs, setCerts] = useState<string[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!mounted) return null

  const canSubmit = countries.length > 0 && certs.length > 0

  function submit() {
    if (!canSubmit) return
    onSubmit({ countries, certs: [...certs] })
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-background rounded-sm border border-border/80 shadow-xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/80 px-lg py-3">
          <span className="font-serif text-[16px] text-foreground">매핑 추가</span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground/60 hover:text-foreground transition-colors"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-lg py-md space-y-md">
          <div>
            <p className="mb-1.5 font-serif text-[13px] text-muted-foreground">여행지</p>
            <DestinationPicker
              values={countries}
              onChange={setCountries}
              placeholder="여행지 검색"
              aria-label="여행지"
            />
          </div>
          <div>
            <p className="mb-1.5 font-serif text-[13px] text-muted-foreground">추가 증명서</p>
            <CertMultiSelect
              selected={certs}
              onAdd={(k) => setCerts((prev) => (prev.includes(k) ? prev : [...prev, k]))}
              onRemove={(k) => setCerts((prev) => prev.filter((c) => c !== k))}
            />
          </div>
        </div>

        <DialogFooter
          bordered
          onCancel={onClose}
          onPrimary={submit}
          primaryLabel="추가"
          primaryDisabled={!canSubmit}
        />
      </div>
    </div>,
    document.body,
  )
}
