'use client'

/**
 * 검증 규칙 on/off 저장소 — 업체와 무관한 공통 규칙이라
 * 브라우저 로컬 설정(localStorage)으로 사용자 단위로 저장한다.
 */

const KEY = 'verification-disabled-checks'

export function getDisabledCheckIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function setDisabledCheckIds(ids: Set<string>): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY, JSON.stringify(Array.from(ids)))
}
