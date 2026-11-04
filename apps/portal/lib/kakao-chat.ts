/** 프로필 홈 대신 상담 화면으로 연결한다. 병원별 채널 주소와 쿼리는 유지한다. */
export const PETMOVE_KAKAO_CHAT_URL = 'https://pf.kakao.com/_zDDxhj/chat'

export function kakaoChatUrl(raw: string): string {
  const value = raw.trim()
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
  if (url.hostname === 'pf.kakao.com' && /^\/_\w+\/?$/.test(url.pathname)) {
    url.protocol = 'https:'
    url.pathname = `${url.pathname.replace(/\/$/, '')}/chat`
  }
  return url.href
}
