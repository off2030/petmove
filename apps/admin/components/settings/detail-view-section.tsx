'use client'

import { useEffect, useState } from 'react'
import { updateDetailViewSettings } from '@/lib/actions/detail-view-settings'
import {
  DETAIL_VIEW_DEFAULTS,
  type DetailViewSettings,
} from '@/lib/detail-view-settings-types'
import {
  SettingsCard,
  SettingsShell,
  SettingsSection,
  SettingsFooter,
  SettingsListRow,
  SettingsToggleButton,
  formatSavedAgo,
} from './settings-layout'
import { useDetailViewSettings } from '@/components/providers/detail-view-settings-provider'
import { DestinationsArea } from './destinations-section'
import { SharePresetsSection } from './share-presets-section'
import { DocumentsSection } from './documents-section'
import {
  getCaseAssigneeEnabled,
  setCaseAssigneeEnabled,
} from '@/lib/actions/case-assignee-settings'

export function DetailViewSection({
  initialSettings = DETAIL_VIEW_DEFAULTS,
}: {
  initialSettings?: DetailViewSettings
} = {}) {
  const { settings, setSettings } = useDetailViewSettings()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [assigneeEnabled, setAssigneeEnabled] = useState<boolean>(false)

  useEffect(() => {
    setSettings(initialSettings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 담당자 기능 토글 — 옛 전달 탭에서 이전됨(전달 기능은 2026-08-06 폐지).
  useEffect(() => {
    let cancelled = false
    void getCaseAssigneeEnabled().then((r) => {
      if (!cancelled && r.ok) setAssigneeEnabled(r.value)
    })
    return () => { cancelled = true }
  }, [])

  async function toggleAssignee() {
    const next = !assigneeEnabled
    setAssigneeEnabled(next)
    setError(null)
    const r = await setCaseAssigneeEnabled(next)
    if (!r.ok) {
      setAssigneeEnabled(!next)
      setError(r.error)
    }
  }

  // 4개 필드 (종/품종/모색/성별) 의 한·영 병기 토글을 하나로 통합.
  // ON 판단: 모두 true 일 때만 ON, 그 외는 OFF.
  const allOn =
    settings.species_bilingual &&
    settings.breed_bilingual &&
    settings.color_bilingual &&
    settings.sex_bilingual

  async function toggleBilingual() {
    const next = !allOn
    const prev = settings
    const updated: DetailViewSettings = {
      species_bilingual: next,
      breed_bilingual: next,
      color_bilingual: next,
      sex_bilingual: next,
    }
    setSettings(updated)
    setError(null)
    const r = await updateDetailViewSettings(updated)
    if (!r.ok) {
      setSettings(prev)
      setError(r.error)
    } else {
      setSavedAt(new Date())
    }
  }

  return (
    <SettingsShell className="max-w-4xl">
      <SettingsSection title="상세">
        {error && (
          <p className="-mt-md mb-md font-serif text-[13px] text-destructive">저장 실패: {error}</p>
        )}

        {/* ── 기본 ── */}
        <div className="space-y-lg">
        <SettingsCard title="기본">
          <div>
            <SettingsListRow
              title="한·영 병기"
              description='종·품종·모색·성별을 "한글 | 영문" 으로 함께 표시'
            >
              <SettingsToggleButton pressed={allOn} onClick={toggleBilingual} />
            </SettingsListRow>
            <SettingsListRow
              title="담당자 표시"
              description="ON 시 케이스 상세에 담당자 선택 메뉴가 노출됩니다."
            >
              <SettingsToggleButton pressed={assigneeEnabled} onClick={toggleAssignee} />
            </SettingsListRow>
          </div>
          <SettingsFooter className="border-t-0 pt-2">
            <span className="font-serif text-[12px] text-muted-foreground/60">
              {formatSavedAgo(savedAt)}
            </span>
          </SettingsFooter>
        </SettingsCard>

        {/* ── 공유 ── */}
        <SharePresetsSection />

        {/* ── 여행지 ── */}
        <DestinationsArea />

        {/* ── 증명서 ── */}
        <DocumentsSection />
        </div>
      </SettingsSection>
    </SettingsShell>
  )
}
