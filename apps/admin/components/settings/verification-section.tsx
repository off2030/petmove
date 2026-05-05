'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { ALL_PROCEDURE_CHECKS, checkCountryKeys } from '@petmove/domain'
import type { ProcedureCheck } from '@petmove/domain'
import {
  SettingsCheckBox,
  SettingsSearchInput,
  SettingsShell,
  SettingsSection,
  SettingsSubsectionTitle,
} from './settings-layout'
import { cn } from '@/lib/utils'
import { listOrgDisabledChecks, setOrgDisabledCheck } from '@/lib/actions/org-disabled-checks'

const COUNTRY_LABELS: Record<string, string> = {
  all: '전 국가 공통',
  japan: '일본',
  eu: '유럽연합',
  singapore: '싱가포르',
  australia: '호주',
  new_zealand: '뉴질랜드',
  uk: '영국',
  switzerland: '스위스',
  ireland: '아일랜드',
  malta: '몰타',
  norway: '노르웨이',
  finland: '핀란드',
  usa: '미국',
  canada: '캐나다',
  china: '중국',
  taiwan: '대만',
  hongkong: '홍콩',
}
function countryLabel(k: string): string {
  return COUNTRY_LABELS[k] ?? k
}

type StatusFilter = 'all' | 'enabled' | 'disabled'

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'enabled', label: '활성' },
  { value: 'disabled', label: '비활성' },
]

const SEVERITY_LABELS: Record<string, string> = {
  blocker: '필수 오류 차단',
  warning: '경고',
  info: '안내 정보',
}

const SEVERITY_ORDER: Record<string, number> = {
  blocker: 0,
  warning: 1,
  info: 2,
}

const CATEGORY_ORDER = ['마이크로칩', '광견병', '접종', '검사', '서류', '일정', '출국']

