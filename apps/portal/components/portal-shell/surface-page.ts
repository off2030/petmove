/**
 * 흰 배경(surface) 화면 판정 — 단일 출처 (2026-07-12 흰 배경 실험).
 *
 * 기준: 카드가 '낱개의 대상'(동물·서류·상품)을 나타내는 화면은 회색 캔버스+흰 카드,
 * 메뉴 나열·긴 글 화면은 흰 배경+구분선 행.
 *  - 흰 배경: 설정 전체(/settings*)만
 *  - 회색 유지: 탭 루트(준비·서류·맡기기), 내 정보 허브·하위(/me*), 케이스 목록
 *    (내 정보 하위도 흰색으로 확장했었으나 사용자 판정으로 원복 — 2026-07-12)
 *
 * top-bar · bottom-nav · EditPageShell · SectionCard · StickySaveBar 가 공유한다.
 */
export function isSurfacePage(pathname: string): boolean {
  return pathname === '/settings' || pathname.startsWith('/settings/')
}
