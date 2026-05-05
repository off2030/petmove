'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { ChevronRight, Paperclip, Plus, X } from 'lucide-react'
import { AttachButton } from '@/components/ui/attach-button'
import {
  PARASITE_FAMILIES,
  daysUntilExpiry,
  getExpiryStatus,
  type ExpiryStatus,
} from '@petmove/domain'
import {
  createOrgVaccineProduct,
  deleteOrgVaccineProduct,
  listOrgVaccineProducts,
  updateOrgVaccineProduct,
  type OrgVaccineProduct,
  type OrgVaccineProductInput,
} from '@/lib/actions/org-vaccine-products'
import { extractVaccineInfo } from '@/lib/actions/extract-vaccine'
import { filesToBase64, isExtractableFile } from '@/lib/file-to-base64'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { DialogFooter } from '@/components/ui/dialog-footer'
import { SectionHeader } from '@/components/ui/section-header'
import {
  SETTINGS_ACTION_BUTTON_CLASS,
  SettingsActionButton,
  SettingsSubsectionTitle,
} from './settings-layout'
import { cn } from '@/lib/utils'
import { useVaccineDefaults } from '@/components/providers/vaccine-data-provider'
import { updateVaccineDefault } from '@/lib/actions/vaccine-defaults'
import type { VaccineDefaults } from '@petmove/domain'

type ProductSection = '접종' | '구충'
type ProductSpecies = 'common' | 'dog' | 'cat'

interface CategoryMeta {
  label: string
  section: ProductSection
  species: ProductSpecies
  kind: 'vaccine' | 'parasite'
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  rabies:                { label: '광견병',                  section: '접종', species: 'common', kind: 'vaccine' },
  comprehensive_dog:     { label: '종합백신',                section: '접종', species: 'dog',    kind: 'vaccine' },
  comprehensive_cat:     { label: '종합백신 (고양이)',       section: '접종', species: 'cat',    kind: 'vaccine' },
  civ:                   { label: '독감',                     section: '접종', species: 'dog',    kind: 'vaccine' },
  kennel_cough:          { label: '켄넬코프',                section: '접종', species: 'dog',    kind: 'vaccine' },
  parasite_internal_dog: { label: '내부 구충',               section: '구충', species: 'common', kind: 'parasite' },
  parasite_internal_cat: { label: '내부 구충 (고양이)',      section: '구충', species: 'cat',    kind: 'parasite' },
  parasite_external_dog: { label: '외부 구충',               section: '구충', species: 'dog',    kind: 'parasite' },
  parasite_external_cat: { label: '외부 구충 (고양이)',      section: '구충', species: 'cat',    kind: 'parasite' },
  parasite_combo_dog:    { label: '내외부 구충 합제',         section: '구충', species: 'dog',   kind: 'parasite' },
  parasite_combo_cat:    { label: '내외부 구충 합제 (고양이)', section: '구충', species: 'cat',  kind: 'parasite' },
  heartworm_dog:         { label: '심장사상충',              section: '구충', species: 'dog',    kind: 'parasite' },
}

const CATEGORY_ORDER: string[] = [
  'rabies',
  'comprehensive_dog',
  'comprehensive_cat',
  'civ',
  'kennel_cough',
  'parasite_internal_dog',
  'parasite_internal_cat',
  'parasite_external_dog',
  'parasite_external_cat',
  'parasite_combo_dog',
  'parasite_combo_cat',
  'heartworm_dog',
]

const SECTION_ORDER: ProductSection[] = ['접종', '구충']

// sage / amber / rust trio — warning 은 amber 를 olive 와 섞어 한 단계 연하게.
const STATUS_STYLES: Record<ExpiryStatus, { label: string; color: string; dot: string }> = {
  expired: { label: '만료', color: 'var(--pmw-rust)',        dot: 'var(--pmw-rust)' },
  urgent:  { label: 'D-',   color: 'var(--pmw-amber)',       dot: 'var(--pmw-amber)' },
  warning: { label: 'D-',   color: 'color-mix(in srgb, var(--pmw-amber) 70%, var(--pmw-olive-gray))', dot: 'color-mix(in srgb, var(--pmw-amber) 55%, var(--pmw-border-warm))' },
  ok:      { label: '정상', color: 'var(--pmw-olive-gray)',  dot: 'var(--pmw-sage)' },
  unknown: { label: '—',    color: 'var(--pmw-stone-gray)',  dot: 'color-mix(in srgb, var(--pmw-stone-gray) 70%, var(--pmw-parchment))' },
}

function StatusBadge({ status, daysLeft }: { status: ExpiryStatus; daysLeft: number | null }) {
  const s = STATUS_STYLES[status]
  let text = s.label
  if (status === 'expired' && daysLeft !== null) text = `-${Math.abs(daysLeft)}일`
  else if ((status === 'urgent' || status === 'warning') && daysLeft !== null) text = `D-${daysLeft}`
  return (
    <span className="inline-flex items-center gap-1.5 font-serif text-[13px]" style={{ color: s.color }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: s.dot }} />
      {text}
    </span>
  )
}

