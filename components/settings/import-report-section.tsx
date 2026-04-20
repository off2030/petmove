'use client'

import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { useCases } from '@/components/cases/cases-context'
import { saveImportReportCountriesAction } from '@/lib/actions/import-report-config-action'
import { DEFAULT_IMPORT_REPORT_COUNTRIES } from '@/lib/import-report-defaults'

export function ImportReportSection() {
  const { importReportCountries, setImportReportCountries } = useCases()
  const [draft, setDraft] = useState<string[]>(importReportCountries)
  const [input, setInput] = useState('')
  const [saving, startSave] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const dirty = JSON.stringify(draft) !== JSON.stringify(importReportCountries)

  function addCountry() {
    const v = input.trim()
    if (!v) return
    if (draft.includes(v)) { setInput(''); return }
    setDraft([...draft, v])
    setInput('')
  }

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
    <div className="rounded-xl border border-border/60 bg-card p-md shadow-sm max-w-2xl space-y-4">
      <div>
        <h3 className="font-medium text-base mb-1">자동 포함 국가</h3>
        <p className="text-sm text-muted-foreground">
          이 목록에 있는 국가가 목적지이고 <b>출국일</b>이 입력된 케이스는 신고 탭에
          자동으로 올라갑니다. 그 외 국가는 상세페이지의 <b>신고</b> 버튼이나 신고 탭의
          <b> 신고 추가</b> 피커에서 수동으로 포함할 수 있습니다.
        </p>
      </div>

      {/* Current list */}
      <div className="flex flex-wrap gap-xs">
        {draft.length === 0 && (
          <span className="text-sm text-muted-foreground/60 italic">목록이 비어있습니다. 자동 포함 대상 없음.</span>
        )}
        {draft.map(name => (
          <span
            key={name}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-sm"
          >
            {name}
            <button
              type="button"
              onClick={() => removeCountry(name)}
              className="text-muted-foreground/60 hover:text-red-500 transition-colors"
              title="제거"
            >
              <X size={14} />
            </button>
          </span>
        ))}
      </div>

      {/* Add new */}
      <div className="flex gap-xs">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); addCountry() }
          }}
          placeholder="국가명 입력 후 Enter (예: 독일)"
          className="flex-1 h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={addCountry}
          disabled={!input.trim()}
          className="h-9 px-md rounded-md border border-border bg-card text-sm hover:bg-accent transition-colors disabled:opacity-40"
        >
          추가
        </button>
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
