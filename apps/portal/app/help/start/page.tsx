import type { Metadata } from 'next'
import { LegalBackBar } from '@/components/legal-back-bar'
import { C } from '@/lib/palette'

/**
 * 펫무브 시작 가이드 — 신규 사용자 첫 안내 (빈 상태 화면·설정>지원·고객지원에서 진입).
 * 약관류(legal-prose 마크다운)와 달리 고객 첫인상 페이지라 앱 톤(회색 캔버스 + 흰 카드
 * + 번호 뱃지)으로 직접 렌더. 문구는 2026-08-05 사용자 확정본 — 수정 시 STEPS 만 고친다.
 */

export const metadata: Metadata = {
  title: '펫무브 시작 가이드 — 펫무브',
  description: '펫무브 앱 시작 가이드 — 등록부터 알림까지',
}

const STEPS: { title: string; paras: string[] }[] = [
  {
    title: '펫무브 등록',
    paras: [
      "가입 후 '시작하기'를 누르고 여행, 보호자, 반려동물 정보를 등록해주세요. 이 정보는 검역에 사용되는 필수 정보예요. 등록 후에는 내 정보 탭에서 확인·수정하실 수 있어요.",
    ],
  },
  {
    title: "'준비' 탭 — 단계별로 따라 하기",
    paras: [
      "등록을 완료하면 '준비' 탭에 '다음 할 일'과 '준비 단계' 카드가 나타나요. 각 카드의 안내에 따라 준비를 하세요.",
      '카드를 누르면 자세한 설명을 볼 수 있어요. 카드의 종류에 따라 날짜를 입력하고 저장 버튼을 누르거나 바로 완료 버튼을 눌러서 해당 단계를 완료할 수 있어요.',
      "입력한 내용이 규정에 맞지 않으면 앱이 경고로 알려드려요(자동 검증 기능). 이 기능을 쓰고 싶지 않을 경우 '더보기' 탭에서 끌 수 있어요.",
    ],
  },
  {
    title: "'서류' 탭 — 서류 체크리스트와 보관함",
    paras: [
      "'서류 체크리스트'에서 여행지 별로 검역을 받기 위해 준비해야 할 서류를 볼 수 있어요. '준비' 탭의 각 단계를 완료하면 자동으로 서류 준비 상태에 반영돼요.",
      "준비하면서 첨부한 이미지, PDF 파일은 '서류' 탭에서 모두 확인할 수 있어요.",
    ],
  },
  {
    title: '알림·푸시 받기',
    paras: [
      "'더보기' 탭 > 설정에서 '일정 알림'을 켜면 주요 일정을 놓치지 않게 알려드려요.",
      '예정일이 있는 경우 예정일 전에 알림을 보내드려요.',
      '접종, 검사의 유효기간 만료, 수입 허가 신청·신고 마감 등이 임박한 경우 알림을 보내드려요.',
      '파트너 동물병원에서 준비를 받고 있는 경우, 검사·신고 완료 등 주요 알림을 받을 수 있어요.',
    ],
  },
  {
    title: '주의하실 점',
    paras: [
      '이 앱은 검역 준비·관리를 쉽게 하고 실수를 줄일 수 있도록 디자인 되었지만, 전문가 서비스를 대체할 수는 없어요. 입국 요건이 까다롭고 준비가 복잡한 여행지는 전문가에 맡기는 것이 안전해요.',
      "'맡기기' 탭에서 의뢰·문의를 할 수 있어요.",
    ],
  },
]

export default function HelpStartPage() {
  return (
    <div style={{ background: C.bg, minHeight: '100dvh' }}>
      <LegalBackBar title="펫무브 시작 가이드" />
      <main
        style={{
          maxWidth: '42rem',
          margin: '0 auto',
          padding: '20px 20px 56px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {STEPS.map((step, i) => (
          <section
            key={step.title}
            style={{
              background: C.surface,
              border: `.5px solid ${C.line}`,
              borderRadius: 18,
              padding: '18px 18px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span
                aria-hidden
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: C.soft,
                  color: C.accentInk,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--pm-font-display)',
                  fontSize: 13,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </span>
              <h2
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  lineHeight: 1.4,
                  color: C.ink,
                }}
              >
                {step.title}
              </h2>
            </div>
            {step.paras.map((p, j) => (
              <p
                key={j}
                style={{
                  margin: j === step.paras.length - 1 ? 0 : '0 0 10px',
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: C.ink2,
                }}
              >
                {p}
              </p>
            ))}
          </section>
        ))}
      </main>
    </div>
  )
}
