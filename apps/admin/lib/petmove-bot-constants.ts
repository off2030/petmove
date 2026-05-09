// 펫무브워크 봇 식별 상수 — client / server 양쪽에서 import 가능.
// 'use server' 가 붙은 모듈에서 export 한 일반 const 는 server action 으로 인식될 수 있어
// 별도 client-safe 모듈로 분리.

export const PETMOVE_BOT_EMAIL = 'bot@petmove.work'

export function isPetmoveBot(email: string | null | undefined): boolean {
  return email === PETMOVE_BOT_EMAIL
}
