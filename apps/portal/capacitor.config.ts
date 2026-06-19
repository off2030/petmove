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
    // 펫무브 본체 주소. 루트 petmove.co.kr·www 는 고스트 블로그이므로 반드시 app 서브도메인.
    // 변경 후 `npx cap sync` → 새 native 빌드 → 앱스토어 재제출.
    url: 'https://app.petmove.co.kr',
    // cleartext 는 dev/staging 에서 http 로 로드할 때만. production https 면 불필요.
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
    // B — WebView 배경색. 콜드 스타트 때 웹이 페인트되기 전 흰 화면 대신 앱 톤(stone)을 깐다.
    backgroundColor: '#F5EFE8',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#F5EFE8',
  },
  plugins: {
    // A — 네이티브 스플래시. Remote URL 모드라 앱 실행 시 웹을 처음부터 받아오는 동안
    // 흰 화면이 보이는데, 그동안 스플래시로 덮는다. 웹 셸이 첫 페인트에 도달하면
    // NativeSplash 컴포넌트가 SplashScreen.hide() 로 내린다(그 자리에 스켈레톤/콘텐츠).
    // launchAutoHide:true + 3초 백스톱 — hide() 가 못 불려도(오프라인·로드 실패) 스플래시가
    // 영원히 안 멈추도록. 스켈레톤이 있으니 백스톱이 일찍 떠도 흰 화면은 안 보인다.
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: '#F5EFE8',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
}

export default config
