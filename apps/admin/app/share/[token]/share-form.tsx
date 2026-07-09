'use client'


import { COAT_COLOR_HEX as COLOR_HEX } from '@/lib/coat-colors'
import { Fragment, useEffect, useRef, useState, useTransition } from 'react'
import { CheckCircle2, Plus, X } from 'lucide-react'
import { DateTextField } from '@petmove/ui'
import { submitShareLink, uploadShareSubmissionFiles } from '@/lib/actions/share-links-public'
import { cardContainer } from '@petmove/ui'
import { cn } from '@petmove/ui'
import type {
  ShareFieldSpec,
  ShareLinkPublicView,
  ShareVaccineEntry,
} from '@petmove/domain'
import { SHARE_RECIPIENT_SUBGROUP_META } from '@petmove/domain'
import breedsData from '@petmove/domain/data/breeds.json'
import colorsData from '@petmove/domain/data/colors.json'

interface Breed { ko: string; en: string; type: string; alias?: string[] }
const BREEDS = breedsData as Breed[]
interface ColorEntry { ko: string; en: string; alias?: string[] }
const COLORS = colorsData as ColorEntry[]

const SPECIES_OPTIONS = [
  { value: 'dog', label: '강아지' },
  { value: 'cat', label: '고양이' },
  { value: 'other', label: '기타' },
]
const SEX_OPTIONS = [
  { value: 'spayed_female', label: '중성화 암컷' },
  { value: 'neutered_male', label: '중성화 수컷' },
  { value: 'female', label: '암컷' },
  { value: 'male', label: '수컷' },
]
const chipButtonActive = 'border-primary bg-primary text-primary-foreground'
const chipButtonInactive = 'border-border bg-card text-foreground hover:bg-accent'
const dropdownClass = 'mt-1 rounded-md border border-border/80 bg-popover shadow-sm'
const dropdownRowClass = 'w-full text-left px-md py-2.5 text-[15px] transition-colors hover:bg-accent'
const dropdownRowActiveClass = 'bg-accent'

interface Props {
  initial: ShareLinkPublicView
}

const pageShellClass = 'min-h-screen bg-background text-foreground'
const pageInnerClass = 'mx-auto w-full max-w-[680px] px-6 py-12 sm:px-8 lg:px-10'
const sectionCardClass = cn(cardContainer, 'p-lg')
const sectionTitleClass = 'font-serif text-[15px] font-medium uppercase tracking-[0.4px] text-foreground'
const fieldRowClass = 'py-4 border-t border-border/80 first:border-t-0 first:pt-1'
const fieldHeaderClass = 'flex items-baseline justify-between gap-3 mb-2'
const labelClass = 'font-serif text-[15px] text-foreground'
const inputClass =
  'w-full h-10 bg-transparent px-0 font-serif font-semibold text-[17px] leading-tight text-foreground placeholder:font-serif placeholder:italic placeholder:font-normal placeholder:text-[14px] placeholder:text-muted-foreground/50 focus:outline-none transition-colors'
const inputEnClass =
  'w-full h-10 bg-transparent px-0 font-serif italic text-[17px] text-foreground placeholder:font-serif placeholder:italic placeholder:font-normal placeholder:text-[14px] placeholder:text-muted-foreground/50 focus:outline-none transition-colors'
const numericInputClass =
  'w-full h-10 bg-transparent px-0 font-mono text-[15px] tracking-[0.3px] tabular-nums text-foreground placeholder:font-serif placeholder:italic placeholder:font-normal placeholder:text-[14px] placeholder:text-muted-foreground/50 focus:outline-none transition-colors'
const textareaClass =
  'w-full min-h-[88px] bg-transparent px-0 py-1 font-serif font-semibold text-[17px] leading-relaxed text-foreground placeholder:font-serif placeholder:italic placeholder:font-normal placeholder:text-[14px] placeholder:text-muted-foreground/50 focus:outline-none resize-none transition-colors'
const selectClass =
  'w-full h-10 rounded-md border border-border/80 bg-background px-3 font-serif text-[15px] text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring/30'
const primaryButtonClass = cn(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors',
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
  'disabled:pointer-events-none disabled:opacity-50 select-none',
  'w-full h-12 text-base tracking-[0.1px]',
  'bg-primary text-primary-foreground hover:bg-primary/90',
)
const dateFieldClass =
  'h-10 w-60 max-w-full bg-transparent px-0 font-mono text-[15px] tracking-[0.3px] tabular-nums text-foreground placeholder:font-serif placeholder:italic placeholder:text-[14px] placeholder:text-muted-foreground/50 focus:outline-none transition-colors'
const compactInputClass =
  'h-7 min-w-[80px] bg-transparent px-1 font-serif text-[13px] text-foreground placeholder:font-serif placeholder:italic placeholder:text-muted-foreground/55 focus:outline-none focus:bg-accent/40 rounded [field-sizing:content]'
const compactDateClass =
  'h-7 min-w-0 rounded-md border border-transparent bg-transparent px-1 font-mono text-[13px] tracking-[0.3px] text-foreground placeholder:font-serif placeholder:italic placeholder:text-muted-foreground/55 focus-visible:border-border/80 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30'
const inlineMetaLabelClass =
  'whitespace-nowrap font-serif text-[12px] italic text-muted-foreground/70'

