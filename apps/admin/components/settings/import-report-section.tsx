'use client'

import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { useCases } from '@/components/cases/cases-context'
import { TodoColumnsToggle } from './todo-columns-toggle'
import {
  saveImportReportCountriesAction,
  saveImportReportButtonCountriesAction,
} from '@/lib/actions/import-report-config-action'
import {
  DEFAULT_IMPORT_REPORT_COUNTRIES,
  DEFAULT_IMPORT_REPORT_BUTTON_COUNTRIES,
} from '@petmove/domain'
import { DestinationPicker } from '@/components/ui/destination-picker'
import { PillButton } from '@/components/ui/pill-button'
import { SettingsShell, SettingsSection, SettingsSubsectionTitle } from './settings-layout'

export function ImportReportSection() {
  return (
    <SettingsShell size="lg">
      <SettingsSection
        title="신고"
        description="상세페이지 신고 버튼 노출국과, 출국일 입력 시 자동 포함되는 국가를 따로 관리합니다. 신고 탭의 추가 피커는 국가 제한 없이 모든 케이스를 검색할 수 있습니다."
      >
        <ButtonCountriesEditor />
        <div className="h-2xl" />
        <AutoCountriesEditor />
        <div className="h-2xl" />
        <TodoColumnsToggle
          tabId="import_report"
          title="신고 탭 표시 컬럼"
          description="신고 탭 테이블에 표시할 컬럼을 선택합니다. 모두 체크가 기본값."
        />
      </SettingsSection>
    </SettingsShell>
  )
}

function ButtonCountriesEditor() {
  const { importReportButtonCountries, setImportReportButtonCountries } = useCases()
  const [draft, setDraft] = useState<string[]>(importReportButtonCountries)
  const [saving, startSave] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const dirty = JSON.stringify(draft) !== JSON.stringify(importReportButtonCountries)

  function removeCountry(name: string) {
    setDraft(draft.filter(c => c !== name))
  }

  function resetToDefaults() {
    setDraft([...DEFAULT_IMPORT_REPORT_BUTTON_COUNTRIES])
  }

  function save() {
    startSave(async () => {
      const r = await saveImportReportButtonCountriesAction(draft)
      if (r.ok) {
        setImportReportButtonCountries(r.countries)
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
        <SettingsSubsectionTitle>신고 버튼 노출 목적지 · {draft.length}</SettingsSubsectionTitle>
        <span className="font-serif text-[12px] text-muted-foreground/60">
          상세페이지에 신고 버튼이 보이는 국가
        </span>
      </div>

      <div className="border-t border-border/80">
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

      <div className="pb-lg border-b border-border/80">
        <DestinationPicker
          values={draft}
          onChange={setDraft}
          hideSelectedChips
          variant="underline"
          placeholder="목적지 추가"
          aria-label="신고 버튼 노출 목적지 추가"
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

function AutoCountriesEditor() {
  const { importReportCountries, setImportReportCountries, importReportButtonCountries } = useCases()
  const [draft, setDraft] = useState<string[]>(importReportCountries)
  const [saving, startSave] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const dirty = JSON.stringify(draft) !== JSON.stringify(importReportCountries)
  const buttonSet = new Set(importReportButtonCountries)
  const orphans = draft.filter(c => !buttonSet.has(c))

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
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-md flex-wrap">
        <SettingsSubsectionTitle>출국일 자동 포함 목적지 · {draft.length}</SettingsSubsectionTitle>
        <span className="font-serif text-[12px] text-muted-foreground/60">
          출국일 입력 시 신고 탭에 자동 진입
        </span>
      </div>

      <div className="border-t border-border/80">
        <div className="flex flex-wrap gap-1.5 py-3">
          {draft.length === 0 ? (
            <span className="font-serif italic text-[13px] text-muted-foreground/60">
              목록이 비어있습니다.
            </span>
          ) : (
            draft.map(name => {
              const isOrphan = !buttonSet.has(name)
              return (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-sans text-[12px]"
                  style={{
                    borderColor: isOrphan ? 'hsl(var(--destructive) / 0.5)' : 'var(--pmw-border-warm)',
                    color: isOrphan ? 'hsl(var(--destructive))' : 'var(--pmw-near-black)',
                  }}
                  title={isOrphan ? '신고 버튼 노출 목록에 없는 국가입니다' : undefined}
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
              )
            })
          )}
        </div>
      </div>

      <div className="pb-lg border-b border-border/80">
        <DestinationPicker
          values={draft}
          onChange={setDraft}
          hideSelectedChips
          variant="underline"
          placeholder="목적지 추가"
          aria-label="자동 포함 목적지 추가"
        />
      </div>

      {orphans.length > 0 && (
        <p className="mt-md font-serif text-[12px] text-destructive">
          {orphans.join(', ')} 은(는) 신고 버튼 노출 목록에 없습니다. 자동 포함은 동작하지만 상세페이지에 신고 버튼이 표시되지 않습니다.
        </p>
      )}

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
