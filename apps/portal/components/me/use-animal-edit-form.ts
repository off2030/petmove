'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CaseRow } from '@petmove/domain'
import { useConfirm } from '@petmove/ui'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { updateCaseInfoFields, type CaseInfoInput } from '@/lib/actions/cases'
import {
  addCaseDestination,
  removeCaseDestination,
  setCaseCoProgress,
  setCaseDestinationTripType,
} from '@/lib/actions/destinations'
import { eqForm, hasSiblingForDestination, readForm } from '@/lib/cases/info-form'
import { showConflictNotice } from '@/lib/cases/conflict-notice'

/**
 * 동물 상세(/me/animal) 전용 편집 hook — '동물 정보' 폼 + '여정'(목적지·왕복편도·함께 준비)을
 * 하나의 로컬 상태로 묶어 **단일 저장 버튼**으로 함께 커밋한다.
 *
 * 왜 통합인가: 예전엔 동물 정보는 벌크 폼(updateCaseInfoFields), 여정은 칩이 토글마다 즉시
 * server action 으로 저장했다. 둘이 따로 놀아 벌크 폼이 칩의 목적지별 trip_type/co_progress 를
 * stale 값으로 덮어쓰는 충돌을 피하려고 저장 버튼을 여정 위로 분리했었다. 이제 여정도 같은 로컬
 * 상태에 담아 '저장'에서 함께 커밋하므로 그 충돌 자체가 사라진다 — 저장 버튼을 여정 아래로 내릴 수
 * 있다.
 *
 * 저장 동작: 검증된 기존 destination actions 를 **저장 시점에 순서대로 replay** 한다(데이터 의미는
 * 즉시저장 때와 동일 — 호출 시점만 저장 버튼으로 옮김). 목적지 삭제·함께 준비 해제 confirm 도
 * 토글이 아니라 저장 누를 때 뜬다.
 */

type TripType = 'round' | 'one_way'
export type AnimalEditStatus = 'idle' | 'saving' | 'saved' | 'error'

interface JourneyBase {
  destinations: string[]
  tripType: Record<string, TripType>
  coProgress: boolean
}
interface JourneyLive {
  /** base 에 없던 새 목적지 (추가 순서). */
  added: string[]
  /** 삭제 표시된 base 목적지 (저장 시 confirm 후 제거). */
  removals: string[]
  /** live 목적지 전체의 왕복/편도 (base 에서 복제 후 토글로 갱신). */
  tripType: Record<string, TripType>
  coProgress: boolean
}

/** caseRow → 여정 base 상태. */
function readJourney(caseRow: CaseRow): JourneyBase {
  const destinations = (caseRow.destination ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  const raw = (caseRow.data as Record<string, unknown> | null)?.trip_type
  const tripType: Record<string, TripType> = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      tripType[k] = v === 'one_way' ? 'one_way' : 'round'
    }
  }
  const coProgress = (caseRow.data as Record<string, unknown> | null)?.co_progress !== false
  return { destinations, tripType, coProgress }
}

function freshLive(base: JourneyBase): JourneyLive {
  return { added: [], removals: [], tripType: { ...base.tripType }, coProgress: base.coProgress }
}

function tt(map: Record<string, TripType>, dest: string): TripType {
  return map[dest] === 'one_way' ? 'one_way' : 'round'
}

/** live 목적지 — base(삭제분 제외) + 추가분. */
function liveDestinations(base: JourneyBase, live: JourneyLive): string[] {
  const removed = new Set(live.removals)
  return [...base.destinations.filter((d) => !removed.has(d)), ...live.added]
}

function journeyDirty(base: JourneyBase, live: JourneyLive): boolean {
  if (live.added.length > 0 || live.removals.length > 0) return true
  if (live.coProgress !== base.coProgress) return true
  return liveDestinations(base, live).some((d) => tt(live.tripType, d) !== tt(base.tripType, d))
}

export interface AnimalJourneyVM {
  /** 화면 렌더용 카드 목록 — base 순서(삭제예정 포함) 뒤에 추가분. */
  cards: Array<{ dest: string; removing: boolean; added: boolean }>
  /** 추가 바텀시트의 제외 기준 — 현재 선택된(live) 목적지. */
  selected: string[]
  tripTypeByDest: Record<string, TripType>
  coProgress: boolean
  /** '함께 준비' 토글을 노출할 목적지 — 같은 곳·같은 트립 형제가 있는 목적지만(live 트립 반영). */
  coProgressDests: Set<string>
}

export interface UseAnimalEditForm {
  form: CaseInfoInput
  set: <K extends keyof CaseInfoInput>(key: K, value: CaseInfoInput[K]) => void
  journey: AnimalJourneyVM
  stageAdd: (dest: string) => void
  stageRemove: (dest: string) => void
  stageRestore: (dest: string) => void
  stageTripType: (dest: string, value: TripType) => void
  stageCoProgress: (value: boolean) => void
  dirty: boolean
  status: AnimalEditStatus
  error: string | null
  handleSave: () => void
}

