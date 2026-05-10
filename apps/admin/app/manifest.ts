import type { MetadataRoute } from 'next'

/**
 * PWA manifest — 모바일에서 "홈 화면에 추가" 시 standalone 앱처럼 동작.
 * 카톡 같은 native 느낌의 즉시 진입 + offline 가능성을 위한 첫 단계.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '펫무브워크',
    short_name: '펫무브워크',
    description: '반려동물 해외 이동 검역 관리',
    start_url: '/',
    display: 'standalone',
    background_color: '#F5F4ED',
    theme_color: '#F5F4ED',
    lang: 'ko',
    orientation: 'portrait',
    icons: [
      // 일반 — SVG 우선. icon.svg 는 글자가 inline path 로 박혀있어 (build-logo-svgs.mjs
      // 가 opentype.js 로 OTF 글리프를 vector path 로 변환) 폰트 의존성 0. 어떤
      // 사이즈에서도 vector 로 또렷, Android Chrome 의 PWA 아이콘 변환기도 path 는
      // 잘 그려 글자 누락 없음. PNG 는 SVG 미지원 환경 fallback.
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      // maskable — Android 적응형 아이콘 (둥근/사각/물방울 등 자유 crop).
      // 안전영역(80%)에 PMW 모노그램 배치 + full-bleed 배경.
      {
        src: '/icon-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
      {
        src: '/icon-maskable',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-maskable-512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
