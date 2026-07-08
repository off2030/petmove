'use client'

import { useMemo, useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { useCases } from '@/components/cases/cases-context'
import { TodoColumnsToggle } from './todo-columns-toggle'
import { saveImportReportCountriesAction } from '@/lib/actions/import-report-config-action'
import { DEFAULT_IMPORT_REPORT_COUNTRIES, IMPORT_REPORT_CANDIDATE_COUNTRIES } from '@petmove/domain'
import { DestinationPicker } from '@/components/ui/destination-picker'
import { PillButton } from '@petmove/ui'
import { SettingsShell, SettingsSection, SettingsSubsectionTitle } from './settings-layout'

export function ImportReportSection() {
  return (
    <SettingsShell size="lg">
      <SettingsSection
        title="신고"
        description="체크한 국가는 출국일을 입력하면 신고 탭에 자동으로 올라옵니다. 개별 케이스는 신고 탭의 + 버튼으로 직접 올릴 수 있습니다."
      >
        <TodoColumnsToggle
          tabId="import_report"
          title="표시 항목 설정"
          description="신고 탭 테이블에 표시할 항목을 선택합니다. 모두 체크가 기본값."
        />
        <AutoCountriesEditor />
      </SettingsSection>
    </SettingsShell>
  )
}

function AutoCountriesEditor() {
  const { importReportCountries, setImportReportCountries } = useCases()
  const [draft, setDraft] = useState<string[]>(importReportCountries)
  const [saving, startSave] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const dirty = JSON.stringify([...draft].sort()) !== JSON.stringify([...importReportCountries].sort())
  const selected = useMemo(() => new Set(draft), [draft])

  // 체크박스 후보 = 기본 후보 목록 ∪ 현재 체크된 국가(후보 밖에서 추가한 것도 함께 표시). 가나다순.
  const pool = useMemo(() => {
    const set = new Set([...IMPORT_REPORT_CANDIDATE_COUNTRIES, ...draft])
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [draft])

  function toggle(name: string) {
    setDraft(d => (d.includes(name) ? d.filter(x => x !== name) : [...d, name]))
  }

  function addExtra(values: string[]) {
    // DestinationPicker 는 values 를 통째로 넘긴다 — draft 로 병합.
    setDraft(Array.from(new Set(values)))
  }

  function resetToDefaults() {
    setDraft([...DEFAULT_IMPORT_REPORT_COUNTRIES])
  }

  function save() {
    startSave(async () => {
      const r = await saveImportReportCountriesAction(draft)
      if (r.ok) {
        setImportReportCountries(r.countries)
        setDraft(r.countries)
        setMsg('저장되었습니다.')
        setTimeout(() => setMsg(null), 2500)
      } else {
        setMsg('저장 실패: ' + r.error)
      }
    })
  }

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-md flex-wrap">
        <SettingsSubsectionTitle>신고 탭에 올릴 국가 · {draft.length}</SettingsSubsectionTitle>
        <span className="font-serif text-[12px] text-muted-foreground/60">
          출국일 입력 시 신고 탭에 자동 진입
        </span>
      </div>

      <div className="border-t border-border/80 py-3">
        <div className="grid grid-cols-2 gap-x-lg gap-y-1 sm:grid-cols-3">
          {pool.map(name => {
            const checked = selected.has(name)
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggle(name)}
                role="checkbox"
                aria-checked={checked}
                className="group flex items-center gap-2 py-1.5 text-left font-sans text-[13.5px] transition-colors"
              >
                <span
                  className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border transition-colors"
                  style={{
                    borderColor: checked ? 'var(--pmw-near-black)' : 'var(--pmw-border-warm)',
                    backgroundColor: checked ? 'var(--pmw-near-black)' : 'transparent',
                  }}
                >
                  {checked && <Check size={12} strokeWidth={3} color="var(--pmw-paper)" />}
                </span>
                <span
                  className={checked ? 'transition-colors' : 'transition-colors text-muted-foreground'}
                  style={checked ? { color: 'var(--pmw-near-black)' } : undefined}
                >
                  {name}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="pb-lg border-b border-border/80">
        <p className="mb-1.5 font-serif text-[12px] text-muted-foreground/60">
          목록에 없는 국가 추가 (추가하면 자동으로 체크됩니다)
        </p>
        <DestinationPicker
          values={draft}
          onChange={addExtra}
          hideSelectedChips
          variant="underline"
          placeholder="목적지 검색"
          aria-label="신고 국가 추가"
        />
      </div>

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
          <PillButton variant="solid" onClick={save} disabled={!dirty || saving}>
            {saving ? '저장 중…' : '변경사항 저장'}
          </PillButton>
        </div>
      </div>
    </section>
  )
}
