'use client'

import { useState } from 'react'
import { applyCase } from '@/lib/actions/apply-case'
import destsData from '@/data/destinations.json'

interface Dest { ko: string; en: string }
const DESTS = destsData as Dest[]

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
  const [customerNameEn, setCustomerNameEn] = useState('')
  const [phone, setPhone] = useState('')
  const [addressKr, setAddressKr] = useState('')
  const [email, setEmail] = useState('')
  const [petName, setPetName] = useState('')
  const [petNameEn, setPetNameEn] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [species, setSpecies] = useState('')
  const [breed, setBreed] = useState('')
  const [color, setColor] = useState('')
  const [sex, setSex] = useState('')
  const [weight, setWeight] = useState('')
  const [microchip, setMicrochip] = useState('')
  const [microchipDate, setMicrochipDate] = useState('')
  const [rabiesDate, setRabiesDate] = useState('')
  const [enWarning, setEnWarning] = useState<string | null>(null)

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
    if (!customerNameEn.trim()) { setError('영문성함을 입력해주세요.'); return }
    if (!phone.trim()) { setError('전화번호를 입력해주세요.'); return }
    if (!addressKr.trim()) { setError('한국주소를 입력해주세요.'); return }
    if (!email.trim()) { setError('이메일을 입력해주세요.'); return }
    if (!petName.trim()) { setError('동물 이름을 입력해주세요.'); return }
    if (!petNameEn.trim()) { setError('동물 영문이름을 입력해주세요.'); return }
    if (!birthDate) { setError('생년월일을 입력해주세요.'); return }
    if (!species) { setError('종을 선택해주세요.'); return }
    if (!breed.trim()) { setError('품종을 입력해주세요.'); return }
    if (!color.trim()) { setError('모색을 입력해주세요.'); return }
    if (!sex) { setError('성별을 선택해주세요.'); return }
    if (!weight.trim()) { setError('몸무게를 입력해주세요.'); return }

    setSubmitting(true)
    const result = await applyCase({
      destination,
      customer_name: customerName.trim(),
      customer_name_en: customerNameEn.trim().toUpperCase(),
      phone: phone.trim(),
      address_kr: addressKr.trim(),
      email: email.trim(),
      pet_name: petName.trim(),
      pet_name_en: petNameEn.trim().toUpperCase(),
      birth_date: birthDate,
      species,
      breed: breed.trim(),
      color: color.trim(),
      sex,
      weight: weight.trim(),
      microchip: microchip.trim() || undefined,
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
              setCustomerName(''); setCustomerNameEn(''); setPhone(''); setAddressKr(''); setEmail('')
              setPetName(''); setPetNameEn(''); setBirthDate(''); setSpecies(''); setBreed('')
              setColor(''); setSex(''); setWeight('')
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

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* 1. 목적지 */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">목적지</h2>
            <div>
              <label className={labelClass}>이동할 국가 <span className="text-red-500">*</span></label>
              {destination ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 h-12 flex items-center rounded-lg border border-gray-300 bg-gray-50 px-4 text-base">
                    {DESTS.find(d => d.ko === destination)?.ko ?? destination} ({DESTS.find(d => d.ko === destination)?.en ?? ''})
                  </span>
                  <button type="button" onClick={() => { setDestination(''); setDestQuery('') }}
                    className="text-sm text-gray-500 hover:text-red-500 px-2">변경</button>
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    value={destQuery}
                    onChange={(e) => setDestQuery(e.target.value)}
                    placeholder="국가명 검색 (예: 일본, Japan)"
                    className={inputClass}
                  />
                  {destQuery && (
                    <ul className="mt-1 rounded-lg border border-gray-200 bg-white max-h-48 overflow-y-auto">
                      {filteredDests.length === 0 ? (
                        <li className="px-4 py-3 text-gray-500 text-sm">검색 결과 없음</li>
                      ) : (
                        filteredDests.slice(0, 10).map(d => (
                          <li key={d.ko}>
                            <button type="button" onClick={() => { setDestination(d.ko); setDestQuery('') }}
                              className="w-full text-left px-4 py-3 text-base hover:bg-blue-50 transition-colors">
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
                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="홍길동" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>영문성함 <span className="text-red-500">*</span> <span className="text-xs font-normal text-gray-400">여권과 동일하게</span></label>
                <input type="text" value={customerNameEn}
                  onChange={(e) => {
                    const raw = e.target.value
                    const filtered = raw.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '')
                    setCustomerNameEn(filtered)
                    if (raw !== filtered) {
                      setEnWarning('영문만 입력 가능합니다')
                      setTimeout(() => setEnWarning(null), 2000)
                    }
                  }}
                  onCompositionEnd={(e) => {
                    const raw = (e.target as HTMLInputElement).value
                    const filtered = raw.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '')
                    setCustomerNameEn(filtered)
                    if (raw !== filtered) {
                      setEnWarning('영문만 입력 가능합니다')
                      setTimeout(() => setEnWarning(null), 2000)
                    }
                  }}
                  placeholder="HONG GILDONG" className={inputClass} />
                {enWarning && <p className="mt-1 text-xs text-red-500">{enWarning}</p>}
              </div>
              <div>
                <label className={labelClass}>전화번호 <span className="text-red-500">*</span></label>
                <input type="tel" inputMode="numeric" value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="01012345678" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>한국주소 <span className="text-red-500">*</span></label>
                <input type="text" value={addressKr} onChange={(e) => setAddressKr(e.target.value)}
                  placeholder="서울시 강남구 테헤란로 123" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>이메일 <span className="text-red-500">*</span></label>
                <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)}
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
                <input type="text" value={petName} onChange={(e) => setPetName(e.target.value)}
                  placeholder="마루" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>동물 영문이름 <span className="text-red-500">*</span></label>
                <input type="text" value={petNameEn}
                  onChange={(e) => {
                    const raw = e.target.value
                    const filtered = raw.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '')
                    setPetNameEn(filtered)
                    if (raw !== filtered) {
                      setEnWarning('영문만 입력 가능합니다')
                      setTimeout(() => setEnWarning(null), 2000)
                    }
                  }}
                  onCompositionEnd={(e) => {
                    const raw = (e.target as HTMLInputElement).value
                    const filtered = raw.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '')
                    setPetNameEn(filtered)
                    if (raw !== filtered) {
                      setEnWarning('영문만 입력 가능합니다')
                      setTimeout(() => setEnWarning(null), 2000)
                    }
                  }}
                  placeholder="MARU" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>생년월일 <span className="text-red-500">*</span></label>
                <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
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
                <input type="text" value={breed} onChange={(e) => setBreed(e.target.value)}
                  placeholder="골든 리트리버" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>모색 <span className="text-red-500">*</span></label>
                <input type="text" value={color} onChange={(e) => setColor(e.target.value)}
                  placeholder="갈색" className={inputClass} />
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
                  placeholder="5.2" className={inputClass} />
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
                <input type="text" inputMode="numeric" value={microchip}
                  onChange={(e) => setMicrochip(e.target.value.replace(/[^\d\s]/g, ''))}
                  placeholder="15자리 숫자" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>마이크로칩 삽입일</label>
                <input type="date" value={microchipDate} onChange={(e) => setMicrochipDate(e.target.value)}
                  className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>최근 광견병 접종일 (1년 이내)</label>
                <input type="date" value={rabiesDate} onChange={(e) => setRabiesDate(e.target.value)}
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
    </div>
  )
}
