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
]

const SEX_OPTIONS = [
  { value: 'spayed_female', label: '중성화 암컷' },
  { value: 'neutered_male', label: '중성화 수컷' },
  { value: 'female', label: '암컷' },
  { value: 'male', label: '수컷' },
]

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
  'mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8'
const heroCardClass = cn(cardContainer, 'p-md')
const sectionCardClass = cn(cardContainer, 'p-md')
const sectionTitleClass =
  'text-base font-semibold text-primary mb-4 pb-3 border-b border-border/60'
const inputClass =
  'w-full h-10 rounded-md border border-border bg-card px-3 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors'
const selectClass =
  'w-full h-10 rounded-md border border-border bg-card px-3 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none transition-colors'
const labelClass =
  'block text-sm font-medium text-primary mb-1.5'
const surfaceButtonClass =
  'inline-flex h-10 items-center rounded-md border border-border bg-card px-3 text-[15px] text-foreground transition-colors hover:bg-accent'
const chipButtonActive =
  'border-[#3FB39D] bg-[#3FB39D] text-white'
const chipButtonInactive =
  'border-border bg-card text-foreground hover:bg-accent'
const dropdownClass =
  'mt-1 rounded-md border border-border/60 bg-card shadow-sm'
const dropdownRowClass =
  'w-full text-left px-md py-2.5 text-[15px] transition-colors hover:bg-accent'
const dropdownRowActiveClass = 'bg-accent'
const destructiveBoxClass =
  'rounded-md border border-destructive/20 bg-destructive/10 px-md py-2.5 text-sm text-destructive'
const primaryButtonClass = cn(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors',
  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
  'disabled:pointer-events-none disabled:opacity-50 select-none',
  'w-full h-12 text-base',
  'bg-[#3FB39D] text-white hover:bg-[#369C89]',
)

