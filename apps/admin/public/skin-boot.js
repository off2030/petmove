// hydration 전에 동기 실행 — localStorage 읽어 data-theme/data-skin/.dark 를
// 미리 박아 FOUC(다크모드·스킨 깜빡임) 방지. layout.tsx 가 <script src> 로 head 에서
// 블로킹 로드한다. React 19/Next 16 은 인라인 <script> 를 렌더 시 경고하므로 외부 파일로 분리.
// VALID_SKINS / FORCE_DEFAULT_PATHS 는 theme-provider.tsx 와 동기화 유지.
(function () {
  try {
    var p = location.pathname
    var force = p.indexOf('/apply') === 0 || p.indexOf('/share') === 0
    var h = document.documentElement
    var m = localStorage.getItem('theme')
    var theme = force ? 'system' : (m === 'dark' || m === 'light' ? m : 'system')
    h.setAttribute('data-theme', theme)
    var dark = !force && (m === 'dark' || ((!m || m === 'system') && matchMedia('(prefers-color-scheme: dark)').matches))
    if (dark) h.classList.add('dark')
    // 외부 고객용(/apply·/share)은 운영자 스킨 무시하고 항상 brand(펫무브 앱 디자인).
    // default = brand (2026-08-05 승격). editorial 만 무속성(기본 CSS 블록),
    // 그 외(미설정·brand·legacy flat)는 전부 brand 로.
    var s = force ? 'brand' : localStorage.getItem('skin')
    if (s !== 'editorial') h.setAttribute('data-skin', 'brand')
  } catch (e) {}
})()
