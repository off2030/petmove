import type { MetadataRoute } from 'next'

/**
 * Web manifest — name·theme·아이콘 메타만 제공. **PWA 설치(홈 화면 추가)는 의도적으로 차단**한다.
 * 알림 등 핵심 기능이 네이티브(Capacitor)에서만 동작하므로 PWA 껍데기는 반쪽짜리 — 사용자가
 * 스토어 네이티브 앱을 설치하도록 유도한다.
 *  - display:'browser' → Android Chrome 의 홈화면 설치(A2HS) 프롬프트가 뜨지 않는다.
 *  - prefer_related_applications:true → Chrome 이 PWA 대신 Play 스토어 네이티브 앱을 가리킨다.
 *  - Capacitor 네이티브 앱은 이 manifest 를 참조하지 않아 영향 없음(iOS A2HS 차단은 layout.tsx 에서).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '펫무브',
    short_name: '펫무브',
    description: '반려동물 해외 출국 보호자 셀프서비스',
    start_url: '/',
    display: 'browser',
    prefer_related_applications: true,
    related_applications: [
      {
        platform: 'play',
        id: 'com.petmove.portal',
        url: 'https://play.google.com/store/apps/details?id=com.petmove.portal',
      },
      { platform: 'itunes', url: 'https://apps.apple.com/app/id6784567864' },
    ],
    // 새 디자인 시스템(2026-07-11): 옅은 회색 캔버스 --pm-bg. (구 양피지 #F5F4ED 폐기)
    background_color: '#F4F6F8',
    theme_color: '#F4F6F8',
    lang: 'ko',
    orientation: 'portrait',
    icons: [
      // 새 브랜드 아이콘(하늘 그라디언트 + 구름 + 노란 P, 2026-07-14 교체) — 원본
      //   docs/brand/app-assets-wip/icon-master.svg. SVG vector.
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      // maskable — Android 적응형(둥근/사각/물방울 crop). full-bleed 하늘 배경 + 안전영역 구름P.
      {
        src: '/icon-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
