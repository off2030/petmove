'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/** 외부 고객용 페이지 — OS 다크 모드와 운영자가 고른 스킨 모두 무시하고 항상 brand
 *  (펫무브 앱 디자인 — 포털 /apply 신청폼과 톤 통일, 2026-08-04).
 *  - /apply: 등록 신청서 (보호자 등 외부)
 *  - /share: 매직 링크 정보 입력 폼 (외부 동물병원·운송사·보호자 등) */
const FORCE_DEFAULT_PATHS = ['/apply', '/share']

type Mode = 'system' | 'light' | 'dark'
type Skin = 'editorial' | 'brand'

// 가나다 순 — use-skin.ts SKIN_LIST 와 동기화 유지. default = brand (2026-08-05).
const VALID_SKINS: Skin[] = ['brand', 'editorial']

function readMode(): Mode {
  try {
    const v = localStorage.getItem('theme')
    if (v === 'light' || v === 'dark') return v
  } catch {}
  return 'system'
}

function readSkin(): Skin {
  try {
    const v = localStorage.getItem('skin')
    // legacy 'flat' 등 목록 밖 값은 default(brand)로 흡수.
    if (v && (VALID_SKINS as string[]).includes(v)) return v as Skin
  } catch {}
  return 'brand'
}

function applyEffective(mode: Mode, skin: Skin, forceDefault: boolean) {
  const html = document.documentElement
  const dark =
    !forceDefault && (
      mode === 'dark' ||
      (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    )
  html.classList.toggle('dark', dark)
  const effSkin = forceDefault ? 'brand' : skin
  if (effSkin === 'editorial') html.removeAttribute('data-skin')
  else html.setAttribute('data-skin', effSkin)
}

export function ThemeProvider() {
  const pathname = usePathname()

  useEffect(() => {
    try {
      const forceDefault = FORCE_DEFAULT_PATHS.some((p) => pathname?.startsWith(p))
      applyEffective(readMode(), readSkin(), forceDefault)

      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const onMq = () => { if (readMode() === 'system') applyEffective(readMode(), readSkin(), forceDefault) }
      const onChange = () => applyEffective(readMode(), readSkin(), forceDefault)
      mq.addEventListener('change', onMq)
      window.addEventListener('themechange', onChange)
      window.addEventListener('skinchange', onChange)
      window.addEventListener('storage', onChange)
      return () => {
        mq.removeEventListener('change', onMq)
        window.removeEventListener('themechange', onChange)
        window.removeEventListener('skinchange', onChange)
        window.removeEventListener('storage', onChange)
      }
    } catch (e) {}
  }, [pathname])

  return null
}
