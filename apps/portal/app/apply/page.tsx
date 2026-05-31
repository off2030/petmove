'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@petmove/ui'
import { DateTextField } from '@petmove/ui'
import { applyCase } from '@/lib/actions/apply-case'
import { BottomSheet } from '@/components/fields/bottom-sheet'
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
    destPlaceholder: '예: 일본 · Japan',
    noResults: '검색 결과 없음',
    tripType: '왕복 · 편도',
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
    next: '다음',
    back: '이전',
    optionalStepTitle: '추가 정보 (선택)',
    addressModalTitle: '주소 검색',
    fillRequest: '작성 요청',
    phoneFormatError: '전화번호는 010-1234-5678 형식으로 입력해주세요.',
    microchipFormatErrorPrefixSingle: '',
    microchipFormatErrorPrefixN: (n: number) => `반려동물 ${n}: `,
    microchipFormatError: '마이크로칩 번호는 15자리 숫자여야 합니다.',
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
    destPlaceholder: 'e.g. Japan',
    noResults: 'No results',
    tripType: 'Round-trip · One-way',
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
    next: 'Next',
    back: 'Back',
    optionalStepTitle: 'Additional (optional)',
    addressModalTitle: 'Address search',
    fillRequest: 'Required',
    phoneFormatError: 'Phone must be in 010-1234-5678 format.',
    microchipFormatErrorPrefixSingle: '',
    microchipFormatErrorPrefixN: (n: number) => `Pet ${n}: `,
    microchipFormatError: 'Microchip number must be 15 digits.',
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
  'min-h-screen bg-[#F5EFE8] text-[#2A2620]'
const pageInnerClass =
  'mx-auto w-full max-w-[680px] px-6 py-12 sm:px-8 lg:px-10'
const sectionCardClass = 'rounded-xl bg-[#FBF7F1] p-lg'
const sectionTitleClass =
  'font-display text-[15px] font-medium uppercase tracking-[0.4px] text-[#2A2620]'
// Field row: vertical container with top divider between rows (first row has no top border)
const fieldRowClass = 'py-4 border-t border-[rgba(42,38,32,0.1)] first:border-t-0 first:pt-1'
// Header row: label left, REQ badge + hint on right
const fieldHeaderClass = 'flex items-baseline justify-between gap-3 mb-2'
const labelClass =
  'font-display text-[15px] text-[#2A2620]'
// Right meta (REQ + hint) — stacked horizontally, right-aligned
const fieldMetaClass = 'flex items-baseline gap-2 shrink-0'
// Optional hint text on the right of header
const hintRightClass =
  'font-display text-[12px] text-[#9A9286]'
// Borderless input — no box, relies on row divider
const placeholderClass =
  'placeholder:font-normal placeholder:text-[14px] placeholder:text-[#9A9286]/70'
const inputClass =
  `w-full h-10 bg-transparent px-0 font-display font-semibold text-[17px] leading-tight text-[#2A2620] ${placeholderClass} focus:outline-none transition-colors`
const inputEnClass =
  `w-full h-10 bg-transparent px-0 font-display text-[17px] text-[#2A2620] ${placeholderClass} focus:outline-none transition-colors`
const numericInputClass =
  `w-full h-10 bg-transparent px-0 font-display text-[15px] tracking-[0.3px] tabular-nums text-[#2A2620] ${placeholderClass} focus:outline-none transition-colors`
const chipButtonActive =
  'border-[#2A2620] bg-[#2A2620] text-[#FBF7F1]'
const chipButtonInactive =
  'border-[rgba(42,38,32,0.14)] bg-[#FBF7F1] text-[#2A2620] hover:bg-[#F0E8DC]'
const destructiveBoxClass =
  'rounded-md border border-[#C26A4A]/30 bg-[#C26A4A]/10 px-md py-2.5 text-sm text-[#C26A4A]'
