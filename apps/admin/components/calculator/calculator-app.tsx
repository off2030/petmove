'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { ChevronDown, Menu, Plus, Printer, Search, Copy, Trash2 } from 'lucide-react'
import { EditModeButton } from '@/components/ui/edit-mode-button'
import { useCalculatorData } from '@/components/providers/calculator-data-provider'
import {
  addCalculatorDestination,
  cloneCalculatorDestination,
  deleteCalculatorDestination,
} from '@/lib/actions/calculator'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Calculator } from './calculator'
import { CalculatorOutputModal } from './calculator-output-modal'
import { ScheduleCalculator, type ScheduleCountry } from './schedule-calculator'
import {
  ExternalLinks,
  type ExternalLinksHandle,
  type ExternalLinksMode,
} from './external-links'
import { PageShell, PageTabs } from '@/components/ui/page-shell'
import type { ExternalLinksConfig } from '@petmove/domain'

type Mode = 'cost' | 'schedule' | 'links'

const MODES = [
  { id: 'cost', label: '비용' },
  { id: 'schedule', label: '일정' },
  { id: 'links', label: '바로가기' },
] as const satisfies ReadonlyArray<{ readonly id: Mode; readonly label: string }>

const SCHEDULE_COUNTRIES: Array<{ value: ScheduleCountry; label: string }> = [
  { value: 'japan', label: '일본' },
  { value: 'australia', label: '호주' },
  { value: 'nz', label: '뉴질랜드' },
]

