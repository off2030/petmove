import { type NextRequest, NextResponse } from 'next/server'
import { verifyPreviewToken } from '@petmove/auth/preview-token'

export const dynamic = 'force-dynamic'

/**
 * 펫무브워크 "고객앱 미리보기" 진입점.
 *
 * admin 이 서명한 토큰을 검증해 pm_preview 세션 쿠키를 심고, 보호자 셸의 일정 탭으로
 * redirect 한다. 이후 (authed) layout 이 이 쿠키로 미리보기 모드로 동작 — 보호자 인증
 * 없이 해당 케이스의 4탭을 읽기 전용으로 탐색할 수 있다.
 *
 * 쿠키는 크로스사이트 iframe(펫무브워크 모달)에서도 전송되도록 SameSite=None +
 * Partitioned(CHIPS). 새 창으로 열면 first-party 라 그대로 동작.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const payload = verifyPreviewToken(token)
  if (!payload) {
    return new NextResponse(
      '미리보기 링크가 만료되었거나 올바르지 않습니다. 펫무브워크에서 다시 열어 주세요.',
      { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    )
  }

  const dest = req.nextUrl.clone()
  dest.pathname = `/cases/${payload.caseId}/journey`
  dest.search = ''
  const res = NextResponse.redirect(dest)

  // 토큰 수명(30분)과 동일하게 쿠키도 제한. NextResponse.cookies 는 Partitioned 를
  // 지원하지 않아 Set-Cookie 헤더를 직접 구성한다.
  res.headers.set(
    'Set-Cookie',
    `pm_preview=${token}; Path=/; Max-Age=1800; HttpOnly; Secure; SameSite=None; Partitioned`,
  )
  return res
}
