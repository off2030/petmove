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

import { C } from '@/lib/palette'

// 표시 순서는 '아주 좋아요'(level 5)를 맨 앞으로 — 긍정 선택을 앞세워 응답 문턱을 낮춘다.
// level(저장값)은 그대로라 점수 의미는 불변, 화면 순서만 역순.
/** 이름 + 와/과 — 마지막 글자 받침 유무로 결정. 한글 음절이 아니면(영문 등) '와' 기본. */
function withWaGwa(name: string): string {
  const last = name.charCodeAt(name.length - 1)
  if (last >= 0xac00 && last <= 0xd7a3) {
    return (last - 0xac00) % 28 !== 0 ? `${name}과` : `${name}와`
  }
  return `${name}와`
}

/** 만족도 얼굴 5단계 — 좋은 순. 완료 히어로 아래 소감 카드(timeline-calm)와 공유. */
export const FACES: { level: number; label: string }[] = [
  { level: 5, label: '아주 좋아요' },
  { level: 4, label: '좋았어요' },
  { level: 3, label: '보통이에요' },
  { level: 2, label: '아쉬워요' },
  { level: 1, label: '많이 아쉬워요' },
]

/** 모노톤 라인 얼굴 — level(1~5)에 따라 입 곡선이 찡그림→미소로 변한다. */
export function FaceIcon({ level, size = 30 }: { level: number; size?: number }) {
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

export function FeedbackView({
  caseId,
  dest,
  initialRating = null,
}: {
  caseId: string
  dest: string | null
  /** 소감 카드의 얼굴 원탭으로 진입 시 미리 선택할 만족도(?rating=). 저장 전 초기값. */
  initialRating?: number | null
}) {
  const caseRow = useCase(caseId)
  const { updateCase } = useCases()
  // 목적지 칸의 의견 읽기 — legacy 단일 객체는 첫 목적지 것으로 호환.
  const firstToken = parseDestinations(caseRow?.destination)[0] ?? null
  const fb = readJourneyFeedback(caseRow?.data, dest ?? firstToken, firstToken)
  const saved = { rating: fb?.rating ?? null, text: fb?.text ?? '' }

  // 시작 선택값 — 원탭 진입(?rating) > 저장된 값 > '아주 좋아요'(5) 기본 선택.
  // (2026-07-12 사용자 확정: 빈 상태 대신 첫 얼굴이 선택된 채 시작 — 만족한 보호자는
  // 열자마자 '남기기' 한 번이면 끝.)
  const initialShown = initialRating ?? saved.rating ?? 5
  const [rating, setRating] = useState<number | null>(initialShown)
  const [text, setText] = useState(saved.text)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // 저장 기준 변경 여부(보내기 활성) vs 사용자 조작 여부(이탈 경고) 를 분리 —
  // 기본 선택(5)만 붙은 채 아무것도 안 만졌다면 경고 없이 떠날 수 있어야 한다.
  const changedFromSaved = rating !== saved.rating || text.trim() !== saved.text
  const touched = rating !== initialShown || text.trim() !== saved.text
  useUnsavedGuard(touched)
  const hasContent = rating !== null || text.trim().length > 0
  const alreadySent = saved.rating !== null || saved.text.length > 0
  const justSaved = status === 'saved' && !changedFromSaved
  // 내용이 있으면 저장, 또는 이미 남긴 의견을 비웠으면(삭제) 그 비움도 저장.
  // 저장 액션은 빈 값이면 feedback 을 삭제.
  const canSend = (hasContent || alreadySent) && changedFromSaved && status !== 'saving'

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
    fontSize: 12,
    color: C.ink3,
    fontWeight: 600,
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

        {/* 제목 = 소감 카드와 같은 질문 — 카드→페이지가 한 번의 대화로 이어지게.
            '의견 남기기' 기능명은 하단 버튼('남기기')이 담당. */}
        <h1 style={{ ...serif, fontSize: 18, lineHeight: 1.2, margin: '12px 0 0', color: C.ink }}>
          {caseRow?.pet_name ? `${withWaGwa(caseRow.pet_name)}의 여정, 어떠셨나요?` : '이번 여정, 어떠셨나요?'}
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
                    background: selected ? 'rgba(33,33,36,.06)' : C.surface,
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
          {/* 읽힌다는 확신 — 자유 의견 응답률을 위한 신뢰 한 줄. */}
          <p style={{ margin: '8px 2px 0', fontSize: 12, color: C.ink3, lineHeight: 1.5 }}>
            남겨주신 의견은 펫무브 팀이 모두 읽어요
          </p>
        </section>

        {/* 보낸 뒤 안내 */}
        {alreadySent && !changedFromSaved && status !== 'error' && (
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
            소중한 의견 감사합니다.{' '}
            {caseRow?.pet_name ? `${withWaGwa(caseRow.pet_name)} 행복한 시간 보내세요` : '즐거운 하루 되세요'} ❤️
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
              border: `.5px solid color-mix(in srgb, ${C.danger} 33%, transparent)`,
              color: C.danger,
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
              : changedFromSaved
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
