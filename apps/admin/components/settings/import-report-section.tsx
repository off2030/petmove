'use client'

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X } from 'lucide-react'
import { useCases } from '@/components/cases/cases-context'
import { saveImportReportCountriesAction } from '@/lib/actions/import-report-config-action'
import { DEFAULT_IMPORT_REPORT_COUNTRIES } from '@petmove/domain'
import { DestinationPicker } from '@/components/ui/destination-picker'

export function ImportReportSection() {
  const { importReportCountries, setImportReportCountries } = useCases()
  const [draft, setDraft] = useState<string[]>(importReportCountries)
  const [saving, startSave] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const dirty = JSON.stringify(draft) !== JSON.stringify(importReportCountries)

  function removeCountry(name: string) {
    setDraft(draft.filter(c => c !== name))
  }

  function resetToDefaults() {
    setDraft([...DEFAULT_IMPORT_REPORT_COUNTRIES])
  }

  function save() {
    startSave(async () => {
      const r = await saveImportReportCountriesAction(draft)
      if (r.ok) {
        setImportReportCountries(r.countries)
        setMsg('저장되었습니다.')
        setTimeout(() => setMsg(null), 2500)
      } else {
        setMsg('저장 실패: ' + r.error)
      }
    })
  }

  return (
    <div className="max-w-5xl pb-2xl">
      {/* Editorial header */}
      <header className="pb-xl">
        <h2 className="font-serif text-[28px] leading-tight text-foreground">신고</h2>
        <p className="pmw-st__sec-lead mt-2">
          이 목록에 있는 목적지는 출국일이 입력되면 자동으로 신고 탭에 반영됩니다.
          목록에 없는 곳은 상세페이지의 신고 버튼이나 신고 탭의 신고 추가 피커에서 수동으로 포함할 수 있습니다.
        </p>
      </header>

      {/* Section label */}
      <div className="mb-2">
        <span className="font-serif text-[13px] text-muted-foreground/80">
          자동 포함 목적지 · {draft.length}
        </span>
      </div>

      {/* Current list — 얇은 border pill */}
      <div className="border-t border-border/70">
        <div className="flex flex-wrap gap-1.5 py-3">
          {draft.length === 0 ? (
            <span className="font-serif italic text-[13px] text-muted-foreground/60">
              목록이 비어있습니다.
            </span>
          ) : (
            draft.map(name => (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-sans text-[12px]"
                style={{
                  borderColor: 'var(--pmw-border-warm)',
                  color: 'var(--pmw-near-black)',
                }}
              >
                {name}
                <button
                  type="button"
                  onClick={() => removeCountry(name)}
                  className="text-muted-foreground/50 hover:text-foreground transition-colors"
                  title="제거"
                >
                  <X size={12} />
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Add destination — modal trigger */}
      <div className="pb-lg border-b border-border/60 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1 pmw-st__btn px-3 py-1 rounded-full border border-border/60 hover:bg-muted/40 transition-colors"
        >
          <Plus className="h-3 w-3" />
          목적지 추가
        </button>
      </div>

      {addOpen && (
        <DestinationAddModal
          existing={draft}
          onClose={() => setAddOpen(false)}
          onAdd={(name) => {
            if (!draft.includes(name)) setDraft([...draft, name])
            setAddOpen(false)
          }}
        />
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-lg">
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

/* ── Single Destination Add Modal ── */

function DestinationAddModal({
  existing,
  onClose,
  onAdd,
}: {
  existing: string[]
  onClose: () => void
  onAdd: (name: string) => void
}) {
  const [picked, setPicked] = useState<string[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!mounted) return null

  // 사용자가 선택하면 즉시 추가하고 모달 닫기.
  function handleChange(next: string[]) {
    const added = next.find(n => !existing.includes(n) && !picked.includes(n))
    if (added) {
      onAdd(added)
      return
    }
    setPicked(next)
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-background rounded-sm border border-border/60 shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border/60 px-lg py-3">
          <h3 className="font-serif text-[15px] text-foreground">목적지 추가</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-lg py-md">
          <label className="font-serif text-[13px] text-muted-foreground/80 block mb-1">목적지</label>
          <DestinationPicker
            values={picked}
            onChange={handleChange}
            hideSelectedChips
            variant="underline"
            placeholder="검색 (예: 독일, DE)"
            aria-label="목적지"
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
