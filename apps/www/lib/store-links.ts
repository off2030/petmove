// 앱 스토어 링크 — 스마트 링크의 단일 출처.
// 모바일 UA 는 해당 스토어 직행, 데스크톱은 하단 배지 섹션(#download 앵커)으로.
export const STORE_IOS = 'https://apps.apple.com/kr/app/id6784567864'
export const STORE_ANDROID = 'https://play.google.com/store/apps/details?id=com.petmove.portal'

export function detectStoreHref(): string | null {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return STORE_IOS
  // iPadOS 13+ 는 사파리가 UA 를 맥으로 보고한다(데스크톱급 브라우징이 기본). 그래서 위
  // /iPad/ 매칭에 안 걸리고 데스크톱 취급돼 하단 배지 섹션으로 빠졌다.
  // UA 는 못 믿지만 터치포인트는 못 속인다 — 맥은 0(터치 모니터를 붙여도 0), 아이패드는 5.
  // "맥이라 주장하는데 멀티터치가 되는 기기" = 아이패드로 확정한다.
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return STORE_IOS
  if (/Android/i.test(ua)) return STORE_ANDROID
  return null
}
