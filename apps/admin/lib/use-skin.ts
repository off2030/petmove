'use client'

import { useEffect, useState } from 'react'

/** 색·radius·폰트가 함께 바뀌는 비주얼 스킨. dark 모드와 직교. */
export type Skin = 'editorial' | 'flat' | 'neumorphism' | 'glassmorphism' | 'art-deco' | 'foggy-pastel' | 'hygge' | 'scandi-minimal' | 'sakura' | 'baby-blue'

const STORAGE_KEY = 'skin'
const EVENT = 'skinchange'

export const SKIN_LIST: Skin[] = ['editorial', 'art-deco', 'sakura', 'flat', 'neumorphism', 'glassmorphism', 'foggy-pastel', 'hygge', 'scandi-minimal', 'baby-blue']

export const SKIN_LABELS: Record<Skin, string> = {
  editorial: '에디토리얼',
  flat: '플랫',
  neumorphism: '뉴모피즘',
  glassmorphism: '글라스',
  'art-deco': '아르데코',
  'foggy-pastel': '포기 파스텔',
  hygge: '휘게',
  'scandi-minimal': '스칸디 미니멀',
  sakura: '벚꽃',
  'baby-blue': '베이비 블루',
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

/** 다음 스킨으로 순환 — editorial → clinical → mono → editorial. */
export function cycleSkin() {
  const current = readSkin()
  const next = SKIN_LIST[(SKIN_LIST.indexOf(current) + 1) % SKIN_LIST.length]
  setSkin(next)
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
