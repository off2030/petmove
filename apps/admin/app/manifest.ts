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
      // 일반 — 둥근 사각 PETMOVE / Work 워드마크. PNG 만 등록.
      // SVG (icon.svg) 도 build artifact 로 존재하지만 Android Chrome 의 PWA 아이콘
      // 변환기가 SVG 안의 inline @font-face 를 못 그려 글자 빠진 갈색 배경만 나오는
      // 사례가 있어 manifest 에선 제외. SVG 는 브라우저 탭 favicon 등 다른 경로에서만 사용.
      // 192/512 두 사이즈 등록 → 작은 홈 아이콘과 큰 splash/app-drawer 모두 또렷.
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
      // 안전영역(80%)에 PETMOVE/Work 배치 + full-bleed 배경. PNG (route handler) 로 제공.
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
