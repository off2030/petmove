'use client'

import { isNativePlatform } from './open-external'

/**
 * 파일 다운로드(저장) — 크로스플랫폼.
 *
 *  - **웹**: blob 으로 받아 <a download> 로 저장(파일명 보존, 크로스오리진 download 무시 우회).
 *  - **네이티브(iOS/Android)**: 앱은 파일을 기기에 직접 못 받으므로, blob 을 캐시에 쓴 뒤
 *    OS 공유·저장 시트(@capacitor/share)를 띄운다 — '파일에 저장 / 사진에 저장 / 프린트 /
 *    전송' 메뉴. 이것이 모바일 앱의 표준 "내보내기/다운로드" UX.
 *
 * 네이티브 경로는 @capacitor/filesystem + @capacitor/share 플러그인이 필요 → 네이티브 재빌드
 * 후에야 동작한다(웹은 즉시).
 */

function sanitizeFilename(name: string): string {
  // 경로 구분자만 제거 — 한글·공백은 그대로 둔다.
  return name.replace(/[/\\]/g, '_').trim() || 'download'
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      // "data:<mime>;base64,XXXX" → "XXXX"
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(reader.error ?? new Error('파일 변환 실패'))
    reader.readAsDataURL(blob)
  })
}

async function webDownload(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(String(res.status))
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
  } catch {
    // 폴백 — 직접 링크로 열기(브라우저가 다운로드 처리).
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

async function nativeDownload(url: string, filename: string): Promise<void> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')

  const res = await fetch(url)
  if (!res.ok) throw new Error('파일을 받지 못했어요.')
  const blob = await res.blob()
  const base64 = await blobToBase64(blob)

  const written = await Filesystem.writeFile({
    path: sanitizeFilename(filename),
    data: base64,
    directory: Directory.Cache,
  })

  try {
    // files: [uri] → 실제 파일을 공유(저장 시트). url 만 주면 링크만 공유되므로 files 사용.
    await Share.share({ files: [written.uri], title: filename })
  } catch (e) {
    // 사용자가 시트를 취소하면 reject — 조용히 무시.
    const msg = (e as { message?: string })?.message ?? ''
    if (/cancel/i.test(msg)) return
    throw e
  }
}

/**
 * @param url      받을 파일 주소(절대/상대 모두 — fetch 가 오리진 기준으로 해석).
 * @param filename 저장될 파일명(표시명).
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  if (isNativePlatform()) {
    await nativeDownload(url, filename)
  } else {
    await webDownload(url, filename)
  }
}
