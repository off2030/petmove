'use client'

// 앱 다운로드 CTA — 스마트 링크. 서버 렌더 시 정적 href(#download 앵커)로 두고,
// 마운트 후 UA 를 보고 iPhone→App Store / Android→Play 직행으로 승격(프로토타입 JS 와 동일 동작).
import { useEffect, useState } from 'react'
import { detectStoreHref } from '@/lib/store-links'

export function AppLink({
  className,
  fallbackHref = '/#download',
  children,
}: {
  className?: string
  fallbackHref?: string
  children: React.ReactNode
}) {
  const [storeHref, setStoreHref] = useState<string | null>(null)

  useEffect(() => {
    setStoreHref(detectStoreHref())
  }, [])

  if (storeHref) {
    return (
      <a className={className} href={storeHref} target="_blank" rel="noopener">
        {children}
      </a>
    )
  }
  return (
    <a className={className} href={fallbackHref}>
      {children}
    </a>
  )
}
