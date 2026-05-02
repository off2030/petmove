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
      // 일반 — 둥근 사각 P 로고. SVG 가 우선, PNG 는 SVG 미지원 브라우저 대비.
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
      // maskable — Android 적응형 아이콘 (둥근/사각/물방울 등 자유 crop).
      // 안전영역(80%)에 P 배치 + full-bleed 배경.
      {
        src: '/icon-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
