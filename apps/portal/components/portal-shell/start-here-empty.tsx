'use client'

import Link from 'next/link'
import { C } from '@/lib/palette'

/**
 * 처음 진입(등록한 반려동물 0마리) 빈 상태 — '시작하기'로 신청서(/apply)를 안내.
 *
 * 일정 탭의 환영 화면(cases/page.tsx 의 EmptyState)과 같은 톤. 동물이 하나도 없는
 * 신규 사용자가 내 정보·서비스 탭에 들어왔을 때, 휑한 프로필 허브나 일반 서비스
 * 안내 대신 이 화면으로 '시작하기' 한 길만 보여준다. 동물을 한 마리라도 등록하면
 * 각 탭은 원래 내용으로 돌아간다.
 */
export function StartHereEmpty({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <div
      className="pm-fade-up"
      style={{
        // main 본문 영역(100dvh − 상단 safe+48 − 하단 88)을 채워 세로 중앙 정렬.
        minHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 48px - 88px)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 14,
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--pm-font-display)',
          fontSize: 21,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          lineHeight: 1.4,
          margin: 0,
          color: C.ink,
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p style={{ fontSize: 14, color: C.ink3, margin: 0, lineHeight: 1.5 }}>{subtitle}</p>
      )}
      <Link
        href="/apply"
        style={{
          marginTop: 4,
          padding: '11px 22px',
          borderRadius: 999,
          background: C.accent,
          color: C.surface,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '-0.005em',
          textDecoration: 'none',
        }}
      >
        시작하기
      </Link>
    </div>
  )
}
