import destsData from '@petmove/domain/data/destinations.json'

interface Dest {
  ko: string
  en: string
}

const DESTS = destsData as Dest[]

/**
 * 펫무브 앱(보호자)에서 목적지로 **선택 가능한** 국가 — 전체 일정 카드 + 서류 탭 구성이
 * 끝난 나라만. 신청 폼·동물 상세의 '목적지 추가'·서비스 목록이 모두 이 한 곳을 본다.
 *
 * ⚠️ 펫무브워크(admin, apps/admin)는 제한 없이 **모든 국가** 선택 가능 — 이 화이트리스트는
 * 펫무브 앱(apps/portal) 한정. (admin 은 destinations.json 전체를 그대로 쓴다.)
 *
 * 새 나라의 여정·서류 구성이 끝나면 여기에 ko 명을 추가하면, 앱의 추가 버튼·신청 폼·
 * 서비스 안내에 함께 노출된다. (이미 등록된 케이스의 비화이트리스트 목적지는 그대로 표시 —
 * 추가만 막고 기존 목적지는 건드리지 않는다.)
 *
 * 정책 메모: memory project_app_supported_destinations.
 */
export const APP_DESTINATIONS_KO: readonly string[] = ['일본', '태국', '필리핀']

/** APP_DESTINATIONS_KO 를 destinations.json 의 {ko,en} 으로 — 등록 순서 보존. */
export const APP_DESTINATIONS: Dest[] = APP_DESTINATIONS_KO.map(
  (ko) => DESTS.find((d) => d.ko === ko) ?? { ko, en: '' },
)

export function isAppDestination(ko: string): boolean {
  return APP_DESTINATIONS_KO.includes(ko)
}
