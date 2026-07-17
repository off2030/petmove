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
// EU 회원국 — 촌충(에키노코쿠스)·사전 통지 등 개별 카드가 있는 국가(핀란드·아일랜드·몰타·
// 노르웨이·영국·스위스·키프로스)는 제외한 나머지 24개국. 여정 카드는 destination-config 의
// 'eu' 오버라이드 + journey-steps 의 euFamilyOverrides 한 벌로 전부 공유한다(EU Reg 576/2013
// 규정 동일). 카드 라벨은 'eu' 키 공통으로 '유럽연합(EU)' 표기.
// 별도 export — 목적지 사진 등 'EU 한 벌 공유' 자산이 이 목록을 단일 출처로 쓴다.
export const APP_EU_DESTINATIONS_KO: readonly string[] = [
  '프랑스', '독일', '이탈리아', '스페인', '네덜란드', '벨기에', '오스트리아',
  '스웨덴', '덴마크', '폴란드', '체코', '포르투갈', '그리스',
  '헝가리', '루마니아', '불가리아', '크로아티아', '슬로바키아',
  '슬로베니아', '리투아니아', '라트비아', '에스토니아', '룩셈부르크',
]

// 유럽 개별 카드국 — 각자 destination-config 에 1:1 키가 있고(촌충·사전 통지 등 고유 절차),
// journey-steps 의 euFamilyOverrides 로 EU 규정 카드 한 벌을 공유하면서 라벨만 자국명.
// 2026-07-16: 촌충·사전 통지 카드 구성 완료로 여정 구성이 끝나 화이트리스트에 추가.
// ⚠️ 히어로 사진 미등록(다른 27개국은 등록 완료) — 등록 전까지 목적지 카드에 사진 없이 표시.
export const APP_EU_INDIVIDUAL_DESTINATIONS_KO: readonly string[] = [
  '핀란드', '아일랜드', '몰타', '노르웨이', '영국', '스위스', '키프로스',
]

export const APP_DESTINATIONS_KO: readonly string[] = [
  '일본', '태국', '필리핀',
  ...APP_EU_DESTINATIONS_KO,
  ...APP_EU_INDIVIDUAL_DESTINATIONS_KO,
]

/** APP_DESTINATIONS_KO 를 destinations.json 의 {ko,en} 으로 — 등록 순서 보존. */
export const APP_DESTINATIONS: Dest[] = APP_DESTINATIONS_KO.map(
  (ko) => DESTS.find((d) => d.ko === ko) ?? { ko, en: '' },
)

/**
 * 여행지 검색 드롭다운용 — 한글 이름 가나다순. 검색 UI 는 등록 순서(대륙 그룹)보다 가나다순이
 * 직관적이라 별도 export (APP_DESTINATIONS 자체 순서는 히어로 사진 등 다른 소비자가 쓰므로 보존).
 */
export const APP_DESTINATIONS_SORTED: Dest[] = [...APP_DESTINATIONS].sort((a, b) =>
  a.ko.localeCompare(b.ko, 'ko'),
)

export function isAppDestination(ko: string): boolean {
  return APP_DESTINATIONS_KO.includes(ko)
}