function searchTokens(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

function categoryOrder(category: string): number {
  const index = CATEGORY_ORDER.findIndex((keyword) => category.includes(keyword))
  return index === -1 ? CATEGORY_ORDER.length : index
}

function checkSearchText(check: ProcedureCheck, enabled: boolean): string {
  const keys = checkCountryKeys(check.country)
  const labels = keys.map(countryLabel)
  return [
    check.title,
    check.description,
    check.category,
    check.id,
    ...keys,
    ...labels,
    check.severity,
    SEVERITY_LABELS[check.severity] ?? check.severity,
    enabled ? '활성 enabled on' : '비활성 disabled off',
  ].join(' ').toLowerCase()
}

export function VerificationSection({ isSuperAdmin = false }: { isSuperAdmin?: boolean } = {}) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [disabled, setDisabled] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    void (async () => {
      const r = await listOrgDisabledChecks()
      if (r.ok) setDisabled(new Set(r.value))
      else setError(r.error)
    })()
  }, [])

  function toggleCheck(id: string) {
    if (!isSuperAdmin) return
    const wasDisabled = disabled.has(id)
    // Optimistic update
    setDisabled((prev) => {
      const next = new Set(prev)
      if (wasDisabled) next.delete(id)
      else next.add(id)
      return next
    })
    startTransition(async () => {
      const r = await setOrgDisabledCheck(id, !wasDisabled)
      if (!r.ok) {
        // Rollback on failure
        setDisabled((prev) => {
          const next = new Set(prev)
          if (wasDisabled) next.add(id)
          else next.delete(id)
          return next
        })
        setError(r.error)
      } else {
        setError(null)
      }
    })
  }

  const grouped = useMemo(() => {
    const tokens = searchTokens(query)
    const filtered = ALL_PROCEDURE_CHECKS.filter((check) => {
      const enabled = !disabled.has(check.id)
      if (statusFilter === 'enabled' && !enabled) return false
      if (statusFilter === 'disabled' && enabled) return false
      if (tokens.length === 0) return true
      const text = checkSearchText(check, enabled)
      return tokens.every((token) => text.includes(token))
    })
    const out: Record<string, ProcedureCheck[]> = {}
    for (const c of filtered) {
      for (const k of checkCountryKeys(c.country)) {
        ;(out[k] ??= []).push(c)
      }
    }
    for (const list of Object.values(out)) {
      list.sort((a, b) => {
        const aEnabled = !disabled.has(a.id)
        const bEnabled = !disabled.has(b.id)
        if (aEnabled !== bEnabled) return aEnabled ? -1 : 1
        const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
        if (severity !== 0) return severity
        const category = categoryOrder(a.category) - categoryOrder(b.category)
        if (category !== 0) return category
        return a.title.localeCompare(b.title, 'ko')
      })
    }
    return out
  }, [disabled, query, statusFilter])

  const countries = Object.keys(grouped).sort((a, b) => {
    if (a === 'all') return -1
    if (b === 'all') return 1
    return countryLabel(a).localeCompare(countryLabel(b), 'ko')
  })

  const total = ALL_PROCEDURE_CHECKS.length

  return (
    <SettingsShell size="lg">
      <SettingsSection title="절차 검증">
        {error && (
          <p className="-mt-md mb-md font-serif text-[13px] text-destructive">저장 실패: {error}</p>
        )}

        <div className="mb-md space-y-2">
          <div className="flex items-center gap-sm">
            <SettingsSearchInput
              value={query}
              onChange={setQuery}
              placeholder="규칙명, 메시지, 목적지 검색"
              className="flex-1"
            />
            <StatusFilterPills value={statusFilter} onChange={setStatusFilter} />
          </div>
          <p className="pmw-st__sec-lead px-1">
            검색 대상: 규칙명, 설명 메시지, 목적지, 절차명, 심각도, 활성 상태. 공백으로 여러 단어를 넣으면 모두 포함된 규칙만 보여줍니다.
          </p>
        </div>

        {total === 0 ? (
          <p className="pmw-st__sec-lead py-md">
            등록된 검증이 아직 없습니다.
          </p>
        ) : countries.length === 0 ? (
          <p className="pmw-st__sec-lead py-md">검색 결과 없음.</p>
        ) : (
          countries.map((country) => (
            <section key={country} className="mb-xl">
              <div className="flex items-baseline gap-2 pb-2 border-b border-border/80 mb-2">
                <SettingsSubsectionTitle>{countryLabel(country)}</SettingsSubsectionTitle>
                <span className="text-muted-foreground/60">·</span>
                <span className="font-serif text-[13px] text-muted-foreground/60">{grouped[country].length}</span>
              </div>

              {grouped[country].map((c) => {
                const enabled = !disabled.has(c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCheck(c.id)}
                    disabled={!isSuperAdmin}
                    title={
                      !isSuperAdmin
                        ? '슈퍼 관리자만 변경 가능'
                        : enabled
                          ? '클릭하여 사용 안 함'
                          : '클릭하여 다시 사용'
                    }
                    className={cn(
                      'w-full text-left grid grid-cols-[24px_1fr] items-start gap-md py-md border-b border-dotted border-border/80 transition-colors',
                      isSuperAdmin
                        ? 'hover:bg-accent cursor-pointer'
                        : 'cursor-default',
                    )}
                  >
                    <SettingsCheckBox checked={enabled} className="mt-1" />
                    <div className={cn('min-w-0', !enabled && 'opacity-55')}>
                      <div className="flex items-baseline gap-sm flex-wrap">
                        <span
                          className={cn('font-serif text-[16px] text-foreground', !enabled && 'line-through')}
                        >
                          {c.title}
                        </span>
                        <span className="font-mono text-[10.5px] tracking-[0.6px] uppercase text-muted-foreground/70">
                          {c.category}
                        </span>
                        <span className="font-mono text-[10.5px] tracking-[0.6px] uppercase text-muted-foreground/70">
                          {SEVERITY_LABELS[c.severity] ?? c.severity}
                        </span>
                      </div>
                      <p className="pmw-st__sec-lead mt-1">{c.description}</p>
                      <div className="font-mono text-[10.5px] tracking-[0.6px] text-muted-foreground/70 mt-2">
                        {c.id}
                      </div>
                    </div>
                  </button>
                )
              })}
            </section>
          ))
        )}

        {!isSuperAdmin && (
          <p className="pt-md border-t border-border/80 pmw-st__sec-lead">
            검증 규칙 변경은 슈퍼 관리자만 가능합니다.
          </p>
        )}
      </SettingsSection>
    </SettingsShell>
  )
}

function StatusFilterPills({
  value,
  onChange,
}: {
  value: StatusFilter
  onChange: (value: StatusFilter) => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-border/80 bg-card p-1">
      {STATUS_FILTERS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'h-8 rounded-full px-3 font-serif text-[13px] transition-colors',
            value === option.value
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
