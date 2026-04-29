'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { ALL_PROCEDURE_CHECKS } from '@petmove/domain'
import type { ProcedureCheck } from '@petmove/domain'
import { SectionHeader } from '@/components/ui/section-header'
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
  usa: '미국',
  canada: '캐나다',
  china: '중국',
  taiwan: '대만',
  hongkong: '홍콩',
}

function countryLabel(k: string): string {
  return COUNTRY_LABELS[k] ?? k
}

type SortKey = 'added' | 'title'

export function VerificationSection({ isSuperAdmin = false }: { isSuperAdmin?: boolean } = {}) {
  const [sort, setSort] = useState<SortKey>('added')
  const [query, setQuery] = useState('')
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
    <div className="max-w-5xl pb-2xl">
      {/* Editorial header */}
      <header className="pb-xl">
        <SectionHeader>절차 검증</SectionHeader>
        <p className="pmw-st__sec-lead mt-2">
          국가·상황별 자동 검증 규칙. 케이스 저장 시 백그라운드로 실행됩니다.
          {!isSuperAdmin && ' 변경은 슈퍼 관리자만 가능합니다.'}
        </p>
        {error && (
          <p className="mt-2 font-serif text-[13px] text-destructive">저장 실패: {error}</p>
        )}
      </header>

      <div className="flex items-center gap-sm mb-md">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색"
            className="h-11 w-full pl-10 pr-9 text-[15px] bg-popover text-foreground shadow-none border border-border/80 rounded-full focus-visible:outline-none focus-visible:ring-0 focus-visible:border-foreground/40 placeholder:text-muted-foreground/60"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <SortDropdown value={sort} onChange={setSort} />
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
            <div className="flex items-baseline gap-2 pb-2 border-b border-border/80 font-serif text-[13px] text-muted-foreground/80">
              <span>{countryLabel(country)}</span>
              <span className="opacity-60">·</span>
              <span className="opacity-60">{grouped[country].length}</span>
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
                  <CheckBox checked={enabled} />
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
    </div>
  )
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'added', label: '최근 추가순' },
  { value: 'title', label: '제목순' },
]

function SortDropdown({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = SORT_OPTIONS.find((o) => o.value === value) ?? SORT_OPTIONS[0]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-11 inline-flex items-center gap-2 rounded-full border border-border/80 bg-card text-foreground pl-4 pr-3 text-[14px] hover:border-foreground/40 transition-colors"
      >
        <span>{current.label}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-full mt-1 min-w-[140px] rounded-sm border border-border/80 bg-card shadow-md py-1 z-10"
        >
          {SORT_OPTIONS.map((o) => {
            const active = o.value === value
            return (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-[14px] hover:bg-accent/40 transition-colors',
                    active ? 'font-serif text-foreground' : 'font-serif text-muted-foreground',
                  )}
                >
                  {o.label}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'mt-1 inline-flex h-4 w-4 items-center justify-center rounded-sm border transition-colors',
        checked ? 'border-foreground/60 bg-foreground/5' : 'border-border/80 bg-transparent',
      )}
    >
      {checked && <Check className="h-3 w-3 text-foreground" strokeWidth={2.5} />}
    </span>
  )
}
