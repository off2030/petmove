'use client'

import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { useCases } from '@/components/cases/cases-context'
import { saveImportReportCountriesAction } from '@/lib/actions/import-report-config-action'
import { DEFAULT_IMPORT_REPORT_COUNTRIES } from '@petmove/domain'
import { DestinationPicker } from '@/components/ui/destination-picker'

export function ImportReportSection() {
  const { importReportCountries, setImportReportCountries } = useCases()
  const [draft, setDraft] = useState<string[]>(importReportCountries)
  const [saving, startSave] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

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

      {/* Add destination — always-visible search input */}
      <div className="pb-lg border-b border-border/60">
        <DestinationPicker
          values={draft}
          onChange={setDraft}
          hideSelectedChips
          variant="underline"
          placeholder="목적지 추가"
          aria-label="목적지 추가"
        />
      </div>

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

