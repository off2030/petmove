'use client'

import { useEffect, useState, useTransition } from 'react'
import { CheckCircle2, Plus, X } from 'lucide-react'
import { submitShareLink } from '@/lib/actions/share-links'
import type {
  ShareFieldSpec,
  ShareLinkPublicView,
  ShareVaccineEntry,
} from '@/lib/share-links-types'

interface Props {
  initial: ShareLinkPublicView
}

export function ShareForm({ initial }: Props) {
  const [view] = useState(initial)
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const out: Record<string, unknown> = {}
    for (const f of initial.fields) {
      if (f.type === 'date_array') {
        // ShareVaccineEntry[] 형태 — 문자열도 호환
        const cur = Array.isArray(f.current_value) ? (f.current_value as unknown[]) : []
        out[f.key] = cur
          .map((e): ShareVaccineEntry | null => {
            if (typeof e === 'string') return { date: e }
            if (e && typeof e === 'object' && 'date' in e) {
              const obj = e as Record<string, unknown>
              return {
                date: typeof obj.date === 'string' ? obj.date : '',
                valid_until: typeof obj.valid_until === 'string' ? obj.valid_until : null,
                product: typeof obj.product === 'string' ? obj.product : null,
                manufacturer: typeof obj.manufacturer === 'string' ? obj.manufacturer : null,
                lot: typeof obj.lot === 'string' ? obj.lot : null,
                expiry: typeof obj.expiry === 'string' ? obj.expiry : null,
              }
            }
            return null
          })
          .filter((e): e is ShareVaccineEntry => e !== null)
      } else {
        out[f.key] = f.current_value ?? ''
      }
    }
    return out
  })
  const [submitterNote, setSubmitterNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()
  const [expiresLabel, setExpiresLabel] = useState('')

  useEffect(() => {
    setExpiresLabel(new Date(view.expires_at).toLocaleString('ko-KR'))
  }, [view.expires_at])

  // 상태 사전 차단
  if (view.status === 'submitted' || done) {
    return (
      <Centered>
        <CheckCircle2 className="mx-auto text-emerald-600" size={48} />
        <h1 className="mt-md font-serif text-[20px] font-medium">제출 완료</h1>
        <p className="mt-2 font-serif text-[14px] text-muted-foreground">
          입력해주신 정보가 {view.org_name || '담당 조직'} 의 케이스에 반영됐습니다. 감사합니다.
        </p>
      </Centered>
    )
  }
  if (view.status === 'expired') {
    return (
      <Centered>
        <h1 className="font-serif text-[20px] font-medium">만료된 링크입니다</h1>
        <p className="mt-2 font-serif text-[14px] text-muted-foreground">
          담당자에게 새 링크를 요청해주세요.
        </p>
      </Centered>
    )
  }
  if (view.status === 'revoked') {
    return (
      <Centered>
        <h1 className="font-serif text-[20px] font-medium">취소된 링크입니다</h1>
        <p className="mt-2 font-serif text-[14px] text-muted-foreground">
          이 링크는 더 이상 사용할 수 없습니다.
        </p>
      </Centered>
    )
  }

  function update(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const r = await submitShareLink({
        token: view.token,
        values,
        submitterNote: submitterNote || null,
      })
      if (!r.ok) { setError(r.error); return }
      setDone(true)
    })
  }

  return (
    <div className="min-h-screen bg-background py-lg px-md">
      <form
        onSubmit={handleSubmit}
        className="mx-auto max-w-xl space-y-md rounded-xl border border-border/80 bg-card p-xl shadow-sm"
      >
        {/* 헤더 */}
        <header className="space-y-1 pb-md border-b border-border/60">
          <p className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted-foreground/80">
            {view.org_name || '담당 조직'}
          </p>
          <h1 className="font-serif text-[20px] font-medium leading-tight">
            {view.case_label}
          </h1>
          {view.title && (
            <p className="mt-2 font-serif italic text-[14px] text-muted-foreground/90 whitespace-pre-wrap">
              {view.title}
            </p>
          )}
        </header>

        {/* 필드 입력 — 카테고리/서브그룹별로 묶어 표시. 카테고리·서브그룹 단일이면 헤더 생략. */}
        <div className="space-y-md">
          {(() => {
            const grouped = groupFields(view.fields)
            const showCategoryHeaders = grouped.length >= 2
            return grouped.map((cat) => (
              <div key={cat.category ?? '__none'} className="space-y-md">
                {showCategoryHeaders && cat.category && (
                  <h2 className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-foreground/80 pt-md">
                    {cat.category}
                  </h2>
                )}
                {cat.blocks.map((block, bi) => (
                  <div key={bi} className="space-y-md">
                    {cat.showSubgroupHeaders && block.subgroup && (
                      <p className="font-mono text-[10px] uppercase tracking-[1.1px] text-muted-foreground/70 pt-1">
                        {block.subgroup}
                      </p>
                    )}
                    {block.fields.map((f) => (
                      <FieldInput key={f.key} field={f} value={values[f.key]} onChange={(v) => update(f.key, v)} />
                    ))}
                  </div>
                ))}
              </div>
            ))
          })()}
        </div>

        {/* 메모 */}
        <div className="pt-md border-t border-border/60">
          <label className="block">
            <span className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted-foreground/80">
              메모 (선택)
            </span>
            <textarea
              value={submitterNote}
              onChange={(e) => setSubmitterNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="담당자에게 전달할 메시지가 있다면 적어주세요."
              className="mt-1 w-full px-3 py-2 rounded-md border border-border/80 bg-background font-serif text-[14px] resize-none focus:outline-none focus:border-foreground/40"
            />
          </label>
        </div>

        {error && (
          <p className="font-serif text-[13px] text-destructive">{error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full py-2.5 rounded-md bg-foreground text-background font-serif text-[15px] hover:bg-foreground/90 disabled:opacity-40 transition-colors"
        >
          {pending ? '제출 중…' : '제출하기'}
        </button>

        <p className="font-serif italic text-[12px] text-muted-foreground/70 text-center" suppressHydrationWarning>
          만료: {expiresLabel}
        </p>
      </form>
    </div>
  )
}

/**
 * 필드 배열을 카테고리(고객정보·동물정보·절차정보·추가정보) → 서브그룹(입국 항공편·출국 항공편)
 * 순으로 그룹핑한다. 등장 순서를 보존하며, 카테고리 미지정 항목은 '__none' 버킷으로 모음.
 *
 * 카테고리·서브그룹은 ShareFieldSpec.category/subgroup 메타로 결정 — 없으면 헤더 없이 평면 출력.
 */
type GroupedBlock = { subgroup?: string; fields: ShareFieldSpec[] }
type GroupedCategory = {
  category?: string
  blocks: GroupedBlock[]
  /** 같은 카테고리 안에 서로 다른 subgroup 이 2개 이상일 때만 헤더 표시. */
  showSubgroupHeaders: boolean
}

function groupFields(fields: ShareFieldSpec[]): GroupedCategory[] {
  // Pass 1: 카테고리별 버킷 (등장 순서 보존)
  const byCategory = new Map<string, ShareFieldSpec[]>()
  for (const f of fields) {
    const cat = f.category ?? '__none'
    const arr = byCategory.get(cat) ?? []
    arr.push(f)
    byCategory.set(cat, arr)
  }
  // Pass 2: 카테고리 내부에서 연속된 같은 subgroup 끼리 블록화
  const result: GroupedCategory[] = []
  for (const [category, items] of byCategory) {
    const blocks: GroupedBlock[] = []
    for (const f of items) {
      const last = blocks[blocks.length - 1]
      if (last && last.subgroup === f.subgroup) {
        last.fields.push(f)
      } else {
        blocks.push({ subgroup: f.subgroup, fields: [f] })
      }
    }
    const distinctSubgroups = new Set(items.map((f) => f.subgroup).filter((s): s is string => !!s))
    result.push({
      category: category === '__none' ? undefined : category,
      blocks,
      showSubgroupHeaders: distinctSubgroups.size >= 2,
    })
  }
  return result
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-lg">
      <div className="max-w-md w-full text-center space-y-md rounded-xl border border-border/80 bg-card p-xl shadow-sm">
        {children}
      </div>
    </div>
  )
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ShareFieldSpec
  value: unknown
  onChange: (v: unknown) => void
}) {
  const baseInputCls =
    'mt-1 w-full px-3 py-2 rounded-md border border-border/80 bg-background font-serif text-[15px] focus:outline-none focus:border-foreground/40'
  const strVal = value === null || value === undefined ? '' : String(value)

  if (field.type === 'date_array') {
    return <DateArrayInput field={field} value={value} onChange={onChange} />
  }

  return (
    <label className="block">
      <span className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted-foreground/80">
        {field.label}
      </span>
      {field.type === 'longtext' ? (
        <textarea
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={`${baseInputCls} resize-none`}
        />
      ) : field.type === 'date' ? (
        <input
          type="date"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          className={baseInputCls}
        />
      ) : field.type === 'number' ? (
        <input
          type="number"
          step="any"
          value={strVal}
          onChange={(e) => {
            const v = e.target.value
            onChange(v === '' ? null : Number(v))
          }}
          className={baseInputCls}
        />
      ) : field.type === 'select' && field.options ? (
        <select
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          className={baseInputCls}
        >
          <option value="">— 선택 —</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label_ko}</option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          className={baseInputCls}
        />
      )}
    </label>
  )
}