export function ShareForm({ initial }: Props) {
  const [view] = useState(initial)
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const out: Record<string, unknown> = {}
    for (const field of initial.fields) {
      out[field.key] = field.type === 'date_array'
        ? normalizeVaccineEntries(field.current_value, !field.hide_valid_until)
        : field.current_value ?? ''
    }
    return out
  })
  // 파일 요청 슬롯별 선택 파일 (key = file_requests[].key).
  const [filesBySlot, setFilesBySlot] = useState<Record<string, File[]>>({})
  // 업로드 성공 후 재제출 시 중복 업로드 방지.
  const uploadedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()
  const [expiresLabel, setExpiresLabel] = useState('')

  useEffect(() => {
    setExpiresLabel(new Date(view.expires_at).toLocaleString('ko-KR'))
  }, [view.expires_at])

  if (view.status === 'submitted' || done) {
    return (
      <StatusScreen
        eyebrow="Completed"
        title="제출 완료"
        description={
          <>
            입력해주신 정보가 {view.org_name || '담당 조직'} 여정에 반영되었습니다.
            <br />
            감사합니다.
          </>
        }
        icon={<CheckCircle2 className="mx-auto mb-6 text-emerald-600" size={40} />}
      />
    )
  }

  if (view.status === 'expired') {
    return (
      <StatusScreen
        eyebrow="Expired"
        title="만료된 링크입니다"
        description="담당자에게 새 링크를 요청하세요."
      />
    )
  }

  if (view.status === 'revoked') {
    return (
      <StatusScreen
        eyebrow="Revoked"
        title="취소된 링크입니다"
        description="이 링크는 더 이상 사용할 수 없습니다."
      />
    )
  }

  function update(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function addSlotFiles(key: string, list: FileList | null) {
    if (!list || list.length === 0) return
    setFilesBySlot((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), ...Array.from(list)] }))
  }
  function removeSlotFile(key: string, idx: number) {
    setFilesBySlot((prev) => ({ ...prev, [key]: (prev[key] ?? []).filter((_, i) => i !== idx) }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      // 파일이 있으면 값 제출 전에 먼저 업로드(링크가 active 인 동안). 성공 시 재제출에서 재업로드 안 함.
      const hasFiles = Object.values(filesBySlot).some((arr) => arr.length > 0)
      if (hasFiles && !uploadedRef.current) {
        const fd = new FormData()
        fd.append('token', view.token)
        for (const [key, arr] of Object.entries(filesBySlot)) {
          if (arr.length === 0) continue
          fd.append('slotKeys', key)
          for (const f of arr) fd.append(`slot:${key}`, f)
        }
        const up = await uploadShareSubmissionFiles(fd)
        if (!up.ok) {
          setError(up.error)
          return
        }
        uploadedRef.current = true
      }
      const result = await submitShareLink({
        token: view.token,
        values,
        submitterNote: null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setDone(true)
    })
  }

  // 신청폼과 동일: 한국주소가 노출되면 영문주소는 검색 결과로만 보여주고 별도 라벨/input 은 숨김.
  const hasAddressKr = view.fields.some((f) => f.key === 'address_kr')
  const renderFields = hasAddressKr ? view.fields.filter((f) => f.key !== 'address_en') : view.fields
  const grouped = groupFields(renderFields)

  return (
    <div className={pageShellClass}>
      <div className={pageInnerClass}>
        <header className="mb-10 border-b border-border/80 pb-8 text-center">
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[2.5px] text-muted-foreground">
            {view.org_name_en || view.org_name || 'PetMove'} · Information Request
          </p>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground">
            정보 등록 요청서
          </h1>
          {view.case_label && (
            <p className="mt-3 font-serif text-[14px] text-muted-foreground">
              {view.case_label}
            </p>
          )}
          {view.title && (
            <p className="mx-auto mt-4 max-w-lg whitespace-pre-wrap font-serif italic text-[14px] leading-relaxed text-muted-foreground/90">
              {view.title}
            </p>
          )}
        </header>

        <form
          onSubmit={handleSubmit}
          className="space-y-md"
          onKeyDown={(e) => {
            // 신청폼과 동일: input 안에서 Enter 가 우발적으로 폼 제출하지 않도록.
            // textarea(메모) 는 줄바꿈, submit 버튼은 통과, 일반 input/select 는 다음 필드로 포커스 이동.
            if (e.key !== 'Enter') return
            const target = e.target as HTMLElement
            if (target.tagName === 'TEXTAREA') return
            if (target.tagName === 'BUTTON' && (target as HTMLButtonElement).type === 'submit') return
            if (target.tagName === 'BUTTON') return
            if ((target as HTMLInputElement).dataset.searchField === 'breed') {
              e.preventDefault()
              return
            }
            if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
              e.preventDefault()
              const form = e.currentTarget
              const focusable = Array.from(
                form.querySelectorAll<HTMLElement>(
                  'input:not([type="hidden"]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])',
                ),
              )
              const idx = focusable.indexOf(target)
              if (idx >= 0 && idx < focusable.length - 1) {
                focusable[idx + 1].focus()
              }
            }
          }}
        >
          {grouped.map((category, index) => (
            <section key={category.category ?? `category-${index}`} className={sectionCardClass}>
              {category.category && (
                <div className="mb-1 flex items-baseline gap-[10px] border-b border-border/80 pb-3">
                  <span className="font-mono text-[12px] tracking-[1.3px] text-muted-foreground">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h2 className={sectionTitleClass}>{category.category}</h2>
                </div>
              )}

              {category.blocks.map((block, blockIndex) => {
                const subgroupMeta = block.subgroup
                  ? SHARE_RECIPIENT_SUBGROUP_META[block.subgroup]
                  : undefined
                const subgroupLabel = subgroupMeta?.label ?? block.subgroup
                const subgroupDescription = subgroupMeta?.description
                return (
                <Fragment key={`${block.subgroup ?? 'default'}-${blockIndex}`}>
                  {block.subgroup && (
                    <div
                      className={cn(
                        'pt-4 pb-2 border-t border-border/80',
                        blockIndex === 0 ? 'mt-1' : 'mt-6',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-px w-6 bg-border/80" aria-hidden />
                        <p className="font-serif text-[14px] font-medium text-muted-foreground">
                          {subgroupLabel}
                        </p>
                      </div>
                      {subgroupDescription && (
                        <p className="mt-2 pl-8 font-serif text-[13px] leading-relaxed text-muted-foreground/85">
                          {subgroupDescription}
                        </p>
                      )}
                    </div>
                  )}
                  {block.fields.map((field) => (
                    <FieldInput
                      key={field.id}
                      field={field}
                      value={values[field.key]}
                      allValues={values}
                      onChange={(value) => update(field.key, value)}
                      onMultiChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
                    />
                  ))}
                </Fragment>
                )
              })}
            </section>
          ))}

          {view.file_requests.length > 0 && (
            <section className={sectionCardClass}>
              <p className="mb-3 font-serif text-[13px] leading-relaxed text-muted-foreground">
                아래 파일을 첨부해주세요. (이미지 또는 PDF, 각 12MB 이하)
              </p>
              {view.file_requests.map((r) => {
                const slotFiles = filesBySlot[r.key] ?? []
                return (
                  <FieldRow key={r.key} label={r.label}>
                    <div className="w-full">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border/80 px-3 py-1.5 font-serif text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                        <Plus size={14} /> 파일 선택
                        <input
                          type="file"
                          multiple
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={(e) => { addSlotFiles(r.key, e.target.files); e.currentTarget.value = '' }}
                        />
                      </label>
                      {slotFiles.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {slotFiles.map((f, i) => (
                            <li
                              key={`${f.name}-${i}`}
                              className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5"
                            >
                              <span className="min-w-0 truncate font-serif text-[13px] text-foreground">{f.name}</span>
                              <span className="flex shrink-0 items-center gap-2">
                                <span className="font-mono text-[11px] text-muted-foreground/60">
                                  {(f.size / 1024 / 1024).toFixed(1)}MB
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeSlotFile(r.key, i)}
                                  className="text-muted-foreground/50 transition-colors hover:text-destructive"
                                  aria-label="파일 제거"
                                >
                                  <X size={13} />
                                </button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </FieldRow>
                )
              })}
            </section>
          )}

          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 px-md py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}

          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? '보내는 중' : '보내기'}
          </button>

          <p className="pb-10 text-center font-mono text-[11px] uppercase tracking-[1.5px] text-muted-foreground" suppressHydrationWarning>
            Expires · {expiresLabel}
          </p>
        </form>
      </div>
    </div>
  )
}

function StatusScreen({
  eyebrow,
  title,
  description,
  icon,
}: {
  eyebrow: string
  title: string
  description: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className={cn(pageShellClass, 'flex items-center justify-center px-4')}>
      <div className="mx-auto w-full max-w-md py-20 text-center">
        {icon}
        <p className="mb-4 font-mono text-[11px] uppercase tracking-[2px] text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="mb-3 font-serif text-2xl font-medium tracking-tight text-foreground">
          {title}
        </h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  )
}

function FieldRow({
  label,
  hint,
  description,
  children,
  className,
}: {
  label: React.ReactNode
  hint?: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn(fieldRowClass, className)}>
      <div className={fieldHeaderClass}>
        <span className={labelClass}>{label}</span>
        {hint && <span className="font-serif italic text-[12px] text-muted-foreground/80">{hint}</span>}
      </div>
      {description && (
        <p className="mb-1.5 font-serif text-[12px] leading-relaxed text-muted-foreground/85">{description}</p>
      )}
      {children}
    </div>
  )
}

function FieldInput({
  field,
  value,
  allValues,
  onChange,
  onMultiChange,
}: {
  field: ShareFieldSpec
  value: unknown
  allValues?: Record<string, unknown>
  onChange: (value: unknown) => void
  onMultiChange?: (patch: Record<string, unknown>) => void
}) {
  const strVal = value === null || value === undefined ? '' : String(value)
  const placeholder = getFieldPlaceholder(field)

  if (field.type === 'date_array') {
    return <DateArrayInput field={field} value={value} onChange={onChange} />
  }

  // 운송방법 — 보호자 친근 라벨 chip. 내부 value 는 영문 코드 그대로(case detail 매핑 호환).
  // Cargo / Cargo(Sea) 는 외부 수신자에게 묻지 않음 — 발신자가 케이스 상세에서 직접 조정.
  if (field.key === 'entry_transport' || field.key === 'return_transport') {
    const TRANSPORT_OPTIONS = [
      { value: 'Carry-on', label: '기내탑승' },
      { value: 'Checked-baggage', label: '위탁수하물' },
    ]
    return (
      <FieldRow label={field.label}>
        <div className="flex flex-wrap gap-sm">
          {TRANSPORT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(strVal === o.value ? '' : o.value)}
              className={cn(
                'h-9 px-md rounded-full border text-[13px] font-medium transition-colors',
                strVal === o.value ? chipButtonActive : chipButtonInactive,
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </FieldRow>
    )
  }

  // 신청폼과 동일: 한국주소 검색 + 상세주소 + 영문주소 자동 입력 (영문주소는 row 내부에 read-only로만 표시)
  if (field.key === 'address_kr') {
    const initialAddressEn = allValues?.address_en ? String(allValues.address_en) : ''
    return (
      <AddressKrInput
        field={field}
        value={strVal}
        initialAddressEn={initialAddressEn}
        onChange={onChange}
        onMultiChange={onMultiChange}
      />
    )
  }

  // 신청폼과 동일: species/sex chip 버튼
  if ((field.key === 'species' || field.key === 'sex') && field.options && field.options.length > 0) {
    const opts = field.key === 'species'
      ? (field.options.length > 0 ? field.options.map((o) => ({ value: o.value, label: o.label_ko })) : SPECIES_OPTIONS)
      : (field.options.length > 0 ? field.options.map((o) => ({ value: o.value, label: o.label_ko })) : SEX_OPTIONS)
    return (
      <FieldRow label={field.label}>
        <div className="flex flex-wrap gap-sm">
          {opts.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                if (field.key === 'species' && onMultiChange) {
                  // 종 변경 시 품종 초기화 (신청폼과 동일)
                  onMultiChange({ [field.key]: o.value, breed: '' })
                } else {
                  onChange(o.value)
                }
              }}
              className={cn(
                field.key === 'species'
                  ? 'h-9 px-5 rounded-full border text-[13px] font-medium transition-colors'
                  : 'h-9 px-md rounded-full border text-[13px] font-medium transition-colors',
                strVal === o.value ? chipButtonActive : chipButtonInactive,
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </FieldRow>
    )
  }

  // 신청폼과 동일: 품종 검색 (종에 따라 필터)
  if (field.key === 'breed') {
    const speciesValue = allValues?.species ? String(allValues.species) : ''
    return <BreedSearchInput field={field} value={strVal} speciesValue={speciesValue} onChange={onChange} />
  }

  // 신청폼과 동일: 모색 chip 다중 선택 (최대 3개) + 색상 swatch
  if (field.key === 'color') {
    return <ColorChips field={field} value={strVal} onChange={onChange} />
  }

  // 신청폼과 동일: 영문성함은 성/이름 분리 입력
  if (field.key === 'customer_name_en') {
    return <CustomerNameEnInput field={field} value={strVal} onChange={onChange} />
  }

  // 신청폼과 동일: 영문 펫이름 (한글 차단, 영문 첫글자 대문자)
  if (field.key === 'pet_name_en') {
    return <EnSingleInput field={field} value={strVal} onChange={onChange} placeholder={placeholder} />
  }

  // 신청폼과 동일: 한글 성함/펫이름 (영문 첫글자만 자동 대문자)
  if (field.key === 'customer_name' || field.key === 'pet_name') {
    return (
      <FieldRow label={field.label}>
        <input
          type="text"
          autoComplete={field.key === 'customer_name' ? 'name' : 'off'}
          value={strVal}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value.replace(/\b[a-z]/g, (c) => c.toUpperCase()))}
          className={inputClass}
        />
      </FieldRow>
    )
  }

  // 신청폼과 동일: 전화번호 자동 포맷팅 (010-1234-5678)
  if (field.key === 'phone') {
    const formatted = strVal.replace(/(\d{3})(\d{4})(\d{0,4})/, (_, a, b, c) => (c ? `${a}-${b}-${c}` : b ? `${a}-${b}` : a))
    return (
      <FieldRow label={field.label}>
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          value={formatted}
          maxLength={13}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '').slice(0, 11))}
          placeholder="010-1234-5678"
          className={numericInputClass}
        />
      </FieldRow>
    )
  }

  // 신청폼과 동일: 이메일 (한글 차단, 소문자)
  if (field.key === 'email') {
    return (
      <FieldRow label={field.label}>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={strVal}
          onChange={(e) => onChange(e.target.value.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣A-Z]/g, (c) => (c >= 'A' && c <= 'Z' ? c.toLowerCase() : '')))}
          onCompositionEnd={(e) => onChange((e.target as HTMLInputElement).value.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '').toLowerCase())}
          placeholder={placeholder}
          className={inputEnClass}
        />
      </FieldRow>
    )
  }

  // 신청폼과 동일: 마이크로칩 (숫자만, 3자리마다 공백)
  if (field.key === 'microchip') {
    const formatted = strVal.replace(/\D/g, '').replace(/(\d{3})(?=\d)/g, '$1 ')
    return (
      <FieldRow label={field.label} hint="15자리">
        <input
          type="text"
          inputMode="numeric"
          value={formatted}
          maxLength={19}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 15))}
          placeholder="000 000 000 000 000"
          className={numericInputClass}
        />
      </FieldRow>
    )
  }

  // 신청폼과 동일: 몸무게 (text + decimal)
  if (field.key === 'weight') {
    return (
      <FieldRow label={field.label} hint="kg">
        <input
          type="text"
          inputMode="decimal"
          value={strVal}
          placeholder="예: 5.2"
          onChange={(e) => {
            const cleaned = e.target.value.replace(/[^\d.]/g, '')
            onChange(cleaned === '' ? null : cleaned)
          }}
          className={numericInputClass}
        />
      </FieldRow>
    )
  }

  return (
    <FieldRow label={field.label} description={field.description}>
      {field.type === 'longtext' ? (
        <textarea
          value={strVal}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={placeholder}
          className={textareaClass}
        />
      ) : field.type === 'date' ? (
        <DateTextField
          value={strVal}
          onChange={(v) => onChange(v)}
          placeholder="YYYY-MM-DD"
          className={numericInputClass}
        />
      ) : field.type === 'number' ? (
        <input
          type="text"
          inputMode="decimal"
          value={strVal}
          placeholder={placeholder}
          onChange={(e) => {
            const cleaned = e.target.value.replace(/[^\d.]/g, '')
            onChange(cleaned === '' ? null : Number(cleaned))
          }}
          className={numericInputClass}
        />
      ) : field.type === 'select' && field.options ? (
        <select value={strVal} onChange={(e) => onChange(e.target.value)} className={selectClass}>
          <option value="">선택 안 함</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label_ko}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={strVal}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}
    </FieldRow>
  )
}

