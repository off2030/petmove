import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { LegalBackBar } from '@/components/legal-back-bar'
import { C } from '@/lib/palette'

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
    a: '현재 앱의 모든 기능을 무료로 사용할 수 있습니다. 전문가에게 맡기는 대행 서비스는 별도 상담 후 진행됩니다.',
  },
  {
    q: '병원에 이미 준비를 의뢰했는데, 앱에서도 볼 수 있나요?',
    a: (
      <>
        네. 병원에 알려주신 이메일과 같은 이메일로 가입하면 준비 중인 내용이 자동으로
        연결됩니다. 연결되지 않으면 {supportLink}으로 문의해 주세요.
      </>
    ),
  },
  {
    q: '여러 마리를 함께 준비할 수 있나요?',
    a: "네. '내 정보' 탭 > '동물 추가'로 각각 등록하면 동물마다 일정이 따로 관리됩니다. '준비'·'서류' 화면에서 좌우로 넘기면 동물을 전환할 수 있습니다.",
  },
  {
    q: '어느 나라를 지원하나요?',
    a: '일본, 유럽 전역, 미국을 비롯한 주요 목적지를 지원합니다. 목적지 선택 화면에서 전체 목록을 확인할 수 있습니다.',
  },
  {
    q: '출국까지 얼마나 걸리나요?',
    a: '나라마다 다릅니다. 광견병 항체검사 후 대기 기간이 있는 나라는 오래 걸립니다(일본 180일, 유럽 3개월 등). 여행이 정해지면 바로 준비를 시작하는 것이 안전합니다.',
  },
  {
    q: '날짜를 잘못 입력했어요.',
    a: '해당 단계 카드를 다시 열어 수정하면 이후 일정이 자동으로 다시 계산됩니다.',
  },
  {
    q: '입력이 안 되는 날짜가 있어요.',
    a: '검역 규정상 불가능한 날짜(예: 접종 전에 채혈)는 자동 검증 기능이 입력을 제한합니다. 규정과 다르게 기록해야 할 특별한 사정이 있다면 설정 > 고급에서 자동 검증 기능을 끌 수 있습니다. 안전한 준비를 위해서는 켜두시는 것을 권장합니다.',
  },
  {
    q: '알림은 어떻게 받나요?',
    a: "설치형 앱(iOS·Android)에서 설정 > '일정 알림'을 켜면 됩니다. 웹 브라우저에서는 알림을 지원하지 않습니다.",
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
