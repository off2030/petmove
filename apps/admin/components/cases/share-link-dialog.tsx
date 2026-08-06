'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Check, X, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConfirm } from '@petmove/ui'
import { useCases } from './cases-context'
import { useDestinationOverrides } from '@/components/providers/destination-overrides-provider'
import { DialogFooter } from '@/components/ui/dialog-footer'
import {
  getAllowedFields,
  getEffectiveVaccineEntries,
  getEffectiveExtraFieldEntries,
  vaccineMatchesSpecies,
} from '@petmove/domain'
import type { CaseRow } from '@petmove/domain'
import {
  createShareLink,
  listShareLinksForCase,
  revokeShareLink,
} from '@/lib/actions/share-links'
import {
  shareLinkStatus,
  type ShareLinkRow,
  type ShareLinkStatus,
} from '@petmove/domain'
import {
  buildShareFieldDescriptors,
  groupShareDescriptorsByCategory,
  parseDestinations,
  shareDescriptorHasValue,
  shareFileRequestsForDestination,
  SHARE_FILE_REQUESTS,
} from '@petmove/domain'
import type { SharePreset } from '@/lib/share-presets-types'

// 정보 요청 링크 만료 — 외부(보호자) 개인정보가 담기므로 무기한은 지양, 30일 고정(UI 미노출).
const SHARE_LINK_EXPIRY_DAYS = 30

// 국가 프리셋 = 필드(field_keys) + 그 국가 필수 파일(fileKeys) 를 함께 선택.
type AutoPreset = SharePreset & { fileKeys: string[] }

// 빠른선택 프리셋에서 기본 제외할 추가정보 필드 — 특정 상황에서만 필요한 항목.
// (직접 선택 목록엔 그대로 남아 필요할 때 수동으로 추가 가능.)
//  - certificate_no(일본 수출동물검역증 번호): 일부 케이스만 해당.
const PRESET_EXCLUDED_FIELD_KEYS = new Set(['certificate_no'])

// 신고 국가별 빠른선택 프리셋 라벨 — 국가마다 절차명이 달라 개별 지정. 명단 밖은 '{국가} 신고'.
const REPORT_PRESET_LABEL: Record<string, string> = {
  일본: '일본 사전 신고',
  태국: '태국 수입허가증 신청',
  필리핀: '필리핀 수입허가증 신청',
  하와이: '하와이 수입신고',
  스위스: '스위스 수입허가증 신청',
  대만: '대만 수입허가증 신청',
  // 사전 통지·신고 대행 국가 (2026-08-06 — 신고 탭 기본 국가 확장과 동기화).
  미국: '미국 CDC 수입신고',
  이스라엘: '이스라엘 사전 통보',
  키프로스: '키프로스 사전 통지',
  아일랜드: '아일랜드 사전 통지',
  몰타: '몰타 사전 통지',
  노르웨이: '노르웨이 사전 통지',
}

interface Props {
  caseRow: CaseRow
  caseLabel: string
  onClose: () => void
}