function DateArrayInput({
  field,
  value,
  onChange,
}: {
  field: ShareFieldSpec
  value: unknown
  onChange: (v: unknown) => void
}) {
  const arr: ShareVaccineEntry[] = Array.isArray(value)
    ? (value as ShareVaccineEntry[]).filter(
        (e): e is ShareVaccineEntry => !!e && typeof e === 'object' && 'date' in e,
      )
    : []
  const max = field.max_entries ?? Infinity
  const canAdd = arr.length < max
  const showValidUntil = !field.hide_valid_until

  function setAt(i: number, patch: Partial<ShareVaccineEntry>) {
    const next = [...arr]
    next[i] = { ...next[i], ...patch }
    onChange(next)
  }
  function add() {
    if (!canAdd) return
    onChange([...arr, { date: '' }])
  }
  function removeAt(i: number) {
    const next = arr.filter((_, idx) => idx !== i)
    onChange(next)
  }

  // 항상 최소 1개 슬롯 노출
  const display: ShareVaccineEntry[] = arr.length === 0 ? [{ date: '' }] : arr

  const subInputCls =
    'w-full px-2 py-1.5 rounded border border-border/70 bg-background font-serif text-[13px] focus:outline-none focus:border-foreground/40'
  const subLabelCls =
    'block font-mono text-[9px] uppercase tracking-[1.1px] text-muted-foreground/60 mb-0.5'

  return (
    <div className="block">
      <span className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted-foreground/80">
        {field.label}
        {field.max_entries && (
          <span className="ml-1 text-muted-foreground/60">(최대 {field.max_entries}회)</span>
        )}
      </span>
      <div className="mt-1 space-y-2">
        {display.map((e, i) => (
          <div
            key={i}
            className="rounded-md border border-border/80 bg-card/40 p-2 space-y-2"
          >
            {/* 1행: 차수 + 접종일 + 삭제 */}
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] text-muted-foreground/60 w-6 shrink-0">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="flex-1">
                <label className={subLabelCls}>접종일</label>
                <input
                  type="date"
                  value={e.date ?? ''}
                  onChange={(ev) => setAt(i, { date: ev.target.value })}
                  className="w-full px-3 py-1.5 rounded border border-border/70 bg-background font-serif text-[14px] focus:outline-none focus:border-foreground/40"
                />
              </div>
              {arr.length > 0 && (
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  aria-label="삭제"
                  className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors mt-3"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            {/* 2행: 약품명 / 제조사 / 로트번호 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pl-7">
              <div>
                <label className={subLabelCls}>약품명</label>
                <input
                  type="text"
                  value={e.product ?? ''}
                  onChange={(ev) => setAt(i, { product: ev.target.value })}
                  className={subInputCls}
                />
              </div>
              <div>
                <label className={subLabelCls}>제조사</label>
                <input
                  type="text"
                  value={e.manufacturer ?? ''}
                  onChange={(ev) => setAt(i, { manufacturer: ev.target.value })}
                  className={subInputCls}
                />
              </div>
              <div>
                <label className={subLabelCls}>로트번호</label>
                <input
                  type="text"
                  value={e.lot ?? ''}
                  onChange={(ev) => setAt(i, { lot: ev.target.value })}
                  className={subInputCls}
                />
              </div>
            </div>
            {/* 3행: 면역유효기간 / 약품유효기간 (구충 등은 면역 없음) */}
            <div
              className={`grid grid-cols-1 ${showValidUntil ? 'sm:grid-cols-2' : 'sm:grid-cols-1'} gap-1.5 pl-7`}
            >
              {showValidUntil && (
                <div>
                  <label className={subLabelCls}>면역 유효기간</label>
                  <input
                    type="date"
                    value={e.valid_until ?? ''}
                    onChange={(ev) => setAt(i, { valid_until: ev.target.value })}
                    className={subInputCls}
                  />
                </div>
              )}
              <div>
                <label className={subLabelCls}>약품 유효기간</label>
                <input
                  type="date"
                  value={e.expiry ?? ''}
                  onChange={(ev) => setAt(i, { expiry: ev.target.value })}
                  className={subInputCls}
                />
              </div>
            </div>
          </div>
        ))}
        {canAdd && (
          <button
            type="button"
            onClick={add}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-dashed border-border/70 font-serif text-[12px] text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors"
          >
            <Plus size={12} /> 추가
          </button>
        )}
      </div>
    </div>
  )
}
