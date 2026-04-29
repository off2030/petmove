'use client'

import { forwardRef, useEffect, useImperativeHandle, useState, useTransition } from 'react'
import { ExternalLink as ExternalLinkIcon, Plus, Trash2 } from 'lucide-react'
import type { ExternalLink, ExternalLinkCategory, ExternalLinksConfig } from '@petmove/domain'
import { saveExternalLinksAction } from '@/lib/actions/external-links-action'

export type ExternalLinksMode = 'view' | 'edit'

export interface ExternalLinksHandle {
  startEdit: () => void
  cancelEdit: () => void
  save: () => void
}

function genId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

function emptyLink(): ExternalLink {
  return { id: genId('link'), name: '', url: '', description: '' }
}

function emptyCategory(): ExternalLinkCategory {
  return { id: genId('cat'), label: '새 카테고리', links: [] }
}

export const ExternalLinks = forwardRef<
  ExternalLinksHandle,
  {
    initialConfig: ExternalLinksConfig
    onModeChange?: (mode: ExternalLinksMode) => void
    onSavingChange?: (saving: boolean) => void
  }
>(function ExternalLinks({ initialConfig, onModeChange, onSavingChange }, ref) {
  const [mode, setMode] = useState<ExternalLinksMode>('view')
  const [config, setConfig] = useState<ExternalLinksConfig>(initialConfig)
  const [draft, setDraft] = useState<ExternalLinksConfig>(initialConfig)
  const [error, setError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()

  useEffect(() => {
    onModeChange?.(mode)
  }, [mode, onModeChange])

  useEffect(() => {
    onSavingChange?.(saving)
  }, [saving, onSavingChange])

  useImperativeHandle(ref, () => ({ startEdit, cancelEdit, save }))

  function startEdit() {
    setDraft(structuredClone(config))
    setError(null)
    setMode('edit')
  }

  function cancelEdit() {
    setDraft(config)
    setError(null)
    setMode('view')
  }

  function save() {
    startSave(async () => {
      const cleaned: ExternalLinksConfig = {
        categories: draft.categories
          .map((c) => ({
            ...c,
            label: c.label.trim(),
            links: c.links
              .map((l) => ({
                ...l,
                name: l.name.trim(),
                url: l.url.trim(),
                description: l.description.trim(),
                flag: l.flag?.trim() || undefined,
              }))
              .filter((l) => l.name && l.url),
          }))
          .filter((c) => c.label),
      }
      const r = await saveExternalLinksAction(cleaned)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setConfig(r.config)
      setDraft(r.config)
      setMode('view')
      setError(null)
    })
  }

  function updateCategory(idx: number, patch: Partial<ExternalLinkCategory>) {
    setDraft((d) => {
      const next = [...d.categories]
      next[idx] = { ...next[idx], ...patch }
      return { categories: next }
    })
  }

  function deleteCategory(idx: number) {
    setDraft((d) => ({ categories: d.categories.filter((_, i) => i !== idx) }))
  }

  function addCategory() {
    setDraft((d) => ({ categories: [...d.categories, emptyCategory()] }))
  }

  function updateLink(catIdx: number, linkIdx: number, patch: Partial<ExternalLink>) {
    setDraft((d) => {
      const cats = [...d.categories]
      const links = [...cats[catIdx].links]
      links[linkIdx] = { ...links[linkIdx], ...patch }
      cats[catIdx] = { ...cats[catIdx], links }
      return { categories: cats }
    })
  }

  function deleteLink(catIdx: number, linkIdx: number) {
    setDraft((d) => {
      const cats = [...d.categories]
      cats[catIdx] = {
        ...cats[catIdx],
        links: cats[catIdx].links.filter((_, i) => i !== linkIdx),
      }
      return { categories: cats }
    })
  }

  function addLink(catIdx: number) {
    setDraft((d) => {
      const cats = [...d.categories]
      cats[catIdx] = { ...cats[catIdx], links: [...cats[catIdx].links, emptyLink()] }
      return { categories: cats }
    })
  }

  if (mode === 'view') {
    return (
      <div className="flex flex-col gap-xl">
        <p className="font-serif italic text-[14px] text-muted-foreground">
          업무에 자주 쓰는 외부 사이트
        </p>

        {config.categories.length === 0 ? (
          <p className="font-serif text-[14px] text-muted-foreground italic">
            아직 등록된 링크가 없습니다. 상단의 "편집" 으로 추가하세요.
          </p>
        ) : (
          config.categories.map((cat) => (
            <section key={cat.id} className="flex flex-col gap-sm">
              <h2 className="font-serif text-[18px] text-foreground">{cat.label}</h2>
              <div className="flex flex-col">
                {cat.links.length === 0 ? (
                  <p className="font-serif text-[13px] text-muted-foreground italic px-1 py-2">
                    (비어 있음)
                  </p>
                ) : (
                  cat.links.map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-sm px-1 py-2 border-b border-border/40 hover:bg-muted/30 transition-colors"
                    >
                      {link.flag && (
                        <span className="shrink-0 text-[18px] leading-none">{link.flag}</span>
                      )}
                      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-baseline sm:gap-sm">
                        <span className="font-serif text-[15px] text-foreground truncate">
                          {link.name}
                        </span>
                        {link.description && (
                          <span className="font-serif text-[13px] text-muted-foreground italic truncate">
                            {link.description}
                          </span>
                        )}
                      </div>
                      <ExternalLinkIcon className="shrink-0 w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </a>
                  ))
                )}
              </div>
            </section>
          ))
        )}
      </div>
    )
  }

  // edit mode
  return (
    <div className="flex flex-col gap-xl">
      <div className="flex items-center justify-between gap-sm">
        <p className="font-serif italic text-[14px] text-muted-foreground">
          편집 중 — 변경사항은 "저장" 시 적용
        </p>
        <button
          type="button"
          onClick={cancelEdit}
          disabled={saving}
          className="px-md py-1.5 text-sm font-serif text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
        >
          취소
        </button>
      </div>

      {error && (
        <p className="font-serif text-[13px] text-destructive">{error}</p>
      )}

      {draft.categories.map((cat, catIdx) => (
        <section key={cat.id} className="flex flex-col gap-sm">
          <div className="flex items-center gap-sm">
            <input
              type="text"
              value={cat.label}
              onChange={(e) => updateCategory(catIdx, { label: e.target.value })}
              placeholder="카테고리 이름"
              className="flex-1 font-serif text-[18px] bg-transparent border-b border-border/80 px-1 py-1 focus:border-foreground outline-none transition-colors"
            />
            <button
              type="button"
              onClick={() => deleteCategory(catIdx)}
              className="shrink-0 p-1.5 text-muted-foreground hover:text-destructive transition-colors"
              title="카테고리 삭제"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-col gap-xs pl-0">
            {cat.links.map((link, linkIdx) => (
              <div
                key={link.id}
                className="flex items-start gap-xs py-1 border-b border-border/30"
              >
                <input
                  type="text"
                  value={link.flag ?? ''}
                  onChange={(e) => updateLink(catIdx, linkIdx, { flag: e.target.value })}
                  placeholder="🏳️"
                  className="w-10 text-center text-[16px] bg-transparent border border-border/40 rounded px-1 py-1 focus:border-foreground outline-none"
                />
                <div className="flex-1 min-w-0 flex flex-col gap-xs">
                  <input
                    type="text"
                    value={link.name}
                    onChange={(e) => updateLink(catIdx, linkIdx, { name: e.target.value })}
                    placeholder="기관명"
                    className="font-serif text-[14px] bg-transparent border-b border-border/40 px-1 py-1 focus:border-foreground outline-none transition-colors"
                  />
                  <input
                    type="url"
                    value={link.url}
                    onChange={(e) => updateLink(catIdx, linkIdx, { url: e.target.value })}
                    placeholder="https://..."
                    className="font-mono text-[12px] bg-transparent border-b border-border/40 px-1 py-1 focus:border-foreground outline-none transition-colors"
                  />
                  <input
                    type="text"
                    value={link.description}
                    onChange={(e) =>
                      updateLink(catIdx, linkIdx, { description: e.target.value })
                    }
                    placeholder="용도 설명"
                    className="font-serif text-[12px] italic bg-transparent border-b border-border/40 px-1 py-1 focus:border-foreground outline-none transition-colors"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => deleteLink(catIdx, linkIdx)}
                  className="shrink-0 p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                  title="링크 삭제"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => addLink(catIdx)}
              className="self-start flex items-center gap-1 px-1 py-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              링크 추가
            </button>
          </div>
        </section>
      ))}

      <button
        type="button"
        onClick={addCategory}
        className="self-start flex items-center gap-1 px-2 py-1.5 text-[13px] text-muted-foreground hover:text-foreground border border-dashed border-border/80 rounded transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        카테고리 추가
      </button>
    </div>
  )
})
