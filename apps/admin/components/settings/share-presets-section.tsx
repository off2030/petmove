'use client'

/**
 * 정보 요청 링크 프리셋 설정 — 요약 목록 + 편집 팝업 (2026-08-06 재설계).
 *
 * 옛 구조는 카드 안에서 아코디언을 펼쳐 필드 칩 수십 개를 쏟아내고, 카드 하단에
 * 되돌리기/저장을 따로 뒀다. 이제 목록은 한 줄 요약(이름·필드 수·파일 수)만 보여주고
 * 편집은 팝업에서 끝낸다(팝업 저장 = 서버 저장). 프리셋은 필드에 더해 **파일 요청**도
 * 담는다 — 프리셋 하나로 필드+파일이 함께 선택되도록.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useCases } from '@/components/cases/cases-context'
import { listSharePresets, saveSharePresets } from '@/lib/actions/share-presets'
import { useConfirm } from '@petmove/ui'
import { cn } from '@/lib/utils'
import { DialogFooter } from '@/components/ui/dialog-footer'
import {
  SettingsActionButton,
  SettingsCard,
  SettingsControlGroup,
  SettingsIconButton,
  SettingsSectionLabelSerif,
  SettingsToggleButton,
} from './settings-layout'
import { ALL_EXTRA_FIELD_KEYS, SHARE_FILE_REQUESTS } from '@petmove/domain'
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
  const [loading, setLoading] = useState(initialPresets === null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  /** 편집 중 프리셋 — 'new' 면 추가. */
  const [editing, setEditing] = useState<SharePreset | 'new' | null>(null)

  useEffect(() => {
    if (initialPresets !== null) return
    listSharePresets().then((r) => {
      if (r.ok) setPresets(r.value)
      setLoading(false)
    })
  }, [initialPresets])

  /** 모든 가능 필드 — 다이얼로그/수신자 폼/case-detail 과 동일한 좌표계 (단일 진실 공급원). */
  const groupedFields = useMemo(
    () => buildShareFieldLayout({
      fieldDefs,
      extraFieldEntries: ALL_EXTRA_ENTRIES,
      caseScoped: null, // 조직 단위 — 여행지/종 필터 미적용
    }),
    [fieldDefs],
  )

  /** 목록 변경을 즉시 서버 저장 — 팝업 저장·삭제 양쪽에서 사용. */
  function persist(next: SharePreset[]) {
    const prev = presets
    setPresets(next)
    setError(null)
    startTransition(async () => {
      const r = await saveSharePresets(next)
      if (!r.ok) {
        setPresets(prev)
        setError(r.error)
      }
    })
  }

  function commit(preset: SharePreset) {
    const exists = presets.some((p) => p.id === preset.id)
    persist(exists ? presets.map((p) => (p.id === preset.id ? preset : p)) : [...presets, preset])
    setEditing(null)
  }

  async function deletePreset(p: SharePreset) {
    if (!await confirm({
      message: `"${p.name}" 을 삭제할까요?`,
      okLabel: '삭제',
      variant: 'destructive',
    })) return
    persist(presets.filter((x) => x.id !== p.id))
  }

  return (
    <SettingsCard title="정보 요청 링크 프리셋">
      {error && (
        <p className="font-serif text-[13px] text-destructive mb-2">{error}</p>
      )}

      <div className="border-t border-border/80">
        {loading ? (
          <p className="py-4 font-serif text-[14px] text-muted-foreground">불러오는 중…</p>
        ) : presets.length === 0 ? (
          <p className="py-4 font-serif text-[14px] text-muted-foreground">
            아직 만든 프리셋이 없습니다.
          </p>
        ) : (
          presets.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-md py-2.5 border-b border-dotted border-border/80"
            >
              <span className="flex-1 min-w-0 truncate font-serif text-[15px] text-foreground">
                {p.name}
              </span>
              <span className="shrink-0 font-mono text-[11px] tracking-[0.5px] text-muted-foreground/70">
                필드 {p.field_keys.length}
              </span>
              <span className="shrink-0 font-mono text-[11px] tracking-[0.5px] text-muted-foreground/70">
                파일 {p.file_keys?.length ?? 0}
              </span>
              <SettingsControlGroup size="sm" className="shrink-0">
                <SettingsActionButton onClick={() => setEditing(p)} disabled={pending}>
                  편집
                </SettingsActionButton>
                <SettingsIconButton
                  variant="destructive"
                  onClick={() => deletePreset(p)}
                  disabled={pending}
                  aria-label={`${p.name} 삭제`}
                  title="삭제"
                >
                  <Trash2 size={13} />
                </SettingsIconButton>
              </SettingsControlGroup>
            </div>
          ))
        )}
      </div>

      <div className="pt-3">
        <SettingsActionButton onClick={() => setEditing('new')} disabled={pending}>
          <Plus className="h-3 w-3" />
          프리셋 추가
        </SettingsActionButton>
      </div>

      {editing && (
        <PresetEditModal
          initial={editing === 'new' ? { id: genId(), name: '', field_keys: [], file_keys: [] } : editing}
          isNew={editing === 'new'}
          groupedFields={groupedFields}
          onClose={() => setEditing(null)}
          onSubmit={commit}
        />
      )}
    </SettingsCard>
  )
}

