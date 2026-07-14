# 펫무브 스플래시 — 네이티브 구현 스펙

## 배경
- 세로 그라데이션: 상단 #63C9FF → 하단 #0BAEFF (linear, 180deg)

## 브랜드 텍스트 "펫무브"
- 폰트: Pretendard Bold(800). 미로드 시 시스템 산세리프 대체
- 색: #FFFFFF, 자간 -0.03em
- 크기: 화면 폭의 ~10% (390pt 기준 38pt)
- 위치: 화면 상단에서 42% 지점, 가로 중앙

## 구름 + P 레이어 (첨부 SVG/PNG)
- 파일: petmove-splash-cloud-P.svg (원본 벡터) / @3x PNG (1170px 폭, 투명 배경)
- 위치: 화면 하단에 딱 붙임(bottom-aligned), 가로 100% 채움
- 높이: 화면 폭 × 0.67 (원본 비율 200:134 유지, 절대 늘리지 말 것)
- P 색: #FFC93C / 구름 아래 비치는 꼬리: #FFC93C @ 34% 불투명도

## Android 12+ (SplashScreen API)
- windowSplashScreenBackground: #0BAEFF (그라데이션 미지원 시 단색)
- 그라데이션·구름은 스플래시 직후 첫 화면에서 재현 권장

## iOS (LaunchScreen storyboard)
- 배경: CAGradientLayer 불가 → 그라데이션 이미지 1장 깔기
- 구름+P: 하단 고정 UIImageView (aspect fit, 폭 100%)
