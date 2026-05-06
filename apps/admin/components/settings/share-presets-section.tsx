'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { useCases } from '@/components/cases/cases-context'
import { listSharePresets, saveSharePresets } from '@/lib/actions/share-presets'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { SettingsSubsectionTitle } from './settings-layout'
import { EXTRA_FIELD_KEY_LABELS, ALL_EXTRA_FIELD_KEYS, EXTRA_FIELD_DEFS } from '@petmove/domain'
import {
  SHARE_VACCINE_GROUPS,
  SHARE_HIDDEN_BY_VACCINE_GROUPS,
} from '@/lib/share-links-types'
import { buildFieldSpecs } from '@/lib/fields'
import type { SharePreset } from '@/lib/share-presets-types'

/** 카테고리 정렬 (직접 선택과 동일). */
const CATEGORIES = ['고객정보', '동물정보', '절차정보', '추가정보'] as const

/** spec.group → 카테고리 (기타정보 = 메모는 폼 별도 필드). */
const SPEC_GROUP_TO_CATEGORY: Record<string, typeof CATEGORIES[number]> = {
  '고객정보': '고객정보',
  '동물정보': '동물정보',
  '절차정보': '절차정보',
}

/** 컬럼 spec 의 기본 라벨을 외부 수신자용 친화 라벨로 덮어쓰기. share-link-dialog 와 동일. */
const COLUMN_LABEL_OVERRIDE: Record<string, string> = {
  customer_name:    '보호자 이름 (한글)',
  customer_name_en: '보호자 이름 (영문)',
  pet_name:         '반려동물 이름 (한글)',
  pet_name_en:      '반려동물 이름 (영문)',
  microchip:        '마이크로칩 번호',
}