function StatCount({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="font-serif text-[17px]" style={{ color }}>{n}</span>
      <span className="font-serif text-[13px]" style={{ color: 'var(--pmw-olive-gray)' }}>{label}</span>
    </span>
  )
}

interface FormState {
  category: string
  vaccine: string
  product: string
  manufacturer: string
  batch: string
  expiry: string
  year: string
  weight_min: string
  weight_max: string
  size: string
  parasite_id: string
}

function blankForm(category = 'rabies'): FormState {
  return {
    category,
    vaccine: '',
    product: '',
    manufacturer: '',
    batch: '',
    expiry: '',
    year: '',
    weight_min: '',
    weight_max: '',
    size: '',
    parasite_id: '',
  }
}

function toFormState(p: OrgVaccineProduct): FormState {
  return {
    category: p.category,
    vaccine: p.vaccine ?? '',
    product: p.product ?? '',
    manufacturer: p.manufacturer,
    batch: p.batch ?? '',
    expiry: p.expiry ?? '',
    year: p.year != null ? String(p.year) : '',
    weight_min: p.weight_min != null ? String(p.weight_min) : '',
    weight_max: p.weight_max != null ? String(p.weight_max) : '',
    size: p.size ?? '',
    parasite_id: p.parasite_id ?? '',
  }
}

function toInput(form: FormState): OrgVaccineProductInput {
  const num = (s: string) => (s.trim() === '' ? null : Number(s))
  const txt = (s: string) => (s.trim() === '' ? null : s.trim())
  const kind = CATEGORY_META[form.category]?.kind ?? 'vaccine'
  // Family 가 weight tier 없는 약이면 체중·size 무관하게 null 저장 — UI 가 숨겨도 폼 state 에
  // 남아있을 수 있으므로 저장 단계에서 안전망.
  const family = form.parasite_id ? PARASITE_FAMILIES.find((f) => f.id === form.parasite_id) : null
  const weightless = family ? !family.hasWeightTiers : false
  return {
    category: form.category,
    vaccine: kind === 'vaccine' ? txt(form.vaccine) : null,
    product: kind === 'parasite' ? txt(form.product) : null,
    manufacturer: form.manufacturer.trim(),
    batch: txt(form.batch),
    expiry: txt(form.expiry),
    year: num(form.year),
    weight_min: weightless ? null : num(form.weight_min),
    weight_max: weightless ? null : num(form.weight_max),
    size: weightless ? null : txt(form.size),
    parasite_id: txt(form.parasite_id),
  }
}

interface ExtractedRecord {
  product: string | null
  manufacturer: string | null
  lot: string | null
  expiry: string | null
}

function extractToFormState(rec: ExtractedRecord): FormState {
  // 분류 실패한 항목은 대체로 구충제이므로 default 카테고리로 parasite_internal_dog 선택.
  // 사용자가 모달에서 적절한 카테고리로 바꿀 수 있음. vaccine/product 양쪽에 채워두면
  // kind 가 어떤 쪽이든 입력 칸에 미리 표시됨 (저장 시 toInput 이 한쪽만 보냄).
  const name = rec.product ?? ''
  return {
    category: 'parasite_internal_dog',
    vaccine: name,
    product: name,
    manufacturer: rec.manufacturer ?? '',
    batch: rec.lot ?? '',
    expiry: rec.expiry ?? '',
    year: '',
    weight_min: '',
    weight_max: '',
    size: '',
    parasite_id: '',
  }
}

