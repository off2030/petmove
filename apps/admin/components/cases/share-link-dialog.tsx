'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Check, X, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useCases } from './cases-context'
import { useDestinationOverrides } from '@/components/providers/destination-overrides-provider'
import { DialogFooter } from '@/components/ui/dialog-footer'
import {
  getAllowedFields,
  getEffectiveVaccineEntries,
  getEffectiveExtraFieldEntries,
  vaccineMatchesSpecies,
  extraFieldMatchesSpecies,
  EXTRA_FIELD_DEFS,
} from '@petmove/domain'
import { buildFieldSpecs } from '@/lib/fields'
import type { CaseRow } from '@/lib/supabase/types'
import {
  createShareLink,
  listShareLinksForCase,
  revokeShareLink,
} from '@/lib/actions/share-links'
import {
  shareLinkStatus,
  SHARE_VACCINE_GROUPS,
  SHARE_HIDDEN_BY_VACCINE_GROUPS,
  SHARE_RECIPIENT_LABEL_OVERRIDE,
  type ShareLinkRow,
  type ShareLinkStatus,
} from '@/lib/share-links-types'
import type { SharePreset } from '@/lib/share-presets-types'

/**
 * 데이터 필드 키 → 백신/검사 그룹 키 매핑.
 * vaccineEntries 에 그룹이 있을 때만 해당 필드를 노출.
 * 매핑 없는 키(고객·동물 정보 등)는 백신 필터 적용 안함.
 */
const FIELD_TO_VACCINE_KEY: Record<string, string> = {
  // 광견병 — legacy 단일·번호 + 현재 array
  rabies_1: 'rabies', rabies_2: 'rabies', rabies_3: 'rabies', rabies_dates: 'rabies',
  // 광견병 항체검사 — legacy 단일 + 현재 키 (rabies_titer_test_date / rabies_titer)
  rabies_titer_date: 'rabies_titer', rabies_titer_value: 'rabies_titer',
  rabies_titer_test_date: 'rabies_titer', rabies_titer: 'rabies_titer',
  // 종합백신 — legacy comprehensive 들 + 현재 general_vaccine
  comprehensive: 'general', comprehensive_2: 'general',
  general_vaccine: 'general', general_vaccine_dates: 'general',
  // 독감(CIV)
  civ: 'civ', civ_dates: 'civ', civ_2: 'civ',
  // 켄넬코프
  kennel_cough_dates: 'kennel',
  // 검사 — legacy + 현재 (heartworm_test, infectious_disease_test)
  heartworm: 'heartworm', heartworm_test: 'heartworm', heartworm_dates: 'heartworm',
  infectious_disease: 'infectious_disease',
  infectious_disease_test: 'infectious_disease',
  // 구충
  external_parasite_1: 'external_parasite',
  external_parasite_2: 'external_parasite',
  external_parasite_3: 'external_parasite',
  internal_parasite_1: 'internal_parasite',
  internal_parasite_2: 'internal_parasite',
}

/** 합성 백신·구충 그룹 → vaccine entry key. */
const SYNTHETIC_VACCINE_KEY: Record<string, string> = {
  __rabies: 'rabies',
  __comprehensive: 'general',
  __civ: 'civ',
  __external_parasite: 'external_parasite',
  __internal_parasite: 'internal_parasite',
}

interface Props {
  caseRow: CaseRow
  caseLabel: string
  onClose: () => void
}

const CATEGORIES = ['고객정보', '동물정보', '절차정보', '추가정보'] as const

/**
 * 외부 수신자가 직접 입력하기 부적절한 필드 — share 다이얼로그에서 제외.
 * - age: 생년월일에서 자동 계산 (별도 입력 불필요)
 * - rabies_3: 3차 접종 미사용 정책
 * - destination: 발신 조직이 결정 (외부 수신자 입력 대상 아님)
 * - memo / notes: 폼 하단의 별도 메모 필드로 분리
 * - customer_first_name_en / customer_last_name_en: 컬럼 customer_name_en 으로 합쳐 노출
 * - breed_en / color_en / sex_en: 한글 칩만 노출 (영문은 자동 보정/표시)
 * - payment_*, payments: 외부 입력 대상 아님
 * - microchip_secondary, japan_extra: 내부/legacy 컨테이너
 * - address_overseas: 추가정보 전용 (4번 블록에서 처리)
 */
