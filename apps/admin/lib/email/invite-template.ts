/** 초대 이메일 HTML 템플릿. */

interface InviteTemplateInput {
  orgName: string
  inviteUrl: string
  /** 초대 대상 역할 — 표시용 */
  roleLabel: string
  /** 만료 일자 — 사람이 읽을 수 있는 형식 */
  expiresAt: Date
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function inviteEmailSubject(orgName: string): string {
  return `${orgName} — 펫무브워크 초대`
}

export function inviteEmailHtml(input: InviteTemplateInput): string {
  const { orgName, inviteUrl, roleLabel, expiresAt } = input
  const expStr = expiresAt.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `<!doctype html>
<html lang="ko">
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px;max-width:560px;">
          <tr>
            <td style="font-size:14px;color:#888;letter-spacing:1px;text-transform:uppercase;padding-bottom:8px;">
              펫무브워크
            </td>
          </tr>
          <tr>
            <td style="font-size:22px;font-weight:600;color:#111;padding-bottom:16px;">
              ${esc(orgName)} 에 초대되었습니다
            </td>
          </tr>
          <tr>
            <td style="font-size:15px;line-height:1.6;color:#333;padding-bottom:24px;">
              <strong>${esc(roleLabel)}</strong> 권한으로 초대를 받았습니다.<br>
              아래 버튼을 눌러 가입을 완료해 주세요.
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;">
              <a href="${esc(inviteUrl)}" style="display:inline-block;padding:12px 24px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:8px;font-weight:500;font-size:15px;">
                초대 수락
              </a>
            </td>
          </tr>
          <tr>
            <td style="font-size:13px;color:#666;line-height:1.6;padding-bottom:16px;">
              버튼이 동작하지 않으면 아래 링크를 브라우저에 붙여넣어 주세요:<br>
              <span style="word-break:break-all;color:#4a4a4a;">${esc(inviteUrl)}</span>
            </td>
          </tr>
          <tr>
            <td style="font-size:12px;color:#999;border-top:1px solid #eee;padding-top:16px;line-height:1.5;">
              이 초대는 <strong>${esc(expStr)}</strong> 까지 유효합니다.<br>
              요청하지 않은 초대라면 이 이메일을 무시해 주세요.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
