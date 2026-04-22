/**
 * Resend HTTP API 얇은 래퍼 — 의존 없이 fetch 만 사용.
 * RESEND_API_KEY env 미설정 시 null 반환 (호출자는 조용히 스킵).
 */

export interface SendEmailInput {
  from: string
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
}

export interface SendEmailResult {
  id: string
}

/**
 * 이메일 1건 발송. 성공 시 `{ id }`, 실패 시 throw.
 * RESEND_API_KEY 미설정이면 null 반환 (조용히 skip).
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult | null> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: input.from,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      reply_to: input.replyTo,
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Resend API ${res.status}: ${errText || res.statusText}`)
  }

  const body = (await res.json()) as { id: string }
  return { id: body.id }
}

/**
 * 초대 이메일 발송자 이메일. Resend 대시보드에서 verified domain 필요.
 * 미설정 시 Resend 샌드박스 'onboarding@resend.dev' (테스트 전용).
 */
export function inviteFromAddress(): string {
  return process.env.INVITE_EMAIL_FROM || 'onboarding@resend.dev'
}