/** share-link-dialog 와 동일한 제외 목록 — 외부 수신자가 채울 일 없는 필드. */
const SHARE_EXCLUDED_KEYS = new Set([
  'age', 'rabies_3', 'destination', 'memo', 'notes',
  'customer_first_name_en', 'customer_last_name_en',
  'breed_en', 'color_en', 'sex_en',
  'payment_amount', 'payment_method', 'payments',
  'microchip_secondary', 'japan_extra',
  'address_overseas',
])

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function SharePresetsSection({
  initialPresets = null,
}: {
  initialPresets?: SharePreset[] | null
}) {
  const confirm = useConfirm()
  const { fieldDefs } = useCases()
  const [presets, setPresets] = useState<SharePreset[]>(initialPresets ?? [])
  const [savedPresets, setSavedPresets] = useState<SharePreset[]>(initialPresets ?? [])
  const [loading, setLoading] = useState(initialPresets === null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (initialPresets !== null) return
    listSharePresets().then((r) => {
      if (r.ok) {
        setPresets(r.value)
        setSavedPresets(r.value)
      }
      setLoading(false)
    })
  }, [initialPresets])

  const isDirty = useMemo(
    () => JSON.stringify(presets) !== JSON.stringify(savedPresets),
    [presets, savedPresets],
  )

  /** 모든 가능 필드 — 카테고리 그룹별, 목적지 무관 (조직 단위 프리셋이라 전체 노출).
   *  case-detail / share-link-dialog 와 동일한 좌표계(buildFieldSpecs)로 정렬. */
  const groupedFields = useMemo(() => {
    type Field = { key: string; label: string; order: number; groupOrder: number; subgroup?: string }
    const buckets: Record<typeof CATEGORIES[number], Field[]> = {
      '고객정보': [],
      '동물정보': [],
      '절차정보': [],
      '추가정보': [],
    }

    // 1) 컬럼 + jsonb — case-detail 와 동일 정렬
    const allSpecs = buildFieldSpecs(fieldDefs)
    for (const spec of allSpecs) {
      if (SHARE_EXCLUDED_KEYS.has(spec.key)) continue
      if (SHARE_HIDDEN_BY_VACCINE_GROUPS.has(spec.key)) continue
      const category = SPEC_GROUP_TO_CATEGORY[spec.group]
      if (!category) continue
      const label = COLUMN_LABEL_OVERRIDE[spec.key] ?? spec.label
      buckets[category].push({ key: spec.key, label, order: spec.order, groupOrder: spec.groupOrder })
    }

    // 2) 합성 백신 그룹 — 조직 단위라 모두 노출.
    for (const g of SHARE_VACCINE_GROUPS) {
      buckets['절차정보'].push({ key: g.key, label: g.label, order: g.display_order, groupOrder: 2 })
    }

    // 3) EXTRA 필드 — 같은 group 메타 2개 이상이면 subgroup 으로 묶어 표시 (case-detail / dialog 와 동일).
    const groupCounts = new Map<string, number>()
    for (const key of ALL_EXTRA_FIELD_KEYS) {
      if (key === 'email') continue // 고객정보 전용
      const g = EXTRA_FIELD_DEFS[key]?.group
      if (g) groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1)
    }
    let extraOrder = 0
    for (const key of ALL_EXTRA_FIELD_KEYS) {
      if (key === 'email') continue // 고객정보 전용 (field_definitions 기본정보)
      const def = EXTRA_FIELD_DEFS[key]
      const useGroup = !!def?.group && (groupCounts.get(def.group) ?? 0) >= 2
      const label = useGroup && def?.shortLabel ? def.shortLabel : (EXTRA_FIELD_KEY_LABELS[key] ?? key)
      buckets['추가정보'].push({
        key,
        label,
        subgroup: useGroup ? def!.group : undefined,
        order: extraOrder++,
        groupOrder: 99,
      })
    }

    for (const c of CATEGORIES) {
      buckets[c].sort((a, b) => {
        if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder
        return a.order - b.order
      })
    }
    return CATEGORIES.map((c) => {
      // 같은 subgroup 끼리 블록으로 묶어 반환 (직접 선택의 그룹 표시와 일치).
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
  }, [fieldDefs])

  function addPreset() {
    const next: SharePreset = { id: genId(), name: '새 프리셋', field_keys: [] }
    setPresets((prev) => [...prev, next])
    setExpandedId(next.id)
  }

  function renamePreset(id: string, name: string) {
    setPresets((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
  }

  function toggleField(id: string, key: string) {
    setPresets((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p
        const has = p.field_keys.includes(key)
        return {
          ...p,
          field_keys: has ? p.field_keys.filter((k) => k !== key) : [...p.field_keys, key],
        }
      }),
    )
  }

  async function deletePreset(id: string) {
    const target = presets.find((p) => p.id === id)
    if (!await confirm({
      message: `"${target?.name ?? '프리셋'}" 을 삭제하시겠습니까? 저장하기 전엔 되돌릴 수 있습니다.`,
      okLabel: '삭제',
      variant: 'destructive',
    })) return
    setPresets((prev) => prev.filter((p) => p.id !== id))
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const r = await saveSharePresets(presets)
      if (!r.ok) { setError(r.error); return }
      setSavedPresets(presets)
      setSavedAt(new Date())
    })
  }

  function handleDiscard() {
    setPresets(savedPresets)
    setError(null)
  }

  return (
    <section className="mt-2xl">
      <div className="flex items-baseline justify-between mb-2 gap-md flex-wrap">
        <SettingsSubsectionTitle className="inline-flex items-center gap-sm">
          공유
          {isDirty && (
            <span className="font-mono text-[10.5px] uppercase tracking-[1.2px] px-1.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
              변경됨
            </span>
          )}
          {!isDirty && savedAt && (
            <span className="font-serif italic text-[12px] text-muted-foreground/60">
              저장됨 · {savedAt.toLocaleTimeString()}
            </span>
          )}
        </SettingsSubsectionTitle>
        <div className="flex items-center gap-sm">
          <button
            type="button"
            onClick={handleDiscard}
            disabled={pending || !isDirty}
            className="h-8 px-3 rounded-full border border-border/80 font-serif text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
          >
            되돌리기
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending || !isDirty}
            className="h-8 px-3 rounded-full bg-foreground text-background font-serif text-[13px] hover:bg-foreground/90 transition-colors disabled:opacity-40"
          >
            {pending ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
      <p className="pmw-st__sec-lead mb-md">
        공유 링크 발급 시 빠른 선택으로 노출됩니다. 자주 쓰는 필드 묶음을 미리 만들어두세요.
      </p>
      {error && (
        <p className="font-serif text-[13px] text-destructive mb-2">{error}</p>
      )}

      <div className="border-t border-border/80">
        {loading ? (
          <p className="py-4 font-serif italic text-[14px] text-muted-foreground">불러오는 중…</p>
        ) : presets.length === 0 ? (
          <p className="py-4 font-serif italic text-[14px] text-muted-foreground">
            아직 만든 프리셋이 없습니다.
          </p>
        ) : (
          presets.map((p) => {
            const expanded = expandedId === p.id
            return (
              <div key={p.id} className="border-b border-dotted border-border/80 py-3">
                <div className="flex items-center gap-sm">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : p.id)}
                    className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    aria-label={expanded ? '접기' : '펼치기'}
                  >
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => renamePreset(p.id, e.target.value)}
                    placeholder="프리셋 이름"
                    className="flex-1 bg-transparent font-serif text-[15px] text-foreground border-0 px-0 py-1 focus:outline-none focus:ring-0 placeholder:text-muted-foreground/40"
                  />
                  <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted-foreground/70">
                    {p.field_keys.length} 개
                  </span>
                  <button
                    type="button"
                    onClick={() => deletePreset(p.id)}
                    disabled={pending}
                    aria-label="삭제"
                    className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {expanded && (
                  <div className="mt-3 space-y-lg pl-9">
                    {groupedFields.map((g) => (
                      <div key={g.category}>
                        <h5 className="font-serif text-[14px] font-medium text-foreground mb-2">
                          {g.category}
                        </h5>
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
                                  const active = p.field_keys.includes(f.key)
                                  return (
                                    <button
                                      key={f.key}
                                      type="button"
                                      onClick={() => toggleField(p.id, f.key)}
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
                )}
              </div>
            )
          })
        )}
      </div>

      <button
        type="button"
        onClick={addPreset}
        disabled={pending}
        className="mt-3 inline-flex items-center gap-1 h-8 px-3 rounded-full border border-dashed border-border/70 font-serif text-[13px] text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors disabled:opacity-40"
      >
        <Plus size={13} /> 새 프리셋
      </button>
    </section>
  )
}
