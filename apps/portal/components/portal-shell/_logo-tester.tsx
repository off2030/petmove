'use client'

/* =============================================================================
 * TEMP — 로고 A/B 테스트용. 결정 후 이 파일 전체 + top-bar.tsx 의 TEMP 블록 삭제.
 * 상단 우측 버튼을 누르면 상단 좌측 로고가 다음 후보로 전환된다.
 * 선택은 localStorage('pm-logo-test')에 저장 → 새로고침/재시작에도 유지.
 * ========================================================================== */

import { useSyncExternalStore } from 'react'

type Variant = { name: string; svg: string }

// 각 후보의 <svg> 내부 콘텐츠 (viewBox 0 0 100 100 기준).
const VARIANTS: Variant[] = [
  {
    name: 'current (dark-v2)',
    svg: '<rect width="100" height="100" rx="22.5" fill="#1f1c17"/><path d="M34 80 C 28 62, 29 42, 41 31 C 53 23, 68 28, 68 43 C 68 55, 57 60, 49 56 C 43 53, 43 47, 48 45" fill="none" stroke="#e08a64" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  // --- ribbon-p 계열 ---
  { name: 'ribbon-p-amber', svg: '<rect width="100" height="100" rx="22.5" fill="#e8a55a"/><path d="M34 80 C 28 62, 29 42, 41 31 C 53 23, 68 28, 68 43 C 68 55, 57 60, 49 56 C 43 53, 43 47, 48 45" fill="none" stroke="#ffffff" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>' },
  { name: 'ribbon-p-coral', svg: '<rect width="100" height="100" rx="22.5" fill="#e08a64"/><path d="M34 80 C 28 62, 29 42, 41 31 C 53 23, 68 28, 68 43 C 68 55, 57 60, 49 56 C 43 53, 43 47, 48 45" fill="none" stroke="#ffffff" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>' },
  { name: 'ribbon-p-coral-soft', svg: '<rect width="100" height="100" rx="22.5" fill="#f6d9c8"/><path d="M34 80 C 28 62, 29 42, 41 31 C 53 23, 68 28, 68 43 C 68 55, 57 60, 49 56 C 43 53, 43 47, 48 45" fill="none" stroke="#b96846" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>' },
  { name: 'ribbon-p-cream', svg: '<rect width="100" height="100" rx="22.5" fill="#faf9f5"/><path d="M34 80 C 28 62, 29 42, 41 31 C 53 23, 68 28, 68 43 C 68 55, 57 60, 49 56 C 43 53, 43 47, 48 45" fill="none" stroke="#e08a64" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>' },
  { name: 'ribbon-p-dark', svg: '<rect width="100" height="100" rx="22.5" fill="#1f1c17"/><path d="M34 80 C 28 62, 29 42, 41 31 C 53 23, 68 28, 68 43 C 68 55, 57 60, 49 56 C 43 53, 43 47, 48 45" fill="none" stroke="#fbf8f2" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>' },
  { name: 'ribbon-p-dark-mint', svg: '<rect width="100" height="100" rx="22.5" fill="#1f1c17"/><path d="M34 80 C 28 62, 29 42, 41 31 C 53 23, 68 28, 68 43 C 68 55, 57 60, 49 56 C 43 53, 43 47, 48 45" fill="none" stroke="#6fb89a" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>' },
  { name: 'ribbon-p-ink', svg: '<rect width="100" height="100" rx="22.5" fill="#1a1814"/><path d="M34 80 C 28 62, 29 42, 41 31 C 53 23, 68 28, 68 43 C 68 55, 57 60, 49 56 C 43 53, 43 47, 48 45" fill="none" stroke="#e08a64" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>' },
  { name: 'ribbon-p-mint', svg: '<rect width="100" height="100" rx="22.5" fill="#6fb89a"/><path d="M34 80 C 28 62, 29 42, 41 31 C 53 23, 68 28, 68 43 C 68 55, 57 60, 49 56 C 43 53, 43 47, 48 45" fill="none" stroke="#ffffff" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>' },
  { name: 'ribbon-p-mono', svg: '<rect width="100" height="100" rx="22.5" fill="#faf9f5"/><path d="M34 80 C 28 62, 29 42, 41 31 C 53 23, 68 28, 68 43 C 68 55, 57 60, 49 56 C 43 53, 43 47, 48 45" fill="none" stroke="#1a1814" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>' },
  { name: 'ribbon-p-sky', svg: '<rect width="100" height="100" rx="22.5" fill="#6fa8c4"/><path d="M34 80 C 28 62, 29 42, 41 31 C 53 23, 68 28, 68 43 C 68 55, 57 60, 49 56 C 43 53, 43 47, 48 45" fill="none" stroke="#ffffff" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>' },
  { name: 'ribbon-p-sky-soft', svg: '<rect width="100" height="100" rx="22.5" fill="#d8e7ef"/><path d="M34 80 C 28 62, 29 42, 41 31 C 53 23, 68 28, 68 43 C 68 55, 57 60, 49 56 C 43 53, 43 47, 48 45" fill="none" stroke="#3a657a" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>' },
  { name: 'ribbon-p-white', svg: '<rect width="100" height="100" rx="22.5" fill="#ffffff"/><path d="M34 80 C 28 62, 29 42, 41 31 C 53 23, 68 28, 68 43 C 68 55, 57 60, 49 56 C 43 53, 43 47, 48 45" fill="none" stroke="#e08a64" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>' },
  // --- two (이중 막대) 계열 ---
  { name: 'two-white', svg: '<rect width="100" height="100" rx="22.5" fill="#ffffff"/><rect x="33" y="30" width="17" height="50" rx="8.5" fill="#e08a64" transform="rotate(-7 41.5 80)"/><rect x="55" y="44" width="15" height="36" rx="7.5" fill="#e08a64" opacity="0.6" transform="rotate(7 62.5 80)"/>' },
  { name: 'two-amber', svg: '<rect width="100" height="100" rx="22.5" fill="#e8a55a"/><rect x="33" y="30" width="17" height="50" rx="8.5" fill="#ffffff" transform="rotate(-7 41.5 80)"/><rect x="55" y="44" width="15" height="36" rx="7.5" fill="#ffffff" opacity="0.6" transform="rotate(7 62.5 80)"/>' },
  { name: 'two-coral', svg: '<rect width="100" height="100" rx="22.5" fill="#e08a64"/><rect x="33" y="30" width="17" height="50" rx="8.5" fill="#ffffff" transform="rotate(-7 41.5 80)"/><rect x="55" y="44" width="15" height="36" rx="7.5" fill="#ffffff" opacity="0.6" transform="rotate(7 62.5 80)"/>' },
  { name: 'two-coral-soft', svg: '<rect width="100" height="100" rx="22.5" fill="#f6d9c8"/><rect x="33" y="30" width="17" height="50" rx="8.5" fill="#b96846" transform="rotate(-7 41.5 80)"/><rect x="55" y="44" width="15" height="36" rx="7.5" fill="#b96846" opacity="0.6" transform="rotate(7 62.5 80)"/>' },
  { name: 'two-cream', svg: '<rect width="100" height="100" rx="22.5" fill="#faf9f5"/><rect x="33" y="30" width="17" height="50" rx="8.5" fill="#e08a64" transform="rotate(-7 41.5 80)"/><rect x="55" y="44" width="15" height="36" rx="7.5" fill="#e08a64" opacity="0.6" transform="rotate(7 62.5 80)"/>' },
  { name: 'two-dark', svg: '<rect width="100" height="100" rx="22.5" fill="#1f1c17"/><rect x="33" y="30" width="17" height="50" rx="8.5" fill="#fbf8f2" transform="rotate(-7 41.5 80)"/><rect x="55" y="44" width="15" height="36" rx="7.5" fill="#fbf8f2" opacity="0.6" transform="rotate(7 62.5 80)"/>' },
  { name: 'two-dark-mint', svg: '<rect width="100" height="100" rx="22.5" fill="#1f1c17"/><rect x="33" y="30" width="17" height="50" rx="8.5" fill="#6fb89a" transform="rotate(-7 41.5 80)"/><rect x="55" y="44" width="15" height="36" rx="7.5" fill="#6fb89a" opacity="0.6" transform="rotate(7 62.5 80)"/>' },
  { name: 'two-ink', svg: '<rect width="100" height="100" rx="22.5" fill="#1a1814"/><rect x="33" y="30" width="17" height="50" rx="8.5" fill="#e08a64" transform="rotate(-7 41.5 80)"/><rect x="55" y="44" width="15" height="36" rx="7.5" fill="#e08a64" opacity="0.6" transform="rotate(7 62.5 80)"/>' },
  { name: 'two-mint', svg: '<rect width="100" height="100" rx="22.5" fill="#6fb89a"/><rect x="33" y="30" width="17" height="50" rx="8.5" fill="#ffffff" transform="rotate(-7 41.5 80)"/><rect x="55" y="44" width="15" height="36" rx="7.5" fill="#ffffff" opacity="0.6" transform="rotate(7 62.5 80)"/>' },
  { name: 'two-mono', svg: '<rect width="100" height="100" rx="22.5" fill="#faf9f5"/><rect x="33" y="30" width="17" height="50" rx="8.5" fill="#1a1814" transform="rotate(-7 41.5 80)"/><rect x="55" y="44" width="15" height="36" rx="7.5" fill="#1a1814" opacity="0.6" transform="rotate(7 62.5 80)"/>' },
  { name: 'two-sky', svg: '<rect width="100" height="100" rx="22.5" fill="#6fa8c4"/><rect x="33" y="30" width="17" height="50" rx="8.5" fill="#ffffff" transform="rotate(-7 41.5 80)"/><rect x="55" y="44" width="15" height="36" rx="7.5" fill="#ffffff" opacity="0.6" transform="rotate(7 62.5 80)"/>' },
  { name: 'two-sky-soft', svg: '<rect width="100" height="100" rx="22.5" fill="#d8e7ef"/><rect x="33" y="30" width="17" height="50" rx="8.5" fill="#3a657a" transform="rotate(-7 41.5 80)"/><rect x="55" y="44" width="15" height="36" rx="7.5" fill="#3a657a" opacity="0.6" transform="rotate(7 62.5 80)"/>' },
]

const KEY = 'pm-logo-test'

// --- 모듈 단위 store (좌측 로고 + 우측 버튼이 인덱스를 공유) ---
const listeners = new Set<() => void>()
function read(): number {
  if (typeof window === 'undefined') return 0
  const n = Number(window.localStorage.getItem(KEY))
  return Number.isInteger(n) && n >= 0 && n < VARIANTS.length ? n : 0
}
function emit() {
  listeners.forEach((l) => l())
}
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function cycle() {
  const next = (read() + 1) % VARIANTS.length
  window.localStorage.setItem(KEY, String(next))
  emit()
}

function useIndex(): number {
  return useSyncExternalStore(subscribe, read, () => 0)
}

/** 상단 좌측 — 현재 후보 로고. */
export function LogoMark({ size = 22 }: { size?: number }) {
  const i = useIndex()
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: VARIANTS[i].svg }}
    />
  )
}

/** 상단 우측 — 누르면 다음 후보로 전환. 현재 이름을 옆에 표시. */
export function LogoCycleButton() {
  const i = useIndex()
  return (
    <button
      type="button"
      onClick={cycle}
      title="로고 후보 전환 (테스트용)"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        height: 40,
        padding: '0 10px',
        borderRadius: 20,
        border: '1px dashed var(--pm-line, #ccc)',
        background: 'transparent',
        cursor: 'pointer',
        color: 'var(--pm-ink-2)',
        font: '600 11px system-ui, sans-serif',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <LogoMark size={18} />
      <span>
        {i + 1}/{VARIANTS.length} {VARIANTS[i].name}
      </span>
    </button>
  )
}