function useEnWarning() {
  const [warn, setWarn] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function show() {
    setWarn('영문만 입력 가능합니다')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setWarn(null), 2000)
  }
  return { warn, show }
}

/**
 * 신청폼(/apply)과 동일: customer_name_en 을 성/이름 두 input 으로 분리.
 * 합칠 때는 "Last First" 공백 한 칸으로 join. 한글 입력은 차단하고 영문 첫글자는
 * 자동으로 대문자 변환 (composition 종료 시점에도 동일 처리).
 */
function CustomerNameEnInput({
  field,
  value,
  onChange,
}: {
  field: ShareFieldSpec
  value: string
  onChange: (value: unknown) => void
}) {
  const composingRef = useRef(false)
  const { warn, show: showWarn } = useEnWarning()
  const [last, setLast] = useState(() => {
    const parts = (value || '').trim().split(/\s+/).filter(Boolean)
    return parts[0] || ''
  })
  const [first, setFirst] = useState(() => {
    const parts = (value || '').trim().split(/\s+/).filter(Boolean)
    return parts.slice(1).join(' ') || ''
  })

  useEffect(() => {
    const combined = [last.trim(), first.trim()].filter(Boolean).join(' ')
    if (combined !== value) onChange(combined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last, first])

  function applyEn(setter: (v: string) => void, raw: string) {
    if (composingRef.current) {
      setter(raw)
      return
    }
    const hasKorean = /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(raw)
    const filtered = raw.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '').replace(/\b[a-z]/g, (c) => c.toUpperCase())
    setter(filtered)
    if (hasKorean) showWarn()
  }

  function endEn(setter: (v: string) => void, e: React.CompositionEvent<HTMLInputElement>) {
    composingRef.current = false
    const raw = (e.target as HTMLInputElement).value
    const hasKorean = /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(raw)
    const filtered = raw.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '').replace(/\b[a-z]/g, (c) => c.toUpperCase())
    setter(filtered)
    if (hasKorean) showWarn()
  }

  return (
    <FieldRow label={field.label} hint="여권과 동일하게">
      <div className="flex gap-sm">
        <input
          type="text"
          autoComplete="family-name"
          value={last}
          onCompositionStart={() => {
            composingRef.current = true
          }}
          onChange={(e) => applyEn(setLast, e.target.value)}
          onCompositionEnd={(e) => endEn(setLast, e)}
          placeholder="성 · Hong"
          className={cn(inputEnClass, 'flex-1')}
        />
        <input
          type="text"
          autoComplete="given-name"
          value={first}
          onCompositionStart={() => {
            composingRef.current = true
          }}
          onChange={(e) => applyEn(setFirst, e.target.value)}
          onCompositionEnd={(e) => endEn(setFirst, e)}
          placeholder="이름 · Gildong"
          className={cn(inputEnClass, 'flex-1')}
        />
      </div>
      {warn && <p className="mt-1.5 text-xs text-destructive">{warn}</p>}
    </FieldRow>
  )
}