const SHARE_EXCLUDED_KEYS = new Set([
  'age', 'rabies_3', 'destination', 'memo', 'notes',
  'customer_first_name_en', 'customer_last_name_en',
  'breed_en', 'color_en', 'sex_en',
  'payment_amount', 'payment_method', 'payments',
  'microchip_secondary', 'japan_extra',
  'address_overseas',
])

// 다이얼로그 칩 라벨도 수신자에게 실제 보일 라벨(SHARE_RECIPIENT_LABEL_OVERRIDE)을 그대로 노출 —
// 발신자가 "고객이 어떻게 볼지" 미리 확인할 수 있도록 단일 진실 공급원으로 통합.

/** 카테고리 별로 allowedFields(=목적지 필터) 를 적용할지. 절차정보만 적용 — 고객·동물 정보는 모든 케이스 공통이라 필터 없이 전부 노출. */
const CATEGORY_APPLIES_DESTINATION_FILTER: Record<string, boolean> = {
  '고객정보': false,
  '동물정보': false,
  '절차정보': true,
  '추가정보': false,
}

/** spec.group → 다이얼로그 카테고리 (case-detail 의 그룹명과 동일). */
const SPEC_GROUP_TO_CATEGORY: Record<string, typeof CATEGORIES[number]> = {
  '고객정보': '고객정보',
  '동물정보': '동물정보',
  '절차정보': '절차정보',
  // '기타정보' (메모) 는 폼 하단 별도 메모 필드로 들어감 → 다이얼로그 칩 미노출
}

const STATUS_LABEL: Record<ShareLinkStatus, string> = {
  active: '대기',
  submitted: '제출됨',
  expired: '만료',
  revoked: '취소',
}