export function VaccineSection({
  initialProducts = null,
  isAdmin = false,
}: {
  initialProducts?: OrgVaccineProduct[] | null
  isAdmin?: boolean
} = {}) {
  const confirm = useConfirm()
  const [products, setProducts] = useState<OrgVaccineProduct[]>(initialProducts ?? [])
  const [loading, setLoading] = useState(initialProducts === null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<
    | { mode: 'create'; initial: FormState; fromExtract?: boolean }
    | { mode: 'edit'; id: string; initial: FormState }
    | null
  >(null)
  const [pending, startTransition] = useTransition()

  // 이미지 추출 상태 — 전역 드롭존으로 통합
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState<{ kind: 'info' | 'error' | 'success'; text: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [picking, setPicking] = useState(false)
  // AI 가 카테고리 분류에 실패한 추출 결과 — 모달로 하나씩 처리.
  const [extractQueue, setExtractQueue] = useState<ExtractedRecord[]>([])

  function closeOrAdvance() {
    if (extractQueue.length === 0) {
      setEditing(null)
      return
    }
    const [next, ...rest] = extractQueue
    setExtractQueue(rest)
    setEditing({ mode: 'create', initial: extractToFormState(next), fromExtract: true })
  }

  async function refresh() {
    setLoading(true)
    const r = await listOrgVaccineProducts()
    if (r.ok) {
      setProducts(r.value)
      setError(null)
    } else {
      setError(r.error)
    }
    setLoading(false)
  }

  // bootstrap 이 나중에 도착했을 때 반영.
  useEffect(() => {
    if (initialProducts) {
      setProducts(initialProducts)
      setLoading(false)
    }
  }, [initialProducts])

  // prop 도 bootstrap 도 없으면 fallback fetch.
  useEffect(() => {
    if (initialProducts !== null) return
    refresh()
  }, [])

  async function processVaccineExtracts(inputs: Array<{ imageBase64?: string; mediaType?: string; text?: string }>) {
    setExtracting(true)
    try {
      let created = 0
      const errors: string[] = []
      const unclassifiedRecs: ExtractedRecord[] = []
      for (const inp of inputs) {
        const r = await extractVaccineInfo(inp)
        if (!r.ok) {
          errors.push(r.error)
          continue
        }
        for (const rec of r.records) {
          const category = rec.category
          const meta = category ? CATEGORY_META[category] : undefined
          if (!category || !meta) {
            unclassifiedRecs.push({
              product: rec.product,
              manufacturer: rec.manufacturer,
              lot: rec.lot,
              expiry: rec.expiry,
            })
            continue
          }
          const kind = meta.kind
          const input: OrgVaccineProductInput = {
            category,
            vaccine: kind === 'vaccine' ? (rec.product ?? null) : null,
            product: kind === 'parasite' ? (rec.product ?? null) : null,
            manufacturer: (rec.manufacturer ?? '').trim() || '(미상)',
            batch: rec.lot ?? null,
            expiry: rec.expiry ?? null,
            year: null,
            weight_min: null,
            weight_max: null,
            size: null,
            parasite_id: null,
          }
          const c = await createOrgVaccineProduct(input)
          if (c.ok) created++
          else errors.push(c.error)
        }
      }
      await refresh()
      const notes: string[] = []
      if (unclassifiedRecs.length > 0) notes.push(`분류 필요 ${unclassifiedRecs.length}건`)
      if (errors.length > 0) notes.push(`오류 ${errors.length}건: ${errors[0]}`)
      if (created > 0) {
        setExtractMsg({
          kind: 'success',
          text: `${created}개 제품 추가됨${notes.length > 0 ? ` · ${notes.join(' · ')}` : ''}`,
        })
      } else if (unclassifiedRecs.length > 0) {
        setExtractMsg({ kind: 'info', text: `${unclassifiedRecs.length}건은 카테고리를 직접 골라주세요.` })
      } else {
        setExtractMsg({ kind: 'error', text: errors[0] ?? '추출된 정보가 없습니다.' })
      }
      // 분류 실패 항목을 큐에 넣고 첫 항목 모달 열기.
      if (unclassifiedRecs.length > 0) {
        const [first, ...rest] = unclassifiedRecs
        setExtractQueue(rest)
        setEditing({ mode: 'create', initial: extractToFormState(first), fromExtract: true })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류'
      setExtractMsg({ kind: 'error', text: `추출 실패: ${msg}` })
    } finally {
      setExtracting(false)
    }
  }

  async function handleImagesGlobal(files: File[]) {
    const extractable = files.filter(isExtractableFile)
    if (extractable.length === 0) {
      setExtractMsg({ kind: 'error', text: '이미지 또는 PDF 파일만 지원됩니다.' })
      return
    }
    setExtractMsg({ kind: 'info', text: `${extractable.length}개 파일에서 제품 정보를 읽는 중…` })
    const images = await filesToBase64(extractable)
    await processVaccineExtracts(images.map(img => ({ imageBase64: img.base64, mediaType: img.mediaType })))
  }

  async function handleTextGlobal(text: string) {
    setExtractMsg({ kind: 'info', text: '복사한 텍스트에서 제품 정보를 읽는 중…' })
    await processVaccineExtracts([{ text }])
  }

  // 문서 전체 paste 이벤트 — 전역으로 라우팅 (AI 가 카테고리 자동 분류)
  useEffect(() => {
    if (!isAdmin) return
    function onPaste(e: ClipboardEvent) {
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (it.kind === 'file') {
          const f = it.getAsFile()
          if (f) files.push(f)
        }
      }
      if (files.length > 0) {
        e.preventDefault()
        handleImagesGlobal(files)
        return
      }
      const text = e.clipboardData?.getData('text/plain')?.trim()
      if (text && text.length > 10) {
        e.preventDefault()
        handleTextGlobal(text)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  const grouped = useMemo(() => {
    const statusOrder: ExpiryStatus[] = ['expired', 'urgent', 'warning', 'ok', 'unknown']
    const byCat = new Map<string, OrgVaccineProduct[]>()
    for (const p of products) {
      if (!byCat.has(p.category)) byCat.set(p.category, [])
      byCat.get(p.category)!.push(p)
    }
    // Sort products inside each category by status then expiry
    for (const list of byCat.values()) {
      list.sort((a, b) => {
        const sa = statusOrder.indexOf(getExpiryStatus(a.expiry))
        const sb = statusOrder.indexOf(getExpiryStatus(b.expiry))
        if (sa !== sb) return sa - sb
        return (a.expiry ?? '9999') < (b.expiry ?? '9999') ? -1 : 1
      })
    }
    // Group by section with ordered categories
    return SECTION_ORDER.map((section) => {
      const cats = CATEGORY_ORDER
        .filter((cat) => CATEGORY_META[cat]?.section === section)
        .map((cat) => ({
          category: cat,
          meta: CATEGORY_META[cat],
          list: byCat.get(cat) ?? [],
        }))
      return { section, categories: cats }
    })
  }, [products])

  // 카테고리(구충은 size 까지)별 "최신 만료일 제품" 만 집계 — 최신이 유효하면 과거 만료 제품은 무시.
  const counts = useMemo(() => {
    const latestByKey = new Map<string, OrgVaccineProduct>()
    for (const p of products) {
      const isParasite = CATEGORY_META[p.category]?.kind === 'parasite'
      const key = isParasite ? `${p.category}|${p.size ?? ''}` : p.category
      const cur = latestByKey.get(key)
      if (!cur || (p.expiry ?? '') > (cur.expiry ?? '')) latestByKey.set(key, p)
    }
    const c = { expired: 0, urgent: 0, warning: 0, ok: 0, unknown: 0 }
    for (const p of latestByKey.values()) c[getExpiryStatus(p.expiry)]++
    return c
  }, [products])

  function onSave(form: FormState) {
    if (!form.manufacturer.trim()) {
      setError('제조사는 필수입니다.')
      return
    }
    const input = toInput(form)
    startTransition(async () => {
      const r = editing?.mode === 'edit'
        ? await updateOrgVaccineProduct(editing.id, input)
        : await createOrgVaccineProduct(input)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setError(null)
      await refresh()
      closeOrAdvance()
    })
  }

  async function onDelete(id: string) {
    if (!await confirm({ message: '이 제품을 삭제하시겠습니까?', okLabel: '삭제', variant: 'destructive' })) return
    startTransition(async () => {
      const r = await deleteOrgVaccineProduct(id)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setError(null)
      await refresh()
    })
  }

  // Shared grid template — 카테고리가 달라도 열이 맞도록 모든 행에 동일 적용.
  const gridCols = 'minmax(0,1.6fr) minmax(0,1fr) 110px 100px 150px'

  return (
    <div
      onDragOver={isAdmin ? (e) => { e.preventDefault(); if (!dragOver) setDragOver(true) } : undefined}
      onDragLeave={isAdmin ? (e) => {
        e.preventDefault()
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
      } : undefined}
      onDrop={isAdmin ? (e) => {
        e.preventDefault()
        setDragOver(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) handleImagesGlobal(files)
      } : undefined}
      className={`max-w-5xl pb-2xl rounded-md transition-colors ${dragOver ? 'bg-primary/5 ring-2 ring-primary/40 ring-dashed' : ''}`}
    >
      {/* Editorial header */}
      <header className="pb-xl">
        <div className="mb-md flex items-center justify-between gap-md flex-wrap">
          <SectionHeader>약품관리</SectionHeader>
          {isAdmin && (
            <div className="flex items-center gap-sm flex-wrap">
              <AttachButton
                accept="image/*,application/pdf"
                multiple
                onFile={(file) => handleImagesGlobal([file])}
                disabled={extracting}
                title="이미지·PDF로 AI 추출 (모바일 카메라 시 자동 크롭)"
                className={SETTINGS_ACTION_BUTTON_CLASS}
              >
                <Paperclip className="h-3.5 w-3.5" />
                이미지
              </AttachButton>
              <SettingsActionButton
                onClick={() => setPicking(true)}
                disabled={extracting}
                title="약품 추가"
              >
                <Plus className="h-3.5 w-3.5" />
                약품 추가
              </SettingsActionButton>
              {extracting && (
                <span className="font-serif italic text-[12px] text-muted-foreground">이미지에서 제품 정보를 읽는 중…</span>
              )}
              {dragOver && !extracting && (
                <span className="font-serif italic text-[12px] text-muted-foreground">놓으면 자동 분류</span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-lg flex-wrap items-baseline">
          {counts.expired > 0 && <StatCount n={counts.expired} label="만료" color="var(--pmw-rust)" />}
          {counts.urgent > 0 && <StatCount n={counts.urgent} label="30일 이내" color="var(--pmw-amber)" />}
          {counts.warning > 0 && <StatCount n={counts.warning} label="90일 이내" color="color-mix(in srgb, var(--pmw-amber) 70%, var(--pmw-olive-gray))" />}
          {counts.ok + counts.unknown > 0 && <StatCount n={counts.ok + counts.unknown} label="정상" color="var(--pmw-olive-gray)" />}
          {!loading && counts.expired + counts.urgent + counts.warning + counts.ok + counts.unknown === 0 && (
            <span className="pmw-st__sec-lead">등록된 제품 없음</span>
          )}
        </div>
      </header>

      {error && (
        <p className="mb-md font-serif text-[13px] text-destructive">{error}</p>
      )}

      {extractMsg && (
        <div
          className={`mb-md font-serif text-[13px] px-sm py-2 rounded flex items-center justify-between gap-sm ${
            extractMsg.kind === 'error'
              ? 'text-destructive bg-destructive/10'
              : extractMsg.kind === 'success'
              ? 'text-pmw-positive bg-pmw-positive/10'
              : 'italic text-muted-foreground bg-muted/60'
          }`}
        >
          <span>{extractMsg.text}</span>
          <button
            type="button"
            onClick={() => setExtractMsg(null)}
            className="text-[12px] opacity-60 hover:opacity-100"
          >
            닫기
          </button>
        </div>
      )}



      {loading ? (
        <p className="font-serif italic text-[14px] text-muted-foreground">불러오는 중…</p>
      ) : (
        grouped.map(({ section, categories }) => {
          const totalInSection = categories.reduce((sum, c) => sum + c.list.length, 0)
          return (
            <section key={section} className="mb-xl">
              <div className="mb-2 flex items-baseline gap-sm">
                <SettingsSubsectionTitle>{section}</SettingsSubsectionTitle>
                <span className="pmw-st__tab-count">{totalInSection}</span>
              </div>

              {/* Shared column header */}
              <div
                className="grid gap-md py-2 border-y border-border/80 pmw-st__group-title"
                style={{ gridTemplateColumns: gridCols }}
              >
                <span>제품명</span>
                <span>제조사</span>
                <span>제품번호</span>
                <span>만료</span>
                <span>상태</span>
              </div>

              {categories.map(({ category, meta, list }) => {
                return (
                  <div key={category} data-vaccine-category={category}>
                    {/* Category sub-header */}
                    <div className="flex items-center pt-md pb-1 px-1">
                      <span className="font-serif text-[13px] text-muted-foreground/80 truncate">
                        {meta.label}
                      </span>
                    </div>

                    {list.length === 0 ? (
                      <div className="py-2 px-1 pmw-st__btn-ghost border-b border-dotted border-border/80">
                        등록된 제품 없음
                      </div>
                    ) : (
                      list.map((p) => {
                        const status = getExpiryStatus(p.expiry)
                        const daysLeft = daysUntilExpiry(p.expiry)
                        const rowClickable = isAdmin
                        return (
                          <div
                            key={p.id}
                            role={rowClickable ? 'button' : undefined}
                            tabIndex={rowClickable ? 0 : undefined}
                            onClick={rowClickable ? () => setEditing({ mode: 'edit', id: p.id, initial: toFormState(p) }) : undefined}
                            onKeyDown={rowClickable ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                setEditing({ mode: 'edit', id: p.id, initial: toFormState(p) })
                              }
                            } : undefined}
                            title={rowClickable ? '클릭하여 수정·삭제' : undefined}
                            className={cn(
                              'grid gap-md items-center py-2 border-b border-dotted border-border/80 hover:bg-accent transition-colors',
                              rowClickable && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm',
                            )}
                            style={{ gridTemplateColumns: gridCols }}
                          >
                            <div className="font-serif text-[15px] truncate" style={{ color: 'var(--pmw-near-black)' }}>
                              {p.vaccine || p.product || '(이름 없음)'}
                            </div>
                            <div className="font-serif text-[14px] truncate" style={{ color: 'var(--pmw-olive-gray)' }}>
                              {p.manufacturer}
                            </div>
                            <div className="font-mono text-[12px] tabular-nums tracking-[0.3px] truncate" style={{ color: 'var(--pmw-near-black)' }}>{p.batch ?? '—'}</div>
                            <div className="font-mono text-[13px] tabular-nums tracking-[0.3px]" style={{ color: 'var(--pmw-olive-gray)' }}>{p.expiry ?? '—'}</div>
                            <div><StatusBadge status={status} daysLeft={daysLeft} /></div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )
              })}
            </section>
          )
        })
      )}

      {!loading && isAdmin && (
        <DefaultsSection products={products} />
      )}

      {!isAdmin && (
        <p className="pt-md border-t border-border/80 pmw-st__sec-lead">
          약품 추가·수정은 관리자만 가능합니다.
        </p>
      )}

      {picking && (
        <CategoryPickerModal
          products={products}
          onClose={() => setPicking(false)}
          onPickExisting={(p) => {
            setPicking(false)
            setEditing({ mode: 'edit', id: p.id, initial: toFormState(p) })
          }}
          onPickNew={(category) => {
            setPicking(false)
            setEditing({ mode: 'create', initial: blankForm(category) })
          }}
        />
      )}

      {editing && (
        <ProductFormModal
          key={editing.mode === 'edit' ? `edit-${editing.id}` : `create-${extractQueue.length}`}
          mode={editing.mode}
          initial={editing.initial}
          pending={pending}
          fromExtract={editing.mode === 'create' && editing.fromExtract === true}
          extractRemaining={extractQueue.length}
          onSkipAll={extractQueue.length > 0 ? () => { setExtractQueue([]); setEditing(null) } : undefined}
          onClose={closeOrAdvance}
          onSave={onSave}
          onDelete={
            editing.mode === 'edit'
              ? () => {
                  const id = editing.id
                  onDelete(id)
                  closeOrAdvance()
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

interface CategoryPickerModalProps {
  products: OrgVaccineProduct[]
  onClose: () => void
  onPickExisting: (p: OrgVaccineProduct) => void
  onPickNew: (category: string) => void
}

function CategoryPickerModal({ products, onClose, onPickExisting, onPickNew }: CategoryPickerModalProps) {
  const [section, setSection] = useState<ProductSection | null>(null)
  const [category, setCategory] = useState<string | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (category) setCategory(null)
        else if (section) setSection(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [category, section, onClose])

  const productsInCategory = useMemo(() => {
    if (!category) return []
    const list = products.filter((p) => p.category === category)
    list.sort((a, b) => (a.expiry ?? '9999') < (b.expiry ?? '9999') ? -1 : 1)
    return list
  }, [products, category])

  const crumbs: { label: string; onClick?: () => void }[] = []
  crumbs.push({ label: '카테고리', onClick: section ? () => { setSection(null); setCategory(null) } : undefined })
  if (section) crumbs.push({ label: section, onClick: category ? () => setCategory(null) : undefined })
  if (section && category) crumbs.push({ label: CATEGORY_META[category]?.label ?? category })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between border-b border-border/80 px-lg py-3">
          <div className="flex items-center gap-1 min-w-0">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1 min-w-0">
                {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />}
                {c.onClick ? (
                  <button
                    type="button"
                    onClick={c.onClick}
                    className="font-serif text-[15px] hover:underline truncate"
                    style={{ color: 'var(--pmw-olive-gray)' }}
                  >
                    {c.label}
                  </button>
                ) : (
                  <span className="font-serif text-[15px] truncate">{c.label}</span>
                )}
              </span>
            ))}
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-lg py-md">
          {!section && (
            <div className="space-y-2">
              {SECTION_ORDER.map((s) => {
                const cnt = CATEGORY_ORDER.filter((c) => CATEGORY_META[c].section === s).length
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSection(s)}
                    className="w-full flex items-center justify-between px-md py-3 rounded-md border border-border/80 hover:bg-muted/40 transition-colors text-left"
                  >
                    <span className="font-serif text-[16px]">{s}</span>
                    <span className="flex items-center gap-2">
                      <span className="pmw-st__tab-count">{cnt}</span>
                      <ChevronRight className="h-4 w-4 opacity-60" />
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {section && !category && (
            <div className="space-y-2">
              {CATEGORY_ORDER.filter((c) => CATEGORY_META[c].section === section).map((c) => {
                const cnt = products.filter((p) => p.category === c).length
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className="w-full flex items-center justify-between px-md py-3 rounded-md border border-border/80 hover:bg-muted/40 transition-colors text-left"
                  >
                    <span className="font-serif text-[15px]">{CATEGORY_META[c].label}</span>
                    <span className="flex items-center gap-2">
                      <span className="pmw-st__tab-count">{cnt}</span>
                      <ChevronRight className="h-4 w-4 opacity-60" />
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {section && category && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => onPickNew(category)}
                className="w-full flex items-center gap-2 px-md py-3 rounded-md border border-dashed border-border/80 hover:bg-muted/40 transition-colors text-left"
              >
                <Plus className="h-4 w-4" />
                <span className="font-serif text-[15px]">새 제품 추가</span>
              </button>

              {productsInCategory.length === 0 ? (
                <p className="font-serif italic text-[13px] text-muted-foreground py-md text-center">
                  등록된 제품 없음
                </p>
              ) : (
                productsInCategory.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onPickExisting(p)}
                    className="w-full grid grid-cols-[1fr_auto_auto] items-center gap-3 px-md py-2.5 rounded-md border border-border/80 hover:bg-muted/40 transition-colors text-left"
                  >
                    <span className="font-serif text-[14px] truncate">
                      {p.vaccine || p.product || '(이름 없음)'}
                    </span>
                    <span className="font-mono text-[12px] tabular-nums" style={{ color: 'var(--pmw-olive-gray)' }}>
                      {p.batch ?? '—'}
                    </span>
                    <span className="font-mono text-[12px] tabular-nums" style={{ color: 'var(--pmw-olive-gray)' }}>
                      {p.expiry ?? '—'}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface ProductFormModalProps {
  mode: 'create' | 'edit'
  initial: FormState
  pending: boolean
  fromExtract?: boolean
  extractRemaining?: number
  onSkipAll?: () => void
  onClose: () => void
  onSave: (form: FormState) => void
  onDelete?: () => void
}

function ProductFormModal({ mode, initial, pending, fromExtract, extractRemaining, onSkipAll, onClose, onSave, onDelete }: ProductFormModalProps) {
  const confirm = useConfirm()
  const [form, setForm] = useState<FormState>(initial)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const kind = CATEGORY_META[form.category]?.kind ?? 'vaccine'
  const parasiteCategorySpecies = CATEGORY_META[form.category]?.species ?? 'common'
  const parasiteOptions = PARASITE_FAMILIES.filter((f) =>
    parasiteCategorySpecies === 'dog' ? f.species === 'dog'
      : parasiteCategorySpecies === 'cat' ? f.species === 'cat'
      : true
  )
  const selectedFamily = form.parasite_id ? PARASITE_FAMILIES.find((f) => f.id === form.parasite_id) ?? null : null
  // family 미선택 시엔 보수적으로 weight 필드 노출 (사용자가 수동 입력 가능),
  // family 선택됐고 그게 weight tier 없는 약(Drontal/Frontline Spray 등)이면 숨김.
  const showWeightFields = !selectedFamily || selectedFamily.hasWeightTiers

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // 제품명·제조사 변경 시 family ID 자동 매칭 — 사용자가 아직 직접 고르지 않았을 때만.
  useEffect(() => {
    if (kind !== 'parasite') return
    if (form.parasite_id) return
    const productLc = form.product.trim().toLowerCase()
    const mfgLc = form.manufacturer.trim().toLowerCase()
    if (!productLc || !mfgLc) return
    const match = parasiteOptions.find(
      (f) => f.name.toLowerCase() === productLc && f.manufacturer.toLowerCase() === mfgLc,
    )
    if (match) {
      setForm((f) => ({ ...f, parasite_id: match.id }))
    }
    // parasiteOptions 는 category 의 species 가 바뀔 때만 변하므로 의존성에서 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.product, form.manufacturer, kind, form.parasite_id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between border-b border-border/80 px-lg py-3">
          <h3 className="font-serif text-[17px]">{mode === 'create' ? '약품 추가' : '약품 수정'}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {fromExtract && (
          <div className="border-b border-border/80 bg-muted/40 px-lg py-2 flex items-center justify-between gap-sm">
            <span className="font-serif italic text-[13px] text-muted-foreground">
              AI 가 카테고리를 자동 분류하지 못했습니다. 카테고리를 골라주세요.
              {extractRemaining && extractRemaining > 0 ? ` (남은 ${extractRemaining}건)` : ''}
            </span>
            {onSkipAll && (
              <button
                type="button"
                onClick={onSkipAll}
                className="font-serif text-[12px] text-muted-foreground/80 hover:text-foreground underline"
              >
                모두 건너뛰기
              </button>
            )}
          </div>
        )}

        <div className="px-lg py-md space-y-md">
          <Field label="카테고리">
            <select
              value={form.category}
              onChange={(e) => update('category', e.target.value)}
              className="w-full px-sm py-1.5 text-sm rounded-md border border-border/80 bg-background"
            >
              {CATEGORY_ORDER.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_META[cat].section} · {CATEGORY_META[cat].label}
                </option>
              ))}
            </select>
          </Field>

          {kind === 'vaccine' ? (
            <Field label="백신명 (vaccine)">
              <input
                value={form.vaccine}
                onChange={(e) => update('vaccine', e.target.value)}
                placeholder="예: Rabisin"
                className="w-full px-sm py-1.5 text-sm rounded-md border border-border/80 bg-background"
              />
            </Field>
          ) : (
            <Field label="제품명 (product)">
              <input
                value={form.product}
                onChange={(e) => update('product', e.target.value)}
                placeholder="예: NexGard Spectra"
                className="w-full px-sm py-1.5 text-sm rounded-md border border-border/80 bg-background"
              />
            </Field>
          )}

          <Field label="제조사 *">
            <input
              value={form.manufacturer}
              onChange={(e) => update('manufacturer', e.target.value)}
              placeholder="예: Boehringer Ingelheim"
              className="w-full px-sm py-1.5 text-sm rounded-md border border-border/80 bg-background"
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-md">
            <Field label="Batch">
              <input
                value={form.batch}
                onChange={(e) => update('batch', e.target.value)}
                placeholder="예: E19623"
                className="w-full px-sm py-1.5 text-sm rounded-md border border-border/80 bg-background font-mono"
              />
            </Field>
            <Field label="만료일 (YYYY-MM-DD 또는 YYYY-MM)">
              <input
                value={form.expiry}
                onChange={(e) => update('expiry', e.target.value)}
                placeholder="2027-06"
                className="w-full px-sm py-1.5 text-sm rounded-md border border-border/80 bg-background"
              />
            </Field>
          </div>

          {/* year 필드는 UI 에서 노출하지 않음 — 2026 G98321 이후 등록되는 신규 batch 는 date-range 매칭을 쓰므로 year 가 불필요. 기존 레코드의 year 값은 form state 에 보존되어 저장 시 유지됨. */}

          {kind === 'parasite' && (
            <>
              <Field label="Parasite family ID (선택사항)">
                <select
                  value={form.parasite_id}
                  onChange={(e) => update('parasite_id', e.target.value)}
                  className="w-full px-sm py-1.5 text-sm rounded-md border border-border/80 bg-background"
                >
                  <option value="">(미지정)</option>
                  {parasiteOptions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.id} — {f.name} ({f.species}, {f.kind})
                    </option>
                  ))}
                </select>
              </Field>

              {showWeightFields && (
                <div className="grid grid-cols-3 gap-md">
                  <Field label="체중 최소 (kg)">
                    <input
                      type="number"
                      step="0.01"
                      value={form.weight_min}
                      onChange={(e) => update('weight_min', e.target.value)}
                      className="w-full px-sm py-1.5 text-sm rounded-md border border-border/80 bg-background"
                    />
                  </Field>
                  <Field label="체중 최대 (kg)">
                    <input
                      type="number"
                      step="0.01"
                      value={form.weight_max}
                      onChange={(e) => update('weight_max', e.target.value)}
                      className="w-full px-sm py-1.5 text-sm rounded-md border border-border/80 bg-background"
                    />
                  </Field>
                  <Field label="표기 (size)">
                    <input
                      value={form.size}
                      onChange={(e) => update('size', e.target.value)}
                      placeholder="1.35-3.5kg"
                      className="w-full px-sm py-1.5 text-sm rounded-md border border-border/80 bg-background"
                    />
                  </Field>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter
          bordered
          onCancel={onClose}
          cancelLabel={fromExtract ? '건너뛰기' : '취소'}
          onPrimary={() => onSave(form)}
          primaryLabel={mode === 'create' ? '추가' : '저장'}
          primaryDisabled={!form.manufacturer.trim()}
          saving={pending}
          destructive={
            mode === 'edit' && onDelete
              ? {
                  onClick: async () => {
                    if (await confirm({ message: '이 제품을 삭제하시겠습니까?', okLabel: '삭제', variant: 'destructive' })) onDelete()
                  },
                }
              : undefined
          }
        />
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="pmw-st__field-label">{label}</span>
      {children}
    </label>
  )
}

/**
 * 카테고리 product/vaccine 이름에서 trailing 괄호 제거 = "브랜드 키".
 * 같은 브랜드의 weight-tier batch 들을 하나로 묶기 위함.
 */
function brandLabel(p: OrgVaccineProduct): string {
  const raw = (p.vaccine || p.product || '').trim()
  return raw.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

// 내부구충은 `parasite_internal_dog` 가 강아지·고양이 공용 catch-all (CATEGORY_META species='common').
// 그래서 internal_cat 슬롯도 dog 카테고리에 등록된 공용 약품 (Drontal Plus 등) 을 옵션에 노출.
const DEFAULT_SLOTS: { key: keyof VaccineDefaults; label: string; species: 'dog' | 'cat'; categories: string[] }[] = [
  { key: 'external_dog',  label: '외부구충 (강아지)',  species: 'dog', categories: ['parasite_external_dog', 'parasite_combo_dog'] },
  { key: 'external_cat',  label: '외부구충 (고양이)',  species: 'cat', categories: ['parasite_external_cat', 'parasite_combo_cat'] },
  { key: 'internal_dog',  label: '내부구충 (강아지)',  species: 'dog', categories: ['parasite_internal_dog', 'parasite_internal_cat', 'parasite_combo_dog'] },
  { key: 'internal_cat',  label: '내부구충 (고양이)',  species: 'cat', categories: ['parasite_internal_dog', 'parasite_internal_cat', 'parasite_combo_cat'] },
  { key: 'heartworm_dog', label: '심장사상충 (강아지)', species: 'dog', categories: ['heartworm_dog', 'parasite_combo_dog'] },
  { key: 'heartworm_cat', label: '심장사상충 (고양이)', species: 'cat', categories: ['heartworm_cat', 'parasite_combo_cat'] },
]

/**
 * 디폴트 약품 설정 — 외/내/심장사상충 × 강아지/고양이 6 슬롯.
 * 케이스 상세에서 날짜만 입력했을 때 자동 채워질 브랜드를 지정.
 * 옵션 = 그 슬롯에 적용 가능한 카테고리 (strict + combo) 에 등록된 unique 브랜드.
 */
function DefaultsSection({ products }: { products: OrgVaccineProduct[] }) {
  const initial = useVaccineDefaults()
  const [values, setValues] = useState<VaccineDefaults>(initial)
  const [savingKey, setSavingKey] = useState<keyof VaccineDefaults | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // initial 이 layout HMR 등으로 갱신되면 sync.
  useEffect(() => { setValues(initial) }, [initial])

  async function handleChange(key: keyof VaccineDefaults, raw: string) {
    const next = raw || undefined
    setValues((s) => ({ ...s, [key]: next }))
    setSavingKey(key)
    const r = await updateVaccineDefault({ [key]: next ?? '' } as Partial<VaccineDefaults>)
    setSavingKey(null)
    if (!r.ok) {
      setMsg(`저장 실패: ${r.error}`)
      setValues(initial)
    } else {
      setMsg(null)
    }
  }

  return (
    <section className="mb-xl border-b border-border/80 pb-lg">
      <div className="mb-2 flex items-baseline gap-sm">
        <SettingsSubsectionTitle>구충 디폴트 설정</SettingsSubsectionTitle>
        <span className="pmw-st__sec-lead">상세페이지에서 날짜 입력 시 자동 채움</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-lg gap-y-2">
        {DEFAULT_SLOTS.map((slot) => {
          const matching = products.filter((p) => slot.categories.includes(p.category))
          const brands = Array.from(new Set(matching.map(brandLabel).filter(Boolean))).sort()
          const current = values[slot.key] ?? ''
          return (
            <div key={slot.key} className="flex items-baseline gap-sm">
              <span className="font-serif text-[14px] text-muted-foreground/80 w-[140px] shrink-0">{slot.label}</span>
              <select
                value={current}
                onChange={(e) => handleChange(slot.key, e.target.value)}
                disabled={savingKey === slot.key}
                className="flex-1 px-sm py-1 text-sm rounded-md border border-border/80 bg-background disabled:opacity-50"
              >
                <option value="">(미지정)</option>
                {brands.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
                {/* 현재 저장된 값이 옵션에 없으면 (카탈로그에서 삭제된 경우) 그래도 표시 */}
                {current && !brands.includes(current) && (
                  <option value={current}>{current} (등록 안 됨)</option>
                )}
              </select>
            </div>
          )
        })}
      </div>
      {msg && <p className="mt-2 font-serif text-[12px] text-destructive">{msg}</p>}
    </section>
  )
}
