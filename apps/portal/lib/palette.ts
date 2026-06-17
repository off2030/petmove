/**
 * 펫무브 색 팔레트 — 단일 출처. 모든 화면이 여기서 import 한다.
 *
 * 값은 globals.css 의 --pm-* 토큰을 참조(라이트/다크 자동). 색을 바꾸려면 globals.css
 * 한 곳만 고치면 된다. 새 화면은 `const C = {...}` 를 다시 정의하지 말고 이걸 import 할 것:
 *   import { C } from '@/lib/palette'
 * 추가 색이 필요하면 spread 로 확장:
 *   const C = { ...PM, accentSoft: '...' }  // import { C as PM } from '@/lib/palette'
 */
export const C = {
  bg: 'var(--pm-bg)',
  surface: 'var(--pm-surface)',
  ink: 'var(--pm-ink)',
  ink2: 'var(--pm-ink-2)',
  ink3: 'var(--pm-ink-3)',
  line: 'var(--pm-line)',
  line2: 'var(--pm-line-2)',
  accent: 'var(--pm-accent)',
  soft: 'var(--pm-accent-soft)',
  sage: 'var(--pm-sage)',
  warn: 'var(--pm-warn)',
  warnBg: 'color-mix(in srgb, var(--pm-warn) 8%, transparent)',
  info: 'var(--pm-info)',
  infoBg: 'color-mix(in srgb, var(--pm-info) 8%, transparent)',
  cardSoft: 'var(--pm-card-soft)',
  cardList: 'var(--pm-card-list)',
  cardHero: 'var(--pm-card-hero)',
} as const
