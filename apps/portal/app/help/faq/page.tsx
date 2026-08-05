import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { LegalBackBar } from '@/components/legal-back-bar'
import { C } from '@/lib/palette'
import { APP_DESTINATIONS_KO } from '@/lib/app-destinations'

/**
 * 자주 묻는 질문 — 시작 가이드(/help/start)·고객지원(/support)과 같은 앱 톤 카드형.
 * 질문 하나 = 카드 하나. 문구 수정은 FAQS 배열만 고친다.
 */

export const metadata: Metadata = {
  title: '자주 묻는 질문 — 펫무브',
  description: '펫무브 앱 자주 묻는 질문(FAQ)',
}

const supportLink = (
  <Link href="/support" style={{ color: C.accentInk, textUnderlineOffset: 3 }}>
    고객지원
  </Link>
)

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: '이용료가 있나요?',
    a: '앱 이용은 무료예요.',
  },
  {
    q: '병원에 이미 준비를 의뢰했는데, 앱에서도 볼 수 있나요?',
    a: '네. 병원에 알려주신 이메일과 같은 이메일로 로그인하면 준비 중인 내용이 자동으로 연결돼요.',
  },
  {
    q: '여러 마리를 함께 준비할 수 있나요?',
    a: "네. '내 정보' 탭 > '동물 추가'로 여러 마리를 등록해서 준비할 수 있어요.",
  },
  {
    q: '어느 나라를 지원하나요?',
    // 숫자는 목적지 선택 화면 목록(app-destinations 단일 출처)에서 자동 계산 — 나라가 늘면 같이 오른다.
    a: `일본, 유럽, 미국을 비롯한 ${APP_DESTINATIONS_KO.length}개 나라를 지원해요. 목적지 선택 화면에서 전체 목록을 확인할 수 있어요.`,
  },
  {
    q: '알림은 어떻게 받나요?',
    a: "설치형 앱(iOS·Android)에서 설정 > '일정 알림'을 켜면 돼요. 웹 브라우저에서는 알림을 지원하지 않아요.",
  },
]

export default function HelpFaqPage() {
  return (
    <div style={{ background: C.bg, minHeight: '100dvh' }}>
      <LegalBackBar title="자주 묻는 질문" />
      <main
        style={{
          maxWidth: '42rem',
          margin: '0 auto',
          padding: '20px 20px 40px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {FAQS.map((item) => (
          <section
            key={item.q}
            style={{
              background: C.surface,
              border: `.5px solid ${C.line}`,
              borderRadius: 18,
              padding: '17px 18px 15px',
            }}
          >
            <h2
              style={{
                margin: '0 0 8px',
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                lineHeight: 1.45,
                color: C.ink,
              }}
            >
              {item.q}
            </h2>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: C.ink2 }}>{item.a}</p>
          </section>
        ))}

        <p style={{ margin: '12px 4px 0', fontSize: 13, lineHeight: 1.7, color: C.ink3 }}>
          원하는 답을 찾지 못하셨다면 {supportLink}으로 문의해 주세요.
        </p>
      </main>
    </div>
  )
}
