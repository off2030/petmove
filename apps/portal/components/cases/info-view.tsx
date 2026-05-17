'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import type { CaseRow } from '@petmove/domain'
import { buildCaseJourneyContext } from '@petmove/domain'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { updateCaseInfoFields, type CaseInfoInput } from '@/lib/actions/cases'
import {
  DateField,
  DestinationField,
  OptionField,
  SegmentField,
  TextField,
  type FieldOption,
} from '@/components/fields/info-fields'

/**
 * 케이스 정보 탭 — 보호자/동물/여행/항공권. 모든 행이 편집 가능한 필드.
 *
 * 시각 소스: docs/portal-preview/app.jsx 의 `Info`. Stone 팔레트 — TimelineCalm·DocsView 동일 톤.
 *
 * 편집 모델: 전체 폼 state(=desired-state) + dirty 추적 + 하단 sticky 저장 바.
 * StepDetailView 의 인터랙티브 step 패턴과 동일. 저장은 updateCaseInfoFields 한 번에 commit.
 * dirty 동안 외부 변경(Realtime/admin push)은 무시 — base 만 갱신해 저장 후 정합 유지.
 */

const C = {
  bg: '#F5EFE8',
  surface: '#FBF7F1',
  ink: '#2A2620',
  ink2: '#6B6457',
  ink3: '#9A9286',
  line: 'rgba(42,38,32,.10)',
  accent: '#B89968',
  sage: '#8FA68C',
  warn: '#C26A4A',
} as const

const SPECIES_OPTIONS: readonly FieldOption[] = [
  { value: 'dog', label: '강아지' },
  { value: 'cat', label: '고양이' },
  { value: 'other', label: '기타' },
]
const SEX_OPTIONS: readonly FieldOption[] = [
  { value: 'male', label: '수컷' },
  { value: 'female', label: '암컷' },
  { value: 'neutered_male', label: '중성화 수컷' },
  { value: 'spayed_female', label: '중성화 암컷' },
]
const TRIP_OPTIONS: readonly FieldOption[] = [
  { value: 'round', label: '왕복' },
  { value: 'one_way', label: '편도' },
]

// ── 데이터 ↔ 폼 ──────────────────────────────────────────────────────────

/** caseRow → 편집 폼 state. data jsonb·컬럼을 모두 문자열 필드로 평탄화. */
function readForm(caseRow: CaseRow): CaseInfoInput {
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const s = (key: string): string => {
    const v = data[key]
    if (typeof v === 'string') return v
    if (typeof v === 'number') return String(v)
    return ''
  }
  const sFallback = (...keys: string[]): string => {
    for (const k of keys) {
      const v = s(k)
      if (v) return v
    }
    return ''
  }
  return {
    customer_name: caseRow.customer_name ?? '',
    customer_name_en: caseRow.customer_name_en ?? '',
    pet_name: caseRow.pet_name ?? '',
    pet_name_en: caseRow.pet_name_en ?? '',
    microchip: (caseRow.microchip ?? '').replace(/\D/g, ''),
    destination: caseRow.destination ?? '',
    departure_date: caseRow.departure_date ?? '',
    phone: s('phone').replace(/\D/g, ''),
    email: s('email'),
    address_kr: sFallback('address_kr', 'address_ko'),
    address_zipcode: sFallback('address_zipcode', 'postal_code', 'zipcode'),
    address_en: sFallback('address_en', 'address_overseas'),
    birth_date: s('birth_date'),
    species: s('species'),
    breed: s('breed'),
    color: s('color'),
    sex: s('sex'),
    weight: s('weight'),
    trip_type: buildCaseJourneyContext(caseRow).tripType,
    return_date: s('return_date'),
    entry_departure_airport: s('entry_departure_airport'),
    entry_airport: s('entry_airport'),
    entry_flight_number: s('entry_flight_number'),
    entry_transport: s('entry_transport'),
    return_departure_airport: s('return_departure_airport'),
    return_arrival_airport: s('return_arrival_airport'),
    return_flight_number: s('return_flight_number'),
    return_transport: s('return_transport'),
    jp_export_quarantine_date: s('jp_export_quarantine_date'),
    jp_export_quarantine_time: s('jp_export_quarantine_time'),
  }
}

function eqForm(a: CaseInfoInput, b: CaseInfoInput): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

// ── 표시용 파생값 ────────────────────────────────────────────────────────

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 출국일 → D-7 / D-DAY / D+3. */
function dDayLabel(departureIso: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departureIso)) return undefined
  const today = new Date(todayIso() + 'T00:00:00')
  const dep = new Date(departureIso + 'T00:00:00')
  const diff = Math.round((dep.getTime() - today.getTime()) / 86_400_000)
  if (diff > 0) return `D-${diff}`
  if (diff === 0) return 'D-DAY'
  return `D+${-diff}`
}