/* ── 편집 팝업 — 이름 + 필드/파일 선택 ── */

type GroupedFields = ReturnType<typeof buildShareFieldLayout>

function PresetEditModal({
  initial,
  isNew,
  groupedFields,
  onClose,
  onSubmit,
}: {
  initial: SharePreset
  isNew: boolean
  groupedFields: GroupedFields
  onClose: () => void
  onSubmit: (preset: SharePreset) => void
}) {
  const [name, setName] = useState(initial.name)
  const [fieldKeys, setFieldKeys] = useState<string[]>(initial.field_keys)
  const [fileKeys, setFileKeys] = useState<string[]>(initial.file_keys ?? [])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!mounted) return null

  function toggleField(key: string) {
    setFieldKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }
  function toggleFile(key: string) {
    setFileKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const canSubmit = name.trim().length > 0 && (fieldKeys.length > 0 || fileKeys.length > 0)

  function submit() {
    if (!canSubmit) return
    onSubmit({
      id: initial.id,
      name: name.trim(),
      field_keys: fieldKeys,
      ...(fileKeys.length > 0 ? { file_keys: fileKeys } : {}),
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-[600px] max-w-full max-h-[85vh] flex flex-col rounded-sm border border-border/80 bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between border-b border-border/80 px-lg py-3">
          <span className="font-serif text-[16px] text-foreground">
            {isNew ? '프리셋 추가' : '프리셋 편집'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground/60 hover:text-foreground transition-colors"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-lg py-md space-y-lg">
          <div>
            <p className="mb-1.5 font-serif text-[13px] text-muted-foreground">이름</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 일본 사전 신고"
              autoFocus
              className="w-full bg-transparent font-serif text-[15px] text-foreground border-b border-border/80 px-0.5 py-1 focus:outline-none focus:border-foreground/40 transition-colors placeholder:text-muted-foreground/40"
            />
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between gap-md">
              <p className="font-serif text-[13px] text-muted-foreground">
                요청 항목
                <span className="ml-2 font-mono text-[11px] text-muted-foreground/70">
                  필드 {fieldKeys.length} · 파일 {fileKeys.length}
                </span>
              </p>
              {(fieldKeys.length > 0 || fileKeys.length > 0) && (
                <button
                  type="button"
                  onClick={() => { setFieldKeys([]); setFileKeys([]) }}
                  className="pmw-st__btn-ghost hover:text-foreground transition-colors"
                >
                  모두 해제
                </button>
              )}
            </div>

            {/* 파일 요청 — 필드보다 개수가 적고 케이스마다 매번 필요해 맨 위. */}
            <div className="mb-lg">
              <SettingsSectionLabelSerif className="mb-2">파일</SettingsSectionLabelSerif>
              <SettingsControlGroup size="sm" wrap className="gap-1">
                {SHARE_FILE_REQUESTS.map((f) => (
                  <SettingsToggleButton
                    key={f.key}
                    pressed={fileKeys.includes(f.key)}
                    onClick={() => toggleFile(f.key)}
                    title={f.destinations === 'all' ? '모든 여행지' : `${f.destinations.join(', ')} 요청 파일`}
                  >
                    {f.label}
                  </SettingsToggleButton>
                ))}
              </SettingsControlGroup>
            </div>

            {groupedFields.map((g) => (
              <div key={g.category} className="mb-lg last:mb-0">
                <SettingsSectionLabelSerif className="mb-2">{g.category}</SettingsSectionLabelSerif>
                <div className="space-y-2">
                  {g.blocks.map((block, bi) => (
                    <div key={block.subgroup ?? `__flat-${bi}`}>
                      {block.subgroup && (
                        <p className="font-mono text-[10px] uppercase tracking-[1.1px] text-muted-foreground/70 mb-1">
                          {block.subgroup}
                        </p>
                      )}
                      <SettingsControlGroup size="sm" wrap className="gap-1">
                        {block.fields.map((f) => (
                          <SettingsToggleButton
                            key={f.key}
                            pressed={fieldKeys.includes(f.key)}
                            onClick={() => toggleField(f.key)}
                          >
                            {f.label}
                          </SettingsToggleButton>
                        ))}
                      </SettingsControlGroup>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter
          bordered
          className="shrink-0"
          onCancel={onClose}
          onPrimary={submit}
          primaryLabel="저장"
          primaryDisabled={!canSubmit}
        />
      </div>
    </div>,
    document.body,
  )
}
