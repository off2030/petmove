'use client'

import { useEffect, useMemo, useState } from 'react'
import { ALL_PROCEDURE_CHECKS } from '@petmove/domain'
import type { CheckSeverity, ProcedureCheck } from '@petmove/domain'
import { cn } from '@/lib/utils'
import { getDisabledCheckIds, setDisabledCheckIds } from '@/lib/verification-disabled'

const COUNTRY_LABELS: Record<string, string> = {
  all: '전 국가 공통',
  japan: '일본',
  eu: '유럽연합',
  singapore: '싱가포르',
  australia: '호주',
  new_zealand: '뉴질랜드',
  uk: '영국',
  usa: '미국',
  canada: '캐나다',
  china: '중국',
  taiwan: '대만',
  hongkong: '홍콩',
}

function countryLabel(k: string): string {
  return COUNTRY_LABELS[k] ?? k
}

const SEVERITY_META: Record<CheckSeverity, { label: string; className: string }> = {
  blocker: { label: '필수', className: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  warning: { label: '경고', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  info:    { label: '안내', className: 'bg-sky-500/15 text-sky-600 dark:text-sky-400' },
}

type SortKey = 'added' | 'title'

export function VerificationSection() {
  const [sort, setSort] = useState<SortKey>('added')
  const [query, setQuery] = useState('')
  const [disabled, setDisabled] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setDisabled(getDisabledCheckIds())
  }, [])

  function toggleCheck(id: string, enabled: boolean) {
    setDisabled((prev) => {
      const next = new Set(prev)
      if (enabled) next.delete(id)
      else next.add(id)
      setDisabledCheckIds(next)
      return next
    })
  }

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? ALL_PROCEDURE_CHECKS.filter((c) =>
          [c.title, c.description, c.category, c.id].some((s) => s.toLowerCase().includes(q)),
        )
      : ALL_PROCEDURE_CHECKS
    const out: Record<string, ProcedureCheck[]> = {}
    for (const c of filtered) (out[c.country] ??= []).push(c)
    for (const list of Object.values(out)) {
      list.sort((a, b) =>
        sort === 'added'
          ? b.addedAt.localeCompare(a.addedAt)
          : a.title.localeCompare(b.title, 'ko'),
      )
    }
    return out
  }, [sort, query])

  const countries = Object.keys(grouped).sort((a, b) => {
    if (a === 'all') return -1
    if (b === 'all') return 1
    return countryLabel(a).localeCompare(countryLabel(b), 'ko')
  })

  const total = ALL_PROCEDURE_CHECKS.length

  return (
    <div className="max-w-3xl">
      <div className="mb-md">
        <h3 className="font-serif text-[17px] text-foreground pb-2 border-b border-border/60">절차 검증</h3>
        <p className="text-sm text-muted-foreground mt-sm">
          등록된 검증 규칙 목록입니다. 국가·상황별로 계속 업데이트됩니다.
          {total > 0 && <> 현재 <strong>{total}</strong>개 등록{disabled.size > 0 && <> · {disabled.size}개 사용 안 함</>}.</>}
        </p>
        <p className="text-xs text-muted-foreground mt-xs">
          체크를 해제하면 해당 규칙은 케이스 화면 검증에서 제외됩니다. 이 설정은 이 브라우저에만 저장됩니다.
        </p>
      </div>

      <div className="flex items-center gap-sm mb-md">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="검색 (제목·설명·카테고리·id)"
          className="h-8 flex-1 rounded-md border border-border/50 bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-8 rounded-md border border-border/50 bg-background px-2 text-sm"
        >
          <option value="added">최근 추가순</option>
          <option value="title">제목순</option>
        </select>
      </div>

      {total === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 p-md text-sm text-muted-foreground">
          등록된 검증이 아직 없습니다.
          <br />
          <code className="text-xs">lib/procedure-checks/&lt;country&gt;.ts</code> 파일에{' '}
          <code className="text-xs">ProcedureCheck</code> 객체를 추가하면 여기에 표시됩니다.
        </div>
      ) : countries.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 p-md text-sm text-muted-foreground">
          검색 결과 없음.
        </div>
      ) : (
        <div className="space-y-md">
          {countries.map((country) => (
            <section key={country}>
              <h3 className="text-sm font-semibold text-primary mb-2">
                {countryLabel(country)}{' '}
                <span className="text-muted-foreground font-normal">({grouped[country].length})</span>
              </h3>
              <ul className="space-y-1">
                {grouped[country].map((c) => {
                  const enabled = !disabled.has(c.id)
                  return (
                  <li
                    key={c.id}
                    className={cn(
                      'rounded-md border border-border/40 p-sm hover:bg-muted/40 transition-colors',
                      !enabled && 'opacity-55',
                    )}
                  >
                    <div className="flex items-start gap-sm">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => toggleCheck(c.id, e.target.checked)}
                        aria-label={`${c.title} 사용`}
                        title={enabled ? '사용 중 — 체크 해제하면 이 규칙을 끕니다' : '사용 안 함 — 체크하면 다시 켭니다'}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      />
                      <span
                        className={cn(
                          'shrink-0 text-xs px-1.5 py-0.5 rounded font-medium',
                          SEVERITY_META[c.severity].className,
                        )}
                      >
                        {SEVERITY_META[c.severity].label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-sm flex-wrap">
                          <span className={cn('font-medium', !enabled && 'line-through')}>{c.title}</span>
                          <span className="text-xs text-muted-foreground">{c.category}</span>
                          {!c.run && (
                            <span className="text-xs text-amber-600 dark:text-amber-400">미구현</span>
                          )}
                          {!enabled && (
                            <span className="text-xs text-muted-foreground">사용 안 함</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{c.description}</p>
                        <div className="flex gap-sm text-xs text-muted-foreground/70 mt-1">
                          <span className="font-mono">{c.id}</span>
                          <span>추가 {c.addedAt}</span>
                        </div>
                      </div>
                    </div>
                  </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