/**
 * 신청폼과 동일: 영문 단일 input — 한글 차단 + 영문 첫글자 자동 대문자 + 한글 경고.
 */
function EnSingleInput({
  field,
  value,
  onChange,
  placeholder,
}: {
  field: ShareFieldSpec
  value: string
  onChange: (value: unknown) => void
  placeholder: string
}) {
  const composingRef = useRef(false)
  const { warn, show: showWarn } = useEnWarning()

  function applyEn(raw: string) {
    if (composingRef.current) {
      onChange(raw)
      return
    }
    const hasKorean = /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(raw)
    const filtered = raw.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '').replace(/\b[a-z]/g, (c) => c.toUpperCase())
    onChange(filtered)
    if (hasKorean) showWarn()
  }

  function endEn(e: React.CompositionEvent<HTMLInputElement>) {
    composingRef.current = false
    const raw = (e.target as HTMLInputElement).value
    const hasKorean = /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(raw)
    const filtered = raw.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '').replace(/\b[a-z]/g, (c) => c.toUpperCase())
    onChange(filtered)
    if (hasKorean) showWarn()
  }

  return (
    <FieldRow label={field.label}>
      <input
        type="text"
        value={value}
        onCompositionStart={() => {
          composingRef.current = true
        }}
        onChange={(e) => applyEn(e.target.value)}
        onCompositionEnd={endEn}
        placeholder={placeholder}
        className={inputEnClass}
      />
      {warn && <p className="mt-1.5 text-xs text-destructive">{warn}</p>}
    </FieldRow>
  )
}

