import type { MetadataRoute } from 'next'

/**
 * PWA manifest — 모바일에서 "홈 화면에 추가" 시 standalone 앱처럼 동작.
 * 보호자가 카톡 링크 따라 들어와서 바로 추가할 수 있게 — admin 의 무거운
 * 데스크톱 앱과 달리 portal 은 모바일 우선.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '펫무브',
    short_name: '펫무브',
    description: '반려동물 해외 출국 보호자 셀프서비스',
    start_url: '/',
    display: 'standalone',
    background_color: '#F5F4ED',
    theme_color: '#F5F4ED',
    lang: 'ko',
    orientation: 'portrait',
    icons: [
      // 펫무브 전용 — 리본P (amber #D99A58, 강조색과 동일). SVG vector 라 어떤 사이즈에서도 또렷.
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      // maskable — Android 적응형(둥근/사각/물방울 crop). full-bleed amber + 안전영역 리본P.
      {
        src: '/icon-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
