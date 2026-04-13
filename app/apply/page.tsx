'use client'

import { useState, useEffect, useRef } from 'react'
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
  { value: 'male', label: '수컷' },
  { value: 'female', label: '암컷' },
  { value: 'neutered_male', label: '중성화 수컷' },
  { value: 'spayed_female', label: '중성화 암컷' },
]

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
  const [petName, setPetName] = useState('')
  const [petNameEn, setPetNameEn] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [species, setSpecies] = useState('')
  const [breed, setBreed] = useState('')      // ko
  const [breedEn, setBreedEn] = useState('')  // en
  const [breedQuery, setBreedQuery] = useState('')
  const [selectedColors, setSelectedColors] = useState<string[]>([]) // ko values
  const [sex, setSex] = useState('')
  const [weight, setWeight] = useState('')
  const [microchip, setMicrochip] = useState('')
  const [microchipDate, setMicrochipDate] = useState('')
  const [rabiesDate, setRabiesDate] = useState('')
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
  const [breedHighlight, setBreedHighlight] = useState(-1)

  const filteredBreeds = BREEDS.filter(b => {
    if (species && b.type !== species) return false
    if (!breedQuery.trim()) return false
    const q = breedQuery.toLowerCase()
    return b.ko.includes(q) || b.en.toLowerCase().includes(q) || b.alias?.some(a => a.toLowerCase().includes(q))
  })

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
    if (!petName.trim()) { setError('동물 이름을 입력해주세요.'); return }
    if (!petNameEn.trim()) { setError('동물 영문이름을 입력해주세요.'); return }
    if (!birthDate) { setError('생년월일을 입력해주세요.'); return }
    if (!species) { setError('종을 선택해주세요.'); return }
    if (!breed.trim()) { setError('품종을 선택해주세요.'); return }
    if (selectedColors.length === 0) { setError('모색을 선택해주세요.'); return }
    if (!sex) { setError('성별을 선택해주세요.'); return }
    if (!weight.trim()) { setError('몸무게를 입력해주세요.'); return }
    if (microchip && microchip.length !== 15) { setError('마이크로칩 번호는 15자리 숫자여야 합니다.'); return }

    setSubmitting(true)
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
      pet_name: petName.trim(),
      pet_name_en: capitalize(petNameEn.trim()),
      birth_date: birthDate,
      species,
      breed: breed.trim(),
      breed_en: breedEn.trim(),
      color: selectedColors.map(ko => COLORS.find(c => c.ko === ko)?.ko ?? ko).join(', '),
      color_en: selectedColors.map(ko => COLORS.find(c => c.ko === ko)?.en ?? ko).join(', '),
      sex,
      weight: weight.trim(),
      microchip: microchip.replace(/\D/g, '') || undefined,
      microchip_implant_date: microchipDate || undefined,
      rabies_date: rabiesDate || undefined,
    })
    setSubmitting(false)

    if (result.ok) {
      setStep(1)
    } else {
      setError(result.error)
    }
  }

  if (step === 1) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md text-center py-16">
          <div className="text-5xl mb-4">&#10003;</div>
          <h1 className="text-2xl font-bold mb-2">신청이 완료되었습니다</h1>
          <p className="text-gray-600 mb-8">
            담당자가 확인 후 연락드리겠습니다.<br />
            감사합니다.
          </p>
          <button
            type="button"
            onClick={() => {
              setStep(0)
              setDestination(''); setDestQuery('')
              setCustomerName(''); setCustomerLastNameEn(''); setCustomerFirstNameEn(''); setPhone(''); setAddressKr(''); setAddressDetail(''); setAddressEn(''); setEmail('')
              setPetName(''); setPetNameEn(''); setBirthDate(''); setSpecies(''); setBreed(''); setBreedEn(''); setBreedQuery('')
              setSelectedColors([]); setSex(''); setWeight('')
              setMicrochip(''); setMicrochipDate(''); setRabiesDate('')
            }}
            className="text-sm text-blue-600 hover:underline"
          >
            새 신청하기
          </button>
        </div>
      </div>
    )
  }

  const inputClass = 'w-full h-12 rounded-lg border border-gray-300 bg-white px-4 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
  const selectClass = 'w-full h-12 rounded-lg border border-gray-300 bg-white px-4 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none'
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-lg mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">PetMove</h1>
          <p className="text-gray-500 mt-1">반려동물 해외이동 신청</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            const target = e.target as HTMLElement
            // submit 버튼에서 Enter는 제출 허용
            if (target.tagName === 'BUTTON' && (target as HTMLButtonElement).type === 'submit') return
            // 검색 드롭다운에서 Enter는 선택 로직에서 처리
            if (target.tagName === 'BUTTON') return
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
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">목적지</h2>
            <div>
              <label className={labelClass}>이동할 국가 <span className="text-red-500">*</span></label>
              {destination ? (
                <button type="button" onClick={() => { setDestination(''); setDestQuery('') }}
                  className="w-full h-12 flex items-center rounded-lg border border-gray-300 bg-gray-50 px-4 text-base text-left hover:bg-gray-100 transition-colors cursor-pointer">
                  {DESTS.find(d => d.ko === destination)?.ko ?? destination} <span className="text-gray-400 ml-1">({DESTS.find(d => d.ko === destination)?.en ?? ''})</span>
                </button>
              ) : (
                <div>
                  <input
                    type="text"
                    value={destQuery}
                    onChange={(e) => { setDestQuery(e.target.value); setDestHighlight(-1) }}
                    onKeyDown={(e) => {
                      const items = filteredDests.slice(0, 10)
                      if (e.key === 'ArrowDown') { e.preventDefault(); setDestHighlight(h => Math.min(h + 1, items.length - 1)) }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setDestHighlight(h => Math.max(h - 1, 0)) }
                      if (e.key === 'Enter' && destHighlight >= 0 && items[destHighlight]) {
                        e.preventDefault(); setDestination(items[destHighlight].ko); setDestQuery(''); setDestHighlight(-1)
                      }
                    }}
                    placeholder="국가명 검색 (예: 일본, Japan)"
                    className={inputClass}
                  />
                  {destQuery && (
                    <ul className="mt-1 rounded-lg border border-gray-200 bg-white max-h-48 overflow-y-auto">
                      {filteredDests.length === 0 ? (
                        <li className="px-4 py-3 text-gray-500 text-sm">검색 결과 없음</li>
                      ) : (
                        filteredDests.slice(0, 10).map((d, i) => (
                          <li key={d.ko}>
                            <button type="button" onClick={() => { setDestination(d.ko); setDestQuery(''); setDestHighlight(-1) }}
                              className={`w-full text-left px-4 py-3 text-base transition-colors ${i === destHighlight ? 'bg-blue-50' : 'hover:bg-blue-50'}`}>
                              {d.ko} <span className="text-gray-400">{d.en}</span>
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

          {/* 2. 고객정보 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">고객정보</h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>성함 <span className="text-red-500">*</span></label>
                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value.replace(/\b[a-z]/g, c => c.toUpperCase()))}
                  placeholder="홍길동" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>영문성함 <span className="text-red-500">*</span> <span className="text-xs font-normal text-gray-400">여권과 동일하게</span></label>
                <div className="flex gap-2">
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
                <div className="flex gap-2">
                  <input type="text" value={addressKr} onChange={(e) => setAddressKr(e.target.value)}
                    placeholder="클릭하여 주소 검색" className={inputClass + ' flex-1 cursor-pointer'} readOnly
                    onFocus={() => { if (!addressKr) handleAddrSearch() }} />
                  <button type="button" onClick={handleAddrSearch}
                    className="shrink-0 h-12 px-4 rounded-lg bg-gray-100 border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors">
                    주소 검색
                  </button>
                </div>
                {addressKr && (
                  <input ref={addrDetailRef} type="text" value={addressDetail} onChange={(e) => setAddressDetail(e.target.value)}
                    placeholder="상세주소 (동/호수 등)"
                    className={inputClass + ' mt-2'} />
                )}
                {addressEn && (
                  <p className="mt-1 text-xs text-gray-500">{addressEn}</p>
                )}
              </div>
              <div>
                <label className={labelClass}>이메일 <span className="text-red-500">*</span></label>
                <input type="email" inputMode="email" value={email}
                  onChange={(e) => setEmail(e.target.value.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣A-Z]/g, (c) => c >= 'A' && c <= 'Z' ? c.toLowerCase() : ''))}
                  onCompositionEnd={(e) => setEmail((e.target as HTMLInputElement).value.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '').toLowerCase())}
                  placeholder="example@email.com" className={inputClass} />
              </div>
            </div>
          </section>

          {/* 3. 동물정보 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">동물정보</h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>동물 이름 <span className="text-red-500">*</span></label>
                <input type="text" value={petName} onChange={(e) => setPetName(e.target.value.replace(/\b[a-z]/g, c => c.toUpperCase()))}
                  placeholder="마루" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>동물 영문이름 <span className="text-red-500">*</span></label>
                <input type="text" value={petNameEn}
                  onCompositionStart={() => { composingRef.current = true }}
                  onChange={(e) => handleEnInput(e, setPetNameEn, 'petNameEn')}
                  onCompositionEnd={(e) => handleEnCompositionEnd(e, setPetNameEn, 'petNameEn')}
                  placeholder="Maru" className={inputClass} />
                {enWarnings.petNameEn && <p className="mt-1 text-xs text-red-500">{enWarnings.petNameEn}</p>}
              </div>
              <div>
                <label className={labelClass}>생년월일 <span className="text-red-500">*</span></label>
                <input type="date" min="1900-01-01" max="2100-12-31"
                  defaultValue={birthDate}
                  onChange={(e) => {
                    const v = e.target.value
                    if (!v) { setBirthDate(''); return }
                    const year = parseInt(v.split('-')[0], 10)
                    if (year >= 1900 && year <= 2100) setBirthDate(v)
                  }}
                  className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>종 <span className="text-red-500">*</span></label>
                <select value={species} onChange={(e) => setSpecies(e.target.value)} className={selectClass}>
                  <option value="">선택</option>
                  {SPECIES_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>품종 <span className="text-red-500">*</span></label>
                {breed ? (
                  <button type="button" onClick={() => { setBreed(''); setBreedEn(''); setBreedQuery('') }}
                    className="w-full h-12 flex items-center rounded-lg border border-gray-300 bg-gray-50 px-4 text-base text-left hover:bg-gray-100 transition-colors cursor-pointer">
                    {breed} <span className="text-gray-400 ml-1">{breedEn}</span>
                  </button>
                ) : (
                  <div>
                    <input type="text" value={breedQuery}
                      onChange={(e) => { setBreedQuery(e.target.value); setBreedHighlight(-1) }}
                      onKeyDown={(e) => {
                        const items = filteredBreeds.slice(0, 10)
                        if (e.key === 'ArrowDown') { e.preventDefault(); setBreedHighlight(h => Math.min(h + 1, items.length - 1)) }
                        if (e.key === 'ArrowUp') { e.preventDefault(); setBreedHighlight(h => Math.max(h - 1, 0)) }
                        if (e.key === 'Enter' && breedHighlight >= 0 && items[breedHighlight]) {
                          e.preventDefault(); setBreed(items[breedHighlight].ko); setBreedEn(items[breedHighlight].en); setBreedQuery(''); setBreedHighlight(-1)
                        }
                      }}
                      placeholder={species ? '품종 검색 (예: 말티즈, Maltese)' : '종을 먼저 선택해주세요'}
                      disabled={!species} className={inputClass} />
                    {breedQuery && filteredBreeds.length > 0 && (
                      <ul className="mt-1 rounded-lg border border-gray-200 bg-white max-h-48 overflow-y-auto">
                        {filteredBreeds.slice(0, 10).map((b, i) => (
                          <li key={`${b.type}:${b.en}`}>
                            <button type="button" onClick={() => { setBreed(b.ko); setBreedEn(b.en); setBreedQuery(''); setBreedHighlight(-1) }}
                              className={`w-full text-left px-4 py-3 text-base transition-colors ${i === breedHighlight ? 'bg-blue-50' : 'hover:bg-blue-50'}`}>
                              {b.ko} <span className="text-gray-400">{b.en}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {breedQuery && filteredBreeds.length === 0 && (
                      <p className="mt-1 text-xs text-gray-500">검색 결과 없음 — 정확한 품종명을 입력해주세요</p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className={labelClass}>모색 <span className="text-red-500">*</span> <span className="text-xs font-normal text-gray-400">최대 3개</span></label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map(c => {
                    const selected = selectedColors.includes(c.ko)
                    return (
                      <button key={c.ko} type="button"
                        onClick={() => {
                          if (selected) setSelectedColors(prev => prev.filter(v => v !== c.ko))
                          else if (selectedColors.length < 3) setSelectedColors(prev => [...prev, c.ko])
                        }}
                        className={`h-10 px-4 rounded-lg border text-sm font-medium transition-colors ${selected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'} ${!selected && selectedColors.length >= 3 ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        {c.ko}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className={labelClass}>성별 <span className="text-red-500">*</span></label>
                <select value={sex} onChange={(e) => setSex(e.target.value)} className={selectClass}>
                  <option value="">선택</option>
                  {SEX_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>몸무게 (kg) <span className="text-red-500">*</span></label>
                <input type="text" inputMode="decimal" value={weight}
                  onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder="5" className={inputClass} />
              </div>
            </div>
          </section>

          {/* 4. 선택 항목 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">추가정보 <span className="text-sm font-normal text-gray-400">(선택)</span></h2>
            <p className="text-sm text-gray-500 mb-4">모르시는 항목은 비워두셔도 됩니다.</p>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>마이크로칩 번호</label>
                <input type="text" inputMode="numeric"
                  value={microchip.replace(/(\d{3})(?=\d)/g, '$1 ')}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 15)
                    setMicrochip(digits)
                  }}
                  placeholder="000 000 000 000 000" maxLength={19} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>마이크로칩 삽입일</label>
                <input type="date" min="1900-01-01" max="2100-12-31"
                  defaultValue={microchipDate}
                  onChange={(e) => {
                    const v = e.target.value
                    if (!v) { setMicrochipDate(''); return }
                    const year = parseInt(v.split('-')[0], 10)
                    if (year >= 1900 && year <= 2100) setMicrochipDate(v)
                  }}
                  className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>최근 광견병 접종일 (1년 이내)</label>
                <input type="date" min="1900-01-01" max="2100-12-31"
                  defaultValue={rabiesDate}
                  onChange={(e) => {
                    const v = e.target.value
                    if (!v) { setRabiesDate(''); return }
                    const year = parseInt(v.split('-')[0], 10)
                    if (year >= 1900 && year <= 2100) setRabiesDate(v)
                  }}
                  className={inputClass} />
              </div>
            </div>
          </section>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full h-14 rounded-lg bg-blue-600 text-white text-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '제출 중...' : '신청하기'}
          </button>

          <p className="text-center text-xs text-gray-400 pb-8">
            제출하신 정보는 반려동물 해외이동 준비에만 사용됩니다.
          </p>
        </form>
      </div>

      {/* Daum Postcode Modal */}
      {showAddrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddrModal(false)}>
          <div className="relative w-full max-w-lg mx-4 bg-white rounded-xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="text-sm font-medium">주소 검색</span>
              <button type="button" onClick={() => setShowAddrModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
            </div>
            <div ref={addrModalRef} className="h-[450px]" />
          </div>
        </div>
      )}
    </div>
  )
}