const primaryButtonClass = cn(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors',
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#B89968]/40',
  'disabled:pointer-events-none disabled:opacity-50 select-none',
  'w-full h-12 text-base tracking-[0.1px]',
  'bg-[#B89968] text-[#FBF7F1] hover:bg-[#A98B5E]',
)
const secondaryButtonClass = cn(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors',
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#B89968]/40',
  'disabled:pointer-events-none disabled:opacity-50 select-none',
  'h-12 px-6 text-base tracking-[0.1px]',
  'border border-[rgba(42,38,32,0.16)] bg-[#FBF7F1] text-[#2A2620] hover:bg-[#F0E8DC]',
)

const TOTAL_STEPS = 4

/* ── Field Row helper — label(left) + REQ/hint(right) + input(below) ── */
function FieldRow({
  label,
  hint,
  children,
  className,
  fieldKey,
  missing = false,
  m,
}: {
  label: React.ReactNode
  /** 필수 항목 여부. 현재 신청 플로우에선 배지 미표시(검증은 missing 으로). */
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
      className={cn(fieldRowClass, className, missing && 'relative pl-3 -ml-3 bg-[#B89968]/10 rounded-sm')}
      data-field-key={fieldKey}
    >
      {missing && (
        <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[3px] bg-[#B89968] rounded" />
      )}
      <div className={fieldHeaderClass}>
        <span className={labelClass}>{label}</span>
        <span className={fieldMetaClass}>
          {hint && !missing && <span className={hintRightClass}>{hint}</span>}
          {missing && (
            <span className="font-display text-[12px] text-[#B89968]">{m.fillRequest}</span>
          )}
        </span>
      </div>
      {children}
    </div>
  )
}

/* ── Search-sheet select (목적지·품종) — 탭하면 하단 시트: 검색창 상단 고정 + 목록 스크롤.
   모바일에서 키보드가 목록을 가리지 않음. 정보 탭 DestinationField 와 동일 패턴. ── */
function SearchSheetField({
  title, selected, items, query, onQuery, onPick, open, onOpen, onClose,
  placeholder, searchPlaceholder, noResults, disabled = false, disabledPlaceholder, lang,
}: {
  title: string
  selected: { ko: string; en: string } | null
  items: { ko: string; en: string }[]
  query: string
  onQuery: (v: string) => void
  onPick: (item: { ko: string; en: string }) => void
  open: boolean
  onOpen: () => void
  onClose: () => void
  placeholder: string
  searchPlaceholder: string
  noResults: string
  disabled?: boolean
  disabledPlaceholder?: string
  lang: Lang
}) {
  const triggerPrimary = selected ? (lang === 'en' ? (selected.en || selected.ko) : selected.ko) : ''
  const triggerSecondary = selected ? (lang === 'en' ? selected.ko : selected.en) : ''
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        className={cn(
          'w-full h-10 flex items-center justify-between gap-2 text-left transition-opacity',
          disabled ? 'opacity-50' : 'hover:opacity-70',
        )}
      >
        {selected ? (
          <span className="min-w-0 flex items-baseline gap-2">
            <span className="font-display font-semibold text-[17px] leading-tight text-[#2A2620] truncate">{triggerPrimary}</span>
            {triggerSecondary && <span className="font-display text-[15px] text-[#9A9286] truncate">{triggerSecondary}</span>}
          </span>
        ) : (
          <span className="font-display text-[17px] text-[#9A9286]/70 truncate">
            {disabled ? (disabledPlaceholder ?? placeholder) : placeholder}
          </span>
        )}
        <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0 text-[#9A9286]">
          <path d="M8 10l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <BottomSheet open={open} onClose={onClose} title={title}>
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="mb-2.5 w-full rounded-lg border border-[rgba(42,38,32,0.16)] bg-white px-3 py-2.5 text-[15px] text-[#2A2620] placeholder:text-[#9A9286]/70 focus:outline-none focus:ring-1 focus:ring-[#B89968]/40"
        />
        <div className="pm-noscroll flex flex-col gap-1 overflow-y-auto" style={{ height: '52vh' }}>
          {items.length === 0 ? (
            <p className="px-1 py-3 text-[13px] text-[#9A9286]">{noResults}</p>
          ) : (
            items.map((it) => {
              const primary = lang === 'en' ? (it.en || it.ko) : it.ko
              const secondary = lang === 'en' ? it.ko : it.en
              const isSel = selected?.ko === it.ko
              return (
                <button
                  key={`${it.ko}|${it.en}`}
                  type="button"
                  onClick={() => onPick(it)}
                  className={cn(
                    'flex w-full items-baseline justify-between gap-2 rounded-md px-3 py-3 text-left transition-colors',
                    isSel ? 'bg-[#F0E8DC]' : 'hover:bg-[#F0E8DC]',
                  )}
                >
                  <span className="min-w-0 flex items-baseline gap-2">
                    <span className="text-[16px] text-[#2A2620] truncate">{primary}</span>
                    {secondary && <span className="text-[13px] text-[#9A9286] truncate">{secondary}</span>}
                  </span>
                  {isSel && (
                    <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 text-[#B89968]">
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              )
            })
          )}
        </div>
      </BottomSheet>
    </>
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

/* ── Step progress — thin segmented bar + "n / total" ── */
function StepProgress({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i < step ? 'bg-[#B89968]' : 'bg-[rgba(42,38,32,0.14)]',
            )}
          />
        ))}
      </div>
      <span className="shrink-0 font-display text-[11px] tracking-[1.3px] tabular-nums text-[#9A9286]">
        {step} / {total}
      </span>
    </div>
  )
}

export default function ApplyPage() {
  const router = useRouter()
  const [lang, setLang] = useState<Lang>('ko')
  const m = messages[lang]
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState<Set<string>>(() => new Set())
  const [step, setStep] = useState(1)

  // Form state
  const [destination, setDestination] = useState('')
  const [destQuery, setDestQuery] = useState('')
  const [destSheetOpen, setDestSheetOpen] = useState(false)
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

  // 단계별 누락 수집 — step 에 해당하는 필드만 검사.
  function collectMissing(s: number): { miss: Set<string>; formatError: string | null } {
    const miss = new Set<string>()
    let formatError: string | null = null
    if (s === 1) {
      if (!destination) miss.add('destination')
    } else if (s === 2) {
      if (!customerName.trim()) miss.add('customerName')
      if (!customerLastNameEn.trim() || !customerFirstNameEn.trim()) miss.add('customerNameEn')
      if (!phone.trim()) miss.add('phone')
      if (!addressKr.trim()) miss.add('addressKr')
      if (!miss.has('phone') && !/^010\d{8}$/.test(phone)) {
        formatError = m.phoneFormatError
        miss.add('phone')
      }
    } else if (s === 3) {
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
    } else if (s === 4) {
      for (let i = 0; i < pets.length; i++) {
        const p = pets[i]
        if (p.microchip && p.microchip.length !== 15) {
          const prefix = pets.length > 1 ? m.microchipFormatErrorPrefixN(i + 1) : m.microchipFormatErrorPrefixSingle
          formatError = `${prefix}${m.microchipFormatError}`
          break
        }
      }
    }
    return { miss, formatError }
  }

  function buildErrorMessage(miss: Set<string>, formatError: string | null): string {
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
    return formatError ? `${summary} ${formatError}`.trim() : summary
  }

  function scrollToFirstMissing(miss: Set<string>) {
    if (miss.size === 0) return
    setTimeout(() => {
      const first = Array.from(miss)[0]
      const el = document.querySelector(`[data-field-key="${first}"]`) as HTMLElement | null
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }

  function goNext() {
    const { miss, formatError } = collectMissing(step)
    if (miss.size > 0 || formatError) {
      setMissing(miss)
      setError(buildErrorMessage(miss, formatError))
      scrollToFirstMissing(miss)
      return
    }
    setMissing(new Set())
    setError(null)
    setStep((s) => Math.min(s + 1, TOTAL_STEPS))
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function goBack() {
    setMissing(new Set())
    setError(null)
    setStep((s) => Math.max(s - 1, 1))
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // 마지막 단계가 아니면 Enter/submit 은 다음 단계로.
    if (step < TOTAL_STEPS) { goNext(); return }

    // 최종 제출 — 전 단계 재검증, 이상 있으면 해당 단계로 이동.
    for (let s = 1; s <= TOTAL_STEPS; s++) {
      const { miss, formatError } = collectMissing(s)
      if (miss.size > 0 || formatError) {
        setStep(s)
        setMissing(miss)
        setError(buildErrorMessage(miss, formatError))
        scrollToFirstMissing(miss)
        return
      }
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

    if (allOk) {
      // 신청 직후 본인 케이스 화면으로. /cases 가 1건이면 그 케이스 /journey 로 자동 redirect.
      router.push('/cases')
    } else {
      setSubmitting(false)
    }
  }

  return (
    <div className={pageShellClass}>
      <div className={pageInnerClass}>
        {/* Header — lang toggle + step progress */}
        <header className="mb-8">
          <div className="mb-5 flex items-baseline justify-end gap-2 font-display text-[11px] uppercase tracking-[1.5px]">
            <button
              type="button"
              onClick={() => setLang('ko')}
              className={cn(
                'transition-colors',
                lang === 'ko' ? 'text-[#2A2620]' : 'text-[#9A9286] hover:text-[#2A2620]',
              )}
              aria-pressed={lang === 'ko'}
            >
              한국어
            </button>
            <span className="text-[#9A9286]/60">·</span>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={cn(
                'transition-colors',
                lang === 'en' ? 'text-[#2A2620]' : 'text-[#9A9286] hover:text-[#2A2620]',
              )}
              aria-pressed={lang === 'en'}
            >
              English
            </button>
          </div>
          <StepProgress step={step} total={TOTAL_STEPS} />
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
          {/* Step 1 · 목적지 */}
          {step === 1 && (
          <section className={sectionCardClass}>
            <div className="flex items-baseline gap-[10px] pb-3 border-b border-[rgba(42,38,32,0.12)] mb-1">
              <h2 className={sectionTitleClass}>{m.sec1}</h2>
            </div>
            <FieldRow m={m} label={m.destination} required fieldKey="destination" missing={missing.has('destination')}>
              <SearchSheetField
                title={m.destination}
                selected={destination ? (DESTS.find(x => x.ko === destination) ?? { ko: destination, en: '' }) : null}
                items={filteredDests}
                query={destQuery}
                onQuery={setDestQuery}
                onPick={(it) => { setDestination(it.ko); setDestQuery(''); setDestSheetOpen(false) }}
                open={destSheetOpen}
                onOpen={() => { setDestQuery(''); setDestSheetOpen(true) }}
                onClose={() => { setDestSheetOpen(false); setDestQuery('') }}
                placeholder={m.destPlaceholder}
                searchPlaceholder={m.destPlaceholder}
                noResults={m.noResults}
                lang={lang}
              />
            </FieldRow>
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
          </section>
          )}

          {/* Step 2 · 소유주 */}
          {step === 2 && (
          <section className={sectionCardClass}>
            <div className="flex items-baseline gap-[10px] pb-3 border-b border-[rgba(42,38,32,0.12)] mb-1">
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
              {(enWarnings.lastNameEn || enWarnings.firstNameEn) && <p className="mt-1.5 text-xs text-[#C26A4A]">{enWarnings.lastNameEn || enWarnings.firstNameEn}</p>}
            </FieldRow>
            <FieldRow m={m} label={m.phone} required fieldKey="phone" missing={missing.has('phone')}>
              <input type="tel" inputMode="numeric" autoComplete="tel"
                value={phone.replace(/(\d{3})(\d{4})(\d{0,4})/, (_, a, b, c) => c ? `${a}-${b}-${c}` : b ? `${a}-${b}` : a)}
                maxLength={13}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 11))}
                placeholder={m.phonePlaceholder} className={numericInputClass} />
            </FieldRow>
            <FieldRow m={m} label={m.addressKr} required fieldKey="addressKr" missing={missing.has('addressKr')}>
              <div className="flex gap-sm items-center">
                <input type="text" autoComplete="off" value={addressKr} onChange={(e) => setAddressKr(e.target.value)}
                  placeholder={m.addressClickToSearch} className={inputClass + ' flex-1 cursor-pointer'} readOnly
                  onFocus={() => { if (!addressKr) handleAddrSearch() }} />
                <button type="button" onClick={handleAddrSearch}
                  className="shrink-0 h-8 rounded-full border border-[rgba(42,38,32,0.12)] bg-transparent px-3 font-display text-[12px] text-[#2A2620] transition-colors hover:bg-[#F0E8DC]">
                  {m.addressSearch}
                </button>
              </div>
              {addressKr && (
                <input ref={addrDetailRef} type="text" autoComplete="address-line2" value={addressDetail} onChange={(e) => setAddressDetail(e.target.value)}
                  placeholder={m.addressDetail}
                  className={inputClass + ' mt-1'} />
              )}
              {addressEn && (
                <p className="mt-1 font-display text-[15px] text-[#2A2620]">{addressEn}</p>
              )}
            </FieldRow>
          </section>
          )}

          {/* Step 3 · 마리수 + 반려동물 (필수) */}
          {step === 3 && (<>
          <section className={sectionCardClass}>
            <div className="flex items-baseline gap-[10px] pb-3 border-b border-[rgba(42,38,32,0.12)] mb-1">
              <h2 className={sectionTitleClass}>{m.sec3}</h2>
            </div>
            <FieldRow m={m} label={m.petCount} required>
              <div className="flex gap-sm">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onClick={() => handlePetCountChange(n)}
                    className={`h-10 w-10 rounded-full border font-display text-sm tabular-nums transition-colors ${petCount === n ? chipButtonActive : chipButtonInactive}`}>
                    {n}
                  </button>
                ))}
              </div>
            </FieldRow>
          </section>

          {/* 반려동물 · 필수 정보 */}
          {pets.map((pet, pi) => (
          <section key={pi} className={sectionCardClass}>
            <div className="flex items-baseline gap-[10px] pb-3 border-b border-[rgba(42,38,32,0.12)] mb-1">
              <h2 className={sectionTitleClass}>
                {pets.length > 1 ? m.petInfoN(pi + 1) : m.petInfo}
              </h2>
            </div>
            <PetFormSection
              part="required"
              pet={pet}
              index={pi}
              updatePet={updatePet}
              enWarnings={enWarnings}
              composingRef={composingRef}
              handleEnInput={handleEnInput}
              handleEnCompositionEnd={handleEnCompositionEnd}
              getFilteredBreeds={getFilteredBreeds}
              missing={missing}
              m={m}
              lang={lang}
            />
          </section>
          ))}
          </>)}

          {/* Step 4 · 추가 정보 (선택) */}
          {step === 4 && (<>
          <div className="px-1 pb-1">
            <p className="font-display text-[15px] text-[#2A2620]">{m.optionalStepTitle}</p>
            <p className="mt-1 font-display text-[13px] text-[#9A9286]/80">{m.optionalHint}</p>
          </div>
          {pets.map((pet, pi) => (
          <section key={pi} className={sectionCardClass}>
            {pets.length > 1 && (
              <div className="flex items-baseline gap-[10px] pb-3 border-b border-[rgba(42,38,32,0.12)] mb-1">
                <h2 className={sectionTitleClass}>{m.petInfoN(pi + 1)}</h2>
              </div>
            )}
            <PetFormSection
              part="optional"
              pet={pet}
              index={pi}
              updatePet={updatePet}
              enWarnings={enWarnings}
              composingRef={composingRef}
              handleEnInput={handleEnInput}
              handleEnCompositionEnd={handleEnCompositionEnd}
              getFilteredBreeds={getFilteredBreeds}
              missing={missing}
              m={m}
              lang={lang}
            />
          </section>
          ))}
          </>)}

          {/* Error */}
          {error && (
            <div className={destructiveBoxClass}>
              {error}
            </div>
          )}

          {/* Navigation — 이전 / 다음 · 마지막 단계는 제출 */}
          <div className="flex gap-sm pt-2">
            {step > 1 && (
              <button type="button" onClick={goBack} className={secondaryButtonClass}>
                {m.back}
              </button>
            )}
            {step < TOTAL_STEPS ? (
              <button type="button" onClick={goNext} className={cn(primaryButtonClass, 'flex-1')}>
                {m.next}
              </button>
            ) : (
              <button type="submit" disabled={submitting} className={cn(primaryButtonClass, 'flex-1')}>
                {submitting ? m.submitting : m.submit}
              </button>
            )}
          </div>

          {step === TOTAL_STEPS && (
            <p className="text-center font-display text-[11px] uppercase tracking-[1.5px] text-[#9A9286] pb-10">
              {m.submitFooter}
            </p>
          )}
        </form>
      </div>

      {/* Daum Postcode Modal */}
      {showAddrModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-[6vh] bg-[#2A2620]/40 backdrop-blur-[2px] sm:items-center sm:py-0 sm:overflow-y-visible" onClick={() => setShowAddrModal(false)}>
          <div className="relative mx-4 w-full max-w-lg overflow-hidden rounded-xl border border-[rgba(42,38,32,0.12)] bg-[#FBF7F1] shadow-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-md py-3 border-b border-[rgba(42,38,32,0.12)]">
              <span className="font-display text-[12px] uppercase tracking-[1.3px] text-[#9A9286]">{m.addressModalTitle}</span>
              <button type="button" onClick={() => setShowAddrModal(false)}
                className="text-[#9A9286] hover:text-[#2A2620] text-lg leading-none">&times;</button>
            </div>
            <div ref={addrModalRef} className="h-[450px]" />
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Pet Form Section (동물정보 + 선택항목) ── */

function PetFormSection({ part, pet, index, updatePet, enWarnings, composingRef, handleEnInput, handleEnCompositionEnd, getFilteredBreeds, missing, m, lang }: {
  part: 'required' | 'optional'
  pet: PetForm
  index: number
  updatePet: (idx: number, field: keyof PetForm, value: PetForm[keyof PetForm]) => void
  enWarnings: Record<string, string | null>
  composingRef: React.RefObject<boolean>
  handleEnInput: (e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void, field: string) => void
  handleEnCompositionEnd: (e: React.CompositionEvent<HTMLInputElement>, setter: (v: string) => void, field: string) => void
  getFilteredBreeds: (pet: PetForm) => Breed[]
  missing: Set<string>
  m: Messages
  lang: Lang
}) {
  const filteredBreeds = getFilteredBreeds(pet)
  const [breedSheetOpen, setBreedSheetOpen] = useState(false)
  const warnKey = (f: string) => `pet${index}_${f}`
  const mk = (f: string) => `pet${index}.${f}`
  const isMissing = (f: string) => missing.has(mk(f))
  const SPECIES = speciesOptions(m)
  const SEX = sexOptions(m)

  return (
    <>
      {part === 'required' && (
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
        {enWarnings[warnKey('en')] && <p className="mt-1.5 text-xs text-[#C26A4A]">{enWarnings[warnKey('en')]}</p>}
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
      <FieldRow m={m} label={m.breed} required fieldKey={mk('breed')} missing={isMissing('breed')}>
        <SearchSheetField
          title={m.breed}
          selected={pet.breed ? { ko: pet.breed, en: pet.breedEn } : null}
          items={filteredBreeds}
          query={pet.breedQuery}
          onQuery={(v) => updatePet(index, 'breedQuery', v)}
          onPick={(it) => { updatePet(index, 'breed', it.ko); updatePet(index, 'breedEn', it.en); updatePet(index, 'breedQuery', ''); setBreedSheetOpen(false) }}
          open={breedSheetOpen}
          onOpen={() => { updatePet(index, 'breedQuery', ''); setBreedSheetOpen(true) }}
          onClose={() => { setBreedSheetOpen(false); updatePet(index, 'breedQuery', '') }}
          placeholder={m.breedPlaceholder}
          searchPlaceholder={m.breedPlaceholder}
          noResults={m.noResults}
          disabled={!pet.species}
          disabledPlaceholder={m.breedSelectSpeciesFirst}
          lang={lang}
        />
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
      </>
      )}

      {part === 'optional' && (
      <>
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
      )}
    </>
  )
}
