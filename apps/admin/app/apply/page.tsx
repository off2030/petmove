'use client'

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { cardContainer } from '@/lib/design-system'
import { DateTextField } from '@/components/ui/date-text-field'
import { applyCase } from '@/lib/actions/apply-case'
import destsData from '@/data/destinations.json'
import breedsData from '@/data/breeds.json'
import colorsData from '@/data/colors.json'

function capitalize(s: string) {
  return s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

interface Dest { ko: string; en: string }
const DESTS = destsData as Dest[]
interface Breed { ko: string; en: string; type: string; alias?: string[] }
const BREEDS = breedsData as Breed[]
interface Color { ko: string; en: string; alias?: string[] }
const COLORS = colorsData as Color[]

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

// 모색 스와치용 HEX 매핑 (colors.json 의 ko 와 매칭)
const COLOR_HEX: Record<string, string> = {
  '흰색': '#FFFFFF',
  '검정': '#141413',
  '갈색': '#6D4A2B',
  '황색': '#E8B84A',
  '크림': '#F5E6C8',
  '회색': '#9CA3AF',
}

interface PetForm {
  petName: string
  petNameEn: string
  birthDate: string
  species: string
  breed: string
  breedEn: string
  breedQuery: string
  selectedColors: string[]
  sex: string
  weight: string
  microchip: string
  microchipDate: string
  rabiesDate: string
}

function emptyPet(): PetForm {
  return { petName: '', petNameEn: '', birthDate: '', species: '', breed: '', breedEn: '', breedQuery: '', selectedColors: [], sex: '', weight: '', microchip: '', microchipDate: '', rabiesDate: '' }
}

const pageShellClass =
  'min-h-screen bg-background text-foreground'
const pageInnerClass =
  'mx-auto w-full max-w-[680px] px-6 py-12 sm:px-8 lg:px-10'
const sectionCardClass = cn(cardContainer, 'p-lg')
const eyebrowNumClass =
  'font-mono text-[12px] tracking-[1.3px] text-muted-foreground'
const sectionTitleClass =
  'font-serif text-[15px] font-medium uppercase tracking-[0.4px] text-foreground'
// Field row: vertical container with top divider between rows (first row has no top border)
const fieldRowClass = 'py-4 border-t border-border/60 first:border-t-0 first:pt-1'
// Header row: label left, REQ badge + hint on right
const fieldHeaderClass = 'flex items-baseline justify-between gap-3 mb-2'
// Label: serif (editorial tone)
const labelClass =
  'font-serif text-[15px] text-foreground'
// Right meta (REQ + hint) — stacked horizontally, right-aligned
const fieldMetaClass = 'flex items-baseline gap-2 shrink-0'
// 필수 표시 — 작은 badge, terracotta
const reqIndicatorClass =
  'font-serif italic text-[12px] text-primary'
// Optional hint text on the right of header
const hintRightClass =
  'font-serif italic text-[12px] text-muted-foreground/80'
// Borderless input — no box, relies on row divider
// 공통 placeholder: serif italic, smaller, muted
const placeholderClass =
  'placeholder:font-serif placeholder:italic placeholder:font-normal placeholder:text-[14px] placeholder:text-muted-foreground/50'
// 한국어 입력 — 홈화면 동물이름 서체
const inputClass =
  `w-full h-10 bg-transparent px-0 font-serif font-semibold text-[17px] leading-tight text-foreground ${placeholderClass} focus:outline-none transition-colors`
// 영어 입력 — 상세페이지 품종 영어 italic 서체
const inputEnClass =
  `w-full h-10 bg-transparent px-0 font-serif italic text-[17px] text-foreground ${placeholderClass} focus:outline-none transition-colors`
// 숫자/날짜 입력 — 상세페이지 mono 서체
const numericInputClass =
  `w-full h-10 bg-transparent px-0 font-mono text-[15px] tracking-[0.3px] tabular-nums text-foreground ${placeholderClass} focus:outline-none transition-colors`
const chipButtonActive =
  'border-foreground bg-foreground text-background'
const chipButtonInactive =
  'border-border bg-card text-foreground hover:bg-accent'
const dropdownClass =
  'mt-1 rounded-md border border-border/60 bg-popover shadow-sm'
const dropdownRowClass =
  'w-full text-left px-md py-2.5 text-[15px] transition-colors hover:bg-accent'
const dropdownRowActiveClass = 'bg-accent'
const destructiveBoxClass =
  'rounded-md border border-destructive/20 bg-destructive/10 px-md py-2.5 text-sm text-destructive'
const primaryButtonClass = cn(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors',
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
  'disabled:pointer-events-none disabled:opacity-50 select-none',
  'w-full h-12 text-base tracking-[0.1px]',
  'bg-primary text-primary-foreground hover:bg-primary/90',
)

/* ── Field Row helper — label(left) + REQ/hint(right) + input(below) ── */
function FieldRow({
  label,
  required,
  hint,
  children,
  className,
  fieldKey,
  missing = false,
}: {
  label: React.ReactNode
  required?: boolean
  hint?: string
  children: React.ReactNode
  className?: string
  /** 누락 시 scroll 대상으로 쓰는 식별자. */
  fieldKey?: string
  /** true 면 "작성 요청" 배지 + 좌측 accent 표시. */
  missing?: boolean
}) {
  return (
    <div
      className={cn(fieldRowClass, className, missing && 'relative pl-3 -ml-3 bg-primary/5 rounded-sm')}
      data-field-key={fieldKey}
    >
      {missing && (
        <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[3px] bg-primary rounded" />
      )}
      <div className={fieldHeaderClass}>
        <span className={labelClass}>{label}</span>
        <span className={fieldMetaClass}>
          {hint && !missing && <span className={hintRightClass}>{hint}</span>}
          {missing ? (
            <span className="font-serif italic text-[12px] text-primary">작성 요청</span>
          ) : (
            required && <span className={reqIndicatorClass}>필수</span>
          )}
        </span>
      </div>
      {children}
    </div>
  )
}

/* ── Color swatch (for 모색 chips) ── */
function ColorSwatch({ hex, selected }: { hex: string; selected?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-[14px] w-[14px] shrink-0 rounded-full ring-1',
        selected ? 'ring-white/40' : 'ring-black/15 dark:ring-white/20',
      )}
      style={{ backgroundColor: hex }}
    />
  )
}

