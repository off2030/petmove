'use client'

import { useEffect, useState } from 'react'
import { updateDetailViewSettings } from '@/lib/actions/detail-view-settings'
import {
  DETAIL_VIEW_DEFAULTS,
  type DetailViewSettings,
} from '@/lib/detail-view-settings-types'
import { SectionHeader } from '@/components/ui/section-header'
import { cn } from '@/lib/utils'
import { useDetailViewSettings } from '@/components/providers/detail-view-settings-provider'
import { DestinationsArea } from './destinations-section'
import { SharePresetsSection } from './share-presets-section'
import { DocumentsSection } from './documents-section'
import {
  getCaseAssigneeEnabled,
  setCaseAssigneeEnabled,
} from '@/lib/actions/transfer-settings'

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

  // 담당자 기능 토글 — 전달 탭에서 이전됨.
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
    <div className="max-w-4xl pb-2xl">
      <header className="pb-xl">
        <SectionHeader>상세뷰 설정</SectionHeader>
        <p className="pmw-st__sec-lead mt-2">
          케이스 상세 페이지에 표시되는 정보를 설정합니다. 기본 표기 모드와 목적지별 표시 항목을 한곳에서 관리해요.
        </p>
        {error && (
          <p className="mt-2 font-serif text-[13px] text-destructive">저장 실패: {error}</p>
        )}
      </header>

      <section>
        <h3 className="font-serif text-[18px] text-foreground mb-2">상세뷰 기본 설정</h3>
        <div className="border-t border-border/80">
          <div className="grid grid-cols-[1fr_auto] items-center gap-md py-3 border-b border-dotted border-border/80">
            <div className="flex flex-col gap-0.5">
              <span className="font-serif text-[15px] text-foreground">한·영 병기</span>
              <span className="font-serif italic text-[12px] text-muted-foreground/70">
                종·품종·모색·성별을 "한글 | 영문" 으로 함께 표시
              </span>
            </div>
            <button
              type="button"
              onClick={toggleBilingual}
              aria-pressed={allOn}
              className={cn(
                'h-8 px-md font-serif text-[14px] rounded-full border transition-colors whitespace-nowrap shrink-0',
                allOn
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border/80 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              )}
            >
              {allOn ? 'ON' : 'OFF'}
            </button>
          </div>
          {/* 담당자 기능 — 전달 탭에서 이전 */}
          <div className="grid grid-cols-[1fr_auto] items-center gap-md py-3 border-b border-dotted border-border/80">
            <div className="flex flex-col gap-0.5">
              <span className="font-serif text-[15px] text-foreground">담당자 기능</span>
              <span className="font-serif italic text-[12px] text-muted-foreground/70">
                ON 시 케이스 상세에 담당자 선택 메뉴가 노출되고, 다른 조직에서 멤버 지정해 보낸 전달이 자동 배정됩니다.
              </span>
            </div>
            <button
              type="button"
              onClick={toggleAssignee}
              aria-pressed={assigneeEnabled}
              className={cn(
                'h-8 px-md font-serif text-[14px] rounded-full border transition-colors whitespace-nowrap shrink-0',
                assigneeEnabled
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border/80 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              )}
            >
              {assigneeEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-end pt-2">
          <span className="font-serif italic text-[12px] text-muted-foreground/60">
            {savedAt ? `자동 저장됨 · ${savedAt.toLocaleTimeString()}` : ''}
          </span>
        </div>
      </section>

      {/* 목적지별 표시정보 — 같은 탭에 통합 */}
      <DestinationsArea />

      {/* 증명서 버튼 생성 규칙 — 기존 "서류" 탭 내용 통합 */}
      <DocumentsSection />

      {/* 공유 링크 프리셋 */}
      <SharePresetsSection />
    </div>
  )
}
