'use client'

import { isNativePlatform } from './open-external'

/**
 * 파일 다운로드(저장/공유) — 플랫폼별로 가장 자연스러운 방식.
 *
 *  - **웹**: blob 으로 받아 <a download> 로 저장.
 *  - **iOS**: OS 공유·저장 시트(@capacitor/share) — 애플 시트가 "이미지 저장 / 파일에 저장"
 *    버튼과 앱 공유를 한 번에 보여줘서 그대로 사용.
 *  - **Android**: 안드로이드 공유 시트는 '앱 선택' 위주라 "폰에 바로 저장"이 안 보인다 →
 *    먼저 **작은 선택창**으로 [기기에 저장 / 다른 앱으로 보내기] 를 제시. 저장은 공개
 *    Documents 폴더(@capacitor/filesystem)에, 공유는 시스템 공유 시트(카톡 등).
 */

function getPlatform(): string {
  if (typeof window === 'undefined') return 'web'
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor
  return cap?.getPlatform?.() ?? 'web'
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\]/g, '_').trim() || 'download'
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(reader.error ?? new Error('파일 변환 실패'))
    reader.readAsDataURL(blob)
  })
}

/** 화면 하단 토스트 — 플러그인 없이 DOM 으로(웹/네이티브 WebView 공통). */
function toast(message: string): void {
  if (typeof document === 'undefined') return
  const el = document.createElement('div')
  el.textContent = message
  el.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:calc(28px + env(safe-area-inset-bottom))',
    'transform:translateX(-50%)', 'z-index:2100', 'max-width:82%',
    'background:rgba(20,18,16,0.94)', 'color:#fff', 'padding:11px 16px',
    'border-radius:12px', 'font-size:13px', 'line-height:1.5', 'text-align:center',
    'box-shadow:0 6px 24px rgba(0,0,0,0.3)', 'pointer-events:none',
  ].join(';')
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3200)
}

/**
 * 작은 바텀 선택창 — [기기에 저장] / [다른 앱으로 보내기]. DOM 으로(플러그인·React 없이).
 * @returns 'save' | 'share' | null(취소)
 */
function chooseSaveOrShare(filename: string): Promise<'save' | 'share' | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(null)
    let done = false
    const finish = (v: 'save' | 'share' | null) => {
      if (done) return
      done = true
      backdrop.remove()
      resolve(v)
    }

    const backdrop = document.createElement('div')
    backdrop.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2050',
      'background:rgba(0,0,0,0.45)',
      'display:flex', 'flex-direction:column', 'justify-content:flex-end',
    ].join(';')
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) finish(null)
    })

    const sheet = document.createElement('div')
    sheet.style.cssText = [
      'background:#1f1d1b', 'color:#fff',
      'border-radius:18px 18px 0 0', 'padding:14px 16px',
      'padding-bottom:calc(16px + env(safe-area-inset-bottom))',
      'box-shadow:0 -8px 30px rgba(0,0,0,0.35)',
    ].join(';')

    const title = document.createElement('div')
    title.textContent = filename
    title.style.cssText = [
      'font-size:13px', 'color:rgba(255,255,255,0.6)', 'text-align:center',
      'padding:6px 8px 14px', 'overflow:hidden', 'text-overflow:ellipsis', 'white-space:nowrap',
    ].join(';')

    const mkBtn = (label: string, primary: boolean, on: () => void) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = label
      b.style.cssText = [
        'display:block', 'width:100%', 'box-sizing:border-box',
        'padding:14px', 'margin-bottom:9px', 'border:0', 'border-radius:13px',
        'font-size:15px', 'font-weight:600', 'font-family:inherit', 'cursor:pointer',
        primary ? 'background:#FFFFFF;color:#212124' : 'background:rgba(255,255,255,0.13);color:#fff',
      ].join(';')
      b.addEventListener('click', on)
      return b
    }

    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = '취소'
    cancel.style.cssText = [
      'display:block', 'width:100%', 'box-sizing:border-box', 'padding:13px', 'marginTop:2px',
      'border:0', 'border-radius:13px', 'background:transparent', 'color:rgba(255,255,255,0.55)',
      'font-size:15px', 'font-family:inherit', 'cursor:pointer',
    ].join(';')
    cancel.addEventListener('click', () => finish(null))

    sheet.appendChild(title)
    sheet.appendChild(mkBtn('기기에 저장', true, () => finish('save')))
    sheet.appendChild(mkBtn('다른 앱으로 보내기', false, () => finish('share')))
    sheet.appendChild(cancel)
    backdrop.appendChild(sheet)
    document.body.appendChild(backdrop)
  })
}

async function fetchBase64(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('파일을 받지 못했어요.')
  return blobToBase64(await res.blob())
}

async function webDownload(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(String(res.status))
    const objectUrl = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

/** 시스템 공유·저장 시트(카톡·드라이브 등). iOS 는 여기에 "이미지/파일 저장"도 포함됨. */
async function shareViaSheet(url: string, filename: string): Promise<void> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const { Share } = await import('@capacitor/share')
  const written = await Filesystem.writeFile({
    path: sanitizeFilename(filename),
    data: await fetchBase64(url),
    directory: Directory.Cache,
  })
  try {
    await Share.share({ files: [written.uri], title: filename })
  } catch (e) {
    const msg = (e as { message?: string })?.message ?? ''
    if (/cancel/i.test(msg)) return
    throw e
  }
}

/** Android — 공개 Documents 폴더에 바로 저장(앱 선택창 없이). '내 파일 > Documents'. */
async function androidSave(url: string, filename: string): Promise<void> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  await Filesystem.writeFile({
    path: sanitizeFilename(filename),
    data: await fetchBase64(url),
    directory: Directory.Documents,
    recursive: true,
  })
  toast('기기에 저장했어요 · 내 파일 > Documents')
}

/**
 * @param url      받을 파일 주소(절대/상대 모두).
 * @param filename 저장될 파일명(표시명).
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  if (!isNativePlatform()) {
    await webDownload(url, filename)
    return
  }
  try {
    // iOS: 애플 시트가 저장+공유를 한 번에 제공 → 그대로.
    if (getPlatform() !== 'android') {
      await shareViaSheet(url, filename)
      return
    }
    // Android: 저장 / 공유를 직접 선택하게 한다(시스템 시트엔 '기기 저장'이 잘 안 보이므로).
    const choice = await chooseSaveOrShare(filename)
    if (choice === 'save') await androidSave(url, filename)
    else if (choice === 'share') await shareViaSheet(url, filename)
  } catch (e) {
    toast('저장에 실패했어요. 다시 시도해 주세요.')
    throw e
  }
}
