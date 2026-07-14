# 펫무브 브랜드 자산

원본: 사용자 제공 `펫무브 로고(한글).zip` (2026-07-11 반입).

## 확정 자산 — 그대로 사용

- `downloads/PetMove-icon-3A.svg` — **공식 아이콘 원안** (하늘 그라데이션 #63C9FF→#0BAEFF + 흰 구름 언덕, rx 46/200).
  portal 상단바 `LogoMark`(apps/portal/components/portal-shell/logo-mark.tsx)가 이 원안 + 플로팅 섀도.
- `downloads/PetMove-logo-korean.svg` — 한글 로고(펫무브).
- `downloads/PetMove-logo-horizontal.svg` — 가로형 로고.
- `downloads/png/PetMove-icon-{16,32,180,192,512,1024}.png` — 앱/웹 아이콘 전 크기.
  네이티브 빌드(런처 아이콘·스플래시) 갱신 시 이 세트 사용.
- `downloads/png/PetMove-icon-3D{,-onblue}.png` — 3D 입체 렌더(홈화면 목업용).
- `fonts/Alonzo-ExtraLight.otf` — PETMOVE 로마자 워드마크 전용 서체(대문자·자간).
  본문·제목엔 쓰지 않는다. (admin topbar 워드마크가 이미 사용 중)

## 참고 아카이브 — 기준 아님

- `design-system-archive/colors_and_type.css` — **예전 웜톤 탐색안**(크림 캔버스 + 코랄피치
  주색). 2026-07-11 확정된 실제 기준(흰 바탕 + 하늘 파랑 #0BAEFF 계열 강조)과 다르다.
  색·타이포 기준은 portal 코드(`apps/portal/app/globals.css --pm-*`)가 진실.
- `brand-applications.html` — 브랜드 적용 예시 모음(열람용).