// 카테고리/그룹 매핑·합성 백신 매핑·라벨 override 등은 모두 share-field-layout.ts 와
// share-links-types.ts 의 공통 정의를 사용 — 다이얼로그·프리셋·수신자 폼·case-detail
// 네 곳이 단일 진실 공급원을 공유한다.

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
  const { fieldDefs, activeDestination, importReportCountries, sharePresets } = useCases()
  const { config: destOverridesConfig } = useDestinationOverrides()

  // 여행지 기반 필터링 — case detail 과 동일하게 activeDestination 우선.
  // 다중 여행지 케이스("호주, 뉴질랜드, 일본") 일 때 사용자가 보고 있는 여행지 하나로만 필터.
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
  /** 백신 그룹 키가 현재 케이스(여행지+종) 에 적용되는지. */
  function vaccineApplies(vaccineKey: string): boolean {
    const entry = vaccineEntries.find((v) => v.key === vaccineKey)
    return !!entry && vaccineMatchesSpecies(entry, speciesValue)
  }

  // 이미 입력된 항목 표시 여부 — 공유 링크는 '아직 안 받은 정보' 수집용이라 기본은 빈 필드만.
  const [showFilled, setShowFilled] = useState(false)

  // 좌표 권위(descriptor) — case-detail/프리셋/수신자 폼과 동일. source 메타로 값 유무 판정.
  const allDescriptors = useMemo(
    () => buildShareFieldDescriptors({
      fieldDefs,
      destinationScope: destination,
      extraFieldEntries,
      caseScoped: { allowedFields, vaccineApplies, speciesValue },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fieldDefs, destination, allowedFields, vaccineEntries, extraFieldEntries, speciesValue],
  )

  // 이미 값이 있는 필드 수(숨김 대상). caseRow.data 기준.
  const filledCount = useMemo(
    () => allDescriptors.filter((d) => shareDescriptorHasValue(d, caseRow, destination)).length,
    [allDescriptors, caseRow, destination],
  )

  // 4개 카테고리로 정규화 — 기본은 빈 필드만, 토글 시 전체.
  const groupedFields = useMemo(() => {
    const visible = showFilled
      ? allDescriptors
      : allDescriptors.filter((d) => !shareDescriptorHasValue(d, caseRow, destination))
    return groupShareDescriptorsByCategory(visible)
  }, [allDescriptors, showFilled, caseRow, destination])

  // 빠른 선택 = 신고 탭에 오르는 국가 중 이 케이스 여행지에 해당하는 국가의 "{국가} 신고" 프리셋.
  // 그 국가의 추가정보(항공편·해외주소·검역증 번호 등)를 한 번에 선택. (이미 입력된 항목은 자동 숨김)
  const autoPresets = useMemo<AutoPreset[]>(() => {
    const tokens = parseDestinations(destination)
    const matched = importReportCountries.filter((c) => tokens.includes(c))
    if (matched.length === 0) return []
    const extraKeys = Array.from(
      new Set(
        allDescriptors
          .filter((d) => d.category === '추가정보' && !PRESET_EXCLUDED_FIELD_KEYS.has(d.key))
          .map((d) => d.key),
      ),
    )
    return matched
      .map((c) => ({
        id: `__report_${c}`,
        name: REPORT_PRESET_LABEL[c] ?? `${c} 신고`,
        field_keys: extraKeys,
        // 그 국가의 필수 파일도 함께 선택(예: 일본 사전 신고 → 이동 가방 사진). 선택 파일은 미선택.
        fileKeys: SHARE_FILE_REQUESTS
          .filter((r) => r.required && r.destinations !== 'all' && r.destinations.includes(c))
          .map((r) => r.key),
      }))
      .filter((p) => p.field_keys.length > 0 || p.fileKeys.length > 0)
  }, [destination, importReportCountries, allDescriptors])

  // 설정(정보 요청 링크 프리셋)에서 만든 조직 프리셋 — 자동 프리셋 뒤에 함께 노출.
  // 2026-08-06 연결: 그전까지 설정에서 만들어도 이 팝업에 나타나지 않아 쓸 수 없었다.
  const userPresets = useMemo<AutoPreset[]>(
    () => sharePresets.map((p) => ({ ...p, fileKeys: p.file_keys ?? [] })),
    [sharePresets],
  )
  const quickPresets = useMemo<AutoPreset[]>(
    () => [...autoPresets, ...userPresets],
    [autoPresets, userPresets],
  )

  // '전체 선택' 대상 = 아직 안 채워진 필드만. '모두 보기'로 이미 입력된 항목을 펼쳐도
  // 전체 선택엔 포함되지 않는다(이 링크는 안 받은 정보 수집용). 재수집은 개별 칩 클릭.
  const allVisibleIds = useMemo(
    () => allDescriptors.filter((d) => !shareDescriptorHasValue(d, caseRow, destination)).map((d) => d.id),
    [allDescriptors, caseRow, destination],
  )

  // 여행지별 파일 요청 — 필수/선택 구분 없이 한 줄로 나열, 모두 토글. 프리셋이 기본 선택을 잡는다.
  // (필수/선택의 성격은 정의에 남아 고객 폼에서 '필수' 배지·검증으로 살아있음.)
  const fileRequests = useMemo(() => shareFileRequestsForDestination(destination), [destination])
  const [selectedFileKeys, setSelectedFileKeys] = useState<Set<string>>(() => new Set())
  const requestedFileKeys = useMemo(
    () => fileRequests.filter((r) => selectedFileKeys.has(r.key)).map((r) => r.key),
    [fileRequests, selectedFileKeys],
  )
  function toggleFile(key: string) {
    setSelectedFileKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const [selectedFieldIds, setSelectedFieldIds] = useState<Set<string>>(() => new Set())

  // 전체 선택 = 안 채워진 필드 + 파일 요청 전부.
  const allSelected =
    allVisibleIds.length + fileRequests.length > 0 &&
    allVisibleIds.every((id) => selectedFieldIds.has(id)) &&
    fileRequests.every((r) => selectedFileKeys.has(r.key))
  function toggleSelectAll() {
    const fileKeys = fileRequests.map((r) => r.key)
    const allOn =
      allVisibleIds.every((id) => selectedFieldIds.has(id)) &&
      fileKeys.every((k) => selectedFileKeys.has(k))
    setSelectedFieldIds((prev) => {
      const next = new Set(prev)
      for (const id of allVisibleIds) allOn ? next.delete(id) : next.add(id)
      return next
    })
    setSelectedFileKeys((prev) => {
      const next = new Set(prev)
      for (const k of fileKeys) allOn ? next.delete(k) : next.add(k)
      return next
    })
  }

  const [links, setLinks] = useState<ShareLinkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  // 생성 성공 배너(자동복사 안내). 화면 하단 고정 위치에 잠깐 노출.
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    const r = await listShareLinksForCase(caseId)
    if (r.ok) setLinks(r.value)
    else setError(r.error)
    setLoading(false)
  }

  useEffect(() => { refresh() }, [caseId])

  // 발급된 링크는 살아있는 것만 — 대기(복사·취소 가능) + 제출됨(입력 완료 확인).
  // 만료·취소는 동작 없는 죽은 기록이라 목록에서 제외해 단순하게.
  const visibleLinks = useMemo(
    () => links.filter((l) => {
      const s = shareLinkStatus(l)
      return s === 'active' || s === 'submitted'
    }),
    [links],
  )

  const fieldsByKey = useMemo(() => {
    const map = new Map<string, Array<{ id: string; key: string; label: string }>>()
    for (const g of groupedFields) {
      for (const b of g.blocks) {
        for (const f of b.fields) {
          const list = map.get(f.key) ?? []
          list.push(f)
          map.set(f.key, list)
        }
      }
    }
    return map
  }, [groupedFields])

  const selectedFields = useMemo(() => {
    const out: Array<{ id: string; key: string; label: string }> = []
    for (const g of groupedFields) {
      for (const b of g.blocks) {
        for (const f of b.fields) {
          if (selectedFieldIds.has(f.id)) out.push(f)
        }
      }
    }
    return out
  }, [groupedFields, selectedFieldIds])

  function applicableFieldIdsForPreset(preset: AutoPreset): string[] {
    return preset.field_keys.flatMap((k) => fieldsByKey.get(k)?.map((f) => f.id) ?? [])
  }

  /** 프리셋이 담는 것(적용 가능한 필드 + 파일) 개수 — 0이면 비활성. */
  function presetApplicableCount(preset: AutoPreset): number {
    return applicableFieldIdsForPreset(preset).length + preset.fileKeys.length
  }

  /** 프리셋이 현재 모두 선택돼 있는지 (필드 + 파일). */
  function isPresetFullySelected(preset: AutoPreset): boolean {
    const ids = applicableFieldIdsForPreset(preset)
    if (ids.length === 0 && preset.fileKeys.length === 0) return false
    return (
      ids.every((id) => selectedFieldIds.has(id)) &&
      preset.fileKeys.every((k) => selectedFileKeys.has(k))
    )
  }

  /** 빠른 선택 — 프리셋 토글식. 필드 + 파일을 함께 추가/제거. 다른 선택은 보존. */
  function pickPreset(preset: AutoPreset) {
    const ids = applicableFieldIdsForPreset(preset)
    const fileKeys = preset.fileKeys
    if (ids.length === 0 && fileKeys.length === 0) return
    const allOn =
      ids.every((id) => selectedFieldIds.has(id)) && fileKeys.every((k) => selectedFileKeys.has(k))
    setSelectedFieldIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) allOn ? next.delete(id) : next.add(id)
      return next
    })
    setSelectedFileKeys((prev) => {
      const next = new Set(prev)
      for (const k of fileKeys) allOn ? next.delete(k) : next.add(k)
      return next
    })
  }

  function toggleField(id: string) {
    setSelectedFieldIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearAll() {
    setSelectedFieldIds(new Set())
    setSelectedFileKeys(new Set())
  }

  function handleCreate() {
    if (selectedFields.length === 0 && requestedFileKeys.length === 0) {
      setError('요청할 정보나 파일을 최소 1개 선택해주세요')
      return
    }
    setError(null)
    startTransition(async () => {
      // 적용된 프리셋이 있으면 그 이름을 template 라벨로 (감사용 메타).
      const matchedPreset = quickPresets.find((p) => isPresetFullySelected(p))
      const templateLabel = matchedPreset?.name ?? null
      const r = await createShareLink({
        caseId,
        template: templateLabel,
        fieldKeys: selectedFields.map((f) => f.key),
        fieldIds: selectedFields.map((f) => f.id),
        fileRequestKeys: requestedFileKeys,
        destinationScope: destination,
        title: null,
        expiresInDays: SHARE_LINK_EXPIRY_DAYS,
      })
      if (!r.ok) { setError(r.error); return }
      // 생성 직후 자동 복사 시도
      const url = shareUrl(r.value.token)
      let copied = false
      try {
        await navigator.clipboard.writeText(url)
        copied = true
        setCopiedToken(r.value.token)
        setTimeout(() => setCopiedToken(null), 2000)
      } catch {
        // best-effort
      }
      // 성공 배너 — 필드 목록이 길어 아래 '발급된 링크'가 안 보여도 결과를 알린다.
      setSuccessMsg(
        copied
          ? '링크가 만들어졌고 클립보드에 복사되었습니다.'
          : '링크가 만들어졌습니다. 아래 목록에서 복사하세요.',
      )
      setTimeout(() => setSuccessMsg(null), 5000)
      // 폼 초기화
      setSelectedFieldIds(new Set())
      setSelectedFileKeys(new Set())
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
            <h2 className="font-serif text-[18px] font-medium leading-tight text-foreground truncate">
              정보 요청 링크
              <span className="ml-2 font-serif text-[13px] font-normal text-muted-foreground">
                {caseLabel}
              </span>
            </h2>
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
          {/* 빠른 선택 — 전체 선택 + 여행지 신고 국가 사전신고 프리셋 */}
          {groupedFields.length > 0 && (
            <section>
              <h3 className="font-sans text-[12px] font-semibold text-foreground/80 mb-2 pb-1.5 border-b border-border/60">
                빠른 선택
              </h3>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  aria-pressed={allSelected}
                  title="아직 안 채워진 모든 항목 선택"
                  className={cn(
                    'h-8 px-3 rounded-full border font-serif text-[13px] transition-colors',
                    allSelected
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border/80 text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  전체 선택
                </button>
                {quickPresets.map((p) => {
                  const active = isPresetFullySelected(p)
                  const applicable = presetApplicableCount(p)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => pickPreset(p)}
                      aria-pressed={active}
                      disabled={applicable === 0}
                      title={applicable === 0 ? '요청할 항목이 없습니다 (이미 모두 입력됨)' : `${applicable}개 선택`}
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
              </div>
            </section>
          )}

          {/* 커스텀 필드 선택 */}
          <section>
            <div className="flex items-baseline justify-between gap-md mb-2 pb-1.5 border-b border-border/60">
              <h3 className="font-sans text-[12px] font-semibold text-foreground/80">
                직접 선택
              </h3>
              <div className="flex items-baseline gap-3">
                {filledCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowFilled((v) => !v)}
                    className="font-serif text-[12px] text-muted-foreground/70 hover:text-foreground transition-colors"
                    title="이 링크는 아직 안 받은 정보를 수집합니다 — 이미 입력된 항목은 기본 숨김"
                  >
                    {showFilled ? '숨기기' : '모두 보기'}
                  </button>
                )}
                {(selectedFieldIds.size > 0 || selectedFileKeys.size > 0) && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="font-serif text-[12px] text-muted-foreground/70 hover:text-foreground transition-colors"
                  >
                    초기화
                  </button>
                )}
              </div>
            </div>
            {groupedFields.length === 0 && (
              <p className="py-3 font-serif italic text-[13px] text-muted-foreground/70">
                {filledCount > 0
                  ? '받을 항목이 없습니다 — 모두 이미 입력되어 있어요. (위 “입력된 N개 보기”로 확인 가능)'
                  : '표시할 필드가 없습니다.'}
              </p>
            )}
            <div className="space-y-lg">
              {groupedFields.map((g) => (
                <div key={g.category}>
                  <h4 className="font-serif text-[15px] font-semibold text-foreground mb-3 pb-1 border-b border-dotted border-border/60">
                    {g.category}
                  </h4>
                  <div className="space-y-2 pl-2 border-l border-border/40">
                    {g.blocks.map((block, bi) => (
                      <div key={block.subgroup ?? `__flat-${bi}`} className="pl-2">
                        {block.subgroup && (
                          <p className="font-sans text-[11px] font-medium text-muted-foreground/70 mb-1">
                            {block.subgroup}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {block.fields.map((f) => {
                            const active = selectedFieldIds.has(f.id)
                            return (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() => toggleField(f.id)}
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

          {/* 파일 첨부 요청 — 여행지별 필수/선택 슬롯 */}
          {fileRequests.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between gap-md mb-2 pb-1.5 border-b border-border/60">
                <h3 className="font-sans text-[12px] font-semibold text-foreground/80">파일 요청</h3>
                <span className="font-sans text-[11px] text-muted-foreground/70">보호자가 올릴 파일</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {fileRequests.map((r) => {
                  const active = selectedFileKeys.has(r.key)
                  return (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => toggleFile(r.key)}
                      aria-pressed={active}
                      className={cn(
                        'h-7 px-2.5 rounded-full border font-serif text-[12px] transition-colors',
                        active
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border/80 text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      {r.label}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {error && (
            <p className="font-serif text-[13px] text-destructive">{error}</p>
          )}

          {/* 기존 링크 목록 */}
          <section>
            <h3 className="font-sans text-[12px] font-semibold text-foreground/80 mb-2 pb-1.5 border-b border-border/60">
              발급된 링크 · {visibleLinks.length}
            </h3>
            <div className="border-t border-border/80">
              {loading ? (
                <p className="py-4 font-serif italic text-[13px] text-muted-foreground">불러오는 중…</p>
              ) : visibleLinks.length === 0 ? (
                <p className="py-4 font-serif italic text-[13px] text-muted-foreground">아직 발급된 링크가 없습니다.</p>
              ) : (
                visibleLinks.map((l) => {
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
          {successMsg && (
            <div className="mb-2 flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 font-serif text-[13px] text-emerald-700 dark:text-emerald-400">
              <Check size={14} className="shrink-0" />
              {successMsg}
            </div>
          )}
          <DialogFooter
            onCancel={onClose}
            onPrimary={handleCreate}
            primaryLabel="링크 만들기"
            savingLabel="만드는 중…"
            saving={pending}
            primaryDisabled={selectedFields.length === 0 && requestedFileKeys.length === 0}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}

function shareUrl(token: string): string {
  // 정보 입력 폼은 work(admin) 도메인이 직접 서빙 — /share/[token] 이 같은 origin.
  // 그래도 window.location.origin 을 그대로 쓰면 deployment-specific 호스트
  // (petmovework-<hash>-petmove.vercel.app)가 박혀 배포 교체 시 DEPLOYMENT_NOT_FOUND 가 난다.
  // 안정적 canonical 도메인(work.petmove.co.kr)을 NEXT_PUBLIC_WORK_BASE_URL 로 우선 사용.
  const workBase = process.env.NEXT_PUBLIC_WORK_BASE_URL?.replace(/\/$/, '')
  if (workBase) return `${workBase}/share/${token}`
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}/share/${token}`
}