const STATUS_TONE: Record<ShareLinkStatus, string> = {
  active: 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400',
  submitted: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400',
  expired: 'border-border/80 text-muted-foreground',
  revoked: 'border-border/80 text-muted-foreground',
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export function ShareLinkDialog({ caseRow, caseLabel, onClose }: Props) {
  const caseId = caseRow.id
  const confirm = useConfirm()
  const { fieldDefs, activeDestination, sharePresets } = useCases()
  const { config: destOverridesConfig } = useDestinationOverrides()

  // 목적지 기반 필터링 — case detail 과 동일하게 activeDestination 우선.
  // 다중 목적지 케이스("호주, 뉴질랜드, 일본") 일 때 사용자가 보고 있는 목적지 하나로만 필터.
  const destination = activeDestination ?? caseRow.destination
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  const extraFields = (data.extra_visible_fields as string[] | undefined) ?? []
  const speciesValue = (data.species as string | undefined) ?? ''
  const allowedFields = useMemo(
    () => getAllowedFields(destination, extraFields),
    [destination, extraFields],
  )
  const vaccineEntries = useMemo(
    () => getEffectiveVaccineEntries(destination, extraFields, destOverridesConfig),
    [destination, extraFields, destOverridesConfig],
  )
  const extraFieldEntries = useMemo(
    () => getEffectiveExtraFieldEntries(destination, destOverridesConfig),
    [destination, destOverridesConfig],
  )
  /** 백신 그룹 키가 현재 케이스(목적지+종) 에 적용되는지. */
  function vaccineApplies(vaccineKey: string): boolean {
    const entry = vaccineEntries.find((v) => v.key === vaccineKey)
    return !!entry && vaccineMatchesSpecies(entry, speciesValue)
  }

  // 4개 카테고리로 정규화 — field_definitions.group_name 또는 컬럼 키 → 카테고리.
  // 매칭 안되는 필드(메모 등)는 표시 자체에서 제외 (return null).
  const groupedFields = useMemo(() => {
    type Field = { key: string; label: string; order: number; groupOrder: number; subgroup?: string }
    const buckets: Record<typeof CATEGORIES[number], Field[]> = {
      '고객정보': [],
      '동물정보': [],
      '절차정보': [],
      '추가정보': [],
    }

    // 1) 컬럼 + jsonb 필드를 case-detail 과 동일한 좌표계로 빌드 → 같은 정렬 결과 보장.
    //    REGULAR_COLUMN_SPECS 의 groupOrder/order 와 field_definitions 의 display_order 가
    //    혼합 정렬되므로 출국일(컬럼 order=9999) 이 마이크로칩 삽입일(jsonb display_order≈30) 뒤에 옴.
    const allSpecs = buildFieldSpecs(fieldDefs)
    for (const spec of allSpecs) {
      if (SHARE_EXCLUDED_KEYS.has(spec.key)) continue
      if (SHARE_HIDDEN_BY_VACCINE_GROUPS.has(spec.key)) continue
      const category = SPEC_GROUP_TO_CATEGORY[spec.group]
      if (!category) continue // 기타정보 등은 제외
      // 절차정보는 목적지 토글 기준 필터, 고객·동물 정보는 전부 노출.
      if (CATEGORY_APPLIES_DESTINATION_FILTER[category] && !allowedFields.has(spec.key)) continue
      // 백신/검사/구충 매핑 키는 합성 그룹이 흡수하므로 vaccineApplies 로 제외 판정.
      const vaccineKey = FIELD_TO_VACCINE_KEY[spec.key]
      if (vaccineKey && !vaccineApplies(vaccineKey)) continue
      const label = SHARE_RECIPIENT_LABEL_OVERRIDE[spec.key] ?? spec.label
      buckets[category].push({
        key: spec.key,
        label,
        order: spec.order,
        groupOrder: spec.groupOrder,
      })
    }

    // 2) 합성 백신 그룹 — 절차 카테고리에 case-detail 과 동일 좌표(groupOrder=2, order=display_order)로 삽입.
    for (const g of SHARE_VACCINE_GROUPS) {
      const vk = SYNTHETIC_VACCINE_KEY[g.key]
      if (vk && !vaccineApplies(vk)) continue
      buckets['절차정보'].push({
        key: g.key,
        label: g.label,
        order: g.display_order,
        groupOrder: 2,
      })
    }

    // 3) 목적지별 추가 필드 (일본 입국일·항공편, EU 해외주소, 호주 입국공항 등)
    //    같은 group 메타가 2개 이상일 때만 subgroup 으로 묶고 shortLabel 사용,
    //    1개뿐이면 평면 표시 (예: 스위스/태국/USA 의 단일 entry_*).
    const groupCounts = new Map<string, number>()
    for (const entry of extraFieldEntries) {
      if (!extraFieldMatchesSpecies(entry, speciesValue)) continue
      const g = EXTRA_FIELD_DEFS[entry.key]?.group
      if (g) groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1)
    }
    // email 은 고객정보(field_definitions 기본정보) 전용 → 추가정보에서 제외.
    const EXTRA_EXCLUDED_FROM_EXTRA = new Set(['email'])
    let extraOrder = 0
    for (const entry of extraFieldEntries) {
      if (EXTRA_EXCLUDED_FROM_EXTRA.has(entry.key)) continue
      if (!extraFieldMatchesSpecies(entry, speciesValue)) continue
      const def = EXTRA_FIELD_DEFS[entry.key]
      const useGroup = !!def?.group && (groupCounts.get(def.group) ?? 0) >= 2
      const label = useGroup && def?.shortLabel ? def.shortLabel : (def?.label ?? entry.key)
      buckets['추가정보'].push({
        key: entry.key,
        label,
        subgroup: useGroup ? def!.group : undefined,
        order: extraOrder++,
        groupOrder: 99, // 추가정보 안에서 자체 정렬
      })
    }

    // 카테고리 내 정렬 — case-detail 과 동일하게 (groupOrder, order) 사전식.
    for (const c of CATEGORIES) {
      buckets[c].sort((a, b) => {
        if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder
        return a.order - b.order
      })
    }

    // 카테고리별로 연속된 같은 subgroup 끼리 블록으로 묶기 (subgroup 없는 항목은 단일 블록).
    return CATEGORIES.map((c) => {
      const blocks: { subgroup?: string; fields: { key: string; label: string }[] }[] = []
      for (const f of buckets[c]) {
        const last = blocks[blocks.length - 1]
        if (last && last.subgroup === f.subgroup) {
          last.fields.push({ key: f.key, label: f.label })
        } else {
          blocks.push({ subgroup: f.subgroup, fields: [{ key: f.key, label: f.label }] })
        }
      }
      return { category: c, blocks }
    }).filter((g) => g.blocks.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldDefs, allowedFields, vaccineEntries, extraFieldEntries, speciesValue])

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const [title, setTitle] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(30)

  const [links, setLinks] = useState<ShareLinkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    const r = await listShareLinksForCase(caseId)
    if (r.ok) setLinks(r.value)
    else setError(r.error)
    setLoading(false)
  }

  useEffect(() => { refresh() }, [caseId])

  /** 프리셋 — 현재 케이스에서 적용 가능한 키만 추출 (목적지·종 필터 통과한 키만). */
  const allAvailableKeys = useMemo(() => {
    const set = new Set<string>()
    for (const g of groupedFields) for (const b of g.blocks) for (const f of b.fields) set.add(f.key)
    return set
  }, [groupedFields])

  function applicableKeysForPreset(preset: SharePreset): string[] {
    return preset.field_keys.filter((k) => allAvailableKeys.has(k))
  }

  /** 프리셋이 현재 모두 선택돼 있는지 (적용 가능한 키 한정). */
  function isPresetFullySelected(preset: SharePreset): boolean {
    const keys = applicableKeysForPreset(preset)
    if (keys.length === 0) return false
    return keys.every((k) => selectedKeys.has(k))
  }

  /** 빠른 선택 — 프리셋 토글식. 적용 가능한 키만 추가/제거. 다른 선택은 보존. */
  function pickPreset(preset: SharePreset) {
    const keys = applicableKeysForPreset(preset)
    if (keys.length === 0) return
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (keys.every((k) => next.has(k))) {
        for (const k of keys) next.delete(k)
      } else {
        for (const k of keys) next.add(k)
      }
      return next
    })
  }

  function toggleField(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function clearAll() {
    setSelectedKeys(new Set())
  }

  function handleCreate() {
    if (selectedKeys.size === 0) {
      setError('최소 1개 이상의 필드를 선택해주세요')
      return
    }
    setError(null)
    startTransition(async () => {
      // 적용된 프리셋이 있으면 그 이름을 template 라벨로 (감사용 메타).
      const matchedPreset = sharePresets.find((p) => isPresetFullySelected(p))
      const templateLabel = matchedPreset?.name ?? null
      const r = await createShareLink({
        caseId,
        template: templateLabel,
        fieldKeys: Array.from(selectedKeys),
        title: title.trim() || null,
        expiresInDays,
      })
      if (!r.ok) { setError(r.error); return }
      // 생성 직후 자동 복사 시도
      const url = shareUrl(r.value.token)
      try {
        await navigator.clipboard.writeText(url)
        setCopiedToken(r.value.token)
        setTimeout(() => setCopiedToken(null), 2000)
      } catch {
        // best-effort
      }
      // 폼 초기화
      setSelectedKeys(new Set())
      setTitle('')
      await refresh()
    })
  }

  async function handleCopy(token: string) {
    try {
      await navigator.clipboard.writeText(shareUrl(token))
      setCopiedToken(token)
      setTimeout(() => setCopiedToken(null), 2000)
    } catch {
      setError('클립보드 복사 실패 — 링크를 직접 선택해 복사해주세요')
    }
  }

  async function handleRevoke(id: string) {
    if (!await confirm({
      message: '이 링크를 취소하시겠습니까? 링크가 더 이상 동작하지 않습니다.',
      okLabel: '링크 취소',
      cancelLabel: '닫기',
      variant: 'destructive',
    })) return
    startTransition(async () => {
      const r = await revokeShareLink(id)
      if (!r.ok) { setError(r.error); return }
      await refresh()
    })
  }

  // ESC 닫기
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-md"
      onClick={onClose}
    >
      <div
        className="w-[640px] max-w-full max-h-[90vh] flex flex-col rounded-lg border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-start justify-between gap-md px-lg pt-lg pb-md border-b border-border/60">
          <div className="min-w-0">
            <h2 className="font-serif text-[18px] font-medium leading-tight text-foreground">
              공유 링크
            </h2>
            <p className="mt-1 font-serif text-[13px] text-muted-foreground truncate">
              {caseLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 -m-1 p-1 text-muted-foreground hover:text-foreground"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-lg py-md space-y-lg">
          {/* 빠른 선택 — 사용자 정의 프리셋 */}
          <section>
            <h3 className="font-mono text-[11px] uppercase tracking-[1.4px] font-medium text-foreground/90 mb-2 pb-1.5 border-b border-border/60">
              빠른 선택
            </h3>
            {sharePresets.length === 0 ? (
              <p className="font-serif italic text-[12px] text-muted-foreground/70">
                프리셋이 없습니다 — 설정 &gt; 상세에서 만들 수 있습니다.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {sharePresets.map((p) => {
                  const active = isPresetFullySelected(p)
                  const applicable = applicableKeysForPreset(p).length
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickPreset(p)}
                      aria-pressed={active}
                      disabled={applicable === 0}
                      title={applicable === 0 ? '이 케이스 목적지에 적용 가능한 필드가 없음' : `${applicable}개 필드`}
                      className={cn(
                        'h-8 px-3 rounded-full border font-serif text-[13px] transition-colors',
                        active
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border/80 text-muted-foreground hover:bg-accent hover:text-foreground',
                        applicable === 0 && 'opacity-40 cursor-not-allowed',
                      )}
                    >
                      {p.name}
                    </button>
                  )
                })}
                {selectedKeys.size > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="h-8 px-3 rounded-full border border-dashed border-border/70 font-serif text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    선택 초기화
                  </button>
                )}
              </div>
            )}
          </section>

          {/* 커스텀 필드 선택 */}
          <section>
            <div className="flex items-baseline justify-between mb-2 pb-1.5 border-b border-border/60">
              <h3 className="font-mono text-[11px] uppercase tracking-[1.4px] font-medium text-foreground/90">
                직접 선택
              </h3>
              <span className="font-mono text-[10.5px] text-muted-foreground/70">
                {selectedKeys.size} 개 선택됨
              </span>
            </div>
            <div className="space-y-lg">
              {groupedFields.map((g) => (
                <div key={g.category}>
                  <h4 className="font-serif text-[14px] font-medium text-foreground mb-2">
                    {g.category}
                  </h4>
                  <div className="space-y-2 pl-2 border-l border-border/40">
                    {g.blocks.map((block, bi) => (
                      <div key={block.subgroup ?? `__flat-${bi}`} className="pl-2">
                        {block.subgroup && (
                          <p className="font-mono text-[10px] uppercase tracking-[1.1px] text-muted-foreground/70 mb-1">
                            {block.subgroup}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {block.fields.map((f) => {
                            const active = selectedKeys.has(f.key)
                            return (
                              <button
                                key={f.key}
                                type="button"
                                onClick={() => toggleField(f.key)}
                                className={cn(
                                  'h-7 px-2.5 rounded-full border font-serif text-[12px] transition-colors',
                                  active
                                    ? 'border-foreground bg-foreground text-background'
                                    : 'border-border/80 text-muted-foreground hover:bg-accent hover:text-foreground',
                                )}
                              >
                                {f.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 안내 메시지 + 만료 */}
          <section className="space-y-md">
            <label className="block">
              <span className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted-foreground/80">
                받는 사람에게 보일 안내 (선택)
              </span>
              <textarea
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                rows={2}
                maxLength={300}
                className="mt-1 w-full px-3 py-2 rounded-md border border-border/80 bg-background font-serif text-[14px] resize-none focus:outline-none focus:border-foreground/40"
              />
            </label>
            <label className="block max-w-[180px]">
              <span className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted-foreground/80">
                만료
              </span>
              <select
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                className="mt-1 w-full px-3 py-2 rounded-md border border-border/80 bg-background font-serif text-[14px] focus:outline-none focus:border-foreground/40"
              >
                <option value={1}>1일</option>
                <option value={3}>3일</option>
                <option value={7}>7일</option>
                <option value={14}>14일</option>
                <option value={30}>30일</option>
                <option value={90}>90일</option>
              </select>
            </label>
          </section>

          {error && (
            <p className="font-serif text-[13px] text-destructive">{error}</p>
          )}

          {/* 기존 링크 목록 */}
          <section>
            <h3 className="font-mono text-[11px] uppercase tracking-[1.4px] font-medium text-foreground/90 mb-2 pb-1.5 border-b border-border/60">
              발급된 링크 · {links.length}
            </h3>
            <div className="border-t border-border/80">
              {loading ? (
                <p className="py-4 font-serif italic text-[13px] text-muted-foreground">불러오는 중…</p>
              ) : links.length === 0 ? (
                <p className="py-4 font-serif italic text-[13px] text-muted-foreground">아직 발급된 링크가 없습니다.</p>
              ) : (
                links.map((l) => {
                  const status = shareLinkStatus(l)
                  return (
                    <div key={l.id} className="grid grid-cols-[1fr_auto] gap-md py-3 border-b border-dotted border-border/80">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn('font-mono text-[10.5px] uppercase tracking-[1.2px] px-1.5 py-0.5 rounded-full border', STATUS_TONE[status])}>
                            {STATUS_LABEL[status]}
                          </span>
                          <span className="font-serif text-[12px] text-muted-foreground truncate">
                            {l.field_keys.length}개 필드 · 만료 {formatDateTime(l.expires_at)}
                          </span>
                        </div>
                        {l.title && (
                          <div className="mt-1 font-serif italic text-[13px] text-muted-foreground/90 line-clamp-2">
                            “{l.title}”
                          </div>
                        )}
                        {l.submitted_at && (
                          <div className="mt-0.5 font-serif text-[12px] text-muted-foreground">
                            제출 {formatDateTime(l.submitted_at)}
                            {l.submitter_name && ` · ${l.submitter_name}`}
                          </div>
                        )}
                        {l.submitter_note && (
                          <div className="mt-1 font-serif italic text-[12px] text-muted-foreground/80 whitespace-pre-wrap">
                            {l.submitter_note}
                          </div>
                        )}
                      </div>
                      <div className="flex items-start gap-1.5 shrink-0">
                        {status === 'active' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleCopy(l.token)}
                              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border/80 font-serif text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            >
                              {copiedToken === l.token ? <Check size={11} /> : <Copy size={11} />}
                              {copiedToken === l.token ? '복사됨' : '링크 복사'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRevoke(l.id)}
                              disabled={pending}
                              title="취소"
                              className="inline-flex items-center justify-center h-7 w-7 rounded-full border border-border/80 text-muted-foreground hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive transition-colors disabled:opacity-40"
                            >
                              <Trash2 size={11} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </section>
        </div>

        <div className="shrink-0 px-lg pb-md pt-1 border-t border-border/40">
          <DialogFooter
            onCancel={onClose}
            onPrimary={handleCreate}
            primaryLabel="링크 만들기"
            savingLabel="만드는 중…"
            saving={pending}
            primaryDisabled={selectedKeys.size === 0}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}

function shareUrl(token: string): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}/share/${token}`
}
