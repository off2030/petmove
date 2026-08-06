'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { useCases } from '@/components/cases/cases-context'
import {
  SettingsActionButton,
  SettingsAddButton,
  SettingsCard,
  SettingsChip,
  SettingsControlGroup,
  SettingsField,
  SettingsFooter,
  SettingsSaveButton,
} from './settings-layout'
import { MappingEditModal, MappingRow } from './mapping-row'
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
      <SettingsControlGroup size="sm" wrap>
        {selected.map(key => {
          const removable = !minOne || selected.length > 1
          return (
            <SettingsChip
              key={key}
              onRemove={removable ? () => onRemove(key) : undefined}
              removeLabel={`${certLabel(key)} 제거`}
            >
              {certLabel(key)}
            </SettingsChip>
          )
        })}
        {remaining.length > 0 && (
          <SettingsAddButton
            onClick={() => setOpen(o => !o)}
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <Plus size={11} />
            {triggerLabel}
            <ChevronDown size={11} className="opacity-60" />
          </SettingsAddButton>
        )}
      </SettingsControlGroup>

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

  // 매핑 추가 팝업 열림 여부 / 편집 중인 행 idx.
  const [addOpen, setAddOpen] = useState(false)
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

      {/* 여행지 → 증명서 매핑 — 목록은 읽기 전용 한 줄, 편집·삭제는 팝업 (2026-08-06).
          목록에 ✕ 를 두지 않아 스치는 클릭으로 매핑이 사라지지 않는다. */}
      <SettingsField label="여행지별 추가 증명서" align="start">
        <div className="min-w-0">
          <p className="font-serif text-[13px] text-muted-foreground mb-2">
            기본 증명서에 더해 표시됩니다.
          </p>
          {draft.rules.length === 0 && (
            <p className="py-1 pmw-st__btn-ghost">매핑 없음.</p>
          )}
          {draft.rules.map((r, i) => (
            <MappingRow key={i} countries={r.countries} onEdit={() => setEditingIdx(i)}>
              {r.certs.map((k) => (
                <SettingsChip key={k}>{certLabel(k)}</SettingsChip>
              ))}
            </MappingRow>
          ))}
          <SettingsControlGroup size="sm" className="pt-2">
            <SettingsAddButton onClick={() => setAddOpen(true)}>＋ 매핑 추가</SettingsAddButton>
          </SettingsControlGroup>
        </div>
      </SettingsField>

      {addOpen && (
        <CertMappingAddModal
          onClose={() => setAddOpen(false)}
          onSubmit={commitNewRule}
        />
      )}

      {editingIdx !== null && draft.rules[editingIdx] && (
        <CertMappingAddModal
          initial={draft.rules[editingIdx]}
          onClose={() => setEditingIdx(null)}
          onSubmit={(rule) => {
            setRules(draft.rules.map((r, i) => (i === editingIdx ? rule : r)))
            setEditingIdx(null)
          }}
          onDelete={() => {
            removeRule(editingIdx)
            setEditingIdx(null)
          }}
        />
      )}

      {/* Footer actions */}
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
    </SettingsCard>
  )
}

/* ── 매핑 추가·편집 팝업 — 공용 MappingEditModal 위에 증명서 선택만 얹는다 ── */

function CertMappingAddModal({
  initial,
  onClose,
  onSubmit,
  onDelete,
}: {
  /** 있으면 편집 모드 — 없으면 추가. */
  initial?: CertRule
  onClose: () => void
  onSubmit: (rule: CertRule) => void
  onDelete?: () => void
}) {
  const [countries, setCountries] = useState<string[]>(initial?.countries ?? [])
  const [certs, setCerts] = useState<string[]>(initial?.certs ?? [])

  const canSubmit = countries.length > 0 && certs.length > 0

  function submit() {
    if (!canSubmit) return
    onSubmit({ countries, certs: [...certs] })
  }

  return (
    <MappingEditModal
      title={initial ? '매핑 편집' : '매핑 추가'}
      countries={countries}
      onCountriesChange={setCountries}
      resultLabel="추가 증명서"
      canSubmit={canSubmit}
      onSubmit={submit}
      onDelete={onDelete}
      onClose={onClose}
    >
      <CertMultiSelect
        selected={certs}
        onAdd={(k) => setCerts((prev) => (prev.includes(k) ? prev : [...prev, k]))}
        onRemove={(k) => setCerts((prev) => prev.filter((c) => c !== k))}
      />
    </MappingEditModal>
  )
}
