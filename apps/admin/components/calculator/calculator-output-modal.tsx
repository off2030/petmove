'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Plus, Search, X } from 'lucide-react'
import type { CalculatorItem } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

const fmt = (n: number) => n.toLocaleString('ko-KR')
const cashDiscount = (total: number) => Math.round((total * 0.95) / 10000) * 10000

const CAT_VARIANTS: Record<string, string> = {
  '호주': '호주(고양이)',
  '뉴질랜드': '뉴질랜드(고양이)',
}

export type EstimateRow = {
  id: string
  name: string
  cost: number
  enabled: boolean
}

export type PriceMode = 'card' | 'cash'
export type DocType = 'invoice' | 'quote'

export type EstimateSnapshot = {
  country: string
  species: 'dog' | 'cat'
  docType: DocType
  rows: EstimateRow[]
  priceMode: PriceMode
  savedAt: string
  /** 이전 버전 호환용 — 신규 저장 시에는 사용하지 않음. */
  title?: string
}

function targetCountry(c: string, s: 'dog' | 'cat') {
  return s === 'cat' && CAT_VARIANTS[c] ? CAT_VARIANTS[c] : c
}

function rowsFromItems(items: CalculatorItem[]): EstimateRow[] {
  return items
    .slice()
    .sort((a, b) => a.item_order - b.item_order)
    .map((it) => ({
      id: String(it.id),
      name: it.item_name,
      cost: it.cost,
      enabled: true,
    }))
}

