'use client'

import Link from 'next/link'
import { useState, useTransition, type CSSProperties } from 'react'
import { parseDestinations, readJourneyFeedback } from '@petmove/domain'
import { useCase, useCases } from '@/components/portal-shell/case-data-provider'
import { useUnsavedGuard } from '@/components/portal-shell/nav-guard'
import { saveCaseFeedback } from '@/lib/actions/cases'

/**
 * 여정 완료 후 보호자 의견 화면 — /cases/<id>/feedback?dest=<목적지>.
 * 만족도(얼굴 5단계 모노톤) + 자유 의견. case.data.feedback 의 **목적지 칸**에 저장(여정별).
 * 한 번 보낸 뒤에도 수정해서 다시 보낼 수 있다.
 */

const C = {
  bg: 'var(--pm-bg)',
  surface: 'var(--pm-surface)',
  ink: 'var(--pm-ink)',
  ink2: 'var(--pm-ink-2)',
  ink3: 'var(--pm-ink-3)',
  line: 'var(--pm-line)',
  accent: 'var(--pm-accent)',
  sage: 'var(--pm-sage)',
  warn: 'var(--pm-warn)',
} as const

// 표시 순서는 '아주 좋아요'(level 5)를 맨 앞으로 — 긍정 선택을 앞세워 응답 문턱을 낮춘다.
// level(저장값)은 그대로라 점수 의미는 불변, 화면 순서만 역순.
const FACES: { level: number; label: string }[] = [
  { level: 5, label: '아주 좋아요' },
  { level: 4, label: '좋았어요' },
  { level: 3, label: '보통이에요' },
  { level: 2, label: '아쉬워요' },
  { level: 1, label: '많이 아쉬워요' },
]

/** 모노톤 라인 얼굴 — level(1~5)에 따라 입 곡선이 찡그림→미소로 변한다. */
function FaceIcon({ level, size = 30 }: { level: number; size?: number }) {
  const mouth =
    level === 1
      ? 'M8 16.5 Q12 12.5 16 16.5'
      : level === 2
        ? 'M8 15.5 Q12 13.8 16 15.5'
        : level === 3
          ? 'M8 15 L16 15'
          : level === 4
            ? 'M8 14.2 Q12 16.2 16 14.2'
            : 'M8 13.6 Q12 17.6 16 13.6'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="9.2" cy="10" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="10" r="0.7" fill="currentColor" stroke="none" />
      <path d={mouth} />
    </svg>
  )
}

