'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { useCases } from '@/components/cases/cases-context'
import { listSharePresets, saveSharePresets } from '@/lib/actions/share-presets'
import { PillButton, useConfirm } from '@petmove/ui'
import { cn } from '@/lib/utils'
import { SettingsActionButton, SettingsSubsectionTitle } from './settings-layout'
import { ALL_EXTRA_FIELD_KEYS } from '@petmove/domain'
import { buildShareFieldLayout } from '@petmove/domain'
import type { SharePreset } from '@/lib/share-presets-types'

/** 조직 단위 프리셋 — 모든 EXTRA 필드를 destination 무관하게 노출. species 필터도 미적용. */
const ALL_EXTRA_ENTRIES = ALL_EXTRA_FIELD_KEYS.map((k) => ({ key: k }))

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

  /** 모든 가능 필드 — 다이얼로그/수신자 폼/case-detail 과 동일한 좌표계 (단일 진실 공급원). */
  const groupedFields = useMemo(
    () => buildShareFieldLayout({
      fieldDefs,
      extraFieldEntries: ALL_EXTRA_ENTRIES,
      caseScoped: null, // 조직 단위 — 목적지/종 필터 미적용
    }),
    [fieldDefs],
  )

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
          <SettingsActionButton onClick={handleDiscard} disabled={pending || !isDirty}>
            되돌리기
          </SettingsActionButton>
          <PillButton variant="solid" onClick={handleSave} disabled={pending || !isDirty}>
            {pending ? '저장 중…' : '변경사항 저장'}
          </PillButton>
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
                        <h5 className="font-serif text-[15px] font-semibold text-foreground mb-3 pb-1 border-b border-dotted border-border/60">
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