export function CalculatorApp({
  initialExternalLinks,
}: {
  initialExternalLinks: ExternalLinksConfig
}) {
  const { items, setItems } = useCalculatorData()
  const confirm = useConfirm()
  const [mode, setMode] = useState<Mode>('cost')

  // Cost mode toolbar state (lifted)
  const [species, setSpecies] = useState<'dog' | 'cat'>('dog')
  const [country, setCountry] = useState<string>('일본')
  const [editMode, setEditMode] = useState(false)
  const [dropOpen, setDropOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropRef = useRef<HTMLDivElement>(null)
  // 목적지 메뉴 (복제/추가/삭제/출력) state
  const [destMenuOpen, setDestMenuOpen] = useState(false)
  const [destAction, setDestAction] = useState<'clone' | 'add' | null>(null)
  const [outputOpen, setOutputOpen] = useState(false)
  const [destName, setDestName] = useState('')
  const [destError, setDestError] = useState<string | null>(null)
  const [destPending, startDestTransition] = useTransition()
  const destMenuRef = useRef<HTMLDivElement>(null)

  // Schedule mode toolbar state
  const [scheduleCountry, setScheduleCountry] = useState<ScheduleCountry>('japan')

  // Links mode toolbar state (controlled from inside ExternalLinks via ref + callbacks)
  const linksRef = useRef<ExternalLinksHandle>(null)
  const [linksMode, setLinksMode] = useState<ExternalLinksMode>('view')
  const [linksSaving, setLinksSaving] = useState(false)
  const onLinksModeChange = useCallback((m: ExternalLinksMode) => setLinksMode(m), [])
  const onLinksSavingChange = useCallback((s: boolean) => setLinksSaving(s), [])

  useEffect(() => {
    if (!dropOpen) return
    const onDown = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [dropOpen])

  // 목적지 메뉴 / 인라인 폼 외부 클릭 시 닫기
  useEffect(() => {
    if (!destMenuOpen && !destAction) return
    const onDown = (e: MouseEvent) => {
      if (destMenuRef.current && !destMenuRef.current.contains(e.target as Node)) {
        setDestMenuOpen(false)
        setDestAction(null)
        setDestName('')
        setDestError(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [destMenuOpen, destAction])

  function resetDestMenu() {
    setDestMenuOpen(false)
    setDestAction(null)
    setDestName('')
    setDestError(null)
  }

  function handleClone() {
    const target = destName.trim()
    if (!country || !target) return
    setDestError(null)
    startDestTransition(async () => {
      const r = await cloneCalculatorDestination({ source: country, target })
      if (!r.ok) {
        setDestError(r.error)
        return
      }
      setItems((prev) => [...prev, ...r.data])
      setCountry(target)
      resetDestMenu()
      setEditMode(true)
    })
  }

  function handleAddDestination() {
    const target = destName.trim()
    if (!target) return
    setDestError(null)
    startDestTransition(async () => {
      const r = await addCalculatorDestination({ target })
      if (!r.ok) {
        setDestError(r.error)
        return
      }
      setItems((prev) => [...prev, r.data])
      setCountry(target)
      resetDestMenu()
      setEditMode(true)
    })
  }

  async function handleDeleteDestination() {
    if (!country) return
    setDestMenuOpen(false)
    const ok = await confirm({
      message: `"${country}" 목적지를 삭제하시겠습니까?`,
      description: '이 목적지의 모든 비용 항목이 함께 삭제됩니다. 되돌릴 수 없습니다.',
      okLabel: '삭제',
      variant: 'destructive',
    })
    if (!ok) return
    startDestTransition(async () => {
      const r = await deleteCalculatorDestination({ country })
      if (!r.ok) {
        setDestError(r.error)
        return
      }
      const deleted = new Set(r.data.deletedIds)
      setItems((prev) => prev.filter((it) => !deleted.has(it.id)))
      // 다른 목적지로 자동 전환
      const remaining = countries.filter((c) => c !== country)
      setCountry(remaining[0] ?? '')
      resetDestMenu()
    })
  }

  const countries = useMemo(() => {
    const seen = new Map<string, number>()
    for (const it of items) {
      if (it.country.includes('(고양이)')) continue
      if (!seen.has(it.country)) seen.set(it.country, it.country_order)
    }
    return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n)
  }, [items])

  const filteredCountries = countries.filter((c) => c.includes(search))

  const right =
    mode === 'cost' ? (
      <>
        {/* Species segment */}
        <div className="inline-flex rounded-full border border-border/80 bg-transparent p-0.5">
          {([
            ['dog', '강아지'],
            ['cat', '고양이'],
          ] as const).map(([v, label]) => {
            const active = species === v
            return (
              <button
                key={v}
                type="button"
                onClick={() => setSpecies(v)}
                className={`h-7 rounded-full px-3 text-sm transition-colors ${
                  active
                    ? 'bg-[#D9A489] text-white dark:bg-[#C08C70]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Country dropdown */}
        <div className="relative" ref={dropRef}>
          <button
            type="button"
            onClick={() => setDropOpen((v) => !v)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border bg-transparent px-3.5 text-sm transition-colors ${
              dropOpen
                ? 'border-[#D9A489] text-[#A87862] dark:border-[#C08C70] dark:text-[#D9A489]'
                : country
                ? 'border-border/80 text-foreground hover:text-foreground'
                : 'border-border/80 text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>{country || '목적지'}</span>
            <ChevronDown
              size={13}
              className={`transition-transform ${dropOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {dropOpen && (
            <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-64 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
              <div className="border-b border-border p-2">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const first = filteredCountries[0]
                        if (first) {
                          setCountry(first)
                          setDropOpen(false)
                          setSearch('')
                        }
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        setDropOpen(false)
                        setSearch('')
                      }
                    }}
                    placeholder="목적지 검색..."
                    className="h-9 w-full rounded-md border border-border bg-background py-2 pl-8 pr-2 text-sm outline-none focus:border-[#D9A489] dark:focus:border-[#C08C70]"
                  />
                </div>
              </div>
              <div className="scrollbar-minimal max-h-60 overflow-y-auto">
                {filteredCountries.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-muted-foreground">검색 결과 없음</div>
                ) : (
                  filteredCountries.map((c) => {
                    const sel = c === country
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setCountry(c)
                          setDropOpen(false)
                          setSearch('')
                        }}
                        className={`block w-full px-3 py-2 text-left text-[15px] transition-colors ${
                          sel
                            ? 'bg-accent text-foreground font-medium'
                            : 'text-foreground hover:bg-accent'
                        }`}
                      >
                        {c}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <EditModeButton editMode={editMode} onToggle={() => setEditMode((v) => !v)} />

        {/* 목적지 메뉴 — 복제 / 추가 / 삭제 */}
        <div className="relative" ref={destMenuRef}>
          <button
            type="button"
            onClick={() => {
              if (destAction) return
              setDestMenuOpen((v) => !v)
            }}
            aria-label="목적지 메뉴"
            title="목적지 메뉴"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/80 bg-transparent text-muted-foreground hover:text-foreground transition-colors"
          >
            <Menu size={14} />
          </button>
          {destMenuOpen && !destAction && (
            <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-44 overflow-hidden rounded-md border border-border bg-popover shadow-lg py-1">
              <button
                type="button"
                disabled={!country}
                onClick={() => {
                  setDestAction('clone')
                  setDestMenuOpen(false)
                  setDestName('')
                  setDestError(null)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <Copy size={14} className="text-muted-foreground" />
                <span>복제</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDestAction('add')
                  setDestMenuOpen(false)
                  setDestName('')
                  setDestError(null)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent transition-colors"
              >
                <Plus size={14} className="text-muted-foreground" />
                <span>추가</span>
              </button>
              <button
                type="button"
                disabled={!country}
                onClick={() => {
                  void handleDeleteDestination()
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <Trash2 size={14} />
                <span>삭제</span>
              </button>
              <button
                type="button"
                disabled={!country}
                onClick={() => {
                  setDestMenuOpen(false)
                  setOutputOpen(true)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <Printer size={14} className="text-muted-foreground" />
                <span>출력</span>
              </button>
            </div>
          )}
          {destAction && (
            <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-72 rounded-md border border-border bg-popover shadow-lg p-3 space-y-2">
              <div className="text-[12px] text-muted-foreground">
                {destAction === 'clone'
                  ? `"${country}" → 새 목적지 이름`
                  : '새 목적지 이름'}
              </div>
              <input
                autoFocus
                value={destName}
                onChange={(e) => {
                  setDestName(e.target.value)
                  setDestError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (destAction === 'clone') handleClone()
                    else handleAddDestination()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    resetDestMenu()
                  }
                }}
                disabled={destPending}
                placeholder="목적지 이름"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-[#D9A489] dark:focus:border-[#C08C70] disabled:opacity-50"
              />
              {destError && (
                <div className="text-[12px] text-destructive">{destError}</div>
              )}
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={destAction === 'clone' ? handleClone : handleAddDestination}
                  disabled={destPending || !destName.trim()}
                  className="flex-1 h-8 rounded-md bg-[#D9A489] text-white text-sm hover:bg-[#C8957A] disabled:opacity-50 dark:bg-[#C08C70] dark:hover:bg-[#A87862] transition-colors"
                >
                  {destPending
                    ? '처리 중…'
                    : destAction === 'clone'
                      ? '복제'
                      : '추가'}
                </button>
                <button
                  type="button"
                  onClick={resetDestMenu}
                  disabled={destPending}
                  className="h-8 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      </>
    ) : mode === 'schedule' ? (
      <div className="inline-flex rounded-full border border-border/80 bg-transparent p-0.5">
        {SCHEDULE_COUNTRIES.map((c) => {
          const active = scheduleCountry === c.value
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => setScheduleCountry(c.value)}
              className={`h-7 rounded-full px-3 text-sm transition-colors ${
                active
                  ? 'bg-[#D9A489] text-white dark:bg-[#C08C70]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {c.label}
            </button>
          )
        })}
      </div>
    ) : mode === 'links' ? (
      <EditModeButton
        editMode={linksMode === 'edit'}
        onToggle={() => {
          if (linksMode === 'edit') linksRef.current?.save()
          else linksRef.current?.startEdit()
        }}
        saving={linksSaving}
      />
    ) : undefined

  return (
    <PageShell
      title="도구"
      tabs={<PageTabs tabs={MODES} value={mode} onChange={setMode} right={right} />}
    >
      {mode === 'cost' && (
        <Calculator
          items={items}
          setItems={setItems}
          species={species}
          country={country}
          editMode={editMode}
        />
      )}
      {mode === 'schedule' && <ScheduleCalculator country={scheduleCountry} />}
      {mode === 'links' && (
        <div className="px-lg">
          <ExternalLinks
            ref={linksRef}
            initialConfig={initialExternalLinks}
            onModeChange={onLinksModeChange}
            onSavingChange={onLinksSavingChange}
          />
        </div>
      )}
      {outputOpen && country && (
        <CalculatorOutputModal
          initialCountry={country}
          initialSpecies={species}
          allItems={items}
          onClose={() => setOutputOpen(false)}
        />
      )}
    </PageShell>
  )
}
