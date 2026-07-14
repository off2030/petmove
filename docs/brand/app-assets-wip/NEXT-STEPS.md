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
1. **`apps/portal/assets/` 교체** — 기존 파일과 같은 이름·규격 유지(@capacitor/assets가 codemagic.yaml에서 읽음):
   - `icon.png` ← icon-1024.png (1024 정사각)
   - `icon-foreground.png` / `icon-background.png` (적응형 — **분리 렌더 필요**: fg=구름+P 투명배경, bg=하늘 그라디언트)
   - `icon-only.png` ← icon-1024.png
   - `splash.png` / `splash-dark.png` ← splash-2732.png (2732, light/dark 동일)
2. **`apps/portal/capacitor.config.ts`** — 배경색 3곳 `#F5EFE8` → `#0BAEFF` (ios.backgroundColor / android.backgroundColor / SplashScreen.backgroundColor)
3. **커밋·푸시** (웹 배포 영향 없음 — assets는 네이티브 전용. portal 웹 재배포는 되지만 무해)
4. **Codemagic 빌드** — push 트리거 없음. Codemagic UI에서 `ios-portal`·`android-portal` 수동 실행.
   - ⚠️ **앱 버전 올려야** 스토어가 새 버전으로 받음. iOS는 CFBundleVersion(빌드번호)만 CI 자동, **마케팅 버전(CFBundleShortVersionString)·Android versionName/versionCode 올리는 방법 확인 필요** (codemagic.yaml / build.gradle).
5. **스토어 제출**: Play Console AAB 수동 업로드 + App Store Connect(자동 업로드됨) → 재심사.

## 별도 작업 (빌드 불필요 — Console 직접 업로드)
- 구글플레이: 512×512 스토어 아이콘, 피처 그래픽 1024×500, 폰 스크린샷(리디자인 화면)
- iOS: 기기 크기별 스크린샷
- 아이콘 SVG에서 파생 생성 가능

## 부수 (웹 배포로 즉시 반영, 재심사 아님)
- 파비콘 / PWA 매니페스트 아이콘 / OG 공유 이미지 새 브랜드로
- Android 알림 아이콘(흰 실루엣) 넣을지 결정
