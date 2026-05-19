import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * 펫무브워크(admin) → 펫무브(portal) "고객앱 미리보기" 용 단기 서명 토큰.
 *
 * portal 은 보호자 인증(case_customer_links) 위에서만 케이스를 보여주므로, admin 직원이
 * 보호자가 아니어도 미리보기를 볼 수 있게 별도의 토큰 경로가 필요하다. admin 이 caseId 에
 * 대해 서명하고, portal 의 /preview/[token] 라우트가 검증한다.
 *
 * 서명 키는 두 앱이 공통으로 갖는 SUPABASE_SERVICE_ROLE_KEY 에서 HMAC 으로 파생한다 —
 * 서비스 롤 키를 직접 쓰지 않고 용도 분리(domain separation)해 별개 키로 만든다. 새 env
 * 설정 없이 admin·portal 양쪽에서 동일 키가 나온다.
 *
 * 서버 전용 — node:crypto 사용. client 번들에 들어가면 빌드가 실패한다.
 */

const PURPOSE = 'petmove-portal-preview-token:v1'
const DEFAULT_TTL_MS = 15 * 60 * 1000

function previewKey(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY 누락 — 미리보기 토큰 키 파생 불가')
  }
  return createHmac('sha256', secret).update(PURPOSE).digest()
}

function sign(body: string): string {
  return createHmac('sha256', previewKey()).update(body).digest('base64url')
}

export interface PreviewTokenPayload {
  /** 미리보기 대상 케이스 id. */
  caseId: string
  /** 만료 시각 (epoch ms). */
  exp: number
}

/** caseId 에 대한 단기 서명 토큰을 만든다. 서버에서만 호출. */
export function signPreviewToken(caseId: string, ttlMs: number = DEFAULT_TTL_MS): string {
  const payload: PreviewTokenPayload = { caseId, exp: Date.now() + ttlMs }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  // 구분자 '~' — base64url 알파벳(A-Za-z0-9-_)에 없어 분리가 모호하지 않다.
  return `${body}~${sign(body)}`
}

/**
 * 토큰을 검증한다. 서명 불일치·형식 오류·만료 시 null. 통과하면 payload 를 반환.
 * 서버에서만 호출.
 */
export function verifyPreviewToken(token: string): PreviewTokenPayload | null {
  const sep = token.indexOf('~')
  if (sep <= 0) return null
  const body = token.slice(0, sep)
  const sig = token.slice(sep + 1)

  const expected = sign(body)
  // timingSafeEqual 은 길이가 다르면 throw — 사전에 길이 비교.
  if (sig.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null

  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof (payload as PreviewTokenPayload).caseId !== 'string' ||
    typeof (payload as PreviewTokenPayload).exp !== 'number'
  ) {
    return null
  }
  const p = payload as PreviewTokenPayload
  if (Date.now() > p.exp) return null
  return p
}
