import type { Metadata } from 'next'
import { createAdminClient } from '@petmove/auth'
import { verifyPreviewToken } from '@petmove/auth/preview-token'
import type { CaseRow } from '@petmove/domain'
import { JourneyPreview } from './journey-preview'

export const dynamic = 'force-dynamic'

// 토큰 URL 이라 색인 금지 (share 라우트와 동일 정책).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

interface Props {
  params: Promise<{ token: string }>
}

/**
 * 고객앱 미리보기 — 펫무브워크(admin) 케이스 상세의 "고객앱 미리보기" 가 iframe 으로 띄운다.
 *
 * (authed) 셸 밖의 단독 라우트 — 보호자 세션이 아니라 admin 이 서명한 단기 토큰으로 진입.
 * 토큰 검증 후 service-role 로 해당 케이스 한 건만 읽어 보호자가 보는 여정 화면을 렌더한다.
 */
export default async function PortalPreviewPage({ params }: Props) {
  const { token } = await params
  const payload = verifyPreviewToken(token)
  if (!payload) return <PreviewUnavailable />

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('cases')
    .select('*')
    .eq('id', payload.caseId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !data) return <PreviewUnavailable />

  return (
    <div style={{ minHeight: '100dvh', background: '#F5EFE8' }}>
      <JourneyPreview caseRow={data as CaseRow} />
    </div>
  )
}

function PreviewUnavailable() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#F5EFE8',
        color: '#6B6457',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div>
        <p
          style={{
            margin: 0,
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
          }}
        >
          Preview
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 15, color: '#2A2620' }}>
          미리보기를 표시할 수 없습니다.
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 13 }}>
          링크가 만료되었을 수 있습니다. 펫무브워크에서 다시 열어 주세요.
        </p>
      </div>
    </div>
  )
}
