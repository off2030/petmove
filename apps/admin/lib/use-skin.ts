'use client'

import { useEffect, useState } from 'react'

/** 색·radius·폰트가 함께 바뀌는 비주얼 스킨. dark 모드와 직교. */
export type Skin = 'editorial' | 'clinical' | 'mono'

const STORAGE_KEY = 'skin'
const EVENT = 'skinchange'

export const SKIN_LIST: Skin[] = ['editorial', 'clinical', 'mono']

export const SKIN_LABELS: Record<Skin, string> = {
  editorial: '에디토리얼',
  clinical: '클리니컬',
  mono: '모노',
}

function readSkin(): Skin {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && (SKIN_LIST as string[]).includes(v)) return v as Skin
  } catch {}
  return 'editorial'
}

/** 스킨 변경 (전역) — localStorage 저장 + skinchange 이벤트로 동기화. */
export function setSkin(skin: Skin) {
  try {
    if (skin === 'editorial') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, skin)
  } catch {}
  window.dispatchEvent(new Event(EVENT))
}

export function useSkin() {
  const [skin, setSkinState] = useState<Skin>('editorial')
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
