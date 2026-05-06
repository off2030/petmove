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
  EXTRA_FIELD_KEY_LABELS,
} from '@petmove/domain'
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
 */
const SHARE_EXCLUDED_KEYS = new Set(['age', 'rabies_3'])

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
    type Field = { key: string; label: string; order: number }
    const buckets: Record<typeof CATEGORIES[number], Field[]> = {
      '고객정보': [],
      '동물정보': [],
      '절차정보': [],
      '추가정보': [],
    }
    let columnOrder = 0

    // 1) 정규 컬럼 — 하드코딩 매핑
    //    destination 은 발신 조직이 결정하는 필드라 외부 수신자가 채울 필요 없음 → 제외.
    //    departure_date 는 운송사 등 외부에서 채울 수 있어 포함.
    const COLUMN_TO_CATEGORY: Record<string, typeof CATEGORIES[number]> = {
      customer_name:    '고객정보',
      customer_name_en: '고객정보',
      pet_name:         '동물정보',
      pet_name_en:      '동물정보',
      microchip:        '동물정보',
      departure_date:   '추가정보',
    }
    const COLUMN_LABEL: Record<string, string> = {
      customer_name:    '보호자 이름 (한글)',
      customer_name_en: '보호자 이름 (영문)',
      pet_name:         '반려동물 이름 (한글)',
      pet_name_en:      '반려동물 이름 (영문)',
      microchip:        '마이크로칩 번호',
      departure_date:   '출국일',
    }
    for (const [key, category] of Object.entries(COLUMN_TO_CATEGORY)) {
      buckets[category].push({ key, label: COLUMN_LABEL[key], order: columnOrder++ })
    }

    // 2) data jsonb 필드 — group_name 으로 카테고리 결정. 메모·기타·미매칭은 제외.
    const GROUP_TO_CATEGORY: Record<string, typeof CATEGORIES[number]> = {
      '기본정보': '고객정보',
      '동물정보': '동물정보',
      '절차/식별': '절차정보',
      '절차/예방접종': '절차정보',
      '절차/검사': '절차정보',
      '절차/구충': '절차정보',
    }
    // data 필드 — display_order 보존 (컬럼 필드보다 뒤로 가도록 +1000 offset)
    for (const d of fieldDefs) {
      if (d.type === 'multiselect') continue // 외부 입력 폼에서 멀티셀렉트 미지원
      if (SHARE_EXCLUDED_KEYS.has(d.key)) continue
      if (SHARE_HIDDEN_BY_VACCINE_GROUPS.has(d.key)) continue // 합성 그룹이 흡수
      const category = GROUP_TO_CATEGORY[d.group_name ?? '']
      if (!category) continue // 메모·기타·미매칭은 제외
      // 목적지·케이스 토글에 포함된 필드만 노출 (case-detail 과 동일 기준).
      if (!allowedFields.has(d.key)) continue
      // 백신/검사/구충 매핑 키는 vaccineEntries 검사 — 목적지별 필요한 백신만 노출.
      const vaccineKey = FIELD_TO_VACCINE_KEY[d.key]
      if (vaccineKey && !vaccineApplies(vaccineKey)) continue
      buckets[category].push({ key: d.key, label: d.label, order: 1000 + d.display_order })
    }

    // 3) 합성 백신 그룹 — 절차 카테고리에 display_order 좌표계로 삽입 (목적지에 적용될 때만)
    for (const g of SHARE_VACCINE_GROUPS) {
      const vk = SYNTHETIC_VACCINE_KEY[g.key]
      if (vk && !vaccineApplies(vk)) continue
      buckets['절차정보'].push({ key: g.key, label: g.label, order: 1000 + g.display_order })
    }

    // 4) 목적지별 추가 필드 (일본 입국일·항공편, EU 해외주소, 호주 입국공항 등)
    //    EXTRA_FIELD_DEFS 의 key 를 그대로 사용. 종 필터 적용.
    let extraOrder = 2000
    for (const entry of extraFieldEntries) {
      if (!extraFieldMatchesSpecies(entry, speciesValue)) continue
      const label = EXTRA_FIELD_KEY_LABELS[entry.key] ?? entry.key
      buckets['추가정보'].push({ key: entry.key, label, order: extraOrder++ })
    }

    // 카테고리 내 정렬 — 컬럼(0~) → data/synthetic(1000+display_order)
    for (const c of CATEGORIES) buckets[c].sort((a, b) => a.order - b.order)

    return CATEGORIES.map((c) => ({
      category: c,
      fields: buckets[c].map(({ key, label }) => ({ key, label })),
    })).filter((g) => g.fields.length > 0)
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
    for (const g of groupedFields) for (const f of g.fields) set.add(f.key)
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
            <p className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted-foreground/80 mb-2">
              빠른 선택
            </p>
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
            <div className="flex items-baseline justify-between mb-2">
              <p className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted-foreground/80">
                직접 선택
              </p>
              <span className="font-mono text-[10.5px] text-muted-foreground/70">
                {selectedKeys.size} 개 선택됨
              </span>
            </div>
            <div className="space-y-md">
              {groupedFields.map((g) => (
                <div key={g.category}>
                  <p className="font-serif text-[12px] text-muted-foreground/80 mb-1">{g.category}</p>
                  <div className="flex flex-wrap gap-1">
                    {g.fields.map((f) => {
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
            <p className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted-foreground/80 mb-2">
              발급된 링크 · {links.length}
            </p>
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
