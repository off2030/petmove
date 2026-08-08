'use client'

// /download 본문 — 기기를 보고 해당 스토어로 바로 보낸다.
//
// 설계: **배지 화면을 기본으로 렌더**하고, 마운트 후 모바일이면 그때 이동시킨다.
// 반대로(“이동 중” 을 기본으로) 하면 JS 가 죽거나 데스크톱일 때 영원히 로딩 화면에
// 갇힌다. 이 순서면 JS 없이도 배지로 설치할 수 있다.
//
// replace() 를 쓰는 이유 — push 로 보내면 스토어에서 뒤로가기 했을 때 이 페이지로 돌아오고
// 다시 스토어로 튕겨 무한루프가 된다.
import { useEffect, useState } from 'react'
import { detectStoreHref, STORE_ANDROID, STORE_IOS } from '@/lib/store-links'

export function DownloadRedirect() {
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    const href = detectStoreHref()
    if (!href) return // 데스크톱 — 배지 그대로 두고 직접 고르게.
    setRedirecting(true)
    window.location.replace(href)
  }, [])

  return (
    <div className="final" id="download">
      <div className="container">
        <h2>무료 앱으로 시작하세요</h2>
        <p>
          {redirecting
            ? '앱 스토어로 이동하고 있어요. 넘어가지 않으면 아래를 눌러주세요.'
            : '사용하시는 기기의 스토어를 눌러주세요.'}
        </p>
        <div className="store-row">
          <a className="store" href={STORE_IOS} target="_blank" rel="noopener">
            <i className="ti ti-brand-apple" style={{ fontSize: 18 }} />
            App Store
          </a>
          <a className="store" href={STORE_ANDROID} target="_blank" rel="noopener">
            <i className="ti ti-brand-google-play" style={{ fontSize: 16 }} />
            Google Play
          </a>
        </div>
      </div>
      <svg className="clouds" viewBox="-6 92 208 68" aria-hidden>
        <g transform="translate(0,26)">
          <circle cx="46" cy="168" r="52" fill="#fff" />
          <circle cx="72" cy="120" r="48" fill="#fff" />
          <circle cx="112" cy="148" r="34" fill="#fff" />
          <circle cx="146" cy="138" r="38" fill="#fff" />
          <circle cx="178" cy="154" r="24" fill="#fff" />
        </g>
      </svg>
    </div>
  )
}