/**
 * 신청폼(/apply)과 동일: 한국주소 입력은 다음 우편번호 검색 모달로만 채움 (readonly base + 상세주소).
 * 영문주소는 같은 검색 결과의 roadAddressEnglish 로 자동 입력 (address_en 필드가 있을 때).
 */
function AddressKrInput({
  field,
  value,
  initialAddressEn,
  onChange,
  onMultiChange,
}: {
  field: ShareFieldSpec
  value: string
  initialAddressEn?: string
  onChange: (value: unknown) => void
  onMultiChange?: (patch: Record<string, unknown>) => void
}) {
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [base, setBase] = useState<string>(() => value || '')
  const [detail, setDetail] = useState<string>('')
  const [autoEn, setAutoEn] = useState<string>(initialAddressEn || '')
  const modalRef = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.daum?.Postcode) {
      setScriptLoaded(true)
      return
    }
    const script = document.createElement('script')
    script.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
    script.async = true
    script.onload = () => setScriptLoaded(true)
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!showModal) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowModal(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showModal])

  // base/detail 변경 시 합쳐서 외부 onChange + address_en 자동 채움
  useEffect(() => {
    const combined = detail.trim() ? `${base.trim()} ${detail.trim()}` : base.trim()
    if (combined !== value) onChange(combined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, detail])

  function handleSearch() {
    if (!scriptLoaded || !window.daum?.Postcode) return
    setShowModal(true)
    setTimeout(() => {
      if (!modalRef.current) return
      new window.daum.Postcode({
        width: '100%',
        height: '100%',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        oncomplete(data: any) {
          const kr = data.roadAddress
          const en = data.roadAddressEnglish || ''
          setBase(kr)
          setDetail('')
          setAutoEn(en)
          if (onMultiChange) {
            const patch: Record<string, unknown> = { [field.key]: kr }
            if (en) patch.address_en = en
            if (data.zonecode) patch.address_zipcode = data.zonecode
            if (data.sido) patch.address_sido = data.sido
            if (data.sigungu) patch.address_sigungu = data.sigungu
            onMultiChange(patch)
          }
          setShowModal(false)
          setTimeout(() => detailRef.current?.focus(), 100)
        },
      }).embed(modalRef.current)
    }, 100)
  }

  return (
    <FieldRow label={field.label} hint="검색 입력">
      <div className="flex gap-sm items-center">
        <input
          type="text"
          autoComplete="off"
          value={base}
          readOnly
          onFocus={() => {
            if (!base) handleSearch()
          }}
          placeholder="클릭하여 검색"
          className={cn(inputClass, 'flex-1 cursor-pointer')}
        />
        <button
          type="button"
          onClick={handleSearch}
          className="shrink-0 h-8 rounded-full border border-border/80 bg-transparent px-3 font-serif italic text-[12px] text-foreground transition-colors hover:bg-accent"
        >
          주소 검색
        </button>
      </div>
      {base && (
        <input
          ref={detailRef}
          type="text"
          autoComplete="address-line2"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="상세주소 · 동/호수 등"
          className={cn(inputClass, 'mt-1')}
        />
      )}
      {autoEn && (
        <p className="mt-1 font-serif italic text-[15px] text-foreground">{autoEn}</p>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-[2px]"
          onClick={() => setShowModal(false)}
        >
          <div
            className="relative mx-4 w-full max-w-lg overflow-hidden rounded-xl border border-border/80 bg-popover shadow-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-md py-3 border-b border-border/80">
              <span className="font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground">
                주소 검색
              </span>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-muted-foreground hover:text-foreground text-lg leading-none"
              >
                &times;
              </button>
            </div>
            <div ref={modalRef} className="h-[450px]" />
          </div>
        </div>
      )}
    </FieldRow>
  )
}

