'use client'

import { useMemo, useState } from 'react'
import { ALL_PROCEDURE_CHECKS } from '@/lib/procedure-checks/registry'
import type { CheckSeverity, ProcedureCheck } from '@/lib/procedure-checks/types'
import { cn } from '@/lib/utils'

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
    <div className="rounded-xl border border-border/60 bg-card p-md shadow-sm max-w-3xl">
      <div className="mb-md">
        <h2 className="text-base font-semibold">절차 검증</h2>
        <p className="text-sm text-muted-foreground mt-1">
          등록된 검증 규칙 목록입니다. 국가·상황별로 계속 업데이트됩니다.
          {total > 0 && <> 현재 <strong>{total}</strong>개 등록.</>}
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
                {grouped[country].map((c) => (
                  <li
                    key={c.id}
                    className="rounded-md border border-border/40 p-sm hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-start gap-sm">
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
                          <span className="font-medium">{c.title}</span>
                          <span className="text-xs text-muted-foreground">{c.category}</span>
                          {!c.run && (
                            <span className="text-xs text-amber-600 dark:text-amber-400">미구현</span>
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
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
