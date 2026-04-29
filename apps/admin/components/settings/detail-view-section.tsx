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

type FieldKey = keyof DetailViewSettings

const FIELDS: Array<{ key: FieldKey; label: string; description: string }> = [
  { key: 'species_bilingual', label: '종', description: '예: 강아지 | Dog' },
  { key: 'breed_bilingual', label: '품종', description: '예: 골든 리트리버 | Golden Retriever' },
  { key: 'color_bilingual', label: '모색', description: '예: 검정 | Black' },
  { key: 'sex_bilingual', label: '성별', description: '예: 수컷 | Male' },
]

export function DetailViewSection({
  initialSettings = DETAIL_VIEW_DEFAULTS,
}: {
  initialSettings?: DetailViewSettings
} = {}) {
  const { settings, setSettings } = useDetailViewSettings()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  // Provider 가 dashboard layout 마운트 시점의 값으로 초기화되어 있어 일반적으로 settings 와
  // initialSettings 가 동일. 그러나 server-side 변경 직후 settings 페이지가 새로 마운트되는
  // 시나리오에서는 prop 으로 들어온 값이 더 최신일 수 있으므로 한 번 동기화.
  useEffect(() => {
    setSettings(initialSettings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 낙관적 갱신 — UI 는 즉시 반영, 서버 저장은 백그라운드. 토글 빠른 연타 시
  // disabled 로 잠기지 않도록 useTransition 미사용.
  async function toggle(key: FieldKey) {
    const prev = settings
    const next = { ...prev, [key]: !prev[key] }
    setSettings(next)
    setError(null)
    const r = await updateDetailViewSettings({ [key]: next[key] })
    if (!r.ok) {
      setSettings(prev)
      setError(r.error)
    } else {
      setSavedAt(new Date())
    }
  }

  return (
    <div className="max-w-3xl pb-2xl">
      <header className="pb-xl">
        <SectionHeader>상세뷰 설정</SectionHeader>
        <p className="pmw-st__sec-lead mt-2">
          케이스 상세 페이지의 동물정보 표기 모드. 켜면 "한글 | 영문"으로 같이 표시되고, 꺼두면 영문만 표시됩니다.
        </p>
        {error && (
          <p className="mt-2 font-serif text-[13px] text-destructive">저장 실패: {error}</p>
        )}
      </header>

      <section>
        <div className="border-t border-border/80">
          {FIELDS.map((f) => (
            <ToggleRow
              key={f.key}
              label={f.label}
              description={f.description}
              value={settings[f.key]}
              onToggle={() => toggle(f.key)}
            />
          ))}
        </div>
      </section>

      <div className="flex items-center justify-end pt-md mt-md border-t border-border/80">
        <span className="font-serif italic text-[12px] text-muted-foreground/60">
          {savedAt ? `자동 저장됨 · ${savedAt.toLocaleTimeString()}` : ''}
        </span>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  value,
  onToggle,
}: {
  label: string
  description: string
  value: boolean
  onToggle: () => void
}) {
  return (
    <div className="grid grid-cols-[150px_1fr_auto] items-center gap-md py-3 border-b border-dotted border-border/80">
      <span className="font-serif text-[13px] text-muted-foreground leading-none">{label}</span>
      <div className="flex flex-col gap-0.5">
        <span className="font-serif text-[15px] text-foreground">
          {value ? '한·영 병기' : '영문만'}
        </span>
        <span className="font-serif italic text-[12px] text-muted-foreground/70">
          {description}
        </span>
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={value}
        className={cn(
          'h-8 px-md font-serif text-[14px] rounded-full border transition-colors whitespace-nowrap shrink-0',
          value
            ? 'border-primary/50 bg-primary/10 text-primary'
            : 'border-border/80 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
        )}
      >
        {value ? 'ON' : 'OFF'}
      </button>
    </div>
  )
}