export default function ApplyPage() {
  const [step, setStep] = useState(0) // 0=form, 1=done
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState<Set<string>>(() => new Set())

  // Form state
  const [destination, setDestination] = useState('')
  const [destQuery, setDestQuery] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerLastNameEn, setCustomerLastNameEn] = useState('')
  const [customerFirstNameEn, setCustomerFirstNameEn] = useState('')
  const [phone, setPhone] = useState('')
  const [addressKr, setAddressKr] = useState('')  // 검색된 기본주소
  const [addressDetail, setAddressDetail] = useState('')  // 상세주소
  const [addressEn, setAddressEn] = useState('')
  const [addressZipcode, setAddressZipcode] = useState('')
  const [addressSido, setAddressSido] = useState('')
  const [addressSigungu, setAddressSigungu] = useState('')
  const [email, setEmail] = useState('')

  // Daum Postcode
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const [showAddrModal, setShowAddrModal] = useState(false)
  const addrModalRef = useRef<HTMLDivElement>(null)
  const addrDetailRef = useRef<HTMLInputElement>(null)

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
    if (!showAddrModal) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setShowAddrModal(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showAddrModal])

  function handleAddrSearch() {
    if (!scriptLoaded || !window.daum?.Postcode) return
    setShowAddrModal(true)
    setTimeout(() => {
      if (!addrModalRef.current) return
      new window.daum.Postcode({
        width: '100%',
        height: '100%',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        oncomplete(data: any) {
          const kr = data.zonecode ? `(${data.zonecode}) ${data.roadAddress}` : data.roadAddress
          setAddressKr(kr)
          setAddressDetail('')
          setAddressEn(data.roadAddressEnglish)
          setAddressZipcode(data.zonecode)
          setAddressSido(data.sido)
          setAddressSigungu(data.sigungu)
          setShowAddrModal(false)
          setTimeout(() => addrDetailRef.current?.focus(), 100)
        },
      }).embed(addrModalRef.current)
    }, 100)
  }
  const [petCount, setPetCount] = useState(1)
  const [pets, setPets] = useState<PetForm[]>([emptyPet()])

  function updatePet(idx: number, field: keyof PetForm, value: PetForm[keyof PetForm]) {
    setPets(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))
  }

  function handlePetCountChange(count: number) {
    setPetCount(count)
    setPets(prev => {
      if (count > prev.length) return [...prev, ...Array(count - prev.length).fill(null).map(() => emptyPet())]
      return prev.slice(0, count)
    })
  }
  const [enWarnings, setEnWarnings] = useState<Record<string, string | null>>({})
  const composingRef = useRef(false)

  function showEnWarning(field: string, msg: string) {
    setEnWarnings(prev => ({ ...prev, [field]: msg }))
    setTimeout(() => setEnWarnings(prev => ({ ...prev, [field]: null })), 2000)
  }

  function handleEnInput(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (v: string) => void,
    field: string,
  ) {
    if (composingRef.current) { setter(e.target.value); return }
    const raw = e.target.value
    const hasKorean = /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(raw)
    const filtered = raw.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '').replace(/\b[a-z]/g, c => c.toUpperCase())
    setter(filtered)
    if (hasKorean) showEnWarning(field, '영문만 입력 가능합니다')
  }

  function handleEnCompositionEnd(
    e: React.CompositionEvent<HTMLInputElement>,
    setter: (v: string) => void,
    field: string,
  ) {
    composingRef.current = false
    const raw = (e.target as HTMLInputElement).value
    const hasKorean = /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(raw)
    const filtered = raw.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '').replace(/\b[a-z]/g, c => c.toUpperCase())
    setter(filtered)
    if (hasKorean) showEnWarning(field, '영문만 입력 가능합니다')
  }
  const [destHighlight, setDestHighlight] = useState(-1)
  const [breedHighlights, setBreedHighlights] = useState<Record<number, number>>({})

  function getFilteredBreeds(pet: PetForm) {
    return BREEDS.filter(b => {
      if (pet.species && b.type !== pet.species) return false
      if (!pet.breedQuery.trim()) return true
      const q = pet.breedQuery.toLowerCase()
      return b.ko.includes(q) || b.en.toLowerCase().includes(q) || b.alias?.some(a => a.toLowerCase().includes(q))
    })
  }

  const filteredDests = DESTS.filter(d => {
    if (!destQuery.trim()) return true
    const q = destQuery.toLowerCase()
    return d.ko.includes(q) || d.en.toLowerCase().includes(q)
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Validation — 모든 누락 항목을 한 번에 수집해서 표시.
    const miss = new Set<string>()
    if (!destination) miss.add('destination')
    if (!customerName.trim()) miss.add('customerName')
    if (!customerLastNameEn.trim() || !customerFirstNameEn.trim()) miss.add('customerNameEn')
    if (!phone.trim()) miss.add('phone')
    if (!addressKr.trim()) miss.add('addressKr')
    if (!email.trim()) miss.add('email')
    for (let i = 0; i < pets.length; i++) {
      const p = pets[i]
      if (!p.petName.trim()) miss.add(`pet${i}.petName`)
      if (!p.petNameEn.trim()) miss.add(`pet${i}.petNameEn`)
      if (!p.birthDate) miss.add(`pet${i}.birthDate`)
      if (!p.species) miss.add(`pet${i}.species`)
      if (!p.breed.trim()) miss.add(`pet${i}.breed`)
      if (p.selectedColors.length === 0) miss.add(`pet${i}.colors`)
      if (!p.sex) miss.add(`pet${i}.sex`)
      if (!p.weight.trim()) miss.add(`pet${i}.weight`)
    }

    // 형식 오류 (누락 아님) — 별도 메시지로 처리.
    let formatError: string | null = null
    if (!miss.has('phone') && !/^010\d{8}$/.test(phone)) {
      formatError = '전화번호는 010-0000-0000 형식(11자리)으로 입력해주세요.'
      miss.add('phone') // 시각적 강조도 같이
    } else {
      for (let i = 0; i < pets.length; i++) {
        const p = pets[i]
        if (p.microchip && p.microchip.length !== 15) {
          const label = pets.length > 1 ? `반려동물 ${i + 1}: ` : ''
          formatError = `${label}마이크로칩 번호는 15자리 숫자여야 합니다.`
          break
        }
      }
    }

    if (miss.size > 0 || formatError) {
      setMissing(miss)
      // 누락 항목을 사람이 읽는 메시지로 정리.
      const TOP_LABELS: Record<string, string> = {
        destination: '목적지',
        customerName: '성함',
        customerNameEn: '영문성함',
        phone: '전화번호',
        addressKr: '한국주소',
        email: '이메일',
      }
      const PET_LABELS: Record<string, string> = {
        petName: '이름',
        petNameEn: '영문이름',
        birthDate: '생년월일',
        species: '종',
        breed: '품종',
        colors: '모색',
        sex: '성별',
        weight: '몸무게',
      }
      const topMissing: string[] = []
      const petMissing = new Map<number, string[]>()
      for (const k of miss) {
        const m = k.match(/^pet(\d+)\.(.+)$/)
        if (m) {
          const idx = Number(m[1])
          const label = PET_LABELS[m[2]] ?? m[2]
          if (!petMissing.has(idx)) petMissing.set(idx, [])
          petMissing.get(idx)!.push(label)
        } else if (TOP_LABELS[k]) {
          topMissing.push(TOP_LABELS[k])
        }
      }
      const parts: string[] = []
      if (topMissing.length > 0) parts.push(topMissing.join(', '))
      const petIdxs = Array.from(petMissing.keys()).sort((a, b) => a - b)
      for (const i of petIdxs) {
        const labels = petMissing.get(i)!
        const prefix = pets.length > 1 ? `반려동물 ${i + 1} ` : '반려동물 '
        parts.push(`${prefix}${labels.join(', ')}`)
      }
      // 마지막 글자 받침 유무로 을/를 선택 (한글 음절: (code-0xAC00)%28 ≠ 0 이면 받침 있음).
      const last = parts.length > 0 ? parts[parts.length - 1].slice(-1) : ''
      const code = last.charCodeAt(0)
      const hasJongseong = code >= 0xAC00 && code <= 0xD7A3 && (code - 0xAC00) % 28 !== 0
      const particle = hasJongseong ? '을' : '를'
      const summary = parts.length > 0 ? `${parts.join(', ')}${particle} 입력해주세요.` : ''
      setError(formatError ? `${summary} ${formatError}`.trim() : summary)
      // 첫 누락 항목으로 스크롤
      if (miss.size > 0) {
        setTimeout(() => {
          const first = Array.from(miss)[0]
          const el = document.querySelector(`[data-field-key="${first}"]`) as HTMLElement | null
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 50)
      }
      return
    }

    setMissing(new Set())
    setError(null)
    setSubmitting(true)
    let allOk = true
    for (const p of pets) {
      const result = await applyCase({
        destination,
        customer_name: customerName.trim(),
        customer_last_name_en: capitalize(customerLastNameEn.trim()),
        customer_first_name_en: capitalize(customerFirstNameEn.trim()),
        phone: phone.trim(),
        address_kr: addressDetail.trim() ? `${addressKr.trim()} ${addressDetail.trim()}` : addressKr.trim(),
        address_en: addressEn.trim(),
        address_zipcode: addressZipcode,
        address_sido: addressSido,
        address_sigungu: addressSigungu,
        email: email.trim(),
        pet_name: p.petName.trim(),
        pet_name_en: capitalize(p.petNameEn.trim()),
        birth_date: p.birthDate,
        species: p.species,
        breed: p.breed.trim(),
        breed_en: p.breedEn.trim(),
        color: p.selectedColors.map(ko => COLORS.find(c => c.ko === ko)?.ko ?? ko).join(', '),
        color_en: p.selectedColors.map(ko => COLORS.find(c => c.ko === ko)?.en ?? ko).join(', '),
        sex: p.sex,
        weight: p.weight.trim(),
        microchip: (() => {
          const d = p.microchip.replace(/\D/g, '')
          return d.length === 15
            ? `${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6,9)} ${d.slice(9,12)} ${d.slice(12)}`
            : undefined
        })(),
        microchip_implant_date: p.microchipDate || undefined,
        rabies_date: p.rabiesDate || undefined,
      })
      if (!result.ok) { setError(result.error); allOk = false; break }
    }
    setSubmitting(false)

    if (allOk) {
      setStep(1)
    }
  }

  if (step === 1) {
    return (
      <div className={cn(pageShellClass, 'flex items-center justify-center px-4')}>
        <div className="mx-auto w-full max-w-md text-center py-20">
          <p className="font-mono text-[11px] uppercase tracking-[2px] text-muted-foreground mb-4">Completed</p>
          <h1 className="font-serif text-2xl font-medium tracking-tight text-foreground mb-3">
            신청이 접수되었습니다
          </h1>
          <p className="text-[15px] leading-relaxed text-muted-foreground mb-10">
            담당자가 확인 후 연락드립니다.<br />
            감사합니다.
          </p>
          <button
            type="button"
            onClick={() => {
              setStep(0)
              setDestination(''); setDestQuery('')
              setCustomerName(''); setCustomerLastNameEn(''); setCustomerFirstNameEn(''); setPhone(''); setAddressKr(''); setAddressDetail(''); setAddressEn(''); setEmail('')
              setPetCount(1); setPets([emptyPet()])
            }}
            className="font-mono text-[12px] uppercase tracking-[1.5px] text-muted-foreground hover:text-foreground transition-colors"
          >
            새 신청 작성
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={pageShellClass}>
      <div className={pageInnerClass}>
        {/* Header — editorial magazine-style masthead */}
        <header className="mb-10 text-center pb-8 border-b border-border/60">
          <p className="font-mono text-[11px] uppercase tracking-[2.5px] text-muted-foreground mb-4">
            PetMove · Registration
          </p>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground">
            펫무브 등록 신청서
          </h1>
        </header>

        <form onSubmit={handleSubmit} className="space-y-md"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            const target = e.target as HTMLElement
            // submit 버튼에서 Enter는 제출 허용
            if (target.tagName === 'BUTTON' && (target as HTMLButtonElement).type === 'submit') return
            // 검색 드롭다운에서 Enter는 선택 로직에서 처리
            if (target.tagName === 'BUTTON') return
            // 검색 드롭다운 input에서는 선택 완료 전까지 다음 필드 이동 차단
            if ((target as HTMLInputElement).dataset.searchField === 'dest' && !destination) { e.preventDefault(); return }
            if ((target as HTMLInputElement).dataset.searchField === 'breed') { e.preventDefault(); return }
            // date input: Enter로 값 확정 + 다음 필드 이동
            // 단, 생년월일은 다음이 버튼(종)이라 이동 안 함
            if ((target as HTMLInputElement).type === 'date') {
              e.preventDefault()
              const form = e.currentTarget
              const focusable = Array.from(form.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([disabled]), select:not([disabled]), button[type="submit"]'))
              const idx = focusable.indexOf(target)
              const next = idx >= 0 && idx < focusable.length - 1 ? focusable[idx + 1] : null
              if (next && next.tagName === 'INPUT') { next.focus() } else { (target as HTMLInputElement).blur() }
              return
            }
            // input/select에서 Enter → 다음 필드로 이동
            if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
              e.preventDefault()
              const form = e.currentTarget
              const focusable = Array.from(form.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([disabled]), select:not([disabled]), button[type="submit"]'))
              const idx = focusable.indexOf(target)
              if (idx >= 0 && idx < focusable.length - 1) {
                focusable[idx + 1].focus()
              }
            }
          }}>
          {/* 1. 목적지 */}
          <section className={sectionCardClass}>
            <div className="flex items-baseline gap-[10px] pb-3 border-b border-border/60 mb-1">
              <span className={eyebrowNumClass}>01</span>
              <h2 className={sectionTitleClass}>어디로 가시나요?</h2>
            </div>
            <FieldRow label="목적지" required hint="검색 입력" fieldKey="destination" missing={missing.has('destination')}>
              {destination ? (
                <button type="button" onClick={() => { setDestination(''); setDestQuery('') }}
                  className="w-full flex items-baseline justify-between text-left h-10 text-foreground hover:opacity-70 transition-opacity">
                  <span className="font-serif font-semibold text-[17px] leading-tight">{DESTS.find(d => d.ko === destination)?.ko ?? destination}</span>
                  <span className="ml-2 font-serif italic text-[15px] text-muted-foreground">{DESTS.find(d => d.ko === destination)?.en ?? ''}</span>
                </button>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    data-search-field="dest"
                    value={destQuery}
                    onChange={(e) => { setDestQuery(e.target.value); setDestHighlight(-1) }}
                    onKeyDown={(e) => {
                      const items = filteredDests.slice(0, 10)
                      if (e.key === 'ArrowDown') { e.preventDefault(); setDestHighlight(h => Math.min(h + 1, items.length - 1)) }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setDestHighlight(h => Math.max(h - 1, 0)) }
                      if (e.key === 'Enter') {
                        const pick = destHighlight >= 0 ? items[destHighlight] : items.length === 1 ? items[0] : null
                        if (pick) { e.preventDefault(); setDestination(pick.ko); setDestQuery(''); setDestHighlight(-1) }
                      }
                    }}
                    onBlur={() => setTimeout(() => { if (!destination) setDestQuery('') }, 300)}
                    placeholder="예: 일본 · Japan"
                    className={inputClass}
                  />
                  {destQuery && (
                    <ul className={cn(dropdownClass, 'absolute left-0 right-0 top-full z-20 max-h-48 overflow-y-auto')}>
                      {filteredDests.length === 0 ? (
                        <li className="px-md py-3 text-sm text-muted-foreground">검색 결과 없음</li>
                      ) : (
                        filteredDests.slice(0, 10).map((d, i) => (
                          <li key={d.ko}>
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setDestination(d.ko); setDestQuery(''); setDestHighlight(-1) }}
                              className={cn(dropdownRowClass, i === destHighlight && dropdownRowActiveClass)}>
                              {d.ko} <span className="font-serif italic text-muted-foreground ml-1">{d.en}</span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
              )}
            </FieldRow>
          </section>

          {/* 2. 소유주 */}
          <section className={sectionCardClass}>
            <div className="flex items-baseline gap-[10px] pb-3 border-b border-border/60 mb-1">
              <span className={eyebrowNumClass}>02</span>
              <h2 className={sectionTitleClass}>소유주 정보</h2>
            </div>
            <FieldRow label="성함" required fieldKey="customerName" missing={missing.has('customerName')}>
              <input type="text" autoComplete="name" value={customerName} onChange={(e) => setCustomerName(e.target.value.replace(/\b[a-z]/g, c => c.toUpperCase()))}
                placeholder="예: 홍길동" className={inputClass} />
            </FieldRow>
            <FieldRow label="영문성함" required hint="여권과 동일하게" fieldKey="customerNameEn" missing={missing.has('customerNameEn')}>
              <div className="flex gap-sm">
                <input type="text" autoComplete="family-name" value={customerLastNameEn}
                  onCompositionStart={() => { composingRef.current = true }}
                  onChange={(e) => handleEnInput(e, setCustomerLastNameEn, 'lastNameEn')}
                  onCompositionEnd={(e) => handleEnCompositionEnd(e, setCustomerLastNameEn, 'lastNameEn')}
                  placeholder="성 · Hong" className={inputEnClass + ' flex-1'} />
                <input type="text" autoComplete="given-name" value={customerFirstNameEn}
                  onCompositionStart={() => { composingRef.current = true }}
                  onChange={(e) => handleEnInput(e, setCustomerFirstNameEn, 'firstNameEn')}
                  onCompositionEnd={(e) => handleEnCompositionEnd(e, setCustomerFirstNameEn, 'firstNameEn')}
                  placeholder="이름 · Gildong" className={inputEnClass + ' flex-1'} />
              </div>
              {(enWarnings.lastNameEn || enWarnings.firstNameEn) && <p className="mt-1.5 text-xs text-destructive">{enWarnings.lastNameEn || enWarnings.firstNameEn}</p>}
            </FieldRow>
            <FieldRow label="전화번호" required fieldKey="phone" missing={missing.has('phone')}>
              <input type="tel" inputMode="numeric" autoComplete="tel"
                value={phone.replace(/(\d{3})(\d{4})(\d{0,4})/, (_, a, b, c) => c ? `${a}-${b}-${c}` : b ? `${a}-${b}` : a)}
                maxLength={13}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 11))}
                placeholder="010-0000-0000" className={numericInputClass} />
            </FieldRow>
            <FieldRow label="한국주소" required hint="검색 입력" fieldKey="addressKr" missing={missing.has('addressKr')}>
              <div className="flex gap-sm items-center">
                <input type="text" autoComplete="off" value={addressKr} onChange={(e) => setAddressKr(e.target.value)}
                  placeholder="클릭하여 검색" className={inputClass + ' flex-1 cursor-pointer'} readOnly
                  onFocus={() => { if (!addressKr) handleAddrSearch() }} />
                <button type="button" onClick={handleAddrSearch}
                  className="shrink-0 h-8 rounded-full border border-border/80 bg-transparent px-3 font-serif italic text-[12px] text-foreground transition-colors hover:bg-accent">
                  주소 검색
                </button>
              </div>
              {addressKr && (
                <input ref={addrDetailRef} type="text" autoComplete="address-line2" value={addressDetail} onChange={(e) => setAddressDetail(e.target.value)}
                  placeholder="상세주소 · 동/호수 등"
                  className={inputClass + ' mt-1'} />
              )}
              {addressEn && (
                <p className="mt-1 font-serif italic text-[15px] text-foreground">{addressEn}</p>
              )}
            </FieldRow>
            <FieldRow label="이메일" required fieldKey="email" missing={missing.has('email')}>
              <input type="email" inputMode="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣A-Z]/g, (c) => c >= 'A' && c <= 'Z' ? c.toLowerCase() : ''))}
                onCompositionEnd={(e) => setEmail((e.target as HTMLInputElement).value.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '').toLowerCase())}
                placeholder="example@email.com" className={inputEnClass} />
            </FieldRow>
          </section>

          {/* 마리 수 선택 */}
          <section className={sectionCardClass}>
            <div className="flex items-baseline gap-[10px] pb-3 border-b border-border/60 mb-1">
              <span className={eyebrowNumClass}>03</span>
              <h2 className={sectionTitleClass}>동반 마리수</h2>
            </div>
            <FieldRow label="마리수" required>
              <div className="flex gap-sm">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onClick={() => handlePetCountChange(n)}
                    className={`h-10 w-10 rounded-full border font-mono text-sm tabular-nums transition-colors ${petCount === n ? chipButtonActive : chipButtonInactive}`}>
                    {n}
                  </button>
                ))}
              </div>
            </FieldRow>
          </section>

          {/* 3. 반려동물 (반복) */}
          {pets.map((pet, pi) => (
          <section key={pi} className={sectionCardClass}>
            <div className="flex items-baseline gap-[10px] pb-3 border-b border-border/60 mb-1">
              <span className={eyebrowNumClass}>{String(4 + pi).padStart(2, '0')}</span>
              <h2 className={sectionTitleClass}>
                {pets.length > 1 ? `반려동물 · ${pi + 1}` : '반려동물 정보'}
              </h2>
            </div>
            <PetFormSection
              pet={pet}
              index={pi}
              updatePet={updatePet}
              enWarnings={enWarnings}
              composingRef={composingRef}
              handleEnInput={handleEnInput}
              handleEnCompositionEnd={handleEnCompositionEnd}
              breedHighlight={breedHighlights[pi] ?? -1}
              setBreedHighlight={(h: number) => setBreedHighlights(prev => ({ ...prev, [pi]: h }))}
              getFilteredBreeds={getFilteredBreeds}
              missing={missing}
            />
          </section>
          ))}

          {/* Error */}
          {error && (
            <div className={destructiveBoxClass}>
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className={primaryButtonClass}
            >
              {submitting ? '제출 중…' : '정보 등록'}
            </button>
          </div>

          <p className="text-center font-mono text-[11px] uppercase tracking-[1.5px] text-muted-foreground pb-10">
            등록하신 정보는 서류 발급에 사용됩니다
          </p>
        </form>
      </div>

      {/* Daum Postcode Modal */}
      {showAddrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-[2px]" onClick={() => setShowAddrModal(false)}>
          <div className="relative mx-4 w-full max-w-lg overflow-hidden rounded-xl border border-border/60 bg-popover shadow-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-md py-3 border-b border-border/60">
              <span className="font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground">주소 검색</span>
              <button type="button" onClick={() => setShowAddrModal(false)}
                className="text-muted-foreground hover:text-foreground text-lg leading-none">&times;</button>
            </div>
            <div ref={addrModalRef} className="h-[450px]" />
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Pet Form Section (동물정보 + 선택항목) ── */

function PetFormSection({ pet, index, updatePet, enWarnings, composingRef, handleEnInput, handleEnCompositionEnd, breedHighlight, setBreedHighlight, getFilteredBreeds, missing }: {
  pet: PetForm
  index: number
  updatePet: (idx: number, field: keyof PetForm, value: PetForm[keyof PetForm]) => void
  enWarnings: Record<string, string | null>
  composingRef: React.RefObject<boolean>
  handleEnInput: (e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void, field: string) => void
  handleEnCompositionEnd: (e: React.CompositionEvent<HTMLInputElement>, setter: (v: string) => void, field: string) => void
  breedHighlight: number
  setBreedHighlight: (h: number) => void
  getFilteredBreeds: (pet: PetForm) => Breed[]
  missing: Set<string>
}) {
  const filteredBreeds = getFilteredBreeds(pet)
  const warnKey = (f: string) => `pet${index}_${f}`
  const mk = (f: string) => `pet${index}.${f}`
  const isMissing = (f: string) => missing.has(mk(f))

  return (
    <div>
      {/* 이름 */}
      <FieldRow label="이름" required fieldKey={mk('petName')} missing={isMissing('petName')}>
        <input type="text" value={pet.petName} onChange={(e) => updatePet(index, 'petName', e.target.value.replace(/\b[a-z]/g, c => c.toUpperCase()))}
          placeholder="예: 마루" className={inputClass} />
      </FieldRow>

      {/* 영문이름 */}
      <FieldRow label="영문이름" required fieldKey={mk('petNameEn')} missing={isMissing('petNameEn')}>
        <input type="text" value={pet.petNameEn}
          onCompositionStart={() => { composingRef.current = true }}
          onChange={(e) => handleEnInput(e, (v) => updatePet(index, 'petNameEn', v), warnKey('en'))}
          onCompositionEnd={(e) => handleEnCompositionEnd(e, (v) => updatePet(index, 'petNameEn', v), warnKey('en'))}
          placeholder="예: Maru" className={inputEnClass} />
        {enWarnings[warnKey('en')] && <p className="mt-1.5 text-xs text-destructive">{enWarnings[warnKey('en')]}</p>}
      </FieldRow>

      {/* 생년월일 */}
      <FieldRow label="생년월일" required fieldKey={mk('birthDate')} missing={isMissing('birthDate')}>
        <DateTextField
          value={pet.birthDate}
          onChange={(v) => updatePet(index, 'birthDate', v)}
          placeholder="YYYY-MM-DD"
          className={numericInputClass}
        />
      </FieldRow>

      {/* 종 */}
      <FieldRow label="종" required fieldKey={mk('species')} missing={isMissing('species')}>
        <div className="flex flex-wrap gap-sm">
          {SPECIES_OPTIONS.map(o => (
            <button key={o.value} type="button"
              onClick={() => { updatePet(index, 'species', o.value); if (pet.breed) { updatePet(index, 'breed', ''); updatePet(index, 'breedEn', ''); updatePet(index, 'breedQuery', '') } }}
              className={`h-9 px-5 rounded-full border text-[13px] font-medium transition-colors ${pet.species === o.value ? chipButtonActive : chipButtonInactive}`}>
              {o.label}
            </button>
          ))}
        </div>
      </FieldRow>

      {/* 품종 */}
      <FieldRow label="품종" required hint="검색 입력" fieldKey={mk('breed')} missing={isMissing('breed')}>
        {pet.breed ? (
          <button type="button" onClick={() => { updatePet(index, 'breed', ''); updatePet(index, 'breedEn', ''); updatePet(index, 'breedQuery', '') }}
            className="w-full flex items-baseline justify-between text-left h-10 text-foreground hover:opacity-70 transition-opacity">
            <span className="font-serif font-semibold text-[17px] leading-tight">{pet.breed}</span>
            <span className="ml-2 font-serif italic text-[15px] text-muted-foreground">{pet.breedEn}</span>
          </button>
        ) : (
          <div className="relative">
            <input type="text" data-search-field="breed" value={pet.breedQuery}
              onChange={(e) => { updatePet(index, 'breedQuery', e.target.value); setBreedHighlight(-1) }}
              onKeyDown={(e) => {
                const items = filteredBreeds.slice(0, 10)
                if (e.key === 'ArrowDown') { e.preventDefault(); setBreedHighlight(Math.min(breedHighlight + 1, items.length - 1)) }
                if (e.key === 'ArrowUp') { e.preventDefault(); setBreedHighlight(Math.max(breedHighlight - 1, 0)) }
                if (e.key === 'Enter') {
                  const pick = breedHighlight >= 0 ? items[breedHighlight] : items.length === 1 ? items[0] : null
                  if (pick) { e.preventDefault(); updatePet(index, 'breed', pick.ko); updatePet(index, 'breedEn', pick.en); updatePet(index, 'breedQuery', ''); setBreedHighlight(-1) }
                }
              }}
              onBlur={() => setTimeout(() => { if (!pet.breed) updatePet(index, 'breedQuery', '') }, 300)}
              placeholder={pet.species ? '품종 검색 · 말티즈 / Maltese' : '종을 먼저 선택해주세요'}
              disabled={!pet.species} className={cn(inputClass, !pet.species && 'opacity-50')} />
            {pet.breedQuery && filteredBreeds.length > 0 && (
              <ul className={cn(dropdownClass, 'absolute left-0 right-0 top-full z-20 max-h-48 overflow-y-auto')}>
                {filteredBreeds.slice(0, 10).map((b, i) => (
                  <li key={`${b.type}:${b.en}`}>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { updatePet(index, 'breed', b.ko); updatePet(index, 'breedEn', b.en); updatePet(index, 'breedQuery', ''); setBreedHighlight(-1) }}
                      className={cn(dropdownRowClass, i === breedHighlight && dropdownRowActiveClass)}>
                      {b.ko} <span className="font-serif italic text-muted-foreground ml-1">{b.en}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {pet.breedQuery && filteredBreeds.length === 0 && (
              <p className="mt-1 font-serif italic text-[12px] text-muted-foreground">검색 결과 없음</p>
            )}
          </div>
        )}
      </FieldRow>

      {/* 모색 */}
      <FieldRow label="모색" required hint="가장 비슷한 색상을 최대 3개까지 선택" fieldKey={mk('colors')} missing={isMissing('colors')}>
        <div className="flex flex-wrap gap-sm">
          {COLORS.map(c => {
            const selected = pet.selectedColors.includes(c.ko)
            const disabled = !selected && pet.selectedColors.length >= 3
            return (
              <button key={c.ko} type="button"
                onClick={() => {
                  if (selected) updatePet(index, 'selectedColors', pet.selectedColors.filter(v => v !== c.ko))
                  else if (pet.selectedColors.length < 3) updatePet(index, 'selectedColors', [...pet.selectedColors, c.ko])
                }}
                className={cn(
                  'h-9 pl-2 pr-4 inline-flex items-center gap-2 rounded-full border text-[13px] font-medium transition-colors',
                  selected ? chipButtonActive : chipButtonInactive,
                  disabled && 'opacity-40 cursor-not-allowed',
                )}>
                <ColorSwatch hex={COLOR_HEX[c.ko] ?? '#999999'} selected={selected} />
                {c.ko}
              </button>
            )
          })}
        </div>
      </FieldRow>

      {/* 성별 */}
      <FieldRow label="성별" required fieldKey={mk('sex')} missing={isMissing('sex')}>
        <div className="flex flex-wrap gap-sm">
          {SEX_OPTIONS.map(o => (
            <button key={o.value} type="button"
              onClick={() => updatePet(index, 'sex', o.value)}
              className={`h-9 px-md rounded-full border text-[13px] font-medium transition-colors ${pet.sex === o.value ? chipButtonActive : chipButtonInactive}`}>
              {o.label}
            </button>
          ))}
        </div>
      </FieldRow>

      {/* 몸무게 */}
      <FieldRow label="몸무게" required hint="kg" fieldKey={mk('weight')} missing={isMissing('weight')}>
        <input type="text" inputMode="decimal" value={pet.weight}
          onChange={(e) => updatePet(index, 'weight', e.target.value.replace(/[^\d.]/g, ''))}
          placeholder="예: 5.2" className={numericInputClass} />
      </FieldRow>

      {/* 선택 항목 섹션 헤더 */}
      <div className="pt-6 mt-4 border-t border-border/60">
        <div className="flex items-baseline justify-between mb-1">
          <span className="font-mono text-[11px] uppercase tracking-[1.6px] text-muted-foreground">Optional</span>
          <span className="font-serif italic text-[12px] text-muted-foreground/80">아시는 부분만 작성해주세요</span>
        </div>
      </div>

      {/* 마이크로칩 번호 */}
      <FieldRow label="마이크로칩 번호" hint="15자리">
        <input type="text" inputMode="numeric"
          value={pet.microchip.replace(/(\d{3})(?=\d)/g, '$1 ')}
          onChange={(e) => updatePet(index, 'microchip', e.target.value.replace(/\D/g, '').slice(0, 15))}
          placeholder="000 000 000 000 000" maxLength={19} className={numericInputClass} />
      </FieldRow>

      {/* 마이크로칩 삽입일 */}
      <FieldRow label="마이크로칩 삽입일">
        <DateTextField
          value={pet.microchipDate}
          onChange={(v) => updatePet(index, 'microchipDate', v)}
          placeholder="YYYY-MM-DD"
          className={numericInputClass}
        />
      </FieldRow>

      {/* 광견병 접종일 */}
      <FieldRow label="최근 광견병 접종일" hint="최근 1년 이내">
        <DateTextField
          value={pet.rabiesDate}
          onChange={(v) => updatePet(index, 'rabiesDate', v)}
          placeholder="YYYY-MM-DD"
          className={numericInputClass}
        />
      </FieldRow>
    </div>
  )
}
