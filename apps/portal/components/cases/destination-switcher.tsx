'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { CaseRow } from '@petmove/domain'

/**
 * 케이스 detail 페이지(journey/docs/info/feedback) 의 activeDestination 칩 전환기.
 *
 * - destinations 가 1개 이하면 null 반환 (의미 없음, 노출 X)
 * - 칩 클릭 → URL `?dest=<token>` (새로고침·뒤로가기에 유지)
 * - 추가/제거 X — 그 액션은 동물 상세(`/me/animal/[caseId]`) 의 DestinationChips 전용
 *
 * 활성 destination 분기는 호출처(timeline, docs, info, feedback) 의 책임 — 이 컴포넌트
 * 는 URL 상태만 관리.
 */
export function DestinationSwitcher({ caseRow }: { caseRow: CaseRow }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const tokens = (caseRow.destination ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  if (tokens.length <= 1) return null

  const tripTypeRaw = (caseRow.data as Record<string, unknown> | null)?.trip_type
  const tripTypeByDest =
    tripTypeRaw && typeof tripTypeRaw === 'object' && !Array.isArray(tripTypeRaw)
      ? (tripTypeRaw as Record<string, 'round' | 'one_way'>)
      : {}

  const active = searchParams.get('dest') ?? tokens[0]

  function setActive(dest: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('dest', dest)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        padding: '0 20px 12px',
      }}
    >
      {tokens.map((t) => {
        const isActive = t === active
        const arrow = (tripTypeByDest[t] ?? 'round') === 'round' ? '⇄' : '→'
        return (
          <button
            key={t}
            type="button"
            onClick={() => setActive(t)}
            aria-pressed={isActive}
            style={{
              padding: '5px 12px',
              borderRadius: 999,
              border: `1px solid ${isActive ? 'var(--pm-ink)' : 'var(--pm-line)'}`,
              background: isActive ? 'var(--pm-ink)' : 'transparent',
              color: isActive ? 'var(--pm-surface)' : 'var(--pm-ink-2)',
              fontFamily: 'inherit',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background .12s, color .12s, border-color .12s',
            }}
          >
            {t} {arrow}
          </button>
        )
      })}
    </div>
  )
}