/** 생년월일 → '연령 3세 2개월'. */
function ageLabel(birthIso: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthIso)) return undefined
  const b = new Date(birthIso + 'T00:00:00')
  const t = new Date(todayIso() + 'T00:00:00')
  if (isNaN(b.getTime())) return undefined
  let years = t.getFullYear() - b.getFullYear()
  let months = t.getMonth() - b.getMonth()
  if (t.getDate() < b.getDate()) months--
  if (months < 0) {
    years--
    months += 12
  }
  if (years <= 0 && months <= 0) return undefined
  if (years <= 0) return `연령 ${months}개월`
  return `연령 ${years}세 ${months}개월`
}

// ── Section ──────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div
        style={{
          fontSize: 11,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: C.ink3,
          fontWeight: 500,
          marginTop: 24,
          marginBottom: 10,
          padding: '0 4px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          background: C.surface,
          border: `.5px solid ${C.line}`,
          borderRadius: 18,
          padding: '2px 16px',
        }}
      >
        {children}
      </div>
    </>
  )
}

// ── InfoView ─────────────────────────────────────────────────────────────

export function InfoView({ caseRow, caseId }: { caseRow: CaseRow; caseId: string }) {
  const { updateCase } = useCases()

  const [form, setForm] = useState<CaseInfoInput>(() => readForm(caseRow))
  const [base, setBase] = useState<CaseInfoInput>(() => readForm(caseRow))
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // 외부(Realtime/admin) 변경 동기화 — 사용자 미편집(form==base) 시에만 새 값 채택.
  useEffect(() => {
    const next = readForm(caseRow)
    setForm((prev) => (eqForm(prev, base) ? next : prev))
    setBase(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow])

  const dirty = useMemo(() => !eqForm(form, base), [form, base])
  const justSaved = status === 'saved' && !dirty

  function set<K extends keyof CaseInfoInput>(key: K, value: CaseInfoInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (status === 'error') setStatus('idle')
  }

  function handleSave() {
    if (!dirty || status === 'saving') return
    if (form.microchip && form.microchip.length !== 15) {
      setStatus('error')
      setError('마이크로칩 번호는 15자리여야 합니다.')
      return
    }
    setStatus('saving')
    setError(null)
    startTransition(async () => {
      const res = await updateCaseInfoFields(caseId, form)
      if (res.ok) {
        const fresh = readForm(res.value)
        setForm(fresh)
        setBase(fresh)
        updateCase(res.value)
        setStatus('saved')
        window.setTimeout(() => setStatus('idle'), 1500)
      } else {
        setStatus('error')
        setError(res.error)
      }
    })
  }

  const isRound = form.trip_type === 'round'
  const isJapan =
    buildCaseJourneyContext({ ...caseRow, destination: form.destination }).destinationKey === 'japan'
  const serif: React.CSSProperties = {
    fontFamily: 'var(--pm-font-display)',
    fontWeight: 500,
    letterSpacing: '-0.01em',
  }

  return (
    <div
      className="pm-fade-up pm-noscroll"
      style={{
        background: C.bg,
        color: C.ink,
        minHeight: '100%',
        paddingTop: 24,
        paddingBottom: 132,
        overflow: 'auto',
      }}
    >
      <div style={{ padding: '0 24px' }}>
        <h1 style={{ ...serif, fontSize: 28, lineHeight: 1.12, margin: '8px 0 0', color: C.ink }}>정보</h1>
        <p style={{ fontSize: 12.5, color: C.ink3, margin: '6px 0 0', lineHeight: 1.5 }}>
          각 항목을 눌러 수정할 수 있어요.
        </p>

        {/* 보호자 정보 */}
        <Section label="보호자 정보">
          <TextField label="성함" value={form.customer_name} onChange={(v) => set('customer_name', v)} placeholder="예: 홍길동" />
          <TextField label="영문 성함" value={form.customer_name_en} onChange={(v) => set('customer_name_en', v)} placeholder="예: Gildong Hong" />
          <TextField label="전화번호" value={form.phone} onChange={(v) => set('phone', v)} mask="phone" inputMode="tel" placeholder="010-0000-0000" />
          <TextField label="이메일" value={form.email} onChange={(v) => set('email', v)} inputMode="email" placeholder="example@email.com" />
          <TextField label="한국주소" value={form.address_kr} onChange={(v) => set('address_kr', v)} placeholder="도로명 주소" stacked />
          <TextField label="우편번호" value={form.address_zipcode} onChange={(v) => set('address_zipcode', v)} inputMode="numeric" placeholder="00000" />
          <TextField label="영문주소" value={form.address_en} onChange={(v) => set('address_en', v)} placeholder="English address" stacked last />
        </Section>

        {/* 동물 정보 */}
        <Section label="동물 정보">
          <TextField label="이름" value={form.pet_name} onChange={(v) => set('pet_name', v)} placeholder="예: 마루" />
          <TextField label="영문 이름" value={form.pet_name_en} onChange={(v) => set('pet_name_en', v)} placeholder="예: Maru" />
          <TextField label="마이크로칩번호" value={form.microchip} onChange={(v) => set('microchip', v)} mask="microchip" inputMode="numeric" placeholder="15자리" />
          <DateField label="생년월일" value={form.birth_date} onChange={(v) => set('birth_date', v)} sub={ageLabel(form.birth_date)} />
          <OptionField label="종" value={form.species} onChange={(v) => set('species', v)} options={SPECIES_OPTIONS} />
          <TextField label="품종" value={form.breed} onChange={(v) => set('breed', v)} placeholder="예: 말티즈" />
          <TextField label="모색" value={form.color} onChange={(v) => set('color', v)} placeholder="예: 흰색" />
          <OptionField label="성별" value={form.sex} onChange={(v) => set('sex', v)} options={SEX_OPTIONS} />
          <TextField label="몸무게" value={form.weight} onChange={(v) => set('weight', v)} mask="weight" inputMode="decimal" placeholder="예: 5.2" suffix="kg" last />
        </Section>

        {/* 여행 정보 */}
        <Section label="여행 정보">
          <DestinationField label="여행지" value={form.destination} onChange={(v) => set('destination', v)} />
          <SegmentField
            label="유형"
            value={form.trip_type}
            onChange={(v) => set('trip_type', v === 'one_way' ? 'one_way' : 'round')}
            options={TRIP_OPTIONS}
          />
          <DateField
            label="출국일"
            value={form.departure_date}
            onChange={(v) => set('departure_date', v)}
            sub={dDayLabel(form.departure_date)}
            last={!isRound}
          />
          {isRound && (
            <DateField label="귀국일" value={form.return_date} onChange={(v) => set('return_date', v)} last />
          )}
        </Section>

        {/* 항공권 — 출국 */}
        <Section label="출국 항공권">
          <TextField label="출발 공항" value={form.entry_departure_airport} onChange={(v) => set('entry_departure_airport', v)} placeholder="예: 인천 ICN" />
          <TextField label="도착 공항" value={form.entry_airport} onChange={(v) => set('entry_airport', v)} placeholder="예: 나리타 NRT" />
          <TextField label="편명" value={form.entry_flight_number} onChange={(v) => set('entry_flight_number', v)} placeholder="예: KE703" />
          <TextField label="운송 방법" value={form.entry_transport} onChange={(v) => set('entry_transport', v)} placeholder="예: 수하물 / 화물" last />
        </Section>

        {/* 항공권 — 귀국 (왕복만) */}
        {isRound && (
          <Section label="귀국 항공권">
            <TextField label="출발 공항" value={form.return_departure_airport} onChange={(v) => set('return_departure_airport', v)} placeholder="예: 나리타 NRT" />
            <TextField label="도착 공항" value={form.return_arrival_airport} onChange={(v) => set('return_arrival_airport', v)} placeholder="예: 인천 ICN" />
            <TextField label="편명" value={form.return_flight_number} onChange={(v) => set('return_flight_number', v)} placeholder="예: KE704" />
            <TextField label="운송 방법" value={form.return_transport} onChange={(v) => set('return_transport', v)} placeholder="예: 수하물 / 화물" last />
          </Section>
        )}

        {/* 일본 수출검역 — 왕복·일본만 */}
        {isRound && isJapan && (
          <Section label="일본 수출검역">
            <DateField
              label="예약일"
              value={form.jp_export_quarantine_date}
              onChange={(v) => set('jp_export_quarantine_date', v)}
            />
            <TextField
              label="예약시간"
              value={form.jp_export_quarantine_time}
              onChange={(v) => set('jp_export_quarantine_time', v)}
              placeholder="예: 14:30"
              inputMode="numeric"
              last
            />
          </Section>
        )}
      </div>

      {/* 하단 sticky 저장 바 — StepDetailView 인터랙티브 step 과 동일 패턴. */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: 12,
          paddingLeft: 20,
          paddingRight: 20,
          paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), 12px) + 53px)',
          background:
            'linear-gradient(180deg, rgba(245,239,232,0) 0%, rgba(245,239,232,.92) 30%, rgba(245,239,232,.92) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          zIndex: 39,
          pointerEvents: 'none',
        }}
      >
        {status === 'error' && (
          <div
            role="alert"
            style={{
              pointerEvents: 'auto',
              marginBottom: 8,
              padding: '9px 12px',
              borderRadius: 10,
              background: C.surface,
              border: `.5px solid ${C.warn}55`,
              color: C.warn,
              fontSize: 12,
              textAlign: 'center',
            }}
          >
            {error ?? '저장 실패'}
          </div>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || status === 'saving'}
          aria-live="polite"
          style={{
            pointerEvents: 'auto',
            width: '100%',
            padding: '14px 0',
            borderRadius: 14,
            border: 0,
            background: justSaved
              ? C.sage
              : dirty && status !== 'saving'
                ? C.accent
                : 'rgba(42,38,32,.10)',
            color: justSaved || (dirty && status !== 'saving') ? '#fff' : C.ink3,
            fontFamily: 'inherit',
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: '-0.005em',
            cursor: dirty && status !== 'saving' ? 'pointer' : 'not-allowed',
            transition: 'background .15s, color .15s',
          }}
        >
          {status === 'saving' ? '저장 중…' : justSaved ? '✓ 저장됨' : '저장'}
        </button>
      </div>
    </div>
  )
}
