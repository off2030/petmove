'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Search, X, ChevronRight } from 'lucide-react'
import { DialogFooter } from '@/components/ui/dialog-footer'
import {
  searchOrganizations,
  searchOrgMembers,
  searchMembersGlobal,
  sendHandoffMessage,
  type OrgSearchResult,
  type OrgMemberSearchResult,
  type GlobalMemberSearchResult,
} from '@/lib/actions/transfers'

interface Props {
  caseId: string
  caseLabel: string
  onClose: () => void
  onSent?: () => void
}

interface PickedRecipient {
  user_id: string
  display: string
  org_name: string
}

/**
 * 케이스 전달 다이얼로그.
 *
 * UX: 단일 드롭다운 — 입력 한 줄로 조직·멤버 동시 검색.
 *  - 멤버 결과 클릭: 바로 수신자 확정
 *  - 조직 결과 클릭: 그 조직의 멤버 목록으로 드릴다운
 */
export function TransferDialog({ caseId, caseLabel, onClose, onSent }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<PickedRecipient | null>(null)

  // unified 검색 결과
  const [orgResults, setOrgResults] = useState<OrgSearchResult[]>([])
  const [memberResults, setMemberResults] = useState<GlobalMemberSearchResult[]>([])
  const [searching, setSearching] = useState(false)

  // 조직 드릴다운 상태 (조직 클릭 시 그 조직의 멤버 보여줌)
  const [drillOrg, setDrillOrg] = useState<OrgSearchResult | null>(null)
  const [drillMembers, setDrillMembers] = useState<OrgMemberSearchResult[]>([])
  const [drillLoading, setDrillLoading] = useState(false)

  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // 자동 포커스
  useEffect(() => { inputRef.current?.focus() }, [])

  // 통합 검색 디바운스
  useEffect(() => {
    if (drillOrg) return // 드릴다운 모드에서는 외부 검색 정지
    const q = query.trim()
    if (q.length === 0) {
      setOrgResults([])
      setMemberResults([])
      return
    }
    setSearching(true)
    const t = setTimeout(async () => {
      const [orgRes, memRes] = await Promise.all([
        searchOrganizations(q),
        searchMembersGlobal(q),
      ])
      if (orgRes.ok) setOrgResults(orgRes.value)
      if (memRes.ok) setMemberResults(memRes.value)
      setSearching(false)
    }, 220)
    return () => clearTimeout(t)
  }, [query, drillOrg])

  // 드릴다운 모드에서 멤버 fetch
  useEffect(() => {
    if (!drillOrg) return
    setDrillLoading(true)
    const t = setTimeout(async () => {
      const r = await searchOrgMembers(drillOrg.id, query)
      if (r.ok) setDrillMembers(r.value)
      setDrillLoading(false)
    }, 220)
    return () => clearTimeout(t)
  }, [drillOrg, query])

  // 외부 클릭으로 드롭다운 닫기
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (
        !dropdownRef.current?.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function handlePickMember(m: GlobalMemberSearchResult | OrgMemberSearchResult, orgName?: string) {
    const display = m.name?.trim() || m.email
    const org = 'org_name' in m ? m.org_name : (orgName ?? '')
    setPicked({ user_id: m.user_id, display, org_name: org })
    setQuery('')
    setOrgResults([])
    setMemberResults([])
    setDrillOrg(null)
    setDrillMembers([])
    setOpen(false)
  }

  function handlePickOrg(o: OrgSearchResult) {
    setDrillOrg(o)
    setQuery('')
    setOrgResults([])
    setMemberResults([])
    setOpen(true)
    inputRef.current?.focus()
  }

  function handleClearPicked() {
    setPicked(null)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function handleBackFromDrill() {
    setDrillOrg(null)
    setDrillMembers([])
    setQuery('')
    inputRef.current?.focus()
  }

  function handleSubmit() {
    if (!picked) return
    setError(null)
    startTransition(async () => {
      const r = await sendHandoffMessage({
        sourceCaseId: caseId,
        toUserId: picked.user_id,
        note: note.trim() || null,
      })
      if (!r.ok) {
        setError(r.error)
        return
      }
      onSent?.()
      onClose()
      router.push('/messages')
    })
  }

  // ESC 닫기 (전체 다이얼로그)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (open) setOpen(false)
        else onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, open])

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  const showDropdown = open && !picked
  const hasResults = orgResults.length > 0 || memberResults.length > 0
  const inDrillMode = !!drillOrg

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-md"
      onClick={onClose}
    >
      <div
        className="w-[480px] max-w-full rounded-lg border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-md px-lg pt-lg pb-md border-b border-border/60">
          <div className="min-w-0">
            <h2 className="font-serif text-[18px] font-medium leading-tight text-foreground">
              다른 조직으로 전달
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

        {/* Body */}
        <div className="px-lg py-md">
          <label className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted-foreground/80">
            받는 사람
          </label>

          {picked ? (
            <div className="mt-1 flex items-center justify-between gap-sm rounded-md border border-border/80 bg-muted/20 px-md py-2">
              <div className="min-w-0">
                <div className="font-serif text-[15px] text-foreground truncate">{picked.display}</div>
                <div className="font-serif italic text-[12px] text-muted-foreground truncate">
                  {picked.org_name}
                </div>
              </div>
              <button
                type="button"
                onClick={handleClearPicked}
                className="shrink-0 font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted-foreground hover:text-foreground transition-colors"
              >
                변경
              </button>
            </div>
          ) : (
            <div className="relative mt-1">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none"
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
                onFocus={() => setOpen(true)}
                placeholder={inDrillMode ? `${drillOrg!.name} 의 멤버 검색…` : '조직명 또는 사람 이름·이메일'}
                className="w-full pl-9 pr-3 py-2 rounded-md border border-border/80 bg-background font-serif text-[15px] focus:outline-none focus:border-foreground/40"
              />

              {showDropdown && (
                <div
                  ref={dropdownRef}
                  className="absolute left-0 right-0 top-full mt-1 z-50 max-h-[320px] overflow-y-auto rounded-md border border-border bg-popover shadow-lg"
                >
                  {inDrillMode ? (
                    <>
                      <div className="flex items-center gap-1 px-md py-2 border-b border-border/40 sticky top-0 bg-popover">
                        <button
                          type="button"
                          onClick={handleBackFromDrill}
                          className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted-foreground hover:text-foreground"
                        >
                          ← 전체 검색
                        </button>
                        <span className="ml-auto font-serif text-[12px] text-muted-foreground truncate">
                          {drillOrg!.name}
                        </span>
                      </div>
                      {drillLoading ? (
                        <p className="font-serif italic text-[13px] text-muted-foreground py-4 text-center">
                          불러오는 중…
                        </p>
                      ) : drillMembers.length === 0 ? (
                        <p className="font-serif italic text-[13px] text-muted-foreground/70 py-4 text-center">
                          멤버가 없습니다.
                        </p>
                      ) : (
                        <ul>
                          {drillMembers.map((m) => (
                            <li key={m.user_id}>
                              <button
                                type="button"
                                onClick={() => handlePickMember(m, drillOrg!.name)}
                                className="w-full text-left px-md py-2 hover:bg-accent/40 transition-colors font-serif text-[14px] text-foreground"
                              >
                                {m.name?.trim() || m.email}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : query.trim().length === 0 ? (
                    <p className="font-serif italic text-[13px] text-muted-foreground/70 py-4 text-center">
                      조직명 또는 사람 이름을 입력하세요.
                    </p>
                  ) : searching ? (
                    <p className="font-serif italic text-[13px] text-muted-foreground py-4 text-center">
                      검색 중…
                    </p>
                  ) : !hasResults ? (
                    <p className="font-serif italic text-[13px] text-muted-foreground/70 py-4 text-center">
                      결과가 없습니다.
                    </p>
                  ) : (
                    <>
                      {memberResults.length > 0 && (
                        <div>
                          <div className="px-md pt-2 pb-1 font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted-foreground/70">
                            사람
                          </div>
                          <ul>
                            {memberResults.map((m) => (
                              <li key={`${m.user_id}-${m.org_id}`}>
                                <button
                                  type="button"
                                  onClick={() => handlePickMember(m)}
                                  className="w-full text-left px-md py-2 hover:bg-accent/40 transition-colors"
                                >
                                  <div className="font-serif text-[14px] text-foreground leading-tight">
                                    {m.name?.trim() || m.email}
                                  </div>
                                  <div className="font-serif italic text-[12px] text-muted-foreground mt-0.5">
                                    {m.org_name}
                                  </div>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {orgResults.length > 0 && (
                        <div>
                          <div className="px-md pt-2 pb-1 font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted-foreground/70 border-t border-border/40">
                            조직
                          </div>
                          <ul>
                            {orgResults.map((o) => (
                              <li key={o.id}>
                                <button
                                  type="button"
                                  onClick={() => handlePickOrg(o)}
                                  className="w-full text-left px-md py-2 hover:bg-accent/40 transition-colors flex items-center gap-sm"
                                >
                                  <span className="font-serif text-[14px] text-foreground flex-1">{o.name}</span>
                                  <ChevronRight size={14} className="shrink-0 text-muted-foreground/60" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <label className="block mt-md">
            <span className="font-mono text-[10.5px] uppercase tracking-[1.2px] text-muted-foreground/80">
              메모 (선택)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="받는 쪽에 전달할 메시지가 있다면 적어주세요."
              className="mt-1 w-full px-3 py-2 rounded-md border border-border/80 bg-background font-serif text-[14px] resize-none focus:outline-none focus:border-foreground/40"
            />
          </label>

          <p className="mt-3 font-serif italic text-[12px] text-muted-foreground/80 leading-relaxed">
            받는 사람과의 메시지 대화에 케이스 카드가 발송됩니다. 카드 안에서 수락/거부할 수 있고,
            수락 시 받는 쪽 조직에 새 케이스로 추가됩니다 (고객·반려동물 정보만 복사).
          </p>
          {error && (
            <p className="mt-2 font-serif text-[13px] text-destructive">{error}</p>
          )}
        </div>

        <div className="px-lg pb-md pt-1">
          <DialogFooter
            onCancel={onClose}
            onPrimary={handleSubmit}
            primaryLabel="메시지로 보내기"
            savingLabel="보내는 중…"
            saving={pending}
            primaryDisabled={!picked}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
