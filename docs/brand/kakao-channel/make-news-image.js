// 카카오 소식용 1080² — 플레이스토어 피처그래픽 재구성
// 폰 목업은 폰스크린샷_1 에서 추출, 텍스트·배경은 브랜드 문법으로 신규 렌더
const sharp = require('sharp');
const fs = require('fs');

const SRC = 'G:/내 드라이브/펫무브워크/디자인/스크린샷/구글플레이/폰스크린샷_1_새브랜드.png';
const OUT_DIR = 'C:/dev/petmove/docs/brand/kakao-channel';
const ICON = 'C:/dev/petmove/docs/brand/app-assets-wip/icon-1024.png'; // 그라데이션 타일 포함 정사각 원본

(async () => {
  // 1. 폰 목업 추출 (베젤 bbox + 여유 1px 안쪽)
  const phone = await sharp(SRC).extract({ left: 180, top: 590, width: 538, height: 1148 }).png().toBuffer();
  const phoneB64 = phone.toString('base64');
  const iconB64 = fs.readFileSync(ICON).toString('base64');

  // 2. SVG 조립 — 폰은 둥근 모서리 클립(베젤 r≈88) 후 시계방향 8도 기울여 우하단 배치
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#63C9FF"/>
      <stop offset="1" stop-color="#0BAEFF"/>
    </linearGradient>
    <clipPath id="phoneClip"><rect x="2" y="2" width="534" height="1144" rx="86"/></clipPath>
    <clipPath id="iconClip"><rect width="96" height="96" rx="21"/></clipPath>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="30" flood-color="#005A94" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect width="1080" height="1080" fill="url(#sky)"/>

  <!-- 아이콘 + 워드마크 (둥근 클립 + 섀도로 배경과 분리) -->
  <g transform="translate(72,84)" filter="url(#drop)">
    <g clip-path="url(#iconClip)">
      <image x="0" y="0" width="96" height="96" xlink:href="data:image/png;base64,${iconB64}"/>
    </g>
  </g>
  <text x="192" y="152" font-family="Pretendard" font-weight="800" font-size="52" letter-spacing="-1.6" fill="#ffffff">펫무브</text>

  <!-- 헤드라인 -->
  <text x="72" y="330" font-family="Pretendard" font-weight="800" font-size="104" letter-spacing="-3.1" fill="#ffffff">반려동물</text>
  <text x="72" y="446" font-family="Pretendard" font-weight="800" font-size="104" letter-spacing="-3.1" fill="#ffffff">해외여행</text>

  <!-- 서브카피 -->
  <text x="72" y="560" font-family="Pretendard" font-weight="800" font-size="42" letter-spacing="-1.3" fill="#ffffff" opacity="0.92">검역 준비가 막막하셨죠?</text>
  <text x="72" y="620" font-family="Pretendard" font-weight="800" font-size="42" letter-spacing="-1.3" fill="#ffffff" opacity="0.92">펫무브로 준비하세요</text>

  <!-- 출시 라인 (노란 P 색 강조, 폰과 겹치지 않게 두 줄) -->
  <text x="72" y="712" font-family="Pretendard" font-weight="800" font-size="34" letter-spacing="-1.0" fill="#FFC93C">App Store · Google Play</text>
  <text x="72" y="762" font-family="Pretendard" font-weight="800" font-size="34" letter-spacing="-1.0" fill="#FFC93C">정식 출시</text>

  <!-- 폰 목업: 우하단, 시계방향 8도, 하단·우측 블리드 -->
  <g transform="translate(600,300) rotate(8)" filter="url(#drop)">
    <g clip-path="url(#phoneClip)">
      <image x="0" y="0" width="538" height="1148" xlink:href="data:image/png;base64,${phoneB64}"/>
    </g>
  </g>
</svg>`;

  fs.writeFileSync(`${OUT_DIR}/news-app-launch.svg.tmp`, svg); // 디버그용 (base64 포함이라 커밋 안 함)
  const out = await sharp(Buffer.from(svg), { density: 96 }).resize(1080, 1080).png().toFile(`${OUT_DIR}/news-app-launch-1080.png`);
  console.log('ok', out.width, out.height);
})();
