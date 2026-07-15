// 앱 스토어 링크 — 스마트 링크의 단일 출처.
// 모바일 UA 는 해당 스토어 직행, 데스크톱은 하단 배지 섹션(#download 앵커)으로.
export const STORE_IOS = 'https://apps.apple.com/kr/app/id6784567864'
export const STORE_ANDROID = 'https://play.google.com/store/apps/details?id=com.petmove.portal'

export function detectStoreHref(): string | null {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return STORE_IOS
  if (/Android/i.test(ua)) return STORE_ANDROID
  return null
}
