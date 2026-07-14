// 안드로이드 사본 capacitor.config.json 의 SplashScreen.launchShowDuration 을 0 으로.
//
// 왜: Android 12+ 에서 @capacitor/splash-screen 은 런치에 "시스템 스플래시"(아이콘+단색만
// 가능)를 launchShowDuration 동안 붙잡을 뿐, drawable 풀화면 스플래시를 못 띄운다.
// 펫무브는 MainActivity 가 직접 부트 스플래시(ImageView, 시안 풀화면)를 얹으므로,
// 안드로이드에서는 플러그인 런치 스플래시를 꺼서 시스템 아이콘 화면이 첫 프레임에 바로
// 내려가게 한다. iOS 는 storyboard 방식이 정상 동작하므로 capacitor.config.ts 의 3000 유지
// — 그래서 TS 를 고치지 않고 안드로이드 생성물(json)만 패치한다.
//
// 실행 시점: `npx cap sync android` 뒤 항상 (codemagic.yaml android-portal 에 포함).
// 로컬에서 cap sync android 를 직접 돌렸다면 이 스크립트도 다시 실행할 것:
//   cd apps/portal && node scripts/patch-android-splash-config.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const target = new URL('../android/app/src/main/assets/capacitor.config.json', import.meta.url)
const config = JSON.parse(readFileSync(target, 'utf8'))
config.plugins = config.plugins ?? {}
config.plugins.SplashScreen = { ...config.plugins.SplashScreen, launchShowDuration: 0 }
writeFileSync(target, JSON.stringify(config, null, 2) + '\n')
console.log('patched android capacitor.config.json: SplashScreen.launchShowDuration=0')
