import type { MetadataRoute } from 'next'

/**
 * PWA manifest — 모바일에서 "홈 화면에 추가" 시 standalone 앱처럼 동작.
 * 카톡 같은 native 느낌의 즉시 진입 + offline 가능성을 위한 첫 단계.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '펫무브워크',
    short_name: '펫무브',
    description: '반려동물 해외 이동 검역 관리',
    start_url: '/',
    display: 'standalone',
    background_color: '#F5F4ED',
    theme_color: '#F5F4ED',
    lang: 'ko',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  }
}