export function CalculatorOutputModal({
  initialCountry,
  initialSpecies,
  allItems,
  onClose,
  initialEstimate,
  onSaveAsPayment,
  saving,
  customerName,
  petName,
}: {
  initialCountry: string
  initialSpecies: 'dog' | 'cat'
  allItems: CalculatorItem[]
  onClose: () => void
  initialEstimate?: EstimateSnapshot | null
  onSaveAsPayment?: (args: { amount: number; estimate: EstimateSnapshot }) => Promise<void> | void
  saving?: boolean
  customerName?: string | null
  petName?: string | null
}) {
  const [country, setCountry] = useState(initialEstimate?.country ?? initialCountry)
  const [species, setSpecies] = useState<'dog' | 'cat'>(initialEstimate?.species ?? initialSpecies)
  const [docType, setDocType] = useState<DocType>(initialEstimate?.docType ?? 'quote')
  const [priceMode, setPriceMode] = useState<PriceMode>(initialEstimate?.priceMode ?? 'card')

  const itemsForCountry = (c: string, s: 'dog' | 'cat') =>
    allItems.filter((it) => it.country === targetCountry(c, s))

  const [rows, setRows] = useState<EstimateRow[]>(() => {
    if (initialEstimate?.rows && initialEstimate.rows.length > 0) {
      return initialEstimate.rows.map((r, i) => ({
        id: r.id || `seed-${i}`,
        name: r.name,
        cost: r.cost,
        enabled: r.enabled,
      }))
    }
    return rowsFromItems(itemsForCountry(initialCountry, initialSpecies))
  })

  // 목적지/종 변경 시 해당 목적지 기본 항목으로 교체. 초기 마운트는 건너뜀.
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setRows(rowsFromItems(itemsForCountry(country, species)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, species])

  const countries = useMemo(() => {
    const seen = new Map<string, number>()
    for (const it of allItems) {
      if (it.country.includes('(고양이)')) continue
      if (!seen.has(it.country)) seen.set(it.country, it.country_order)
    }
    return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n)
  }, [allItems])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const enabledRows = useMemo(() => rows.filter((r) => r.enabled && r.name.trim()), [rows])
  const total = enabledRows.reduce((s, r) => s + r.cost, 0)
  const disc = total > 0 ? cashDiscount(total) : 0
  const printableTotal = priceMode === 'cash' ? disc : total

  function updateRow(id: string, patch: Partial<EstimateRow>) {
    setRows((arr) => arr.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function addRow(name = '', cost = 0) {
    setRows((arr) => [
      ...arr,
      {
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        cost,
        enabled: true,
      },
    ])
  }

  // 항목 추가 picker
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const pickerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
        setPickerSearch('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pickerOpen])

  const pickerItems = useMemo(() => {
    const list = itemsForCountry(country, species).sort((a, b) => a.item_order - b.item_order)
    const q = pickerSearch.trim().toLowerCase()
    return q ? list.filter((it) => it.item_name.toLowerCase().includes(q)) : list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, species, allItems, pickerSearch])

  // 목적지 dropdown
  const [countryOpen, setCountryOpen] = useState(false)
  const [countrySearch, setCountrySearch] = useState('')
  const countryRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!countryOpen) return
    const onDown = (e: MouseEvent) => {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) {
        setCountryOpen(false)
        setCountrySearch('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [countryOpen])
  const filteredCountries = useMemo(
    () => countries.filter((c) => c.includes(countrySearch)),
    [countries, countrySearch],
  )

  function handlePrint() {
    const html = renderPrintHtml({
      docType,
      country,
      species,
      rows: enabledRows,
      total,
      disc,
      priceMode,
      customerName: customerName ?? null,
      petName: petName ?? null,
    })
    const win = window.open('', '_blank', 'width=900,height=1100')
    if (!win) {
      alert('팝업 차단을 해제해 주세요.')
      return
    }
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => {
      try {
        win.print()
      } catch {
        // ignore
      }
    }, 250)
  }

  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  if (!mounted) return null

  const modal = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header — 청구서 / 견적서 */}
        <div className="shrink-0 flex items-center justify-between border-b border-border/80 px-md py-sm">
          <div className="inline-flex rounded-full border border-border/80 bg-transparent p-0.5">
            {([
              ['quote', '견적서'],
              ['invoice', '청구서'],
            ] as const).map(([v, label]) => {
              const active = docType === v
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDocType(v)}
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
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-md py-sm space-y-3 scrollbar-minimal">
          {/* 목적지 + 종 */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1" ref={countryRef}>
              <button
                type="button"
                onClick={() => setCountryOpen((v) => !v)}
                className={`inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-sm transition-colors ${
                  countryOpen
                    ? 'border-[#D9A489] dark:border-[#C08C70]'
                    : 'border-border/80 hover:border-foreground/40'
                }`}
              >
                <span>{country || '목적지 선택'}</span>
                <ChevronDown
                  size={13}
                  className={`transition-transform ${countryOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {countryOpen && (
                <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                  <div className="border-b border-border p-2">
                    <div className="relative">
                      <Search
                        size={14}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                      />
                      <input
                        autoFocus
                        value={countrySearch}
                        onChange={(e) => setCountrySearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const first = filteredCountries[0]
                            if (first) {
                              setCountry(first)
                              setCountryOpen(false)
                              setCountrySearch('')
                            }
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            setCountryOpen(false)
                            setCountrySearch('')
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
                              setCountryOpen(false)
                              setCountrySearch('')
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
          </div>

          {/* 항목 표 */}
          <div className="rounded-md border border-border/80">
            <div className="grid grid-cols-[28px_1fr_140px] items-center gap-2 px-3 py-2 border-b border-border/80 text-[11px] tracking-[1px] uppercase text-muted-foreground/70">
              <span></span>
              <span>항목</span>
              <span className="text-right">금액</span>
            </div>
            {rows.map((r) => {
              const on = r.enabled
              return (
                <div
                  key={r.id}
                  className="grid grid-cols-[28px_1fr_140px] items-center gap-2 px-3 py-1.5 border-b border-border/40 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => updateRow(r.id, { enabled: !on })}
                    aria-label={on ? '비활성화' : '활성화'}
                    className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
                      on
                        ? 'border-[#D9A489] bg-[#D9A489] dark:border-[#C08C70] dark:bg-[#C08C70]'
                        : 'border-border bg-transparent'
                    }`}
                  >
                    {on && (
                      <span className="font-serif text-white text-[15px] leading-none -translate-y-[1px]">
                        ✓
                      </span>
                    )}
                  </button>
                  <input
                    value={r.name}
                    onChange={(e) => updateRow(r.id, { name: e.target.value })}
                    placeholder="항목명"
                    className={cn(
                      'h-8 rounded-md border border-transparent bg-transparent px-1 font-serif text-[16px] hover:border-border focus:outline-none focus:border-foreground/40',
                      !on && 'text-muted-foreground/60 line-through',
                    )}
                  />
                  <input
                    type="text"
                    value={fmt(r.cost)}
                    onChange={(e) => {
                      const n = Number(e.target.value.replace(/[^\d]/g, ''))
                      updateRow(r.id, { cost: Number.isFinite(n) ? n : 0 })
                    }}
                    className={cn(
                      'h-8 rounded-md border border-transparent bg-transparent px-1 text-right font-mono text-[15px] tabular-nums hover:border-border focus:outline-none focus:border-foreground/40',
                      !on && 'text-muted-foreground/50 line-through',
                    )}
                  />
                </div>
              )
            })}

            {/* 항목 추가 — 기존 항목 picker + 직접 추가 */}
            <div className="relative" ref={pickerRef}>
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="flex w-full items-center justify-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Plus size={13} />
                <span>항목 추가</span>
              </button>
              {pickerOpen && (
                <div className="absolute left-0 right-0 bottom-full mb-1 z-50 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                  <div className="border-b border-border p-2">
                    <div className="relative">
                      <Search
                        size={14}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                      />
                      <input
                        autoFocus
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault()
                            setPickerOpen(false)
                            setPickerSearch('')
                          }
                        }}
                        placeholder="항목 검색..."
                        className="h-9 w-full rounded-md border border-border bg-background py-2 pl-8 pr-2 text-sm outline-none focus:border-[#D9A489] dark:focus:border-[#C08C70]"
                      />
                    </div>
                  </div>
                  <div className="scrollbar-minimal max-h-60 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        addRow()
                        setPickerOpen(false)
                        setPickerSearch('')
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent transition-colors border-b border-border/40"
                    >
                      <Plus size={13} className="text-muted-foreground" />
                      <span>직접 추가</span>
                    </button>
                    {pickerItems.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-muted-foreground">
                        {country ? '항목 없음' : '목적지 선택 필요'}
                      </div>
                    ) : (
                      pickerItems.map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => {
                            addRow(it.item_name, it.cost)
                            setPickerOpen(false)
                            setPickerSearch('')
                          }}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent transition-colors"
                        >
                          <span className="truncate font-serif text-[15px]">{it.item_name}</span>
                          <span className="font-mono text-[13px] tabular-nums text-muted-foreground">
                            ₩{fmt(it.cost)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 출력 가격 (카드가/현금가) + 총 합계 — 하단 통합 */}
          <div className="rounded-md border border-border/80 px-3 py-3 space-y-2">
            <span className="block text-[11px] tracking-[1px] uppercase text-muted-foreground/70">
              출력 가격
            </span>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                { id: 'card', label: '카드가', amount: total, helper: '기본 합계' },
                { id: 'cash', label: '현금가', amount: disc, helper: '5% 할인 적용' },
              ] as const).map((option) => {
                const active = priceMode === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setPriceMode(option.id)}
                    className={cn(
                      'rounded-md border px-3 py-2.5 text-left transition-colors',
                      active
                        ? 'border-[#D9A489] bg-[#D9A489]/10 dark:border-[#C08C70] dark:bg-[#C08C70]/10'
                        : 'border-border/80 hover:bg-accent',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{option.label}</span>
                      <span className="font-serif text-[22px] tabular-nums text-foreground">
                        ₩{fmt(option.amount)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{option.helper}</div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end gap-2 border-t border-border/80 px-md py-sm">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-full border border-border/80 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={enabledRows.length === 0}
            className={cn(
              'h-8 rounded-full px-4 text-sm transition-colors disabled:opacity-50',
              onSaveAsPayment
                ? 'border border-border/80 bg-transparent text-foreground hover:bg-accent'
                : 'bg-[#D9A489] text-white hover:bg-[#C8957A] dark:bg-[#C08C70] dark:hover:bg-[#A87862]',
            )}
          >
            PDF 출력
          </button>
          {onSaveAsPayment && (
            <button
              type="button"
              onClick={() => {
                void onSaveAsPayment({
                  amount: printableTotal,
                  estimate: {
                    country,
                    species,
                    docType,
                    rows,
                    priceMode,
                    savedAt: new Date().toISOString(),
                  },
                })
              }}
              disabled={saving || enabledRows.length === 0 || printableTotal <= 0}
              className="h-8 rounded-full bg-[#D9A489] px-4 text-sm text-white hover:bg-[#C8957A] disabled:opacity-50 dark:bg-[#C08C70] dark:hover:bg-[#A87862] transition-colors"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

function renderPrintHtml(input: {
  docType: DocType
  country: string
  species: 'dog' | 'cat'
  rows: EstimateRow[]
  total: number
  disc: number
  priceMode: PriceMode
  customerName: string | null
  petName: string | null
}) {
  const speciesLabel = input.species === 'cat' ? '고양이' : '강아지'
  const docLabel = input.docType === 'invoice' ? '청구서' : '견적서'
  const fullTitle = docLabel
  const finalTotal = input.priceMode === 'cash' ? input.disc : input.total
  const totalLabel = input.priceMode === 'cash' ? '현금가 합계' : '카드가 합계'
  const today = new Date()
  const ymd = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`
  const itemRows = input.rows
    .map(
      (r) => `
      <tr>
        <td class="name">${escapeHtml(r.name)}</td>
        <td class="cost">₩${fmt(r.cost)}</td>
      </tr>`,
    )
    .join('')

  const infoCells: string[] = []
  if (input.customerName) {
    infoCells.push(
      `<div class="info-cell"><div class="info-label">보호자</div><div class="info-value">${escapeHtml(input.customerName)}</div></div>`,
    )
  }
  if (input.petName) {
    infoCells.push(
      `<div class="info-cell"><div class="info-label">동물 이름</div><div class="info-value">${escapeHtml(input.petName)}</div></div>`,
    )
  }
  infoCells.push(
    `<div class="info-cell"><div class="info-label">목적지</div><div class="info-value">${escapeHtml(input.country)} <span class="info-sub">· ${speciesLabel}</span></div></div>`,
  )
  const infoBlock = `<div class="info">${infoCells.join('')}</div>`

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(fullTitle)}</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Pretendard', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1a1816; margin: 0; padding: 0; }
  .doc { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; font-weight: 600; letter-spacing: -0.2px; }
  .meta { font-size: 12px; color: #7a776c; margin-bottom: 16px; }
  .info { display: flex; gap: 24px; flex-wrap: wrap; padding: 12px 14px; border: 1px solid #e2dccd; border-radius: 6px; margin-bottom: 24px; }
  .info-cell { min-width: 120px; }
  .info-label { font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #9b9789; margin-bottom: 3px; }
  .info-value { font-size: 14px; color: #1a1816; }
  .info-value .info-sub { color: #7a776c; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { padding: 10px 6px; border-bottom: 1px solid #d9d4c6; }
  th { text-align: left; font-size: 11px; font-weight: 500; letter-spacing: 1px; color: #7a776c; text-transform: uppercase; }
  th.cost, td.cost { text-align: right; font-variant-numeric: tabular-nums; }
  td.name { font-size: 14px; }
  td.cost { font-size: 14px; }
  tr.total td { font-weight: 600; font-size: 16px; padding-top: 14px; border-bottom: none; border-top: 2px solid #1a1816; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="doc">
  <h1>${escapeHtml(fullTitle)}</h1>
  <div class="meta">${ymd}</div>
  ${infoBlock}
  <table>
    <thead>
      <tr>
        <th>항목</th>
        <th class="cost">금액</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      <tr class="total">
        <td class="name">${totalLabel}</td>
        <td class="cost">₩${fmt(finalTotal)}</td>
      </tr>
    </tbody>
  </table>
</div>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
