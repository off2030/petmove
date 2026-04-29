/**
 * OpenCV.js를 CDN에서 동적으로 로드한다. 첫 호출에서만 스크립트를 주입하고,
 * 이후 호출은 캐시된 promise를 재사용한다.
 *
 * jscanify의 client 빌드는 글로벌 `cv`를 사용하므로 본 모듈이 먼저 호출돼야 한다.
 */

let opencvPromise: Promise<void> | null = null

declare global {
  interface Window {
    cv?: { Mat: unknown; onRuntimeInitialized?: () => void }
  }
}

const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js'

export function loadOpenCv(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'))
  if (window.cv && window.cv.Mat) return Promise.resolve()
  if (opencvPromise) return opencvPromise

  opencvPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-opencv]')
    if (existing) {
      waitReady().then(resolve, reject)
      return
    }
    const script = document.createElement('script')
    script.src = OPENCV_URL
    script.async = true
    script.dataset.opencv = '1'
    script.onerror = () => reject(new Error('OpenCV.js 로드 실패'))
    script.onload = () => waitReady().then(resolve, reject)
    document.head.appendChild(script)
  })

  return opencvPromise
}

function waitReady(): Promise<void> {
  return new Promise((resolve, reject) => {
    let tries = 0
    const id = window.setInterval(() => {
      if (window.cv && window.cv.Mat) {
        clearInterval(id)
        resolve()
      } else if (tries++ > 400) {
        clearInterval(id)
        reject(new Error('OpenCV 초기화 시간 초과'))
      }
    }, 50)
  })
}
