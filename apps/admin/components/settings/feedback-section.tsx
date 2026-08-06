'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  SettingsChip,
  SettingsControlGroup,
  SettingsShell,
  SettingsSection,
  SettingsSubsectionTitle,
} from './settings-layout'
import { listFeedback, type FeedbackEntry } from '@/lib/actions/feedback'

/**
 * 설정 > 데이터 > 고객 의견.
 * 펫무브(고객 앱) 여정 완료 후 보호자가 남긴 만족도(1~5)+자유 의견을 읽기 전용으로 모아 본다.
 * - 일반 멤버: 본인 조직 의견만 (서버 RLS).
 * - 슈퍼어드민: 전 조직 의견을 조직별로 묶어 표시.
 */

const RATING_LABELS = ['', '많이 아쉬워요', '아쉬워요', '보통이에요', '좋았어요', '아주 좋아요']

function formatDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

interface OrgGroup {
  orgId: string
  orgName: string | null
  items: FeedbackEntry[]
}

export function FeedbackSection() {
  const [entries, setEntries] = useState<FeedbackEntry[] | null>(null)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    listFeedback().then((r) => {
      if (!alive) return
      if (r.ok) {
        setEntries(r.entries)
        setIsSuperAdmin(r.isSuperAdmin)
      } else {
        setError(r.error)
      }
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  const groups: OrgGroup[] = useMemo(() => {
    if (!entries) return []
    if (!isSuperAdmin) return [{ orgId: '', orgName: null, items: entries }]
    const byOrg = new Map<string, OrgGroup>()
    for (const e of entries) {
      let g = byOrg.get(e.orgId)
      if (!g) {
        g = { orgId: e.orgId, orgName: e.orgName, items: [] }
        byOrg.set(e.orgId, g)
      }
      g.items.push(e)
    }
    return [...byOrg.values()].sort((a, b) => b.items.length - a.items.length)
  }, [entries, isSuperAdmin])

  const total = entries?.length ?? 0

  return (
    <SettingsShell size="lg">
      <SettingsSection title="고객 의견">
        {loading && <p className="pmw-st__sec-lead">불러오는 중…</p>}
        {!loading && error && (
          <p className="font-serif text-[14px] text-destructive">{error}</p>
        )}
        {!loading && !error && total === 0 && (
          <p className="pmw-st__sec-lead">아직 받은 의견이 없습니다.</p>
        )}
        {!loading && !error && total > 0 && (
          <div className="space-y-xl">
            {isSuperAdmin && (
              <p className="font-mono text-[12px] tracking-[0.04em] text-muted-foreground/70">
                전체 {total}건 · {groups.length}개 조직
              </p>
            )}
            {groups.map((g) => (
              <div key={g.orgId || 'self'} className="space-y-sm">
                {isSuperAdmin && (
                  <div className="flex items-baseline gap-2 border-b border-border/60 pb-2">
                    <SettingsSubsectionTitle>
                      {g.orgName ?? '(이름 없는 조직)'}
                    </SettingsSubsectionTitle>
                    <span className="font-mono text-[12px] text-muted-foreground/70">
                      {g.items.length}건
                    </span>
                  </div>
                )}
                <div className="space-y-sm">
                  {g.items.map((e) => (
                    <FeedbackCard key={`${e.caseId}:${e.destination ?? ''}`} entry={e} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>
    </SettingsShell>
  )
}

function FeedbackCard({ entry }: { entry: FeedbackEntry }) {
  const ratingLabel =
    entry.rating !== null ? `${RATING_LABELS[entry.rating] ?? ''} (${entry.rating}/5)` : null
  const who = [entry.petName, entry.customerName].filter(Boolean).join(' · ')
  return (
    <a
      href={`/cases?case=${entry.caseId}`}
      className="block rounded-sm border border-border/80 px-lg py-md transition-colors hover:border-foreground/40 hover:bg-muted/30"
    >
      <div className="flex items-baseline justify-between gap-md">
        <span className="flex items-baseline gap-2">
          <span className="font-serif text-[15px] text-foreground">{who || '케이스'}</span>
          {entry.destination && (
            <SettingsControlGroup size="sm">
              <SettingsChip tone="plain" className="bg-muted/60 text-muted-foreground">
                {entry.destination}
              </SettingsChip>
            </SettingsControlGroup>
          )}
        </span>
        <span className="shrink-0 font-mono text-[12px] text-muted-foreground/70">
          {formatDate(entry.submittedAt)}
        </span>
      </div>
      <div className="mt-1.5">
        {ratingLabel ? (
          <span className="font-serif text-[14px] text-foreground">{ratingLabel}</span>
        ) : (
          <span className="font-serif text-[13px] text-muted-foreground/60">만족도 미선택</span>
        )}
      </div>
      {entry.text && (
        <p className="mt-2 whitespace-pre-wrap font-serif text-[14px] leading-relaxed text-foreground/90">
          {entry.text}
        </p>
      )}
    </a>
  )
}
