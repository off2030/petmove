'use client'

/**
 * 첨부 문서(signed URL)를 새 화면으로 여는 크로스플랫폼 헬퍼.
 *
 * 두 가지 함정을 함께 해결한다:
 *  1) **팝업 차단**: 서버에서 signed URL 을 받는 await 뒤에 window.open 을 부르면 브라우저가
 *     '사용자 제스처 없는 팝업'으로 보고 조용히 차단한다(클릭하면 '여는 중…' 만 뜨고 무반응).
 *     → 클릭 즉시(동기) 빈 탭을 먼저 띄워두고, URL 을 받으면 그 탭으로 이동시킨다.
 *  2) **네이티브 WebView**: Capacitor(iOS/Android) WebView 는 window.open 으로 외부 URL 을
 *     못 여는 경우가 많다 → @capacitor/browser(인앱 브라우저)로 연다.
 *
 * 네이티브 판별은 동기 전역(window.Capacitor)으로 한다 — @capacitor/core 를 await import 하면
 * 그 사이 제스처가 끊겨 (1)의 빈 탭 우회가 무력화되기 때문.
 */

type UrlResult = { ok: true; value: string } | { ok: false; error: string }

export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return !!cap?.isNativePlatform?.()
}

/**
 * 상대경로(/forms/form25.pdf 등)를 절대 URL 로 변환. @capacitor/browser 의 Browser.open 은
 * 절대 URL 만 받아 상대경로면 아무 동작도 안 한다(버튼 무반응의 원인). signed URL 처럼 이미
 * 절대 URL 이면 그대로 둔다.
 */
function toAbsoluteUrl(url: string): string {
  try {
    return new URL(url, window.location.href).href
  } catch {
    return url
  }
}

async function openOnNative(url: string): Promise<void> {
  const { Browser } = await import('@capacitor/browser')
  await Browser.open({ url: toAbsoluteUrl(url) })
}

/**
 * 이미 가진 URL 을 연다 — 클릭 핸들러에서 직접 호출(제스처 유지)하는 경우.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (isNativePlatform()) {
    await openOnNative(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

/**
 * URL 을 비동기로 받아(서버 signed URL) 연다 — 팝업 차단 우회 + 네이티브 대응.
 * @returns URL 조회 결과(에러 표시는 호출부가 맡는다).
 */
export async function openExternalUrlAsync(urlPromise: Promise<UrlResult>): Promise<UrlResult> {
  const native = isNativePlatform()
  // 웹: 제스처 안에서 빈 탭을 먼저 확보(차단 우회). 네이티브는 인앱 브라우저라 불필요.
  const pending = !native && typeof window !== 'undefined' ? window.open('', '_blank') : null
  const res = await urlPromise
  if (!res.ok) {
    pending?.close()
    return res
  }
  if (native) {
    await openOnNative(res.value)
  } else if (pending && !pending.closed) {
    pending.location.href = res.value
  } else {
    // 빈 탭 확보가 차단된 경우의 마지막 시도.
    window.open(res.value, '_blank', 'noopener,noreferrer')
  }
  return res
}