export function useAnimalEditForm(caseRow: CaseRow, caseId: string): UseAnimalEditForm {
  const { cases, updateCase, refreshCases } = useCases()
  const confirm = useConfirm()
  const router = useRouter()

  // ── 동물 정보 폼 (useCaseEditForm 과 동일 패턴) ──
  const [form, setForm] = useState<CaseInfoInput>(() => readForm(caseRow))
  const [formBase, setFormBase] = useState<CaseInfoInput>(() => readForm(caseRow))

  // ── 여정 (base + live) ──
  const [base, setBase] = useState<JourneyBase>(() => readJourney(caseRow))
  const [live, setLive] = useState<JourneyLive>(() => freshLive(readJourney(caseRow)))

  const [status, setStatus] = useState<AnimalEditStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // 외부(Realtime/admin) 변경 동기화 — 사용자 미편집 시에만 새 값 채택.
  useEffect(() => {
    const nextForm = readForm(caseRow)
    setForm((prev) => (eqForm(prev, formBase) ? nextForm : prev))
    setFormBase(nextForm)

    const nextBase = readJourney(caseRow)
    setLive((prevLive) =>
      journeyDirty(base, prevLive) ? prevLive : freshLive(nextBase),
    )
    setBase(nextBase)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseRow])

  const animalDirty = useMemo(() => !eqForm(form, formBase), [form, formBase])
  const jDirty = useMemo(() => journeyDirty(base, live), [base, live])
  const dirty = animalDirty || jDirty

  function set<K extends keyof CaseInfoInput>(key: K, value: CaseInfoInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (status === 'error') setStatus('idle')
  }

  function clearErr() {
    if (status === 'error') setStatus('idle')
  }

  function stageAdd(dest: string) {
    const d = dest.trim()
    if (!d) return
    clearErr()
    setLive((prev) => {
      // 삭제 표시돼 있던 base 목적지를 다시 고르면 삭제 취소로 해석.
      if (prev.removals.includes(d)) {
        return { ...prev, removals: prev.removals.filter((x) => x !== d) }
      }
      if (base.destinations.includes(d) || prev.added.includes(d)) return prev
      return {
        ...prev,
        added: [...prev.added, d],
        tripType: { ...prev.tripType, [d]: prev.tripType[d] ?? 'round' },
      }
    })
  }

  function stageRemove(dest: string) {
    clearErr()
    setLive((prev) => {
      // 추가했던(아직 미저장) 목적지면 그냥 빼고, base 목적지면 삭제예정 표시.
      if (prev.added.includes(dest)) {
        return { ...prev, added: prev.added.filter((x) => x !== dest) }
      }
      if (base.destinations.includes(dest) && !prev.removals.includes(dest)) {
        return { ...prev, removals: [...prev.removals, dest] }
      }
      return prev
    })
  }

  function stageRestore(dest: string) {
    clearErr()
    setLive((prev) => ({ ...prev, removals: prev.removals.filter((x) => x !== dest) }))
  }

  function stageTripType(dest: string, value: TripType) {
    clearErr()
    setLive((prev) => ({ ...prev, tripType: { ...prev.tripType, [dest]: value } }))
  }

  function stageCoProgress(value: boolean) {
    clearErr()
    setLive((prev) => ({ ...prev, coProgress: value }))
  }

  // ── 화면 view-model ──
  const journey = useMemo<AnimalJourneyVM>(() => {
    const removed = new Set(live.removals)
    const cards = [
      ...base.destinations.map((dest) => ({ dest, removing: removed.has(dest), added: false })),
      ...live.added.map((dest) => ({ dest, removing: false, added: true })),
    ]
    const selected = liveDestinations(base, live)
    // 함께 준비 노출 기준 — live 트립을 반영한 합성 caseRow 로 형제 매칭.
    const syntheticRow = {
      ...caseRow,
      destination: selected.join(', '),
      data: { ...((caseRow.data as Record<string, unknown> | null) ?? {}), trip_type: live.tripType },
    } as CaseRow
    const coProgressDests = new Set(
      selected.filter((d) => hasSiblingForDestination(cases, syntheticRow, d)),
    )
    return { cards, selected, tripTypeByDest: live.tripType, coProgress: live.coProgress, coProgressDests }
  }, [base, live, cases, caseRow])

  function handleSave() {
    if (!dirty || status === 'saving') return

    // 동물 정보 입력 검증 — 이 페이지에서 편집되는 필드만 선제 검증(나머지는 server).
    if (form.microchip && form.microchip.replace(/\D/g, '').length !== 15) {
      setStatus('error')
      setError('15자리 숫자를 입력하세요.')
      return
    }
    if (form.weight.trim()) {
      const n = Number(form.weight)
      if (!Number.isFinite(n) || n < 0) {
        setStatus('error')
        setError('몸무게 형식이 올바르지 않습니다.')
        return
      }
    }

    const finalDests = liveDestinations(base, live)
    const removalsInOrder = base.destinations.filter((d) => live.removals.includes(d))

    // 함께 준비 강제 해제 판정 — base 에서 묶여 있던(같은 곳·같은 트립 형제 + co_progress on)
    // 목적지의 트립을 바꾸면 같은 여정이 아니게 돼 해제된다. (live 가 아니라 base 기준 묶임.)
    const baseCoProgressDests = base.coProgress
      ? base.destinations.filter((d) => hasSiblingForDestination(cases, caseRow, d))
      : []
    const forceUnlink =
      base.coProgress &&
      baseCoProgressDests.some(
        (d) => !live.removals.includes(d) && tt(live.tripType, d) !== tt(base.tripType, d),
      )
    const finalCoProgress = forceUnlink ? false : live.coProgress

    void runSave()

    async function runSave() {
      // ── confirm (팝업은 저장 누를 때) ──
      for (const dest of removalsInOrder) {
        const ok = await confirm({
          message: `목적지 '${dest}' 를 삭제하시겠습니까?`,
          description: '해당 목적지에 입력된 절차·일정 정보가 함께 삭제됩니다.',
          okLabel: '삭제',
          variant: 'destructive',
        })
        if (!ok) return // 저장 취소 — staged 상태 유지.
      }
      // '함께 준비' 토글은 펫무브앱에서 제거(펫무브워크 전용). 트립이 형제와 달라지면
      // 같은 여정이 아니게 돼 co_progress 를 자동 해제하는 동작(forceUnlink → ① 단계)은
      // 데이터 정합을 위해 그대로 두되, 보호자에겐 '함께 준비' 개념을 노출하지 않으므로
      // 확인창 없이 조용히 처리한다.

      setStatus('saving')
      setError(null)
      startTransition(async () => {
        try {
          // ① 함께 준비 해제 먼저 — 이어지는 변경이 동기화 트리거로 형제에 새지 않도록(즉시저장 때와 동일 순서).
          if (finalCoProgress === false && base.coProgress === true) {
            const r = await setCaseCoProgress(caseId, false)
            if (!r.ok) throw new Error(r.error)
          }
          // ② 목적지 삭제 (by_dest·trip_type 정리는 action 내부).
          for (const dest of removalsInOrder) {
            const r = await removeCaseDestination(caseId, dest)
            if (!r.ok) throw new Error(r.error)
          }
          // ③ 목적지 추가 (by_dest 초기화·trip_type 설정은 action 내부).
          for (const dest of live.added) {
            const r = await addCaseDestination(caseId, dest, tt(live.tripType, dest))
            if (!r.ok) throw new Error(r.error)
          }
          // ④ 기존 목적지의 왕복/편도 변경분.
          for (const dest of finalDests) {
            if (live.added.includes(dest)) continue // 추가분은 ③에서 트립까지 설정됨.
            if (tt(live.tripType, dest) !== tt(base.tripType, dest)) {
              const r = await setCaseDestinationTripType(caseId, dest, tt(live.tripType, dest))
              if (!r.ok) throw new Error(r.error)
            }
          }
          // ⑤ 함께 준비 켜기(사용자가 명시적으로 on). 끄기는 ①에서 처리.
          if (finalCoProgress === true && base.coProgress === false) {
            const r = await setCaseCoProgress(caseId, true)
            if (!r.ok) throw new Error(r.error)
          }
          // ⑥ 동물 정보 — destination 은 최종 목적지 목록으로 맞춰 충돌 제거(journey 가 이미 쓴 값과 동일).
          let saved: CaseRow | null = null
          if (animalDirty) {
            const r = await updateCaseInfoFields(
              caseId,
              { ...form, destination: finalDests.join(', ') },
              formBase,
            )
            if (!r.ok) {
              if ('conflict' in r && r.conflict) {
                // 같은 칸을 그 사이 다른 곳에서 바꿈 — 동물 정보는 저장 안 됨(여정 변경은
                // 이미 반영). 안내 후 최신 내용 불러오기.
                setStatus('idle')
                await showConflictNotice(confirm)
                return
              }
              throw new Error(r.error)
            }
            saved = r.value
            updateCase(r.value)
          }

          // 로컬 base/live 를 방금 저장한 최종 상태로 리셋 (dirty=false).
          const nextTrip: Record<string, TripType> = {}
          for (const d of finalDests) nextTrip[d] = tt(live.tripType, d)
          const nextBase: JourneyBase = {
            destinations: finalDests,
            tripType: nextTrip,
            coProgress: finalCoProgress,
          }
          setBase(nextBase)
          setLive(freshLive(nextBase))
          if (saved) {
            const fresh = readForm(saved)
            setForm(fresh)
            setFormBase(fresh)
          }

          await refreshCases()
          router.refresh()
          setStatus('saved')
          window.setTimeout(() => setStatus('idle'), 1500)
        } catch (e) {
          setStatus('error')
          setError((e as Error).message)
        }
      })
    }
  }

  return {
    form,
    set,
    journey,
    stageAdd,
    stageRemove,
    stageRestore,
    stageTripType,
    stageCoProgress,
    dirty,
    status,
    error,
    handleSave,
  }
}
