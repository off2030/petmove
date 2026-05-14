'use client'

import { useState, useEffect, useRef } from 'react'
import { cn } from '@petmove/ui'
import { cardContainer } from '@petmove/ui'
import { DateTextField } from '@petmove/ui'
import { applyCase } from '@/lib/actions/apply-case'
import destsData from '@petmove/domain/data/destinations.json'
import breedsData from '@petmove/domain/data/breeds.json'
import colorsData from '@petmove/domain/data/colors.json'

function capitalize(s: string) {
  return s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

interface Dest { ko: string; en: string }
const DESTS = destsData as Dest[]
interface Breed { ko: string; en: string; type: string; alias?: string[] }
const BREEDS = breedsData as Breed[]
interface Color { ko: string; en: string; alias?: string[] }
const COLORS = colorsData as Color[]

type Lang = 'ko' | 'en'

const messages = {
  ko: {
    eyebrow: 'PetMove · Registration',
    title: '펫무브 등록 신청서',
    sec1: '어디로 가시나요?',
    destination: '목적지',
    required: '필수',
    searchHint: '검색 입력',
    destPlaceholder: '예: 일본 · Japan',
    noResults: '검색 결과 없음',
    tripType: '여행 유형',
    tripRound: '왕복',
    tripOneWay: '편도',
    sec2: '소유주 정보',
    name: '성함',
    namePlaceholder: '예: 홍길동',
    nameEn: '영문성함',
    nameEnHint: '여권과 동일하게',
    lastNameEnPlaceholder: '성 · Hong',
    firstNameEnPlaceholder: '이름 · Gildong',
    enOnlyWarning: '영문만 입력 가능합니다',
    phone: '전화번호',
    phonePlaceholder: '010-1234-5678',
    addressKr: '한국주소',
    addressSearch: '주소 검색',
    addressClickToSearch: '클릭하여 검색',
    addressDetail: '상세주소 · 동/호수 등',
    email: '이메일',
    emailPlaceholder: 'example@email.com',
    sec3: '동반 마리수',
    petCount: '마리수',
    petInfo: '반려동물 정보',
    petInfoN: (n: number) => `반려동물 · ${n}`,
    petName: '이름',
    petNamePlaceholder: '예: 마루',
    petNameEn: '영문이름',
    petNameEnPlaceholder: '예: Maru',
    birthDate: '생년월일',
    species: '종',
    speciesDog: '강아지',
    speciesCat: '고양이',
    speciesOther: '기타',
    breed: '품종',
    breedPlaceholder: '품종 검색 · 말티즈 / Maltese',
    breedSelectSpeciesFirst: '종을 먼저 선택해주세요',
    color: '모색',
    colorHint: '가장 비슷한 색상을 최대 3개까지 선택',
    sex: '성별',
    sexSpayedFemale: '중성화 암컷',
    sexNeuteredMale: '중성화 수컷',
    sexFemale: '암컷',
    sexMale: '수컷',
    weight: '몸무게',
    weightHint: 'kg',
    weightPlaceholder: '예: 5.2',
    optional: 'Optional',
    optionalHint: '아시는 부분만 작성해주세요',
    microchip: '마이크로칩 번호',
    microchipHint: '15자리',
    microchipDate: '마이크로칩 삽입일',
    rabiesDate: '최근 광견병 접종일',
    rabiesHint: '최근 1년 이내',
    submitting: '제출 중…',
    submit: '정보 등록',
    submitFooter: '등록하신 정보는 서류 발급에 사용됩니다',
    addressModalTitle: '주소 검색',
    completed: 'Completed',
    doneTitle: '신청이 접수되었습니다',
    doneBody1: '담당자가 확인 후 연락드립니다.',
    doneBody2: '감사합니다.',
    newApply: '새 신청 작성',
    fillRequest: '작성 요청',
    phoneFormatError: '전화번호는 010-1234-5678 형식으로 입력해주세요.',
    microchipFormatErrorPrefixSingle: '',
    microchipFormatErrorPrefixN: (n: number) => `반려동물 ${n}: `,
    microchipFormatError: '마이크로칩 번호는 15자리 숫자여야 합니다.',
    honeypotLabel: '웹사이트 (입력하지 마세요)',
    topLabels: {
      destination: '목적지',
      customerName: '성함',
      customerNameEn: '영문성함',
      phone: '전화번호',
      addressKr: '한국주소',
      email: '이메일',
    } as Record<string, string>,
    petLabels: {
      petName: '이름',
      petNameEn: '영문이름',
      birthDate: '생년월일',
      species: '종',
      breed: '품종',
      colors: '모색',
      sex: '성별',
      weight: '몸무게',
    } as Record<string, string>,
    petPrefixSingle: '반려동물 ',
    petPrefixN: (n: number) => `반려동물 ${n} `,
    summarize(parts: string[]): string {
      if (parts.length === 0) return ''
      const last = parts[parts.length - 1].slice(-1)
      const code = last.charCodeAt(0)
      const hasJongseong = code >= 0xAC00 && code <= 0xD7A3 && (code - 0xAC00) % 28 !== 0
      const particle = hasJongseong ? '을' : '를'
      return `${parts.join(', ')}${particle} 입력해주세요.`
    },
  },
  en: {
    eyebrow: 'PetMove · Registration',
    title: 'PETMOVE Application Form',
    sec1: 'Where are you going?',
    destination: 'Destination',
    required: 'Required',
    searchHint: 'Search',
    destPlaceholder: 'e.g. Japan',
    noResults: 'No results',
    tripType: 'Trip type',
    tripRound: 'Round-trip',
    tripOneWay: 'One-way',
    sec2: 'Owner Information',
    name: 'Name',
    namePlaceholder: 'e.g. 홍길동',
    nameEn: 'English Name',
    nameEnHint: 'as on passport',
    lastNameEnPlaceholder: 'Last · Hong',
    firstNameEnPlaceholder: 'First · Gildong',
    enOnlyWarning: 'English only',
    phone: 'Phone',
    phonePlaceholder: '010-1234-5678',
    addressKr: 'Korean Address',
    addressSearch: 'Search address',
    addressClickToSearch: 'Click to search',
    addressDetail: 'Detail · unit / floor',
    email: 'Email',
    emailPlaceholder: 'example@email.com',
    sec3: 'Number of Pets',
    petCount: 'Pets',
    petInfo: 'Pet Information',
    petInfoN: (n: number) => `Pet · ${n}`,
    petName: 'Name',
    petNamePlaceholder: 'e.g. 마루',
    petNameEn: 'English Name',
    petNameEnPlaceholder: 'e.g. Maru',
    birthDate: 'Date of Birth',
    species: 'Species',
    speciesDog: 'Dog',
    speciesCat: 'Cat',
    speciesOther: 'Other',
    breed: 'Breed',
    breedPlaceholder: 'Search breed · Maltese',
    breedSelectSpeciesFirst: 'Select species first',
    color: 'Color',
    colorHint: 'Up to 3 closest colors',
    sex: 'Sex',
    sexSpayedFemale: 'Spayed female',
    sexNeuteredMale: 'Neutered male',
    sexFemale: 'Female',
    sexMale: 'Male',
    weight: 'Weight',
    weightHint: 'kg',
    weightPlaceholder: 'e.g. 5.2',
    optional: 'Optional',
    optionalHint: 'Fill in what you know',
    microchip: 'Microchip number',
    microchipHint: '15 digits',
    microchipDate: 'Microchip implant date',
    rabiesDate: 'Latest rabies vaccination',
    rabiesHint: 'within 1 year',
    submitting: 'Submitting…',
    submit: 'Submit',
    submitFooter: 'Your information will be used to prepare documents',
    addressModalTitle: 'Address search',
    completed: 'Completed',
    doneTitle: 'Application received',
    doneBody1: 'Our team will contact you after review.',
    doneBody2: 'Thank you.',
    newApply: 'New application',
    fillRequest: 'Required',
    phoneFormatError: 'Phone must be in 010-1234-5678 format.',
    microchipFormatErrorPrefixSingle: '',
    microchipFormatErrorPrefixN: (n: number) => `Pet ${n}: `,
    microchipFormatError: 'Microchip number must be 15 digits.',
    honeypotLabel: 'Website (do not fill)',
    topLabels: {
      destination: 'Destination',
      customerName: 'Korean Name',
      customerNameEn: 'English Name',
      phone: 'Phone',
      addressKr: 'Korean Address',
      email: 'Email',
    } as Record<string, string>,
    petLabels: {
      petName: 'Name',
      petNameEn: 'English Name',
      birthDate: 'Date of Birth',
      species: 'Species',
      breed: 'Breed',
      colors: 'Color',
      sex: 'Sex',
      weight: 'Weight',
    } as Record<string, string>,
    petPrefixSingle: 'Pet ',
    petPrefixN: (n: number) => `Pet ${n} `,
    summarize(parts: string[]): string {
      if (parts.length === 0) return ''
      return `Please fill in: ${parts.join(', ')}.`
    },
  },
} satisfies Record<Lang, unknown>

type Messages = (typeof messages)[Lang]

function speciesOptions(m: Messages) {
  return [
    { value: 'dog', label: m.speciesDog },
    { value: 'cat', label: m.speciesCat },
    { value: 'other', label: m.speciesOther },
  ]
}

function sexOptions(m: Messages) {
  return [
    { value: 'spayed_female', label: m.sexSpayedFemale },
    { value: 'neutered_male', label: m.sexNeuteredMale },
    { value: 'female', label: m.sexFemale },
    { value: 'male', label: m.sexMale },
  ]
}

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
const fieldRowClass = 'py-4 border-t border-border/80 first:border-t-0 first:pt-1'
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
  'mt-1 rounded-md border border-border/80 bg-popover shadow-sm'
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
  m,
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
  m: Messages
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
            <span className="font-serif italic text-[12px] text-primary">{m.fillRequest}</span>
          ) : (
            required && <span className={reqIndicatorClass}>{m.required}</span>
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

// Cloudflare Turnstile site key (publicly safe — secret 은 서버에만).
// 미설정 시 위젯 미표시 + 서버측 검증도 skip.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

export default function ApplyPage() {
  const [lang, setLang] = useState<Lang>('ko')
  const m = messages[lang]
  const [step, setStep] = useState(0) // 0=form, 1=done
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState<Set<string>>(() => new Set())
  // honeypot — 사람 사용자에게는 invisible. 봇이 자동 채우면 서버 액션이 silent reject.
  const [website, setWebsite] = useState('')
  // Cloudflare Turnstile token (위젯 콜백에서 갱신).
  const [turnstileToken, setTurnstileToken] = useState('')
  const turnstileRef = useRef<HTMLDivElement>(null)

  // Form state
  const [destination, setDestination] = useState('')
  const [destQuery, setDestQuery] = useState('')
  const [tripType, setTripType] = useState<'round' | 'one_way'>('round')
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

  // Cloudflare Turnstile 위젯 로드·렌더 — site key 설정 시에만.
  // 스크립트가 이미 있으면 재사용 (다른 페이지에서 로드된 경우 등).
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !turnstileRef.current) return
    interface TurnstileGlobal {
      render(el: HTMLElement, opts: {
        sitekey: string
        callback?: (token: string) => void
        'expired-callback'?: () => void
        'error-callback'?: () => void
      }): string | undefined
    }
    type WindowWithTurnstile = Window & { turnstile?: TurnstileGlobal }
    function tryRender() {
      const w = window as WindowWithTurnstile
      if (!w.turnstile || !turnstileRef.current) return false
      w.turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY!,
        callback: (token) => setTurnstileToken(token),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      })
      return true
    }
    if (tryRender()) return
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src^="https://challenges.cloudflare.com/turnstile"]',
    )
    if (existing) {
      existing.addEventListener('load', tryRender, { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    script.async = true
    script.defer = true
    script.onload = tryRender
    document.head.appendChild(script)
  }, [])

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
          setAddressKr(data.roadAddress)
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
    if (hasKorean) showEnWarning(field, m.enOnlyWarning)
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
    if (hasKorean) showEnWarning(field, m.enOnlyWarning)
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
      formatError = m.phoneFormatError
      miss.add('phone') // 시각적 강조도 같이
    } else {
      for (let i = 0; i < pets.length; i++) {
        const p = pets[i]
        if (p.microchip && p.microchip.length !== 15) {
          const prefix = pets.length > 1 ? m.microchipFormatErrorPrefixN(i + 1) : m.microchipFormatErrorPrefixSingle
          formatError = `${prefix}${m.microchipFormatError}`
          break
        }
      }
    }

    if (miss.size > 0 || formatError) {
      setMissing(miss)
      const topMissing: string[] = []
      const petMissing = new Map<number, string[]>()
      for (const k of miss) {
        const mm = k.match(/^pet(\d+)\.(.+)$/)
        if (mm) {
          const idx = Number(mm[1])
          const label = m.petLabels[mm[2]] ?? mm[2]
          if (!petMissing.has(idx)) petMissing.set(idx, [])
          petMissing.get(idx)!.push(label)
        } else if (m.topLabels[k]) {
          topMissing.push(m.topLabels[k])
        }
      }
      const parts: string[] = []
      if (topMissing.length > 0) parts.push(topMissing.join(', '))
      const petIdxs = Array.from(petMissing.keys()).sort((a, b) => a - b)
      for (const i of petIdxs) {
        const labels = petMissing.get(i)!
        const prefix = pets.length > 1 ? m.petPrefixN(i + 1) : m.petPrefixSingle
        parts.push(`${prefix}${labels.join(', ')}`)
      }
      const summary = m.summarize(parts)
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
        trip_type: tripType,
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
        website,
        cf_turnstile_token: turnstileToken || undefined,
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
          <p className="font-mono text-[11px] uppercase tracking-[2px] text-muted-foreground mb-4">{m.completed}</p>
          <h1 className="font-serif text-2xl font-medium tracking-tight text-foreground mb-3">
            {m.doneTitle}
          </h1>
          <p className="text-[15px] leading-relaxed text-muted-foreground mb-10">
            {m.doneBody1}<br />
            {m.doneBody2}
          </p>
          <button
            type="button"
            onClick={() => {
              setStep(0)
              setDestination(''); setDestQuery(''); setTripType('round')
              setCustomerName(''); setCustomerLastNameEn(''); setCustomerFirstNameEn(''); setPhone(''); setAddressKr(''); setAddressDetail(''); setAddressEn(''); setEmail('')
              setPetCount(1); setPets([emptyPet()])
            }}
            className="font-mono text-[12px] uppercase tracking-[1.5px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {m.newApply}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={pageShellClass}>
      <div className={pageInnerClass}>
        {/* Header — editorial magazine-style masthead */}
        <header className="relative mb-10 text-center pb-8 border-b border-border/80">
          {/* Language toggle */}
          <div className="mb-3 flex items-baseline justify-center gap-2 font-mono text-[11px] uppercase tracking-[1.5px] sm:absolute sm:top-0 sm:right-0 sm:mb-0">
            <button
              type="button"
              onClick={() => setLang('ko')}
              className={cn(
                'transition-colors',
                lang === 'ko' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              aria-pressed={lang === 'ko'}
            >
              한국어
            </button>
            <span className="text-muted-foreground/60">·</span>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={cn(
                'transition-colors',
                lang === 'en' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
              aria-pressed={lang === 'en'}
            >
              English
            </button>
          </div>
          <p className="font-mono text-[11px] uppercase tracking-[2.5px] text-muted-foreground mb-4">
            {m.eyebrow}
          </p>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground">
            {m.title}
          </h1>
        </header>

        {/* honeypot — 시각적으로 숨기되 display:none 은 피함 (일부 봇이 skip). */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: '1px', height: '1px', overflow: 'hidden' }}>
          <label>
            {m.honeypotLabel}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
        </div>
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
            <div className="flex items-baseline gap-[10px] pb-3 border-b border-border/80 mb-1">
              <span className={eyebrowNumClass}>01</span>
              <h2 className={sectionTitleClass}>{m.sec1}</h2>
            </div>
            <FieldRow m={m} label={m.destination} required hint={m.searchHint} fieldKey="destination" missing={missing.has('destination')}>
              {destination ? (
                (() => {
                  const d = DESTS.find(x => x.ko === destination)
                  const primary = lang === 'en' ? (d?.en ?? destination) : (d?.ko ?? destination)
                  const secondary = lang === 'en' ? (d?.ko ?? '') : (d?.en ?? '')
                  return (
                    <button type="button" onClick={() => { setDestination(''); setDestQuery('') }}
                      className="w-full flex items-baseline justify-between text-left h-10 text-foreground hover:opacity-70 transition-opacity">
                      <span className="font-serif font-semibold text-[17px] leading-tight">{primary}</span>
                      <span className="ml-2 font-serif italic text-[15px] text-muted-foreground">{secondary}</span>
                    </button>
                  )
                })()
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
                    placeholder={m.destPlaceholder}
                    className={inputClass}
                  />
                  {destQuery && (
                    <ul className={cn(dropdownClass, 'absolute left-0 right-0 top-full z-20 max-h-48 overflow-y-auto')}>
                      {filteredDests.length === 0 ? (
                        <li className="px-md py-3 text-sm text-muted-foreground">{m.noResults}</li>
                      ) : (
                        filteredDests.slice(0, 10).map((d, i) => {
                          const primary = lang === 'en' ? d.en : d.ko
                          const secondary = lang === 'en' ? d.ko : d.en
                          return (
                            <li key={d.ko}>
                              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setDestination(d.ko); setDestQuery(''); setDestHighlight(-1) }}
                                className={cn(dropdownRowClass, i === destHighlight && dropdownRowActiveClass)}>
                                {primary} <span className="font-serif italic text-muted-foreground ml-1">{secondary}</span>
                              </button>
                            </li>
                          )
                        })
                      )}
                    </ul>
                  )}
                </div>
              )}
            </FieldRow>
            {destination && (
              <FieldRow m={m} label={m.tripType} required>
                <div className="flex gap-sm">
                  <button type="button" onClick={() => setTripType('round')}
                    className={`h-9 px-5 rounded-full border text-[13px] font-medium transition-colors ${tripType === 'round' ? chipButtonActive : chipButtonInactive}`}>
                    {m.tripRound}
                  </button>
                  <button type="button" onClick={() => setTripType('one_way')}
                    className={`h-9 px-5 rounded-full border text-[13px] font-medium transition-colors ${tripType === 'one_way' ? chipButtonActive : chipButtonInactive}`}>
                    {m.tripOneWay}
                  </button>
                </div>
              </FieldRow>
            )}
          </section>

          {/* 2. 소유주 */}
          <section className={sectionCardClass}>
            <div className="flex items-baseline gap-[10px] pb-3 border-b border-border/80 mb-1">
              <span className={eyebrowNumClass}>02</span>
              <h2 className={sectionTitleClass}>{m.sec2}</h2>
            </div>
            <FieldRow m={m} label={m.name} required fieldKey="customerName" missing={missing.has('customerName')}>
              <input type="text" autoComplete="name" value={customerName} onChange={(e) => setCustomerName(e.target.value.replace(/\b[a-z]/g, c => c.toUpperCase()))}
                placeholder={m.namePlaceholder} className={inputClass} />
            </FieldRow>
            <FieldRow m={m} label={m.nameEn} required hint={m.nameEnHint} fieldKey="customerNameEn" missing={missing.has('customerNameEn')}>
              <div className="flex gap-sm">
                <input type="text" autoComplete="family-name" value={customerLastNameEn}
                  onCompositionStart={() => { composingRef.current = true }}
                  onChange={(e) => handleEnInput(e, setCustomerLastNameEn, 'lastNameEn')}
                  onCompositionEnd={(e) => handleEnCompositionEnd(e, setCustomerLastNameEn, 'lastNameEn')}
                  placeholder={m.lastNameEnPlaceholder} className={inputEnClass + ' flex-1'} />
                <input type="text" autoComplete="given-name" value={customerFirstNameEn}
                  onCompositionStart={() => { composingRef.current = true }}
                  onChange={(e) => handleEnInput(e, setCustomerFirstNameEn, 'firstNameEn')}
                  onCompositionEnd={(e) => handleEnCompositionEnd(e, setCustomerFirstNameEn, 'firstNameEn')}
                  placeholder={m.firstNameEnPlaceholder} className={inputEnClass + ' flex-1'} />
              </div>
              {(enWarnings.lastNameEn || enWarnings.firstNameEn) && <p className="mt-1.5 text-xs text-destructive">{enWarnings.lastNameEn || enWarnings.firstNameEn}</p>}
            </FieldRow>
            <FieldRow m={m} label={m.phone} required fieldKey="phone" missing={missing.has('phone')}>
              <input type="tel" inputMode="numeric" autoComplete="tel"
                value={phone.replace(/(\d{3})(\d{4})(\d{0,4})/, (_, a, b, c) => c ? `${a}-${b}-${c}` : b ? `${a}-${b}` : a)}
                maxLength={13}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 11))}
                placeholder={m.phonePlaceholder} className={numericInputClass} />
            </FieldRow>
            <FieldRow m={m} label={m.addressKr} required hint={m.searchHint} fieldKey="addressKr" missing={missing.has('addressKr')}>
              <div className="flex gap-sm items-center">
                <input type="text" autoComplete="off" value={addressKr} onChange={(e) => setAddressKr(e.target.value)}
                  placeholder={m.addressClickToSearch} className={inputClass + ' flex-1 cursor-pointer'} readOnly
                  onFocus={() => { if (!addressKr) handleAddrSearch() }} />
                <button type="button" onClick={handleAddrSearch}
                  className="shrink-0 h-8 rounded-full border border-border/80 bg-transparent px-3 font-serif italic text-[12px] text-foreground transition-colors hover:bg-accent">
                  {m.addressSearch}
                </button>
              </div>
              {addressKr && (
                <input ref={addrDetailRef} type="text" autoComplete="address-line2" value={addressDetail} onChange={(e) => setAddressDetail(e.target.value)}
                  placeholder={m.addressDetail}
                  className={inputClass + ' mt-1'} />
              )}
              {addressEn && (
                <p className="mt-1 font-serif italic text-[15px] text-foreground">{addressEn}</p>
              )}
            </FieldRow>
            <FieldRow m={m} label={m.email} required fieldKey="email" missing={missing.has('email')}>
              <input type="email" inputMode="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣A-Z]/g, (c) => c >= 'A' && c <= 'Z' ? c.toLowerCase() : ''))}
                onCompositionEnd={(e) => setEmail((e.target as HTMLInputElement).value.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '').toLowerCase())}
                placeholder={m.emailPlaceholder} className={inputEnClass} />
            </FieldRow>
          </section>

          {/* 마리 수 선택 */}
          <section className={sectionCardClass}>
            <div className="flex items-baseline gap-[10px] pb-3 border-b border-border/80 mb-1">
              <span className={eyebrowNumClass}>03</span>
              <h2 className={sectionTitleClass}>{m.sec3}</h2>
            </div>
            <FieldRow m={m} label={m.petCount} required>
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
            <div className="flex items-baseline gap-[10px] pb-3 border-b border-border/80 mb-1">
              <span className={eyebrowNumClass}>{String(4 + pi).padStart(2, '0')}</span>
              <h2 className={sectionTitleClass}>
                {pets.length > 1 ? m.petInfoN(pi + 1) : m.petInfo}
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
              m={m}
              lang={lang}
            />
          </section>
          ))}

          {/* Error */}
          {error && (
            <div className={destructiveBoxClass}>
              {error}
            </div>
          )}

          {/* Cloudflare Turnstile — 봇 차단. site key 미설정 시 div 자체는 남지만 빈 채로
              표시되지 않고, 서버측 검증도 skip 된다 (dev 환경 호환). */}
          {TURNSTILE_SITE_KEY && (
            <div className="pt-2 flex justify-center">
              <div ref={turnstileRef} />
            </div>
          )}

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className={primaryButtonClass}
            >
              {submitting ? m.submitting : m.submit}
            </button>
          </div>

          <p className="text-center font-mono text-[11px] uppercase tracking-[1.5px] text-muted-foreground pb-10">
            {m.submitFooter}
          </p>
        </form>
      </div>

      {/* Daum Postcode Modal */}
      {showAddrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-[2px]" onClick={() => setShowAddrModal(false)}>
          <div className="relative mx-4 w-full max-w-lg overflow-hidden rounded-xl border border-border/80 bg-popover shadow-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-md py-3 border-b border-border/80">
              <span className="font-mono text-[12px] uppercase tracking-[1.3px] text-muted-foreground">{m.addressModalTitle}</span>
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

function PetFormSection({ pet, index, updatePet, enWarnings, composingRef, handleEnInput, handleEnCompositionEnd, breedHighlight, setBreedHighlight, getFilteredBreeds, missing, m, lang }: {
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
  m: Messages
  lang: Lang
}) {
  const filteredBreeds = getFilteredBreeds(pet)
  const warnKey = (f: string) => `pet${index}_${f}`
  const mk = (f: string) => `pet${index}.${f}`
  const isMissing = (f: string) => missing.has(mk(f))
  const SPECIES = speciesOptions(m)
  const SEX = sexOptions(m)

  return (
    <>
      {/* 이름 */}
      <FieldRow m={m} label={m.petName} required fieldKey={mk('petName')} missing={isMissing('petName')}>
        <input type="text" value={pet.petName} onChange={(e) => updatePet(index, 'petName', e.target.value.replace(/\b[a-z]/g, c => c.toUpperCase()))}
          placeholder={m.petNamePlaceholder} className={inputClass} />
      </FieldRow>

      {/* 영문이름 */}
      <FieldRow m={m} label={m.petNameEn} required fieldKey={mk('petNameEn')} missing={isMissing('petNameEn')}>
        <input type="text" value={pet.petNameEn}
          onCompositionStart={() => { composingRef.current = true }}
          onChange={(e) => handleEnInput(e, (v) => updatePet(index, 'petNameEn', v), warnKey('en'))}
          onCompositionEnd={(e) => handleEnCompositionEnd(e, (v) => updatePet(index, 'petNameEn', v), warnKey('en'))}
          placeholder={m.petNameEnPlaceholder} className={inputEnClass} />
        {enWarnings[warnKey('en')] && <p className="mt-1.5 text-xs text-destructive">{enWarnings[warnKey('en')]}</p>}
      </FieldRow>

      {/* 생년월일 */}
      <FieldRow m={m} label={m.birthDate} required fieldKey={mk('birthDate')} missing={isMissing('birthDate')}>
        <DateTextField
          value={pet.birthDate}
          onChange={(v) => updatePet(index, 'birthDate', v)}
          placeholder="YYYY-MM-DD"
          className={numericInputClass}
        />
      </FieldRow>

      {/* 종 */}
      <FieldRow m={m} label={m.species} required fieldKey={mk('species')} missing={isMissing('species')}>
        <div className="flex flex-wrap gap-sm">
          {SPECIES.map(o => (
            <button key={o.value} type="button"
              onClick={() => { updatePet(index, 'species', o.value); if (pet.breed) { updatePet(index, 'breed', ''); updatePet(index, 'breedEn', ''); updatePet(index, 'breedQuery', '') } }}
              className={`h-9 px-5 rounded-full border text-[13px] font-medium transition-colors ${pet.species === o.value ? chipButtonActive : chipButtonInactive}`}>
              {o.label}
            </button>
          ))}
        </div>
      </FieldRow>

      {/* 품종 */}
      <FieldRow m={m} label={m.breed} required hint={m.searchHint} fieldKey={mk('breed')} missing={isMissing('breed')}>
        {pet.breed ? (
          (() => {
            const primary = lang === 'en' ? pet.breedEn : pet.breed
            const secondary = lang === 'en' ? pet.breed : pet.breedEn
            return (
              <button type="button" onClick={() => { updatePet(index, 'breed', ''); updatePet(index, 'breedEn', ''); updatePet(index, 'breedQuery', '') }}
                className="w-full flex items-baseline justify-between text-left h-10 text-foreground hover:opacity-70 transition-opacity">
                <span className="font-serif font-semibold text-[17px] leading-tight">{primary}</span>
                <span className="ml-2 font-serif italic text-[15px] text-muted-foreground">{secondary}</span>
              </button>
            )
          })()
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
              placeholder={pet.species ? m.breedPlaceholder : m.breedSelectSpeciesFirst}
              disabled={!pet.species} className={cn(inputClass, !pet.species && 'opacity-50')} />
            {pet.breedQuery && filteredBreeds.length > 0 && (
              <ul className={cn(dropdownClass, 'absolute left-0 right-0 top-full z-20 max-h-48 overflow-y-auto')}>
                {filteredBreeds.slice(0, 10).map((b, i) => {
                  const primary = lang === 'en' ? b.en : b.ko
                  const secondary = lang === 'en' ? b.ko : b.en
                  return (
                    <li key={`${b.type}:${b.en}`}>
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { updatePet(index, 'breed', b.ko); updatePet(index, 'breedEn', b.en); updatePet(index, 'breedQuery', ''); setBreedHighlight(-1) }}
                        className={cn(dropdownRowClass, i === breedHighlight && dropdownRowActiveClass)}>
                        {primary} <span className="font-serif italic text-muted-foreground ml-1">{secondary}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {pet.breedQuery && filteredBreeds.length === 0 && (
              <p className="mt-1 font-serif italic text-[12px] text-muted-foreground">{m.noResults}</p>
            )}
          </div>
        )}
      </FieldRow>

      {/* 모색 */}
      <FieldRow m={m} label={m.color} required hint={m.colorHint} fieldKey={mk('colors')} missing={isMissing('colors')}>
        <div className="flex flex-wrap gap-sm">
          {COLORS.map(c => {
            const selected = pet.selectedColors.includes(c.ko)
            const disabled = !selected && pet.selectedColors.length >= 3
            const label = lang === 'en' ? c.en : c.ko
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
                {label}
              </button>
            )
          })}
        </div>
      </FieldRow>

      {/* 성별 */}
      <FieldRow m={m} label={m.sex} required fieldKey={mk('sex')} missing={isMissing('sex')}>
        <div className="flex flex-wrap gap-sm">
          {SEX.map(o => (
            <button key={o.value} type="button"
              onClick={() => updatePet(index, 'sex', o.value)}
              className={`h-9 px-md rounded-full border text-[13px] font-medium transition-colors ${pet.sex === o.value ? chipButtonActive : chipButtonInactive}`}>
              {o.label}
            </button>
          ))}
        </div>
      </FieldRow>

      {/* 몸무게 */}
      <FieldRow m={m} label={m.weight} required hint={m.weightHint} fieldKey={mk('weight')} missing={isMissing('weight')}>
        <input type="text" inputMode="decimal" value={pet.weight}
          onChange={(e) => updatePet(index, 'weight', e.target.value.replace(/[^\d.]/g, ''))}
          placeholder={m.weightPlaceholder} className={numericInputClass} />
      </FieldRow>

      {/* 선택 항목 섹션 헤더 */}
      <div className="pt-6 mt-4 border-t border-border/80">
        <div className="flex items-baseline justify-between mb-1">
          <span className="font-mono text-[11px] uppercase tracking-[1.6px] text-muted-foreground">{m.optional}</span>
          <span className="font-serif italic text-[12px] text-muted-foreground/80">{m.optionalHint}</span>
        </div>
      </div>

      {/* 마이크로칩 번호 */}
      <FieldRow m={m} label={m.microchip} hint={m.microchipHint}>
        <input type="text" inputMode="numeric"
          value={pet.microchip.replace(/(\d{3})(?=\d)/g, '$1 ')}
          onChange={(e) => updatePet(index, 'microchip', e.target.value.replace(/\D/g, '').slice(0, 15))}
          placeholder="000 000 000 000 000" maxLength={19} className={numericInputClass} />
      </FieldRow>

      {/* 마이크로칩 삽입일 */}
      <FieldRow m={m} label={m.microchipDate}>
        <DateTextField
          value={pet.microchipDate}
          onChange={(v) => updatePet(index, 'microchipDate', v)}
          placeholder="YYYY-MM-DD"
          className={numericInputClass}
        />
      </FieldRow>

      {/* 광견병 접종일 */}
      <FieldRow m={m} label={m.rabiesDate} hint={m.rabiesHint}>
        <DateTextField
          value={pet.rabiesDate}
          onChange={(v) => updatePet(index, 'rabiesDate', v)}
          placeholder="YYYY-MM-DD"
          className={numericInputClass}
        />
      </FieldRow>
    </>
  )
}
