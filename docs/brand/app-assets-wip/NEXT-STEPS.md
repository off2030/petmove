# 앱 리브랜딩 — 아이콘·스플래시 교체 인수인계

> 2026-07-14 작성. 다른 컴퓨터에서 이어가기 위한 문서. (이 폴더 = 다음 작업용 재료. 아직 앱에 미적용.)

## 배경
웹(portal)은 새 브랜드로 배포됐지만 **네이티브 앱 아이콘·스플래시는 옛것 그대로**라 교체 필요.
오늘 앱 1.0이 구글플레이 프로덕션 게시됨 → 이 작업은 **새 버전 업데이트 + 재심사**가 됨.
⚠️ 아이콘·스플래시는 **네이티브 빌드에 구워짐** — master push(웹 배포)만으로는 절대 안 바뀜.

## 확정된 디자인 (사용자 승인)
- **아이콘**: 하늘 그라디언트(#63C9FF→#0BAEFF) + 노란 P(#FFC93C) + 흰 구름 ("완전히 떠오른 P").
  사용자 제공 SVG 그대로, rx=46 둥근 클립만 제거(정사각 소스 — OS가 모서리 둥글림).
- **스플래시**: C2안 (로고 확장형·불투명 흰 구름). 구현 스펙 = 이 폴더 `SPEC.md`.
  "펫무브" Pretendard ExtraBold(800)·화면폭 10%·자간 -0.03em·상단 42%, 구름+P 하단 고정·폭 100%·높이=폭×0.67.

## 이 폴더 파일
| 파일 | 용도 |
|---|---|
| `icon-master.svg` / `icon-1024.png` | 확정 아이콘 (정사각) |
| `splash-c2.svg` / `splash-2732.png` | 스플래시 소스 + 최종 렌더(Pretendard 적용) |
| `splash-cloud-P.svg` | 사용자 원본 구름+P 벡터 |
| `SPEC.md` | 사용자 제공 구현 스펙 |
| `Pretendard-ExtraBold.otf` + `fonts.conf` | 재렌더용 폰트(OFL). sharp 렌더 시 `FONTCONFIG_PATH`로 지정 |

재렌더 예: `FONTCONFIG_PATH=<이폴더> node -e "sharp('splash-c2.svg',{density:96}).resize(2732,2732).flatten({background:'#0BAEFF'})..."`

## 다음 할일 (순서대로)
1. ✅ **`apps/portal/assets/` 교체 완료** (2026-07-14, 커밋 5803d447) — icon/icon-only/적응형 fg·bg 분리 렌더/splash·splash-dark 전부 교체.
2. ✅ **`capacitor.config.ts`** 배경색 3곳 `#0BAEFF` 완료.
   - 추가로 **Android 네이티브 res 도 갱신**(같은 커밋): colors.xml 분리 — `splash_background`=#0BAEFF(시스템 스플래시), `app_background`=#F4F6F8(상태바·내비바·창배경=웹 --pm-bg). 런처 mipmap·스플래시 drawable 로컬 재생성(`npx @capacitor/assets generate --android`).
3. ✅ **커밋·푸시 완료** (5803d447).
   - **버전 업도 완료**: Android `versionName = "1.1"`(build.gradle), iOS 마케팅 버전 = codemagic.yaml `MARKETING_VERSION: "1.1"`(CFBundleShortVersionString PlistBuddy 주입 추가). versionCode/CFBundleVersion 은 기존대로 Codemagic 빌드번호 자동.
4. ⬜ **Codemagic 빌드** — push 트리거 없음. Codemagic UI에서 `ios-portal`·`android-portal` 수동 실행.
5. ⬜ **스토어 제출**: Play Console AAB 수동 업로드 + App Store Connect(자동 업로드됨) → 재심사.
   - ⚠️ Android 1.0 이 아직 검토 중이면(관리형 게시) 1.1 제출 타이밍은 승인 후 권장.

## 별도 작업 (빌드 불필요 — Console 직접 업로드)
- 구글플레이: 512×512 스토어 아이콘, 피처 그래픽 1024×500, 폰 스크린샷(리디자인 화면)
- iOS: 기기 크기별 스크린샷
- 아이콘 SVG에서 파생 생성 가능

## 부수 (웹 배포로 즉시 반영, 재심사 아님)
- 파비콘 / PWA 매니페스트 아이콘 / OG 공유 이미지 새 브랜드로
- Android 알림 아이콘(흰 실루엣) 넣을지 결정
