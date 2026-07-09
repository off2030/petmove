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
    var s = force ? null : localStorage.getItem('skin')
    var V = ['baby-blue', 'scandi-minimal', 'flat', 'hygge']
    if (s && V.indexOf(s) >= 0) h.setAttribute('data-skin', s)
  } catch (e) {}
})()
