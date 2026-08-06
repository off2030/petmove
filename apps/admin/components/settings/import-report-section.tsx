'use client'

import { useRef, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { useCases } from '@/components/cases/cases-context'
import { TodoColumnsToggle } from './todo-columns-toggle'
import { saveImportReportCountriesAction } from '@/lib/actions/import-report-config-action'
import { DEFAULT_IMPORT_REPORT_COUNTRIES } from '@petmove/domain'
import { DestinationPicker } from '@/components/ui/destination-picker'
import { PillButton } from '@petmove/ui'
import { SettingsShell, SettingsSection, SettingsSubsectionTitle } from './settings-layout'

export function ImportReportSection() {
  return (
    <SettingsShell size="lg">
      <SettingsSection title="신고">
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

/** 가나다순 정렬 — 칩 표시·저장 순서를 안정화. */
function sortKo(list: string[]): string[] {
  return [...list].sort((a, b) => a.localeCompare(b, 'ko'))
}

// 신고 탭에 올릴 국가 편집 — 전체 국가 검색 드롭다운에서 추가, 칩 ✕ 로 삭제.
// (2026-08-06 — 고정 체크박스 후보 목록 폐기, 사용자 지시.)
function AutoCountriesEditor() {
  const { importReportCountries, setImportReportCountries } = useCases()
  const [draft, setDraft] = useState<string[]>(() => sortKo(importReportCountries))
  const [saving, startSave] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  // '+ 추가' 클릭 시에만 검색창 노출 — 검사 탭 기관 목록의 +추가 패턴과 통일.
  const [adding, setAdding] = useState(false)
  const addWrapRef = useRef<HTMLDivElement>(null)

  const dirty = JSON.stringify(sortKo(draft)) !== JSON.stringify(sortKo(importReportCountries))

  function resetToDefaults() {
    setDraft(sortKo(DEFAULT_IMPORT_REPORT_COUNTRIES))
  }

  function save() {
    startSave(async () => {
      const r = await saveImportReportCountriesAction(draft)
      if (r.ok) {
        setImportReportCountries(r.countries)
        setDraft(sortKo(r.countries))
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

      <div className="border-t border-b border-border/80 pt-3 pb-lg">
        <div className="flex flex-wrap items-center gap-1.5">
          {draft.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-sans text-[13px] whitespace-nowrap"
              style={{ borderColor: 'var(--pmw-border-warm)', color: 'var(--pmw-near-black)' }}
            >
              {v}
              <button
                type="button"
                onClick={() => setDraft(draft.filter((x) => x !== v))}
                className="text-muted-foreground/50 hover:text-foreground transition-colors"
                aria-label={`${v} 제거`}
              >
                <X size={13} />
              </button>
            </span>
          ))}
          {adding ? (
            <div
              ref={addWrapRef}
              className="flex-1 min-w-[220px]"
              // 검색창 밖으로 포커스가 나가면 접기 — 다시 '+ 추가' 버튼으로.
              onBlur={(e) => {
                if (!addWrapRef.current?.contains(e.relatedTarget as Node)) setAdding(false)
              }}
            >
              <DestinationPicker
                values={draft}
                onChange={(values) => setDraft(sortKo(values))}
                hideSelectedChips
                autoFocus
                variant="underline"
                placeholder="국가 검색"
                aria-label="신고 국가 추가"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 rounded-sm border border-dashed px-2 py-1 font-sans text-[13px] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
              style={{ borderColor: 'var(--pmw-border-warm)' }}
            >
              ＋ 추가
            </button>
          )}
        </div>
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
