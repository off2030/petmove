'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { useCases } from '@/components/cases/cases-context'
import { listSharePresets, saveSharePresets } from '@/lib/actions/share-presets'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { EXTRA_FIELD_KEY_LABELS, ALL_EXTRA_FIELD_KEYS } from '@petmove/domain'
import {
  SHARE_VACCINE_GROUPS,
  SHARE_HIDDEN_BY_VACCINE_GROUPS,
} from '@/lib/share-links-types'
import type { SharePreset } from '@/lib/share-presets-types'

/** 카테고리 정렬 (직접 선택과 동일). */
const CATEGORIES = ['고객정보', '동물정보', '절차정보', '추가정보'] as const

/** 컬럼 → 카테고리·라벨 매핑. */
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

/** field_definitions group_name → 카테고리. 메모/매칭없음은 제외. */
const GROUP_TO_CATEGORY: Record<string, typeof CATEGORIES[number]> = {
  '기본정보': '고객정보',
  '동물정보': '동물정보',
  '절차/식별': '절차정보',
  '절차/예방접종': '절차정보',
  '절차/검사': '절차정보',
  '절차/구충': '절차정보',
}

const SHARE_EXCLUDED_KEYS = new Set(['age', 'rabies_3'])

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

  /** 모든 가능 필드 — 카테고리 그룹별, 목적지 무관 (조직 단위 프리셋이라 전체 노출). */
  const groupedFields = useMemo(() => {
    type Field = { key: string; label: string; order: number }
    const buckets: Record<typeof CATEGORIES[number], Field[]> = {
      '고객정보': [],
      '동물정보': [],
      '절차정보': [],
      '추가정보': [],
    }
    let columnOrder = 0
    for (const [key, category] of Object.entries(COLUMN_TO_CATEGORY)) {
      buckets[category].push({ key, label: COLUMN_LABEL[key], order: columnOrder++ })
    }
    for (const d of fieldDefs) {
      if (d.type === 'multiselect') continue
      if (SHARE_EXCLUDED_KEYS.has(d.key)) continue
      if (SHARE_HIDDEN_BY_VACCINE_GROUPS.has(d.key)) continue
      const category = GROUP_TO_CATEGORY[d.group_name ?? '']
      if (!category) continue
      buckets[category].push({ key: d.key, label: d.label, order: 1000 + d.display_order })
    }
    for (const g of SHARE_VACCINE_GROUPS) {
      buckets['절차정보'].push({ key: g.key, label: g.label, order: 1000 + g.display_order })
    }
    let extraOrder = 2000
    for (const key of ALL_EXTRA_FIELD_KEYS) {
      const label = EXTRA_FIELD_KEY_LABELS[key] ?? key
      buckets['추가정보'].push({ key, label, order: extraOrder++ })
    }
    for (const c of CATEGORIES) buckets[c].sort((a, b) => a.order - b.order)
    return CATEGORIES.map((c) => ({
      category: c,
      fields: buckets[c].map(({ key, label }) => ({ key, label })),
    })).filter((g) => g.fields.length > 0)
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
        <h3 className="font-serif text-[18px] text-foreground inline-flex items-center gap-sm">
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
        </h3>
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
                  <div className="mt-3 space-y-md pl-9">
                    {groupedFields.map((g) => (
                      <div key={g.category}>
                        <p className="font-serif text-[12px] text-muted-foreground/80 mb-1">
                          {g.category}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {g.fields.map((f) => {
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