/**
 * 신청폼과 동일: 품종 검색 (선택된 종에 따라 필터링).
 */
function BreedSearchInput({
  field,
  value,
  speciesValue,
  onChange,
}: {
  field: ShareFieldSpec
  value: string
  speciesValue: string
  onChange: (value: unknown) => void
}) {
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(-1)

  const filtered = BREEDS.filter((b) => {
    if (speciesValue && b.type !== speciesValue) return false
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return b.ko.includes(q) || b.en.toLowerCase().includes(q) || b.alias?.some((a) => a.toLowerCase().includes(q))
  })

  if (value) {
    const matched = BREEDS.find((b) => b.ko === value)
    return (
      <FieldRow label={field.label} hint="검색 입력">
        <button
          type="button"
          onClick={() => onChange('')}
          className="w-full flex items-baseline justify-between text-left h-10 text-foreground hover:opacity-70 transition-opacity"
        >
          <span className="font-serif font-semibold text-[17px] leading-tight">{value}</span>
          {matched && (
            <span className="ml-2 font-serif italic text-[15px] text-muted-foreground">{matched.en}</span>
          )}
        </button>
      </FieldRow>
    )
  }

  return (
    <FieldRow label={field.label} hint="검색 입력">
      <div className="relative">
        <input
          type="text"
          data-search-field="breed"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setHighlight(-1)
          }}
          onKeyDown={(e) => {
            const items = filtered.slice(0, 10)
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHighlight((h) => Math.min(h + 1, items.length - 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHighlight((h) => Math.max(h - 1, 0))
            }
            if (e.key === 'Enter') {
              const pick = highlight >= 0 ? items[highlight] : items.length === 1 ? items[0] : null
              if (pick) {
                e.preventDefault()
                onChange(pick.ko)
                setQuery('')
                setHighlight(-1)
              }
            }
          }}
          onBlur={() => setTimeout(() => setQuery(''), 300)}
          placeholder={speciesValue ? '품종 검색 · 말티즈 / Maltese' : '종을 먼저 선택하세요'}
          disabled={!speciesValue}
          className={cn(inputClass, !speciesValue && 'opacity-50')}
        />
        {query && filtered.length > 0 && (
          <ul className={cn(dropdownClass, 'absolute left-0 right-0 top-full z-20 max-h-48 overflow-y-auto')}>
            {filtered.slice(0, 10).map((b, i) => (
              <li key={`${b.type}:${b.en}`}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(b.ko)
                    setQuery('')
                    setHighlight(-1)
                  }}
                  className={cn(dropdownRowClass, i === highlight && dropdownRowActiveClass)}
                >
                  {b.ko} <span className="font-serif italic text-muted-foreground ml-1">{b.en}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query && filtered.length === 0 && (
          <p className="mt-1 font-serif italic text-[12px] text-muted-foreground">검색 결과 없음</p>
        )}
      </div>
    </FieldRow>
  )
}

/**
 * 신청폼과 동일: 모색 chip 다중 선택 (최대 3개) + 색상 swatch.
 * 저장 형식은 신청폼과 동일하게 콤마 join.
 */
function ColorChips({
  field,
  value,
  onChange,
}: {
  field: ShareFieldSpec
  value: string
  onChange: (value: unknown) => void
}) {
  const selected = value
    ? value.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  function toggle(ko: string) {
    if (selected.includes(ko)) {
      onChange(selected.filter((v) => v !== ko).join(', '))
    } else if (selected.length < 3) {
      onChange([...selected, ko].join(', '))
    }
  }

  return (
    <FieldRow label={field.label} hint="가장 비슷한 색상을 최대 3개까지 선택">
      <div className="flex flex-wrap gap-sm">
        {COLORS.map((c) => {
          const isSelected = selected.includes(c.ko)
          const disabled = !isSelected && selected.length >= 3
          return (
            <button
              key={c.ko}
              type="button"
              onClick={() => toggle(c.ko)}
              className={cn(
                'h-9 pl-2 pr-4 inline-flex items-center gap-2 rounded-full border text-[13px] font-medium transition-colors',
                isSelected ? chipButtonActive : chipButtonInactive,
                disabled && 'opacity-40 cursor-not-allowed',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'inline-block h-[14px] w-[14px] shrink-0 rounded-full ring-1',
                  isSelected ? 'ring-white/40' : 'ring-black/15 dark:ring-white/20',
                )}
                style={{ backgroundColor: COLOR_HEX[c.ko] ?? '#999999' }}
              />
              {c.ko}
            </button>
          )
        })}
      </div>
    </FieldRow>
  )
}

function DateArrayInput({
  field,
  value,
  onChange,
}: {
  field: ShareFieldSpec
  value: unknown
  onChange: (value: unknown) => void
}) {
  const max = field.max_entries ?? Infinity
  const showValidUntil = !field.hide_valid_until
  const records = Array.isArray(value) ? normalizeVaccineEntries(value, showValidUntil) : []
  const display = records.length === 0 ? [emptyVaccineEntry(showValidUntil)] : records
  const canAdd = records.length > 0 && records.length < max

  function setAt(index: number, patch: Partial<ShareVaccineEntry>) {
    const next = [...records]
    const current = next[index] ?? emptyVaccineEntry(showValidUntil)
    next[index] = { ...current, ...patch }
    onChange(next)
  }

  function add() {
    if (!canAdd) return
    onChange([...records, emptyVaccineEntry(showValidUntil)])
  }

  function removeAt(index: number) {
    onChange(records.filter((_, recordIndex) => recordIndex !== index))
  }

  return (
    <FieldRow
      label={field.label}
      hint={field.max_entries ? `최대 ${field.max_entries}건` : undefined}
    >
      <div className="space-y-3">
        {display.map((record, index) => (
          <div
            key={index}
            className="group/item rounded-md border border-border/40 p-2 transition-colors hover:bg-accent/40"
          >
            <div className="flex flex-wrap items-baseline gap-[10px]">
              <span className="w-6 shrink-0 font-mono text-[11px] tracking-[0.8px] text-muted-foreground/70">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="inline-flex items-baseline gap-2">
                <span className={inlineMetaLabelClass}>접종일</span>
                <DateTextField
                  value={record.date ?? ''}
                  onChange={(next) => setAt(index, { date: next })}
                  placeholder="YYYY-MM-DD"
                  className={dateFieldClass}
                />
              </div>

              {showValidUntil && (
                <ValidityYearsSelector
                  value={record.valid_until}
                  onChange={(validity) => setAt(index, { valid_until: validity })}
                />
              )}

              {records.length > 0 && (
                <button
                  type="button"
                  onClick={() => removeAt(index)}
                  aria-label="삭제"
                  className="ml-auto shrink-0 inline-flex items-center justify-center rounded-md p-1 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="ml-8 mt-1 flex flex-wrap items-baseline gap-x-[10px] gap-y-1">
              <CompactTextInput
                value={record.product}
                placeholder="약품명"
                onChange={(next) => setAt(index, { product: next })}
              />
              <Separator />
              <CompactTextInput
                value={record.manufacturer}
                placeholder="제조사"
                onChange={(next) => setAt(index, { manufacturer: next })}
              />
              <Separator />
              <CompactTextInput
                value={record.lot}
                placeholder="로트번호"
                onChange={(next) => setAt(index, { lot: next })}
              />
              {showValidUntil && (
                <>
                  <Separator />
                  <DateTextField
                    value={record.expiry ?? ''}
                    onChange={(next) => setAt(index, { expiry: next })}
                    placeholder="약품만료일 · YYYY-MM-DD"
                    size="sm"
                    className={compactInputClass}
                  />
                </>
              )}
            </div>
          </div>
        ))}

        {canAdd && (
          <button
            type="button"
            onClick={add}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-border/70 px-3 font-serif text-[13px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            <Plus size={13} /> 추가
          </button>
        )}
      </div>
    </FieldRow>
  )
}

function ValidityYearsSelector({
  value,
  onChange,
}: {
  value?: string | null
  onChange: (value: string) => void
}) {
  const selected = parseValidityYears(value) ?? '1'
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border/40 bg-background/50 p-0.5">
      {(['1', '2', '3'] as const).map((year) => (
        <button
          key={year}
          type="button"
          onClick={() => onChange(`${year}년`)}
          aria-pressed={selected === year}
          className={cn(
            'rounded px-2 py-0.5 text-xs transition-colors',
            selected === year
              ? 'bg-foreground text-background'
              : 'text-muted-foreground/70 hover:bg-accent/60 hover:text-foreground',
          )}
        >
          {year}년
        </button>
      ))}
    </div>
  )
}

function CompactTextInput({
  value,
  placeholder,
  onChange,
}: {
  value?: string | null
  placeholder: string
  onChange: (value: string | null) => void
}) {
  return (
    <input
      type="text"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value || null)}
      className={compactInputClass}
    />
  )
}

function Separator() {
  return <span className="select-none text-muted-foreground/30">|</span>
}

function getFieldPlaceholder(field: ShareFieldSpec): string {
  const key = field.key
  const lowerLabel = field.label.toLowerCase()
  const byKey: Record<string, string> = {
    customer_name: '예: 홍길동',
    customer_name_en: '예: Hong Gildong',
    phone: '예: 010-1234-5678',
    email: '예: example@email.com',
    address_kr: '예: 서울특별시 강남구 테헤란로 000',
    address_en: '예: 000 Teheran-ro, Gangnam-gu, Seoul',
    pet_name: '예: 마루',
    pet_name_en: '예: Maru',
    birth_date: 'YYYY-MM-DD',
    species: '예: 강아지',
    breed: '예: 말티즈',
    color: '예: 흰색',
    sex: '예: 중성화 수컷',
    weight: '예: 5.2',
    microchip: '예: 410 000 000 000 000',
    microchip_date: 'YYYY-MM-DD',
    passport_no: '예: M12345678',
    certificate_no: '예: DTT3224320-01',
    passport_expiry: 'YYYY-MM-DD',
    passport_issuer: '예: Ministry of Foreign Affairs',
    overseas_address: '예: 현지 체류 주소',
    departure_date: 'YYYY-MM-DD',
    departure_time: '예: 13:40',
    flight_no: '예: KE001',
    arrival_airport: '예: LAX',
    departure_airport: '예: ICN',
  }
  if (byKey[key]) return byKey[key]
  if (key.includes('date') || lowerLabel.includes('날짜') || lowerLabel.includes('일')) return 'YYYY-MM-DD'
  if (key.includes('time') || lowerLabel.includes('시간')) return '예: 13:40'
  if (key.includes('flight') || lowerLabel.includes('항공편')) return '예: KE001'
  if (key.includes('airport') || lowerLabel.includes('공항')) return '예: ICN'
  if (field.type === 'number') return '예: 1'
  return '입력하세요'
}

type GroupedBlock = { subgroup?: string; fields: ShareFieldSpec[] }
type GroupedCategory = { category?: string; blocks: GroupedBlock[] }

function groupFields(fields: ShareFieldSpec[]): GroupedCategory[] {
  const byCategory = new Map<string, ShareFieldSpec[]>()
  for (const field of fields) {
    const category = field.category ?? '__none'
    const items = byCategory.get(category) ?? []
    items.push(field)
    byCategory.set(category, items)
  }

  const result: GroupedCategory[] = []
  for (const [category, items] of byCategory) {
    const blocks: GroupedBlock[] = []
    for (const field of items) {
      const last = blocks[blocks.length - 1]
      if (last && last.subgroup === field.subgroup) {
        last.fields.push(field)
      } else {
        blocks.push({ subgroup: field.subgroup, fields: [field] })
      }
    }
    result.push({
      category: category === '__none' ? undefined : category,
      blocks,
    })
  }
  return result
}

function emptyVaccineEntry(withValidity = true): ShareVaccineEntry {
  return withValidity
    ? { date: '', valid_until: '1년', other_hospital: true }
    : { date: '' }
}

function normalizeVaccineEntries(value: unknown, withValidity = true): ShareVaccineEntry[] {
  const raw = Array.isArray(value) ? value : []
  return raw
    .map((entry): ShareVaccineEntry | null => {
      if (typeof entry === 'string') return { ...emptyVaccineEntry(withValidity), date: entry }
      if (!entry || typeof entry !== 'object') return null
      const obj = entry as Record<string, unknown>
      return {
        date: typeof obj.date === 'string' ? obj.date : '',
        valid_until: withValidity && typeof obj.valid_until === 'string' ? obj.valid_until : withValidity ? '1년' : null,
        product: typeof obj.product === 'string' ? obj.product : null,
        manufacturer: typeof obj.manufacturer === 'string' ? obj.manufacturer : null,
        lot: typeof obj.lot === 'string' ? obj.lot : null,
        expiry: withValidity && typeof obj.expiry === 'string' ? obj.expiry : null,
        other_hospital: withValidity ? true : null,
      }
    })
    .filter((entry): entry is ShareVaccineEntry => entry !== null)
}

function parseValidityYears(value: string | null | undefined): '1' | '2' | '3' | null {
  if (!value) return null
  const match = value.trim().match(/^([123])\s*(?:년|y|yr|yrs|year|years)/i)
  if (!match) return null
  return match[1] as '1' | '2' | '3'
}