export default function ApplyPage() {
  const [step, setStep] = useState(0) // 0=form, 1=done
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setError(null)

    // Validation
    if (!destination) { setError('목적지를 선택해주세요.'); return }
    if (!customerName.trim()) { setError('성함을 입력해주세요.'); return }
    if (!customerLastNameEn.trim() || !customerFirstNameEn.trim()) { setError('영문 성과 이름을 모두 입력해주세요.'); return }
    if (!phone.trim()) { setError('전화번호를 입력해주세요.'); return }
    if (phone.length < 10 || phone.length > 11) { setError('전화번호는 10~11자리로 입력해주세요.'); return }
    if (!addressKr.trim()) { setError('한국주소를 입력해주세요.'); return }
    if (!email.trim()) { setError('이메일을 입력해주세요.'); return }
    for (let i = 0; i < pets.length; i++) {
      const p = pets[i]
      const label = pets.length > 1 ? `반려동물 ${i + 1}: ` : ''
      if (!p.petName.trim()) { setError(`${label}이름을 입력해주세요.`); return }
      if (!p.petNameEn.trim()) { setError(`${label}영문이름을 입력해주세요.`); return }
      if (!p.birthDate) { setError(`${label}생년월일을 입력해주세요.`); return }
      if (!p.species) { setError(`${label}종을 선택해주세요.`); return }
      if (!p.breed.trim()) { setError(`${label}품종을 선택해주세요.`); return }
      if (p.selectedColors.length === 0) { setError(`${label}모색을 선택해주세요.`); return }
      if (!p.sex) { setError(`${label}성별을 선택해주세요.`); return }
      if (!p.weight.trim()) { setError(`${label}몸무게를 입력해주세요.`); return }
      if (p.microchip && p.microchip.length !== 15) { setError(`${label}마이크로칩 번호는 15자리 숫자여야 합니다.`); return }
    }

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
        microchip: p.microchip.replace(/\D/g, '') || undefined,
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
        <div className={cn(heroCardClass, 'mx-auto w-full max-w-md text-center py-16')}>
          <div className="text-5xl mb-4">&#10003;</div>
          <h1 className="text-xl font-semibold text-primary mb-2">신청이 완료되었습니다</h1>
          <p className="text-sm text-muted-foreground mb-8">
            담당자가 확인 후 연락드리겠습니다.<br />
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
            className="text-sm text-primary hover:underline"
          >
            새 신청하기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={pageShellClass}>
      <div className={pageInnerClass}>
        {/* Header */}
        <div className={cn(heroCardClass, 'mb-md text-center')}>
          <h1 className="text-xl font-semibold tracking-tight text-[#2D8A78]">펫무브 등록 신청서</h1>
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
          <section className={cn(sectionCardClass, 'space-y-4')}>
            <h2 className={sectionTitleClass}>어디로 가시나요?</h2>
            <div>
              <label className={labelClass}>목적지 <span className="text-red-500">*</span></label>
              {destination ? (
                <button type="button" onClick={() => { setDestination(''); setDestQuery('') }}
                  className={cn(surfaceButtonClass, 'w-full cursor-pointer justify-between')}>
                  <span>{DESTS.find(d => d.ko === destination)?.ko ?? destination}</span>
                  <span className="ml-2 text-muted-foreground">({DESTS.find(d => d.ko === destination)?.en ?? ''})</span>
                </button>
              ) : (
                <div>
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
                    placeholder="국가명 검색 (예: 일본, Japan)"
                    className={inputClass}
                  />
                  {destQuery && (
                    <ul className={cn(dropdownClass, 'max-h-48 overflow-y-auto')}>
                      {filteredDests.length === 0 ? (
                        <li className="px-md py-3 text-sm text-muted-foreground">검색 결과 없음</li>
                      ) : (
                        filteredDests.slice(0, 10).map((d, i) => (
                          <li key={d.ko}>
                            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setDestination(d.ko); setDestQuery(''); setDestHighlight(-1) }}
                              className={cn(dropdownRowClass, i === destHighlight && dropdownRowActiveClass)}>
                              {d.ko} <span className="text-muted-foreground">{d.en}</span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* 2. 소유주 */}
          <section className={cn(sectionCardClass, 'space-y-4')}>
            <h2 className={sectionTitleClass}>소유주 정보</h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>성함 <span className="text-red-500">*</span></label>
                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value.replace(/\b[a-z]/g, c => c.toUpperCase()))}
                  placeholder="홍길동" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>영문성함 <span className="text-red-500">*</span></label>
                <div className="flex gap-sm">
                  <input type="text" value={customerLastNameEn}
                    onCompositionStart={() => { composingRef.current = true }}
                    onChange={(e) => handleEnInput(e, setCustomerLastNameEn, 'lastNameEn')}
                    onCompositionEnd={(e) => handleEnCompositionEnd(e, setCustomerLastNameEn, 'lastNameEn')}
                    placeholder="성 (Hong)" className={inputClass + ' flex-1'} />
                  <input type="text" value={customerFirstNameEn}
                    onCompositionStart={() => { composingRef.current = true }}
                    onChange={(e) => handleEnInput(e, setCustomerFirstNameEn, 'firstNameEn')}
                    onCompositionEnd={(e) => handleEnCompositionEnd(e, setCustomerFirstNameEn, 'firstNameEn')}
                    placeholder="이름 (Gildong)" className={inputClass + ' flex-1'} />
                </div>
                {(enWarnings.lastNameEn || enWarnings.firstNameEn) && <p className="mt-1 text-xs text-red-500">{enWarnings.lastNameEn || enWarnings.firstNameEn}</p>}
              </div>
              <div>
                <label className={labelClass}>전화번호 <span className="text-red-500">*</span></label>
                <input type="tel" inputMode="numeric"
                  value={phone.replace(/(\d{3})(\d{4})(\d{0,4})/, (_, a, b, c) => c ? `${a}-${b}-${c}` : b ? `${a}-${b}` : a)}
                  maxLength={13}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, '').slice(0, 11))}
                  placeholder="010-1234-5678" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>한국주소 <span className="text-red-500">*</span></label>
                <div className="flex gap-sm">
                  <input type="text" value={addressKr} onChange={(e) => setAddressKr(e.target.value)}
                    placeholder="클릭하여 주소 검색" className={inputClass + ' flex-1 cursor-pointer'} readOnly
                    onFocus={() => { if (!addressKr) handleAddrSearch() }} />
                  <button type="button" onClick={handleAddrSearch}
                    className="shrink-0 h-10 rounded-md border border-border bg-card px-md text-sm font-medium text-foreground transition-colors hover:bg-accent">
                    주소 검색
                  </button>
                </div>
                {addressKr && (
                  <input ref={addrDetailRef} type="text" value={addressDetail} onChange={(e) => setAddressDetail(e.target.value)}
                    placeholder="상세주소 (동/호수 등)"
                    className={inputClass + ' mt-2'} />
                )}
                {addressEn && (
                  <p className="mt-1 text-xs text-muted-foreground">{addressEn}</p>
                )}
              </div>
              <div>
                <label className={labelClass}>이메일 주소 <span className="text-red-500">*</span></label>
                <input type="email" inputMode="email" value={email}
                  onChange={(e) => setEmail(e.target.value.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣A-Z]/g, (c) => c >= 'A' && c <= 'Z' ? c.toLowerCase() : ''))}
                  onCompositionEnd={(e) => setEmail((e.target as HTMLInputElement).value.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '').toLowerCase())}
                  placeholder="example@email.com" className={inputClass} />
              </div>
            </div>
          </section>

          {/* 마리 수 선택 */}
          <section className={cn(sectionCardClass, 'space-y-4')}>
            <h2 className={sectionTitleClass}>동반 마리수</h2>
            <div className="flex gap-sm">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" onClick={() => handlePetCountChange(n)}
                  className={`h-10 w-10 rounded-full border text-sm font-medium transition-colors ${petCount === n ? chipButtonActive : chipButtonInactive}`}>
                  {n}
                </button>
              ))}
            </div>
          </section>

          {/* 3. 반려동물 (반복) */}
          {pets.map((pet, pi) => (
          <section key={pi} className={cn(sectionCardClass, 'space-y-4')}>
            <h2 className={sectionTitleClass}>
              {pets.length > 1 ? `반려동물 정보 ${pi + 1}` : '반려동물 정보'}
            </h2>
            <PetFormSection
              pet={pet}
              index={pi}
              updatePet={updatePet}
              enWarnings={enWarnings}
              showEnWarning={showEnWarning}
              composingRef={composingRef}
              handleEnInput={handleEnInput}
              handleEnCompositionEnd={handleEnCompositionEnd}
              breedHighlight={breedHighlights[pi] ?? -1}
              setBreedHighlight={(h: number) => setBreedHighlights(prev => ({ ...prev, [pi]: h }))}
              getFilteredBreeds={getFilteredBreeds}
              inputClass={inputClass}
              labelClass={labelClass}
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
          <button
            type="submit"
            disabled={submitting}
            className={primaryButtonClass}
          >
            {submitting ? '제출 중...' : '정보 등록'}
          </button>

          <p className="text-center text-xs text-muted-foreground pb-8">
            등록하신 정보는 서류 발급에 사용됩니다.
          </p>
        </form>
      </div>

      {/* Daum Postcode Modal */}
      {showAddrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddrModal(false)}>
          <div className={cn(cardContainer, 'relative mx-4 w-full max-w-lg overflow-hidden p-0')} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-md py-3 border-b border-border/60">
              <span className="text-sm font-medium text-primary">주소 검색</span>
              <button type="button" onClick={() => setShowAddrModal(false)}
                className="text-muted-foreground hover:text-foreground text-lg">&times;</button>
            </div>
            <div ref={addrModalRef} className="h-[450px]" />
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Pet Form Section (동물정보 + 선택항목) ── */

function PetFormSection({ pet, index, updatePet, enWarnings, showEnWarning, composingRef, handleEnInput, handleEnCompositionEnd, breedHighlight, setBreedHighlight, getFilteredBreeds, inputClass, labelClass }: {
  pet: PetForm
  index: number
  updatePet: (idx: number, field: keyof PetForm, value: PetForm[keyof PetForm]) => void
  enWarnings: Record<string, string | null>
  showEnWarning: (field: string, msg: string) => void
  composingRef: React.RefObject<boolean>
  handleEnInput: (e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void, field: string) => void
  handleEnCompositionEnd: (e: React.CompositionEvent<HTMLInputElement>, setter: (v: string) => void, field: string) => void
  breedHighlight: number
  setBreedHighlight: (h: number) => void
  getFilteredBreeds: (pet: PetForm) => Breed[]
  inputClass: string
  labelClass: string
}) {
  const filteredBreeds = getFilteredBreeds(pet)
  const warnKey = (f: string) => `pet${index}_${f}`

  return (
    <div className="space-y-4">
      {/* 이름 */}
      <div>
        <label className={labelClass}>이름 <span className="text-red-500">*</span></label>
        <input type="text" value={pet.petName} onChange={(e) => updatePet(index, 'petName', e.target.value.replace(/\b[a-z]/g, c => c.toUpperCase()))}
          placeholder="마루" className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>영문이름 <span className="text-red-500">*</span></label>
        <input type="text" value={pet.petNameEn}
          onCompositionStart={() => { composingRef.current = true }}
          onChange={(e) => handleEnInput(e, (v) => updatePet(index, 'petNameEn', v), warnKey('en'))}
          onCompositionEnd={(e) => handleEnCompositionEnd(e, (v) => updatePet(index, 'petNameEn', v), warnKey('en'))}
          placeholder="Maru" className={inputClass} />
        {enWarnings[warnKey('en')] && <p className="mt-1 text-xs text-red-500">{enWarnings[warnKey('en')]}</p>}
      </div>

      {/* 생년월일 */}
      <div>
        <label className={labelClass}>생년월일 <span className="text-red-500">*</span></label>
        <DateTextField
          value={pet.birthDate}
          onChange={(v) => updatePet(index, 'birthDate', v)}
          placeholder="YYYY-MM-DD"
          className={inputClass}
        />
      </div>

      {/* 종 */}
      <div>
        <label className={labelClass}>종 <span className="text-red-500">*</span></label>
        <div className="flex flex-wrap gap-sm">
          {SPECIES_OPTIONS.map(o => (
            <button key={o.value} type="button"
              onClick={() => { updatePet(index, 'species', o.value); if (pet.breed) { updatePet(index, 'breed', ''); updatePet(index, 'breedEn', ''); updatePet(index, 'breedQuery', '') } }}
              className={`h-10 px-5 rounded-full border text-sm font-medium transition-colors ${pet.species === o.value ? chipButtonActive : chipButtonInactive}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* 품종 */}
      <div>
        <label className={labelClass}>품종 <span className="text-red-500">*</span></label>
        {pet.breed ? (
          <button type="button" onClick={() => { updatePet(index, 'breed', ''); updatePet(index, 'breedEn', ''); updatePet(index, 'breedQuery', '') }}
            className={cn(surfaceButtonClass, 'w-full cursor-pointer justify-between')}>
            <span>{pet.breed}</span> <span className="ml-2 text-muted-foreground">{pet.breedEn}</span>
          </button>
        ) : (
          <div>
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
              placeholder={pet.species ? '품종 검색 (예: 말티즈, Maltese)' : '종을 먼저 선택해주세요'}
              disabled={!pet.species} className={inputClass} />
            {pet.breedQuery && filteredBreeds.length > 0 && (
            <ul className={cn(dropdownClass, 'max-h-48 overflow-y-auto')}>
                {filteredBreeds.slice(0, 10).map((b, i) => (
                  <li key={`${b.type}:${b.en}`}>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { updatePet(index, 'breed', b.ko); updatePet(index, 'breedEn', b.en); updatePet(index, 'breedQuery', ''); setBreedHighlight(-1) }}
                      className={cn(dropdownRowClass, i === breedHighlight && dropdownRowActiveClass)}>
                      {b.ko} <span className="text-muted-foreground">{b.en}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {pet.breedQuery && filteredBreeds.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">검색 결과 없음</p>
            )}
          </div>
        )}
      </div>

      {/* 모색 */}
      <div>
        <label className={labelClass}>모색 <span className="text-red-500">*</span> <span className="text-xs font-normal text-muted-foreground">가장 유사한 색상을 최대 3개까지 골라주세요</span></label>
        <div className="flex flex-wrap gap-sm">
          {COLORS.map(c => {
            const selected = pet.selectedColors.includes(c.ko)
            return (
              <button key={c.ko} type="button"
                onClick={() => {
                  if (selected) updatePet(index, 'selectedColors', pet.selectedColors.filter(v => v !== c.ko))
                  else if (pet.selectedColors.length < 3) updatePet(index, 'selectedColors', [...pet.selectedColors, c.ko])
                }}
                className={`h-10 px-md rounded-full border text-sm font-medium transition-colors ${selected ? chipButtonActive : chipButtonInactive} ${!selected && pet.selectedColors.length >= 3 ? 'opacity-40 cursor-not-allowed' : ''}`}>
                {c.ko}
              </button>
            )
          })}
        </div>
      </div>

      {/* 성별 */}
      <div>
        <label className={labelClass}>성별 <span className="text-red-500">*</span></label>
        <div className="flex flex-wrap gap-sm">
          {SEX_OPTIONS.map(o => (
            <button key={o.value} type="button"
              onClick={() => updatePet(index, 'sex', o.value)}
              className={`h-10 px-md rounded-full border text-sm font-medium transition-colors ${pet.sex === o.value ? chipButtonActive : chipButtonInactive}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* 몸무게 */}
      <div>
        <label className={labelClass}>몸무게 (kg) <span className="text-red-500">*</span></label>
        <input type="text" inputMode="decimal" value={pet.weight}
          onChange={(e) => updatePet(index, 'weight', e.target.value.replace(/[^\d.]/g, ''))}
          placeholder="5" className={inputClass} />
      </div>

      {/* 선택: 마이크로칩 */}
      <div className="pt-2 mt-2 border-t border-gray-100">
        <p className="text-xs text-muted-foreground mb-3">아시는 경우 작성해주세요</p>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>마이크로칩 번호</label>
            <input type="text" inputMode="numeric"
              value={pet.microchip.replace(/(\d{3})(?=\d)/g, '$1 ')}
              onChange={(e) => updatePet(index, 'microchip', e.target.value.replace(/\D/g, '').slice(0, 15))}
              placeholder="000 000 000 000 000" maxLength={19} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>마이크로칩 삽입일</label>
            <DateTextField
              value={pet.microchipDate}
              onChange={(v) => updatePet(index, 'microchipDate', v)}
              placeholder="YYYY-MM-DD"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>최근 광견병 접종일 (1년 이내)</label>
            <DateTextField
              value={pet.rabiesDate}
              onChange={(v) => updatePet(index, 'rabiesDate', v)}
              placeholder="YYYY-MM-DD"
              className={inputClass}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
