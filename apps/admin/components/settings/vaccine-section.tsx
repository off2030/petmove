'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Paperclip, Pencil, Plus, Trash2, X } from 'lucide-react'
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
  civ:                   { label: 'CIV 독감',                section: '접종', species: 'dog',    kind: 'vaccine' },
  kennel_cough:          { label: '켄넬코프',                section: '접종', species: 'dog',    kind: 'vaccine' },
  parasite_internal_dog: { label: '내부 구충',               section: '구충', species: 'common', kind: 'parasite' },
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
  return {
    category: form.category,
    vaccine: txt(form.vaccine),
    product: txt(form.product),
    manufacturer: form.manufacturer.trim(),
    batch: txt(form.batch),
    expiry: txt(form.expiry),
    year: num(form.year),
    weight_min: num(form.weight_min),
    weight_max: num(form.weight_max),
    size: txt(form.size),
    parasite_id: txt(form.parasite_id),
  }
}

export function VaccineSection({
  initialProducts = null,
  isAdmin = false,
}: {
  initialProducts?: OrgVaccineProduct[] | null
  isAdmin?: boolean
} = {}) {
  const [products, setProducts] = useState<OrgVaccineProduct[]>(initialProducts ?? [])
  const [loading, setLoading] = useState(initialProducts === null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<
    | { mode: 'create'; initial: FormState }
    | { mode: 'edit'; id: string; initial: FormState }
    | null
  >(null)
  const [pending, startTransition] = useTransition()

  // 이미지 추출 상태 — 전역 드롭존으로 통합
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState<{ kind: 'info' | 'error' | 'success'; text: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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

  async function handleImagesGlobal(files: File[]) {
    const extractable = files.filter(isExtractableFile)
    if (extractable.length === 0) {
      setExtractMsg({ kind: 'error', text: '이미지 또는 PDF 파일만 지원됩니다.' })
      return
    }
    setExtracting(true)
    setExtractMsg({ kind: 'info', text: `${extractable.length}개 파일에서 제품 정보를 읽는 중…` })
    try {
      const images = await filesToBase64(extractable)
      let created = 0
      const errors: string[] = []
      const unclassified: string[] = []
      for (const img of images) {
        const r = await extractVaccineInfo({ imageBase64: img.base64, mediaType: img.mediaType })
        if (!r.ok) {
          errors.push(r.error)
          continue
        }
        for (const rec of r.records) {
          const category = rec.category
          const meta = category ? CATEGORY_META[category] : undefined
          if (!category || !meta) {
            unclassified.push(rec.product ?? '(이름 없음)')
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
      if (unclassified.length > 0) notes.push(`분류 실패 ${unclassified.length}건 (${unclassified.slice(0, 2).join(', ')}${unclassified.length > 2 ? '…' : ''})`)
      if (errors.length > 0) notes.push(`오류 ${errors.length}건: ${errors[0]}`)
      if (created > 0) {
        setExtractMsg({
          kind: 'success',
          text: `${created}개 제품 추가됨${notes.length > 0 ? ` · ${notes.join(' · ')}` : ''}`,
        })
      } else if (unclassified.length > 0) {
        setExtractMsg({ kind: 'error', text: `카테고리를 자동 분류하지 못했습니다. 수동으로 추가해 주세요. (${unclassified.slice(0, 2).join(', ')})` })
      } else {
        setExtractMsg({ kind: 'error', text: errors[0] ?? '추출된 정보가 없습니다.' })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류'
      setExtractMsg({ kind: 'error', text: `추출 실패: ${msg}` })
    } finally {
      setExtracting(false)
    }
  }

  // 문서 전체 paste 이벤트 — 전역으로 라우팅 (AI 가 카테고리 자동 분류)
  useEffect(() => {
    if (!isAdmin) return
    function onPaste(e: ClipboardEvent) {
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
      if (files.length === 0) return
      e.preventDefault()
      handleImagesGlobal(files)
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
      setEditing(null)
      await refresh()
    })
  }

  function onDelete(id: string) {
    if (!confirm('이 제품을 삭제하시겠습니까?')) return
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
  const gridCols = isAdmin
    ? 'minmax(0,1.6fr) minmax(0,1fr) 110px 100px 150px 56px'
    : 'minmax(0,1.6fr) minmax(0,1fr) 110px 100px 150px'

  return (
    <div className="max-w-5xl pb-2xl">
      {/* Editorial header */}
      <header className="pb-xl">
        <h2 className="pmw-st__sec-title mb-md">약품</h2>
        <div className="flex gap-lg flex-wrap items-baseline">
          {counts.expired > 0 && <StatCount n={counts.expired} label="만료" color="var(--pmw-rust)" />}
          {counts.urgent > 0 && <StatCount n={counts.urgent} label="30일 이내" color="var(--pmw-amber)" />}
          {counts.warning > 0 && <StatCount n={counts.warning} label="90일 이내" color="color-mix(in srgb, var(--pmw-amber) 70%, var(--pmw-olive-gray))" />}
          {counts.ok > 0 && <StatCount n={counts.ok} label="정상" color="var(--pmw-olive-gray)" />}
          {counts.unknown > 0 && <StatCount n={counts.unknown} label="정보 없음" color="var(--pmw-stone-gray)" />}
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
              ? 'text-green-700 bg-green-50'
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

      {isAdmin && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            if (!dragOver) setDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const files = Array.from(e.dataTransfer.files)
            if (files.length > 0) handleImagesGlobal(files)
          }}
          className={`mb-xl border border-dotted rounded-sm px-lg py-md transition-colors ${
            dragOver ? 'border-primary/60 bg-primary/5' : 'border-border/60'
          }`}
        >
          <div className="flex items-center justify-between gap-md flex-wrap">
            <div className="flex items-center gap-sm min-w-0">
              <Paperclip className="h-4 w-4 shrink-0" style={{ color: 'var(--pmw-olive-gray)' }} />
              <p className="pmw-st__sec-lead">
                {extracting
                  ? '이미지에서 제품 정보를 읽는 중…'
                  : '제품 이미지·PDF 를 이 영역에 드래그하거나 Ctrl+V 로 붙여넣으면 AI 가 카테고리를 자동 분류합니다.'}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                e.target.value = ''
                if (files.length > 0) handleImagesGlobal(files)
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={extracting}
              className="inline-flex items-center gap-1 pmw-st__btn px-2 py-0.5 rounded-full border border-border/60 hover:bg-muted/40 transition-colors disabled:opacity-40 shrink-0"
            >
              <Paperclip className="h-3 w-3" />
              파일 선택
            </button>
          </div>
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
                <h3 className="font-serif text-[17px] text-foreground">{section}</h3>
                <span className="pmw-st__tab-count">{totalInSection}</span>
              </div>

              {/* Shared column header */}
              <div
                className="grid gap-md py-2 border-y border-border/70 pmw-st__group-title"
                style={{ gridTemplateColumns: gridCols }}
              >
                <span>제품명</span>
                <span>제조사</span>
                <span>제품번호</span>
                <span>만료</span>
                <span>상태</span>
                {isAdmin && <span />}
              </div>

              {categories.map(({ category, meta, list }) => {
                return (
                  <div key={category} data-vaccine-category={category}>
                    {/* Category sub-header */}
                    <div className="flex items-center justify-between pt-md pb-1 px-1">
                      <div className="flex items-baseline gap-sm min-w-0">
                        <span className="pmw-st__group-title truncate">{meta.label}</span>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditing({ mode: 'create', initial: blankForm(category) })
                          }
                          className="inline-flex items-center gap-1 pmw-st__btn px-2 py-0.5 rounded-full border border-border/60 hover:bg-muted/40 transition-colors shrink-0"
                        >
                          <Plus className="h-3 w-3" />
                          추가
                        </button>
                      )}
                    </div>

                    {list.length === 0 ? (
                      <div className="py-2 px-1 pmw-st__btn-ghost border-b border-dotted border-border/60">
                        등록된 제품 없음
                      </div>
                    ) : (
                      list.map((p) => {
                        const status = getExpiryStatus(p.expiry)
                        const daysLeft = daysUntilExpiry(p.expiry)
                        return (
                          <div
                            key={p.id}
                            className="grid gap-md items-center py-2 border-b border-dotted border-border/60 hover:bg-accent transition-colors"
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
                            {isAdmin && (
                              <div className="flex gap-0.5 justify-end">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditing({ mode: 'edit', id: p.id, initial: toFormState(p) })
                                  }
                                  className="p-1 rounded hover:bg-muted transition-colors"
                                  title="수정"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDelete(p.id)}
                                  disabled={pending}
                                  className="p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
                                  title="삭제"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
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

      {!isAdmin && (
        <p className="pt-md border-t border-border/60 pmw-st__sec-lead">
          약품 추가·수정은 관리자만 가능합니다.
        </p>
      )}

      {editing && (
        <ProductFormModal
          mode={editing.mode}
          initial={editing.initial}
          pending={pending}
          onClose={() => setEditing(null)}
          onSave={onSave}
        />
      )}
    </div>
  )
}

interface ProductFormModalProps {
  mode: 'create' | 'edit'
  initial: FormState
  pending: boolean
  onClose: () => void
  onSave: (form: FormState) => void
}

function ProductFormModal({ mode, initial, pending, onClose, onSave }: ProductFormModalProps) {
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

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between border-b border-border/60 px-lg py-3">
          <h3 className="font-serif text-[17px]">{mode === 'create' ? '약품 추가' : '약품 수정'}</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-lg py-md space-y-md">
          <Field label="카테고리">
            <select
              value={form.category}
              onChange={(e) => update('category', e.target.value)}
              disabled={mode === 'edit'}
              className="w-full px-sm py-1.5 text-sm rounded-md border border-border/60 bg-background disabled:opacity-60"
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
                className="w-full px-sm py-1.5 text-sm rounded-md border border-border/60 bg-background"
              />
            </Field>
          ) : (
            <Field label="제품명 (product)">
              <input
                value={form.product}
                onChange={(e) => update('product', e.target.value)}
                placeholder="예: NexGard Spectra"
                className="w-full px-sm py-1.5 text-sm rounded-md border border-border/60 bg-background"
              />
            </Field>
          )}

          <Field label="제조사 *">
            <input
              value={form.manufacturer}
              onChange={(e) => update('manufacturer', e.target.value)}
              placeholder="예: Boehringer Ingelheim"
              className="w-full px-sm py-1.5 text-sm rounded-md border border-border/60 bg-background"
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-md">
            <Field label="Batch">
              <input
                value={form.batch}
                onChange={(e) => update('batch', e.target.value)}
                placeholder="예: E19623"
                className="w-full px-sm py-1.5 text-sm rounded-md border border-border/60 bg-background font-mono"
              />
            </Field>
            <Field label="만료일 (YYYY-MM-DD 또는 YYYY-MM)">
              <input
                value={form.expiry}
                onChange={(e) => update('expiry', e.target.value)}
                placeholder="2027-06"
                className="w-full px-sm py-1.5 text-sm rounded-md border border-border/60 bg-background"
              />
            </Field>
          </div>

          {/* year 필드는 UI 에서 노출하지 않음 — 2026 G98321 이후 등록되는 신규 batch 는 date-range 매칭을 쓰므로 year 가 불필요. 기존 레코드의 year 값은 form state 에 보존되어 저장 시 유지됨. */}

          {kind === 'parasite' && (
            <>
              <div className="grid grid-cols-3 gap-md">
                <Field label="체중 최소 (kg)">
                  <input
                    type="number"
                    step="0.01"
                    value={form.weight_min}
                    onChange={(e) => update('weight_min', e.target.value)}
                    className="w-full px-sm py-1.5 text-sm rounded-md border border-border/60 bg-background"
                  />
                </Field>
                <Field label="체중 최대 (kg)">
                  <input
                    type="number"
                    step="0.01"
                    value={form.weight_max}
                    onChange={(e) => update('weight_max', e.target.value)}
                    className="w-full px-sm py-1.5 text-sm rounded-md border border-border/60 bg-background"
                  />
                </Field>
                <Field label="표기 (size)">
                  <input
                    value={form.size}
                    onChange={(e) => update('size', e.target.value)}
                    placeholder="1.35-3.5kg"
                    className="w-full px-sm py-1.5 text-sm rounded-md border border-border/60 bg-background"
                  />
                </Field>
              </div>

              <Field label="Parasite family ID (선택사항)">
                <select
                  value={form.parasite_id}
                  onChange={(e) => update('parasite_id', e.target.value)}
                  className="w-full px-sm py-1.5 text-sm rounded-md border border-border/60 bg-background"
                >
                  <option value="">(미지정)</option>
                  {parasiteOptions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.id} — {f.name} ({f.species}, {f.kind})
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border/60 px-lg py-3">
          <button
            type="button"
            onClick={onClose}
            className="px-md py-1.5 text-sm rounded-md hover:bg-muted transition-colors"
            disabled={pending}
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => onSave(form)}
            disabled={pending || !form.manufacturer.trim()}
            className="px-md py-1.5 text-sm rounded-md bg-accent hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {mode === 'create' ? '추가' : '저장'}
          </button>
        </div>
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
