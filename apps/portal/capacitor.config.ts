import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor 설정 — Next.js 웹 portal 을 native shell (iOS/Android) 로 감싸 App Store /
 * Google Play 배포.
 *
 * 모드: **Remote URL** — 웹 빌드를 Vercel 에 그대로 두고, native 앱은 그 URL 을 WebView 로
 * 로드. Next.js 의 server actions / app router / SSR 그대로 동작. 콘텐츠 변경은
 * `git push` → Vercel 재배포 → 모든 사용자 즉시 반영 (앱스토어 재심사 없이).
 *
 * 단점:
 * - 오프라인 시 portal 의 sw.js offline 페이지에 의존 (이미 구현됨)
 * - native 라이브러리 (camera/geolocation/biometric 등) 가 필요해지면 Capacitor plugin
 *   추가하고 native 빌드 재제출 필요
 *
 * 대안 (static export 모드): Next.js `output: 'export'` + Capacitor 가 정적 파일을 앱에
 * 번들. 오프라인 더 강하지만 SSR/server actions 못 씀 — auth 흐름 재설계 필요. 현재는
 * remote URL 이 명확히 합리적.
 */
const config: CapacitorConfig = {
  appId: 'com.petmove.portal',
  appName: '펫무브',
  // webDir 는 static export 모드에서 사용. remote URL 모드에선 형식상만 필요 (빌드 산출물 폴더).
  webDir: 'out',
  server: {
    // production 배포 시 https://petmove.co.kr 로 변경. 베타 단계엔 Vercel 임시 도메인.
    // 변경 후 `npx cap sync` → 새 native 빌드 → 앱스토어 재제출.
    url: 'https://petmove.co.kr',
    // cleartext 는 dev/staging 에서 http 로 로드할 때만. production https 면 불필요.
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
  },
  android: {
    allowMixedContent: false,
  },
}

export default config