export function FeedbackView({ caseId, dest }: { caseId: string; dest: string | null }) {
  const caseRow = useCase(caseId)
  const { updateCase } = useCases()
  // 목적지 칸의 의견 읽기 — legacy 단일 객체는 첫 목적지 것으로 호환.
  const firstToken = parseDestinations(caseRow?.destination)[0] ?? null
  const fb = readJourneyFeedback(caseRow?.data, dest ?? firstToken, firstToken)
  const saved = { rating: fb?.rating ?? null, text: fb?.text ?? '' }

  const [rating, setRating] = useState<number | null>(saved.rating)
  const [text, setText] = useState(saved.text)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const dirty = rating !== saved.rating || text.trim() !== saved.text
  useUnsavedGuard(dirty)
  const hasContent = rating !== null || text.trim().length > 0
  const alreadySent = saved.rating !== null || saved.text.length > 0
  const justSaved = status === 'saved' && !dirty
  // 내용이 있으면 저장, 또는 이미 남긴 의견을 비웠으면(삭제) 그 비움도 저장. 빈 상태에서
  // 처음부터 빈 채로는 저장할 게 없음(dirty=false). 저장 액션은 빈 값이면 feedback 을 삭제.
  const canSend = (hasContent || alreadySent) && dirty && status !== 'saving'

  function handleSubmit() {
    if (!canSend) return
    setStatus('saving')
    setError(null)
    startTransition(async () => {
      const res = await saveCaseFeedback(caseId, dest ?? firstToken, rating, text.trim() || null)
      if (res.ok) {
        updateCase(res.value)
        setStatus('saved')
        window.setTimeout(() => setStatus('idle'), 1500)
      } else {
        setStatus('error')
        setError(res.error)
      }
    })
  }

  const serif: CSSProperties = {
    fontFamily: 'var(--pm-font-display)',
    fontWeight: 500,
    letterSpacing: '-0.01em',
  }
  const monoCap: CSSProperties = {
    fontSize: 11,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: C.ink3,
    fontWeight: 500,
  }

  return (
    <div
      className="pm-fade-up"
      style={{
        background: C.bg,
        color: C.ink,
        minHeight: '100%',
        paddingTop: 16,
        paddingBottom: 40,
        overflow: 'auto',
      }}
    >
      <div style={{ padding: '0 20px' }}>
        <Link
          href={`/cases/${caseId}/journey${dest ? `?dest=${encodeURIComponent(dest)}` : ''}`}
          style={{
            ...monoCap,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: C.ink2,
            textDecoration: 'none',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          일정
        </Link>

        <h1 style={{ ...serif, fontSize: 24, lineHeight: 1.2, margin: '12px 0 0', color: C.ink }}>
          의견 남기기
        </h1>

        {/* 만족도 — 얼굴 5단계 (모노톤) */}
        <section style={{ marginTop: 24 }}>
          <h3 style={{ ...monoCap, margin: '0 0 12px', padding: '0 2px' }}>만족도</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            {FACES.map((f) => {
              const selected = rating === f.level
              return (
                <button
                  key={f.level}
                  type="button"
                  onClick={() => setRating(selected ? null : f.level)}
                  className="pm-pressable"
                  aria-label={f.label}
                  aria-pressed={selected}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    padding: '12px 2px',
                    borderRadius: 14,
                    border: selected ? `1px solid ${C.accent}` : `.5px solid ${C.line}`,
                    background: selected ? 'rgba(184,153,104,.10)' : C.surface,
                    color: selected ? C.accent : C.ink3,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    transition: 'color .15s, background .15s, border-color .15s',
                  }}
                >
                  <FaceIcon level={f.level} />
                  <span
                    style={{
                      fontSize: 10.5,
                      lineHeight: 1.2,
                      textAlign: 'center',
                      wordBreak: 'keep-all',
                      color: selected ? C.ink2 : C.ink3,
                    }}
                  >
                    {f.label}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        {/* 자유 의견 */}
        <section style={{ marginTop: 22 }}>
          <h3 style={{ ...monoCap, margin: '0 0 10px', padding: '0 2px' }}>하고 싶은 말</h3>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="좋았던 점, 아쉬웠던 점, 개선하면 좋겠는 점 — 무엇이든 들려주세요."
            rows={6}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '14px 14px',
              borderRadius: 14,
              border: `.5px solid ${C.line}`,
              background: C.surface,
              color: C.ink,
              fontFamily: 'inherit',
              fontSize: 15,
              lineHeight: 1.6,
              resize: 'vertical',
              outline: 'none',
            }}
          />
        </section>

        {/* 보낸 뒤 안내 */}
        {alreadySent && !dirty && status !== 'error' && (
          <div
            role="status"
            style={{
              marginTop: 18,
              padding: '12px 14px',
              borderRadius: 12,
              background: 'rgba(143,166,140,.10)',
              border: `.5px solid color-mix(in srgb, ${C.sage} 33%, transparent)`,
              color: C.ink2,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            소중한 의견 감사합니다. 즐거운 하루 되세요 ❤️
          </div>
        )}
        {status === 'error' && (
          <div
            role="alert"
            style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 10,
              background: C.surface,
              border: `.5px solid color-mix(in srgb, ${C.warn} 33%, transparent)`,
              color: C.warn,
              fontSize: 12,
              textAlign: 'center',
            }}
          >
            {error ?? '저장에 실패했어요. 잠시 후 다시 시도하세요.'}
          </div>
        )}

        {/* 보내기 */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSend}
          aria-live="polite"
          style={{
            marginTop: 20,
            width: '100%',
            padding: '14px 0',
            borderRadius: 14,
            border: 0,
            background: justSaved ? C.sage : canSend ? C.accent : 'var(--pm-line)',
            color: justSaved || canSend ? '#fff' : C.ink3,
            fontFamily: 'inherit',
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: '-0.005em',
            cursor: canSend ? 'pointer' : 'not-allowed',
            transition: 'background .15s, color .15s',
          }}
        >
          {status === 'saving'
            ? '남기는 중…'
            : justSaved
              ? '✓ 남겼어요'
              : dirty
                ? alreadySent
                  ? '수정해서 남기기'
                  : '남기기'
                : alreadySent
                  ? '남겼어요'
                  : '남기기'}
        </button>
      </div>
    </div>
  )
}
