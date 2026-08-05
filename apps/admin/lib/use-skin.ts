'use client'

import { useEffect, useState } from 'react'

/** 색·radius·폰트가 함께 바뀌는 비주얼 스킨. dark 모드와 직교. */
export type Skin = 'editorial' | 'brand'

const STORAGE_KEY = 'skin'
const EVENT = 'skinchange'

// 가나다 순 (한글 라벨 기준). default = brand (2026-08-05 승격 — flat 은 삭제됨).
export const SKIN_LIST: Skin[] = [
  'brand',     // 브랜드 (default — 2026-07 리브랜딩)
  'editorial', // 에디토리얼
]

export const SKIN_LABELS: Record<Skin, string> = {
  brand: '브랜드',
  editorial: '에디토리얼',
}

function readSkin(): Skin {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    // legacy 'flat' 등 목록 밖 값은 default(brand)로 흡수.
    if (v && (SKIN_LIST as string[]).includes(v)) return v as Skin
  } catch {}
  return 'brand'
}

/** 스킨 변경 (전역) — localStorage 저장 + skinchange 이벤트로 동기화. */
export function setSkin(skin: Skin) {
  try {
    if (skin === 'brand') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, skin)
  } catch {}
  window.dispatchEvent(new Event(EVENT))
}

/** 다음 스킨으로 순환 — SKIN_LIST 순서대로. */
export function cycleSkin() {
  const current = readSkin()
  const next = SKIN_LIST[(SKIN_LIST.indexOf(current) + 1) % SKIN_LIST.length]
  setSkin(next)
}

export function useSkin() {
  const [skin, setSkinState] = useState<Skin>('brand')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    function refresh() { setSkinState(readSkin()) }
    refresh()
    setMounted(true)
    window.addEventListener(EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  return { skin, mounted, setSkin }
}
