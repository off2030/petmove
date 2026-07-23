'use client'

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  destinationKoLabel,
  matchesDestinationKey,
  ADVANCE_NOTICE_DESTINATIONS,
  DESTINATION_OVERRIDES,
  type CaseRow,
} from '@petmove/domain'
import destsData from '@petmove/domain/data/destinations.json'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { StartHereEmpty } from '@/components/portal-shell/start-here-empty'
import { BottomSheet } from '@/components/fields/bottom-sheet'
import { type FieldOption } from '@/components/fields/info-fields'
import { C, serif } from '@/components/me/settings-shared'
import { PAGE_TOP, pageTitle, sectionTitle } from '@/lib/tokens'
import { APP_DESTINATIONS_KO, APP_EU_INDIVIDUAL_DESTINATIONS_KO } from '@/lib/app-destinations'
import { buildProfileView } from '@/lib/profile/catalog'
import { notifyServiceInquiry } from '@/lib/actions/service-inquiry'

/**
 * 서비스 탭 (/services) — 펫무브 유료 상품 안내. 목적지 + 여정 유형(왕복·편도) 인식형.
 *
 * 서비스 내용·비용은 목적지와 왕복/편도에 따라 달라진다.
 *  - 목적지 선택지 = '서비스 제공 국가' 큐레이션 목록(OFFERED_KO). 처음부터 검색 시트로
 *    — 목록이 늘어나도 버튼으로 감당 안 되므로. 새 나라 준비되면 OFFERED_KO 에 push.
 *  - 기본 목적지 = **현재 선택된 동물의 여정** 목적지. TabHost 가 준비·서류 pane 과 똑같이
 *    caseId·dest 를 prop 으로 내려준다. 그게 서비스 제공 목록에 있으면 그것. 없으면
 *    전체 케이스 union 의 첫 제공 목적지, 그것도 없으면 목록 첫 번째. (서비스는 보고 있는
 *    동물 기준으로 안내해야 — 여러 동물의 목적지가 섞이면 엉뚱한 나라가 잡힘.)
 *
 *    ⚠️ 이전엔 mount 시 sessionStorage(LAST_CASE_KEY·readLastDest)를 `useEffect(…, [])` 로
 *    한 번만 읽었다. 이 pane 은 keep-alive(+예열 선mount)라 이후 동물·목적지를 바꿔도
 *    영영 갱신되지 않아, 밀꾸(일본)를 보는데 맡기기 탭엔 중국이 뜨는 버그가 있었다.
 *    그 값이 문의 봇 알림(notifyServiceInquiry)에도 실려 나가 운영자가 엉뚱한 목적지를
 *    통보받았다. prop 으로 받으면 pane 재생성 없이 항상 현재 값을 따른다.
 *  - 왕복/편도 = 등록값을 기본 표시 + 여기서도 전환. 단, 이 선택은 **둘러보기용 로컬 상태**라
 *    실제 여정의 trip_type 을 바꾸지 않는다(목록엔 미등록 목적지도 있어 저장 대상이 아님).
 *
 * 두 갈래: 오프라인(오프라인 올케어, 전체 의뢰) / 온라인(온라인 안심케어, 부분 의뢰).
 * v1 은 안내(소개)만 — 상담 신청·결제 액션은 결제 모델 확정 전까지 미연결.
 * 목적지·유형별 내용·비용 분기는 차차 — 지금은 buildOffers 가 generic 반환.
 * (결제 모델 미정: docs/portal-plan.md §결제 / memory project_portal_paywall)
 */

interface Dest {
  ko: string
  en: string
}
const DESTS = destsData as Dest[]

/** 서비스 제공 국가 = 앱 지원 목적지(여정·서류 구성 완료). 새 나라는 app-destinations 한 곳에서 추가. */
const OFFERED_KO: readonly string[] = APP_DESTINATIONS_KO
const OFFERED: Dest[] = OFFERED_KO.map((ko) => DESTS.find((d) => d.ko === ko) ?? { ko, en: '' })
// 여행지 선택 시트 표시용 — 가나다순. (OFFERED_KO 자체 순서는 폴백 기본값[0] 등 로직에 쓰여 보존.)
const OFFERED_SORTED: Dest[] = [...OFFERED].sort((a, b) => a.ko.localeCompare(b.ko, 'ko'))

/** 펫무브 카카오톡 채널 채팅 링크 — '카카오톡으로 문의' 진입. */
const KAKAO_CHAT_URL = 'https://pf.kakao.com/_zDDxhj/chat'

type TripType = 'round' | 'one_way'
const TRIP_OPTIONS: readonly FieldOption[] = [
  { value: 'round', label: '왕복' },
  { value: 'one_way', label: '편도' },
]

type Accent = { stroke: string; chipBg: string }
const AMBER: Accent = { stroke: C.accent, chipBg: C.soft }
const SAGE: Accent = {
  stroke: C.sage,
  chipBg: 'color-mix(in srgb, var(--pm-sage) 14%, transparent)',
}

const clinicIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 21h18" />
    <path d="M5 21V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v15" />
    <path d="M10 21v-3.5a2 2 0 0 1 4 0V21" />
    <path d="M12 10.2c-1.1 0-1.9.7-1.9 1.5 0 .7.8 1.1 1.9 1.1s1.9-.4 1.9-1.1c0-.8-.8-1.5-1.9-1.5z" fill="currentColor" stroke="none" />
    <circle cx="9.4" cy="9.5" r="0.85" fill="currentColor" stroke="none" />
    <circle cx="11" cy="8.5" r="0.85" fill="currentColor" stroke="none" />
    <circle cx="13" cy="8.5" r="0.85" fill="currentColor" stroke="none" />
    <circle cx="14.6" cy="9.5" r="0.85" fill="currentColor" stroke="none" />
  </svg>
)

const devicesIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M6.5 4h9a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-9a1.5 1.5 0 0 1-1.5-1.5v-4a1.5 1.5 0 0 1 1.5-1.5z" />
    <path d="M3.5 13.8h15" />
    <path
      d="M15.9 7.5h3.1a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-3.1a1.5 1.5 0 0 1-1.5-1.5V9a1.5 1.5 0 0 1 1.5-1.5z"
      style={{ fill: 'color-mix(in srgb, var(--pm-sage) 14%, var(--pm-surface))' }}
    />
    <path d="M16.7 17.5h1.6" />
  </svg>
)

/** 상세 V 체크리스트 항목 — sub(한 줄 설명)는 선택. 목록이 길면 라벨만 둔다. */
type Prep = { label: string; sub?: string }
/** 상세 히어로 3장(오프라인 공통) — 아이콘(또는 숫자 배지) + 한 줄 라벨. */
type Highlight = { icon: ReactNode; label: string }
/** 먼저 경험한 분들 — 실제 후기(이름은 익명화). meta = 반려동물·목적지. */
type Review = { initial: string; name: string; meta?: string; text: string }
/** 자주 묻는 질문 — link 있으면 답변 아래 바깥링크(예: 병원 위치) 노출. */
type Faq = { q: string; a: string; link?: { label: string; href: string } }
/** 목적지별 상세 본문 — 같은 상품이라도 나라마다 다르게 구성한다. */
type DestDetail = { intro: string; included: Prep[]; steps: string[]; faq: Faq[]; reviews: Review[] }

interface Offer {
  // ── 목록 카드(목적지 공통) ──
  accent: Accent
  icon: ReactNode
  title: string
  /** 상세를 주소(?service=)에 반영하기 위한 식별자. */
  slug: string
  tag: string
  desc: string
  /** "이럴 때 추천해요" 항목들 — 두 갈래 중 자기 것을 빠르게 고르게 하는 결정 보조. */
  forWhom: string[]
  /** 밀어주는 갈래에 '추천' 배지 + 강조 테두리. */
  recommended?: boolean
  /** 상세 히어로 3장(오프라인 공통 — 경험·전문성·앱). 없으면 미표시. */
  highlights?: Highlight[]
  // ── 상세(목적지별) — DestDetail 을 펼쳐 담는다 ──
  /** 상세 상단의 가벼운 소개 한두 문장. */
  intro: string
  included: Prep[]
  /** 상세 '이렇게 진행돼요' 단계 라벨. */
  steps: string[]
  faq: Faq[]
  reviews: Review[]
}

/**
 * 서비스 상세 — 카드 본체(설명·추천 대상·아이콘)는 목적지 공통이지만,
 * 상세 본문(소개·체크리스트·진행 단계·FAQ·후기)은 **목적지마다 다르게** 구성한다.
 * 새 목적지는 {OFFLINE,ONLINE}_DETAIL 에 그 나라 블록을 추가(전용 카피 전엔 default 폴백).
 * 후기(reviews)는 default 로 공유하지 않는다 — 한 나라 후기가 다른 나라에 새지 않도록 빈 배열.
 */
const DEFAULT_FAQ: Faq[] = [
  { q: '비용은 얼마인가요?', a: '여행지와 반려동물 상태에 따라 달라져요. 카카오톡으로 문의 주시면 정확히 안내해 드려요.' },
  {
    q: '준비 기간은 얼마나 걸리나요?',
    a: '나라마다 달라요. 광견병 항체검사가 필요한 곳은 몇 달 전부터 준비해야 해서, 상담 때 여행지에 맞는 일정표를 만들어 드려요.',
  },
  {
    q: '예약을 취소·변경할 수 있나요?',
    a: '절차를 시작하기 전이라면 언제든 가능해요. 이미 진행된 부분은 진행한 만큼만 정산돼요. 자세한 기준은 상담 시 안내해 드려요.',
  },
]

// 실제 카톡 후기(이름·반려동물명 익명화·각색 — 재식별 단서 없음, 동의 불필요). 올케어·안심케어 공통.
const JAPAN_REVIEWS: Review[] = [
  {
    initial: '노',
    name: '유○하님',
    meta: '노을이 · 일본',
    text: '일본 검역이 깐깐하다고 들어 솔직히 긴장을 많이 했는데, 원장님께서 서류를 완벽하게 해주신 덕분에 아무 문제 없이 통과할 수 있었습니다. 서류의 숫자 하나하나, 항목 하나하나를 세심하게 확인하는데, 정말 작은 빈틈도 없으니 일본 측에서도 친절하게 절차를 진행해 주더군요. 서류에 작은 실수라도 있었다면, 아마 여행은 시작도 못 하고 돌아왔을지도 모릅니다. 꼼꼼하게 챙겨주신 덕분에 좋은 추억을 만들 수 있었습니다. 진심으로 감사드립니다.',
  },
  {
    initial: '모',
    name: '최○지님',
    meta: '모짜·렐라 · 일본',
    text: '안녕하세요. 모짜와 렐라 보호자입니다. 이사하고 이것저것 준비할 게 많아서 인사가 늦었네요. 원장님 덕분에 애들 무사히 일본에 도착했습니다. 여러 가지로 신경 써주셔서 정말 정말 감사합니다!',
  },
  {
    initial: '꼬',
    name: '구○이님',
    meta: '꼬비 · 일본',
    text: '안녕하세요. 선생님 덕분에 강아지랑 같이 일본 잘 들어왔습니다. 다음에 한국에 갈 일 있으면 다시 잘 부탁드리겠습니다. 감사합니다!',
  },
]

// 태국 실제 후기(이름·반려동물명 익명화·각색 — 재식별 단서 없음, 동의 불필요). 올케어·안심케어 공통.
const THAILAND_REVIEWS: Review[] = [
  {
    initial: '망',
    name: '이○연님',
    meta: '망고 · 태국',
    text: '원장님 안녕하세요~ 망고 데리고 치앙마이 잘 도착해서 짐 풀고 이제야 카톡 드려요. ^^ 고양이라 비행기 안에서 예민하게 굴까 봐 걱정이 참 많았는데, 상담해 주신 대로 스트레스 줄이는 약을 처방받아 먹여서 그런지 기내에서 얌전히 잘 와주었어요. 태국 검역소에서도 챙겨주신 서류 그대로 내니까 쓱 훑어보고 바로 통과시켜 주더라고요. 원장님 덕분에 마음 편하게 왔어요. 정말 감사합니다!',
  },
  {
    initial: '보',
    name: '김○수님',
    meta: '보리 · 태국',
    text: '원장님 안녕하세요! 방콕으로 이주하면서 보리 입국 서류 때문에 막막했는데, 원장님 덕분에 무사히 잘 도착했습니다. 수입허가서 발급이랑 접종 스케줄 짜는 건 저 혼자선 도저히 엄두가 안났었는데, 덕분에 마음이 든든했습니다. 진심으로 감사드려요!',
  },
  {
    initial: '콩',
    name: '박○훈님',
    meta: '콩이 · 태국',
    text: '원장님, 급하게 결정이 되는 바람에 콩이 검역 준비가 빠듯했는데 바로 예약 잡아주시고 빠르게 진행해 주셔서 정말 감사했어요. 태국은 서류 하나만 잘못돼도 입국이 거절될 수 있다고 해서 긴장했는데, 챙겨주신 서류만 들고 가니 당황할 일 없이 수월하게 입국했습니다. 덕분에 콩이랑 잘 지내고 있어요. 진심으로 감사드려요!',
  },
]

// 필리핀 실제 후기(이름·반려동물명 익명화·각색 — 재식별 단서 없음, 동의 불필요). 올케어·안심케어 공통.
const PHILIPPINE_REVIEWS: Review[] = [
  {
    initial: '호',
    name: '정○우님',
    meta: '호두 · 필리핀',
    text: '원장님 안녕하세요, 호두 보호자입니다. 갑작스럽게 클락으로 발령이 나는 바람에 검역 준비 시간이 너무 촉박해서 눈앞이 깜깜했어요. 규정이 까다로워 아이를 두고 가야 하나 진지하게 고민했는데, 제 출국 날짜에 맞춰 접종이랑 서류 일정을 기가 막히게 짜주신 덕분에 잘 들어왔습니다. 마지막 서류 점검 때 “이대로만 내시면 아무 문제 없습니다” 하셨는데, 정말 그 말씀대로였어요. 꼼꼼히 챙겨주셔서 정말 감사합니다.',
  },
  {
    initial: '루',
    name: '최○진님',
    meta: '루나 · 필리핀',
    text: '원장님 안녕하세요~ 루나 데리고 세부에 입국해서 짐 정리하다가 이제야 인사 드려요. 루나가 워낙 예민한 고양이라 병원 갈 때부터 걱정이 많았는데, 검진 조심스럽게 잘 해주시고 안심시켜 주셔서 너무 감사했어요. 광견병이랑 예방접종 증명서를 깐깐하게 본다고 들었는데, 챙겨주신 서류 그대로 검역소에 내니까 질문 하나 없이 패스였어요! 감사해요!',
  },
  {
    initial: '초',
    name: '박○훈님',
    meta: '초코 · 필리핀',
    text: '원장님, 초코네 마닐라 무사히 도착했습니다! 수입허가서 받는 과정이 워낙 복잡하고 빠꾸도 잘 난다고 해서 걱정이 태산이었는데, 혼자 했으면 출국 전날까지 피 말렸을 것 같아요. 날짜 딱딱 맞춰 준비해 주신 덕분에 금방 통과했어요. 원장님 정말 감사합니다!',
  },
]

// ── 서비스 상세 factory (Phase 3 아키타입화) ─────────────────────────────────
// 구조(진행 단계·FAQ 골격·intro 골격·included 파생)는 factory 가 강제하고, 나라 사실
// (강조절·절차 항목·비용·기간·후기)만 주입한다. included 의 백신·검사 항목은 domain
// 프로파일(vaccines·rabiesTiterForReturnOnly·archetype)에서 파생 — 카드와 어긋나지 않는다.

/**
 * 오프라인 올케어 상세 factory.
 *  - included 파생: 칩·광견병(공통) + 종합백신(vaccines 'general') + 내부구충(vaccines 의
 *    전 종 'internal_parasite' — EU 촌충국의 개 전용 선언은 제외) + 항체검사(귀국용 국가는
 *    왕복만) + 나라 절차 항목 + 임상검사 + 서류 준비. EU 패밀리는 절차 항목이 임상검사 뒤
 *    (사전 통지·수입허가가 출국 직전 절차라서), 일본·동남아는 앞.
 *  - intro: 일본·동남아 '의료 절차는 물론 X, …' / EU 패밀리 '의료 절차와 (X, )…'.
 */
function offlineDetail(opts: {
  /** destination-config 키 — included 파생의 프로파일 출처. */
  destKey: string
  /** 귀국용 항체검사 국가(태국·필리핀)의 트립 — 왕복만 항체검사 포함. */
  trip?: TripType
  /** intro 강조절 (예: '태국 수입 허가 신청'). EU 패밀리는 생략 가능. */
  introHighlight?: string
  /** 나라 절차 항목 라벨 (예: ['사전 신고', '일본 수출 검역 신청 · 예약']). */
  procedureItems?: string[]
  /** 비용 범위(만원) — '50~60' 형태. 미정이면 생략 → '상담 후 안내'. */
  cost?: string
  /** 준비 기간 — '최소 6~7개월' / '2~4주' 형태('정도 걸려요' 앞부분 그대로). 미정이면 생략. */
  period?: string
  reviews?: Review[]
}): DestDetail {
  const o = DESTINATION_OVERRIDES[opts.destKey]
  const euFam = o?.archetype === 'eu-family'
  const titerIncluded = o?.rabiesTiterForReturnOnly ? opts.trip === 'round' : true
  const procedure = (opts.procedureItems ?? []).map((label) => ({ label }))

  const included: Prep[] = [{ label: '마이크로칩 삽입 · 동물등록' }, { label: '광견병 백신 접종' }]
  // 백신·검사 항목은 destination 프로파일에서 파생 — 여정과 단일 출처(빠지면 서비스 목록이
  // 여정과 어긋난다. 예: 튀르키예 external_parasite 누락 — 2026-07-23 수정). **전 종 선언
  // (string)만** 표기: EU 촌충국의 { key:'internal_parasite', species:'dog' } 같은 종 제한
  // 선언은 개 전용이라 '대신해 드려요'에 일반화하면 오해 → 제외. 순서는 여정 카드 순서.
  const hasVaccine = (k: string) => (o?.vaccines ?? []).some((v) => v === k)
  if (hasVaccine('general')) included.push({ label: '종합백신 접종' })
  if (hasVaccine('civ')) included.push({ label: '독감 접종' })
  if (hasVaccine('kennel')) included.push({ label: '켄넬코프 접종' })
  if (hasVaccine('covid')) included.push({ label: '코로나 접종' })
  if (hasVaccine('infectious_disease')) included.push({ label: '전염병 검사' })
  // 여정 카드 순서와 동일: 외부 기생충(order 80) → 내부 기생충(order 90).
  if (hasVaccine('external_parasite')) included.push({ label: '외부 기생충 치료' })
  if (hasVaccine('internal_parasite')) included.push({ label: '내부 기생충 치료' })
  if (hasVaccine('heartworm')) included.push({ label: '심장사상충 검사' })
  if (titerIncluded) included.push({ label: '광견병 항체 검사' })
  if (euFam) included.push({ label: '출국 전 임상검사' }, ...procedure)
  else included.push(...procedure, { label: '출국 전 임상검사' })
  included.push({ label: '서류 준비' })

  // 특수 절차(introHighlight)가 없는 나라도 있다 — 없으면 그 절만 빼고 문장을 만든다.
  // (없을 때 그대로 끼워 넣어 '의료 절차는 물론 undefined, 서류 준비까지'가 노출된 적 있음.)
  const mid = !opts.introHighlight
    ? '의료 절차와 서류 준비까지'
    : euFam
      ? `의료 절차와 ${opts.introHighlight}, 서류 준비까지`
      : `의료 절차는 물론 ${opts.introHighlight}, 서류 준비까지`
  return {
    intro: `로잔동물의료센터에서 검역 준비를 해 드려요. ${mid} 빈틈없이 진행해 드려요. 앱을 통해 쉽게 진행 상황, 정보를 확인할 수 있어요.`,
    included,
    steps: ['예약', '내원', '상담', '시작'],
    faq: [
      {
        q: '어디로 방문하나요?',
        a: '로잔동물의료센터로 방문해 주세요.',
        link: { label: '병원 위치 보기', href: 'https://naver.me/GUwSYQ9h' },
      },
      {
        q: '비용은 얼마인가요?',
        a: opts.cost
          ? `오프라인 올케어의 비용은 약 ${opts.cost}만원이에요. 정확한 비용은 상담 후 결정돼요.`
          : '오프라인 올케어의 비용은 여행지와 준비 상황에 따라 달라져요. 정확한 비용은 상담 후 안내해 드려요.',
      },
      {
        q: '준비 기간이 궁금해요',
        a: opts.period
          ? `접종 상황에 따라 ${opts.period} 정도 걸려요.`
          : '접종 상황에 따라 달라져요. 상담 시 여행지 기준으로 안내해 드려요.',
      },
    ],
    reviews: opts.reviews ?? [],
  }
}

/** 온라인 안심케어 상세 factory — 골격 공통, 나라 항목·비용·기간만 주입. */
function onlineDetail(opts: {
  /** intro 에 끼는 절 (예: '사전 신고, 일본 수출 검역 신청 및 예약'). 고유 절차가 없으면 생략. */
  introItems?: string
  /** included 가운데 항목들('단계별 가이드'와 '서류 점검' 사이). */
  items: string[]
  /** 고정 비용 표기 (예: '15만원 정도'). 생략 시 '서비스 내용에 따라 달라져요'. */
  cost?: string
  /** 준비 기간. 미정이면 생략 → '상담 시 안내'. */
  period?: string
  reviews?: Review[]
}): DestDetail {
  return {
    // 고유 절차가 없는 나라는 그 절만 빼고 문장을 만든다 ('단계별 가이드, , 서류 점검' 방지).
    intro: `안심하고 준비할 수 있도록 곁에서 도와드려요. ${
      opts.introItems ? `단계별 가이드, ${opts.introItems}, 서류 점검을` : '단계별 가이드와 서류 점검을'
    } 해 드려요. 준비 중 궁금한 것은 언제든 물어볼 수 있어요.`,
    included: [
      { label: '단계별 가이드' },
      ...opts.items.map((label) => ({ label })),
      { label: '서류 점검' },
    ],
    steps: ['상담', '신청', '결제', '시작'],
    faq: [
      { q: '어떻게 도움을 받나요?', a: '온라인 안심케어는 앱과 카카오톡을 이용한 비대면 서비스예요. 필요에 따라 전화 연결도 가능해요.' },
      {
        q: '비용은 얼마인가요?',
        a: opts.cost
          ? `온라인 안심케어 비용은 ${opts.cost}예요. 정확한 비용은 상담 후 결정돼요.`
          : '온라인 안심케어는 서비스 내용에 따라 비용이 달라져요. 정확한 비용은 상담 후 결정돼요.',
      },
      {
        q: '준비 기간이 궁금해요',
        a: opts.period
          ? `접종 상황에 따라 ${opts.period} 정도 걸려요.`
          : '접종 상황에 따라 달라져요. 상담 시 여행지 기준으로 안내해 드려요.',
      },
    ],
    reviews: opts.reviews ?? [],
  }
}

export const OFFLINE_DETAIL: Record<string, DestDetail> = {
  일본: offlineDetail({
    destKey: 'japan',
    introHighlight: '일본 검역소와의 소통',
    procedureItems: ['사전 신고', '일본 수출 검역 신청 · 예약'],
    cost: '50~60',
    period: '최소 6~7개월',
    reviews: JAPAN_REVIEWS,
  }),
  // 태국 편도(한국→태국) / 왕복(태국→한국 재입국) — 왕복은 귀국용 광견병 항체검사가
  // included 에 파생 추가돼 비용·기간이 늘어난다.
  '태국:one_way': offlineDetail({
    destKey: 'thailand',
    trip: 'one_way',
    introHighlight: '태국 수입 허가 신청',
    procedureItems: ['수입 허가 신청'],
    cost: '20~32',
    period: '2~4주',
    reviews: THAILAND_REVIEWS,
  }),
  '태국:round': offlineDetail({
    destKey: 'thailand',
    trip: 'round',
    introHighlight: '태국 수입 허가 신청',
    procedureItems: ['수입 허가 신청'],
    cost: '20~60',
    period: '최소 2~6주',
    reviews: THAILAND_REVIEWS,
  }),
  // 필리핀 — 내부 기생충 치료는 프로파일(전 종 internal_parasite)에서 파생 포함.
  '필리핀:one_way': offlineDetail({
    destKey: 'philippines',
    trip: 'one_way',
    introHighlight: '필리핀 수입 허가증(SPSIC) 신청',
    procedureItems: ['수입 허가증(SPSIC) 신청'],
    cost: '20~32',
    period: '최소 1~4주',
    reviews: PHILIPPINE_REVIEWS,
  }),
  '필리핀:round': offlineDetail({
    destKey: 'philippines',
    trip: 'round',
    introHighlight: '필리핀 수입 허가증(SPSIC) 신청',
    procedureItems: ['수입 허가증(SPSIC) 신청'],
    cost: '20~60',
    period: '최소 2~6주',
    reviews: PHILIPPINE_REVIEWS,
  }),
  // 유럽(EU 24개국) — EU Reg 576/2013 공통 절차라 한 벌로 공유(resolveDetail 가 'eu' 로 정규화).
  // 한국은 EU 비지정국이라 광견병 항체검사 필수. 일본과 달리 검역소 사전신고·수출검역 신청 절차는 없음.
  eu: offlineDetail({ destKey: 'eu', cost: '36~46', period: '최소 3~4개월' }),
  // 스위스 — EU 공통 + FSVO 수입허가 신청 추가. 그 절차로 비용 상한 +10만원(46→56만).
  스위스: offlineDetail({
    destKey: 'switzerland',
    introHighlight: '수입 허가 신청',
    procedureItems: ['수입 허가 신청'],
    cost: '36~56',
    period: '최소 3~4개월',
  }),
  default: {
    intro: '복잡한 검역 절차, 수의사가 처음부터 끝까지 직접 준비·관리해 드려요.',
    included: [
      { label: '검역·백신 일정 관리', sub: '놓치면 안 되는 날짜를 대신 챙겨요' },
      { label: '서류 발급 대행', sub: '건강증명서·검사 서류까지 발급해요' },
      { label: '수입 허가 신청', sub: '여행지 정부 허가 신청을 대신해요' },
    ],
    steps: ['상담', '준비·관리', '출국'],
    faq: DEFAULT_FAQ,
    reviews: [],
  },
}

// 사전 통지 국가(아일랜드·몰타·노르웨이·키프로스) — EU 공통(eu) + 입국국 사전 통지 추가.
// 그 절차로 오프라인 올케어 비용 상한 +5만원(46→51만). intro·included·비용만 다르고 나머지는 eu 와 동일.
const OFFLINE_ADVANCE_NOTICE: DestDetail = offlineDetail({
  destKey: 'eu',
  introHighlight: '사전 통지',
  procedureItems: ['사전 통지'],
  cost: '36~51',
  period: '최소 3~4개월',
})
// 사전 통지국 — 프로파일 advanceNotice 선언 파생(아일랜드·몰타·노르웨이·키프로스).
for (const k of ADVANCE_NOTICE_DESTINATIONS.map(destinationKoLabel)) OFFLINE_DETAIL[k] = OFFLINE_ADVANCE_NOTICE

export const ONLINE_DETAIL: Record<string, DestDetail> = {
  일본: onlineDetail({
    introItems: '사전 신고, 일본 수출 검역 신청 및 예약',
    items: ['사전 신고', '일본 수출 검역 신청 · 예약', '일본 검역소와의 소통'],
    period: '최소 6~7개월',
    reviews: JAPAN_REVIEWS,
  }),
  // 태국·필리핀 온라인 안심케어 — intro·단계·included 는 트립 무관 공통, 준비 기간만
  // 트립별로 다름(왕복은 귀국용 광견병 항체검사로 길어짐).
  '태국:one_way': onlineDetail({
    introItems: '수입 허가 신청',
    items: ['수입 허가 신청'],
    cost: '15만원 정도',
    period: '최소 2~4주',
    reviews: THAILAND_REVIEWS,
  }),
  '태국:round': onlineDetail({
    introItems: '수입 허가 신청',
    items: ['수입 허가 신청'],
    cost: '15만원 정도',
    period: '최소 2~6주',
    reviews: THAILAND_REVIEWS,
  }),
  '필리핀:one_way': onlineDetail({
    introItems: '수입 허가 신청',
    items: ['수입 허가 신청'],
    cost: '15만원 정도',
    period: '최소 1~4주',
    reviews: PHILIPPINE_REVIEWS,
  }),
  '필리핀:round': onlineDetail({
    introItems: '수입 허가 신청',
    items: ['수입 허가 신청'],
    cost: '15만원 정도',
    period: '최소 1~6주',
    reviews: PHILIPPINE_REVIEWS,
  }),
  // 유럽(EU 24개국) — EU Reg 576/2013 공통, resolveDetail 가 'eu' 로 정규화.
  eu: onlineDetail({
    introItems: 'EU 동물건강증명서(Annex III) 준비',
    items: ['EU 동물건강증명서(Annex III) 준비'],
    period: '최소 3~4개월',
  }),
  // 스위스 — EU 공통 + FSVO 수입허가 신청 추가. (온라인 비용은 고정값 없어 상향 없음.)
  스위스: onlineDetail({
    introItems: 'EU 동물건강증명서(Annex III) 준비, 수입 허가 신청',
    items: ['EU 동물건강증명서(Annex III) 준비', '수입 허가 신청'],
    period: '최소 3~4개월',
  }),
  default: {
    intro: '직접 준비하시되 혼자 헤매지 않게, 실패 없는 안전한 준비를 곁에서 도와드려요.',
    included: [
      { label: '단계별 준비 가이드', sub: '지금 뭘 해야 하는지 순서대로 알려드려요' },
      { label: '서류 검토·점검', sub: '빠진 서류·오류를 미리 잡아드려요' },
      { label: '수입 허가 신청 대행', sub: '까다로운 허가 신청은 대신해 드려요' },
    ],
    steps: ['상담', '직접 준비 + 점검', '출국'],
    faq: DEFAULT_FAQ,
    reviews: [],
  },
}

// 사전 통지 국가(아일랜드·몰타·노르웨이·키프로스) 온라인 — EU 공통(eu) + 사전 통지 추가.
// (온라인 비용은 고정값 없어 상향 없음 — 스위스 온라인과 동일.)
const ONLINE_ADVANCE_NOTICE: DestDetail = onlineDetail({
  introItems: 'EU 동물건강증명서(Annex III) 준비, 사전 통지',
  items: ['EU 동물건강증명서(Annex III) 준비', '사전 통지'],
  period: '최소 3~4개월',
})
for (const k of ADVANCE_NOTICE_DESTINATIONS.map(destinationKoLabel)) ONLINE_DETAIL[k] = ONLINE_ADVANCE_NOTICE

/** 히어로 3장 — 로잔 공통 강점(전문성·경험·앱 편의). 올케어·안심케어 둘 다 사용. */
const HIGHLIGHTS: Highlight[] = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="9.5" cy="7" r="3.3" />
        <path d="M3.5 20.5v-1a6 6 0 0 1 8-5.65" />
        <path d="M16.8 20.8s-2.3-1.4-2.3-3.1a1.35 1.35 0 0 1 2.3-.95 1.35 1.35 0 0 1 2.3.95c0 1.7-2.3 3.1-2.3 3.1z" />
      </svg>
    ),
    label: '전문 의료진',
  },
  {
    icon: <span style={{ ...serif, fontSize: 12.5, fontWeight: 500, letterSpacing: '-0.02em' }}>20y</span>,
    label: '풍부한 경험',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
        <path d="M9.3 11l1.9 1.9 3.5-3.6" />
      </svg>
    ),
    label: '앱 연동',
  },
]

/**
 * 상세 본문(DestDetail) 선택 — `목적지:왕복편도` → `목적지`(트립 공통) → `default` 순.
 * 같은 목적지라도 왕복/편도는 절차가 달라(예: 한국 재입국 시 광견병 항체검사) 트립별로 나눈다.
 * 트립 구분이 없는 목적지(일본 등)는 `목적지` 키 하나로 두 트립 모두 커버한다.
 * EU 회원국 24개국은 개별 국가명 대신 'eu' 묶음 키 한 벌로 정규화해 공유한다.
 */
/**
 * 목적지별 비용·기간 — **사업 판단 값이라 코드가 만들 수 없는 유일한 부분**.
 *
 * 나머지(포함 항목·소개문·절차)는 전부 프로파일에서 파생되므로, 새 여행지를 추가할 때
 * 여기에 두 값만 채우면 맡기기 상세가 완성된다. 안 채우면 FAQ 가 '상담 후 안내'로 답한다
 * — 가상의 숫자를 지어내지 않는다. (명시 항목이 있는 나라는 각 블록의 cost·period 가 우선.)
 *
 * period 는 '정도 걸려요' 앞에 그대로 들어간다. 출처 = 펫무브 웹사이트 여행지 가이드
 * (`apps/www/content/docs/<나라>-pet-travel-guide.json`)의 "…입국 준비는 최소 N~M개월
 * 걸립니다" 문장. 웹에 그 문장이 없는 나라는 비워 둔다 — 추정해서 채우지 않는다.
 */
const DEST_PRICING: Record<string, { offlineCost?: string; period?: string }> = {
  // 중국 — 광견병 2회(30일 간격 권고) + 항체검사. 항체검사 후 대기 기간이 없어 EU(3개월 대기)보다 짧다.
  china: { offlineCost: '36~52', period: '1~2개월' },

  // ── 아시아 ────────────────────────────────────────────────
  taiwan: { offlineCost: '40~51', period: '최소 4~5개월' },
  hongkong: { offlineCost: '21~27' }, // 웹 가이드에 '최소 N개월' 문장 없음 (권장 시작 시점만 기술)
  singapore: { offlineCost: '76~92' }, // 웹 가이드에 기간 문장 없음
  malaysia: { offlineCost: '14~54', period: '최소 2~3개월' },
  indonesia: { offlineCost: '40~51', period: '최소 2~3개월' },
  // 기간은 www 가이드 문장 그대로 — '편도 이동의 경우 최소 한달, 왕복인 경우 최소 1달 반~2달'.
  vietnam: { offlineCost: '36~46', period: '최소 1~2개월' },
  // 가이드가 2026-07-20 갱신되며 기간 문장이 생겼다 — '편도 이동의 경우 최소 한달,
  // 왕복인 경우 최소 1달 반~2달'. 베트남과 같은 표기로 맞춘다.
  cambodia: { offlineCost: '36~46', period: '최소 1~2개월' },
  // 가이드가 2026-07-20 갱신되며 기간 문장이 생겼다 — '편도 이동의 경우 최소 한달,
  // 왕복인 경우 최소 1달 반~2달'. 베트남·캄보디아와 같은 표기로 맞춘다.
  mongolia: { offlineCost: '36~46', period: '최소 1~2개월' },
  india: { offlineCost: '24~58', period: '최소 1~2개월' },
  uzbekistan: { offlineCost: '36~46', period: '최소 1~2개월' },

  // ── 유럽·중동·아프리카 ────────────────────────────────────
  ukraine: { offlineCost: '36~46', period: '최소 3~4개월' },
  // 종합백신까지 필요해 다른 4국(36~46)보다 상단이 높다(사용자 지정 2026-07-22: 36~49).
  kazakhstan: { offlineCost: '36~49', period: '최소 1~2개월' },
  russia: { offlineCost: '15~49', period: '최소 1~2개월' },
  israel: { offlineCost: '45~56', period: '최소 1~2개월' },
  uae: { offlineCost: '10~27', period: '최소 1~2개월' },
  turkey: { offlineCost: '36~49', period: '최소 1~2개월' },
  morocco: { offlineCost: '36~46', period: '최소 1~2개월' },
  south_africa: { offlineCost: '95~107' }, // 웹 가이드 문서 자체가 없음

  // ── 아메리카 ──────────────────────────────────────────────
  usa: { offlineCost: '10~51' }, // 웹 가이드에 기간 문장 없음
  hawaii: { offlineCost: '36~63' }, // 〃 ('추가 1~2개월' 언급만 있어 기본 기간 도출 불가)
  guam: { offlineCost: '45~64', period: '최소 5~6개월' },
  // 가이드가 2026-07-20 갱신되며 기간 문장이 생겼다 — '편도 이동인 경우 최소 한달,
  // 왕복인 경우 1달 반~2달'.
  canada: { offlineCost: '36~46', period: '최소 1~2개월' },
  mexico: { offlineCost: '36~46', period: '최소 1~2개월' },
  brazil: { offlineCost: '36~46', period: '최소 1~2개월' },
  argentina: { offlineCost: '36~46', period: '최소 1~2개월' },

  // ── 오세아니아 ────────────────────────────────────────────
  // 광견병 항체검사 후 180일 대기가 필수라 준비가 가장 길다.
  australia: { offlineCost: '107~142', period: '최소 7~8개월' },
  new_zealand: { offlineCost: '126~149', period: '최소 6개월' },
}

/**
 * 목적지 한글명 → destination-config 프로파일 키. 프로파일이 곧 뼈대의 출처라, 서비스 상세도
 * 이 키를 통해 백신 구성·항체검사 여부를 그대로 물려받는다.
 */
function profileKeyForDest(dest: string): string | null {
  return Object.keys(DESTINATION_OVERRIDES).find((k) => matchesDestinationKey(dest, k)) ?? null
}

/**
 * 명시적 항목이 없는 목적지의 기본 상세 — **프로파일에서 파생**한다.
 *
 * 예전엔 손으로 쓴 고정 문구(`default`)로 떨어졌다. 그 문구가 '수입허가증 신청'을 포함해,
 * 수입허가증이 없는 나라(중국 등)에도 사실과 다른 안내가 조용히 표시됐다. 게다가 여정·서류·
 * 검증은 프로파일에서 자동 파생되는데 맡기기만 빠져 있어, 새 목적지를 추가할 때마다 아무
 * 경고 없이 같은 문제가 재발하는 구조였다.
 *
 * 이제 공장(offlineDetail·onlineDetail)을 그대로 태워 그 나라 프로파일대로 만든다. 비용·기간은
 * 사업 판단이라 코드가 만들 수 없어 생략 → FAQ 가 '상담 후 안내'로 답한다(가상 숫자 금지).
 * 나라 특수 절차(수입허가·사전 통지·수출 검역)는 종전대로 명시 항목으로 얹는다.
 */
function derivedDetail(kind: 'offline' | 'online', dest: string, trip: TripType): DestDetail | null {
  const destKey = profileKeyForDest(dest)
  if (!destKey) return null
  const { offlineCost, period } = DEST_PRICING[destKey] ?? {}
  // 나라 고유 절차 — 프로파일에서만 파생한다(지어내지 않는다). 현재 파생 가능한 선언은
  // importPermit(수입허가국: 대만 등) 하나 — 스위스 '수입 허가 신청'과 같은 기존 표현을 쓴다.
  // 표기 통일: 신청 대상은 '허가'라 **'수입 허가 신청'**(신청 결과물이 '허가증'). 2026-07-23.
  // 로잔이 대행하지 못하는 허가는 맡기기 상품에서 뺀다 — 두 경우:
  //   · selfApply — 보호자·수입자가 목적국 시스템에 직접 온라인 신청(대만 APHIA e-permit / 호주·뉴질랜드)
  //   · localApplyOnly — 현지 등록 수입자·에이전시만 현지 신청(인도네시아 Barantin·농업부 / 말레이시아 MAQIS)
  // 여정 카드·서류 탭에는 그대로 뜬다. 여기서 빼는 건 **맡기기 상품에 포함되는 항목**뿐.
  const permit = DESTINATION_OVERRIDES[destKey]?.importPermit
  const hasPermit = !!permit && !permit.selfApply && !permit.localApplyOnly
  const permitItems = hasPermit ? ['수입 허가 신청'] : []
  if (kind === 'offline') {
    return offlineDetail({
      destKey,
      trip,
      cost: offlineCost,
      period,
      introHighlight: hasPermit ? '수입 허가 신청' : undefined,
      procedureItems: permitItems,
    })
  }
  // 온라인 항목(items)은 **그 나라 고유 절차**만 적는다 — 일본 '사전 신고·수출 검역 신청',
  // EU '동물건강증명서(Annex III) 준비', 스위스 '수입 허가 신청'처럼. 고유 절차가 없는
  // 나라는 비운다(공장이 '단계별 가이드'·'서류 점검'을 앞뒤로 붙인다). 빈칸을 메우려고
  // '검역 일정 관리' 같은 일반 항목을 지어내지 않는다 — 기존 목적지에 없는 표현이다.
  return onlineDetail({
    introItems: permitItems.length ? permitItems.join(', ') : undefined,
    items: permitItems,
    period,
  })
}

function resolveDetail(map: Record<string, DestDetail>, dest: string, trip: TripType): DestDetail {
  // 우선순위: 국가·트립 전용 → 국가 전용 → EU 패밀리 공통('eu') → default.
  // EU 패밀리(EU Reg 576/2013 공통 절차)는 'eu' 한 벌을 공유하되, 자체 블록이 있는 나라
  // (예: 스위스=수입허가 추가·비용 상향)는 그 블록을 우선한다. eu 묶음(프랑스·독일 등)은
  // matchesDestinationKey 로, 개별 카드국(영국·핀란드·아일랜드·몰타·노르웨이·스위스·키프로스)은
  // 별도 목록으로 'eu' 정규화 — 개별국이 default(일반 문구)로 새던 것 수정(2026-07-17).
  const isEuFamily = matchesDestinationKey(dest, 'eu') || APP_EU_INDIVIDUAL_DESTINATIONS_KO.includes(dest)
  return (
    map[`${dest}:${trip}`] ??
    map[dest] ??
    (isEuFamily ? map[`eu:${trip}`] ?? map.eu : undefined) ??
    // 명시 항목이 없으면 프로파일에서 파생 — 새 목적지가 '수입허가증 신청' 같은 틀린
    // 일반 문구로 새는 것을 막는다. 프로파일조차 없을 때만 최후 default.
    derivedDetail(map === ONLINE_DETAIL ? 'online' : 'offline', dest, trip) ??
    map.default
  )
}

/** 카드 본체는 공통, 상세 본문(DestDetail)만 목적지·왕복편도별. 미정 조합은 default 폴백. */
function buildOffers(dest: string | null, trip: TripType): Offer[] {
  const d = dest ?? ''
  return [
    {
      accent: AMBER,
      icon: clinicIcon,
      title: '오프라인 올케어',
      slug: 'offline',
      tag: '병원 방문 · 전체 의뢰',
      desc: '수의사가 모든 절차를 준비·관리해 드려요.',
      forWhom: [
        '검역이 처음이라 막막해요',
        '바빠서 직접 챙기기 어려워요',
        '전문가에게 맡기고 안심하고 싶어요',
      ],
      recommended: true,
      highlights: HIGHLIGHTS,
      ...resolveDetail(OFFLINE_DETAIL, d, trip),
    },
    {
      accent: SAGE,
      icon: devicesIcon,
      title: '온라인 안심케어',
      slug: 'online',
      tag: '셀프 준비 · 부분 의뢰',
      desc: '안심하고 준비할 수 있도록 곁에서 도와드려요.',
      forWhom: [
        '직접 해본 경험이 있어요',
        '멀어서 방문이 힘들어요',
        '어려운 부분만 도움받고 싶어요',
      ],
      highlights: HIGHLIGHTS,
      ...resolveDetail(ONLINE_DETAIL, d, trip),
    },
  ]
}

/**
 * 한 케이스(동물)의 여정 목적지 중 서비스 제공 목록에 있는 것 — 활성 목적지(activeDest) 우선.
 * 다중 목적지 케이스면 보던 목적지(?dest=)를 맨 앞에 두고, 없거나 미제공이면 그 다음 제공 목적지.
 */
function offeredDestForCase(c: CaseRow, activeDest: string | null): string | null {
  const toks = (c.destination ?? '').split(',').map((t) => t.trim()).filter(Boolean)
  const ordered =
    activeDest && toks.includes(activeDest)
      ? [activeDest, ...toks.filter((t) => t !== activeDest)]
      : toks
  return ordered.find((t) => OFFERED_KO.includes(t)) ?? null
}

/** 내 케이스들의 목적지 union — 등록 순서 보존, 중복 제거. */
function destinationsFromCases(cases: CaseRow[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of cases) {
    for (const tok of (c.destination ?? '').split(',').map((t) => t.trim()).filter(Boolean)) {
      if (!seen.has(tok)) {
        seen.add(tok)
        out.push(tok)
      }
    }
  }
  return out
}

/** 등록값에서 그 목적지의 왕복/편도를 읽는다 — 없으면 'round'. data.trip_type 객체 + 레거시 문자열 대응. */
function tripTypeForDest(cases: CaseRow[], dest: string | null): TripType {
  if (!dest) return 'round'
  for (const c of cases) {
    const data = (c.data ?? {}) as Record<string, unknown>
    const tt = data.trip_type
    if (tt && typeof tt === 'object' && !Array.isArray(tt)) {
      const v = (tt as Record<string, unknown>)[dest]
      if (v === 'round' || v === 'one_way') return v
    } else if (typeof tt === 'string') {
      const toks = (c.destination ?? '').split(',').map((t) => t.trim())
      if (toks.includes(dest) && (tt === 'round' || tt === 'one_way')) return tt
    }
  }
  return 'round'
}

function ServiceCard({ offer, onOpen }: { offer: Offer; onOpen: () => void }) {
  const { accent } = offer
  return (
    <div
      role="button"
      tabIndex={0}
      data-swipe-allow="true"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      style={{
        position: 'relative',
        borderRadius: 18,
        background: C.surface,
        border: offer.recommended ? `1.5px solid ${accent.stroke}` : `.5px solid ${C.line}`,
        padding: 18,
        cursor: 'pointer',
      }}
    >
      {offer.recommended && (
        <span
          style={{
            position: 'absolute',
            top: -9,
            left: 16,
            fontSize: 11,
            fontWeight: 500,
            padding: '2px 9px',
            borderRadius: 999,
            background: accent.stroke,
            color: '#fff',
          }}
        >
          추천
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 13,
            flexShrink: 0,
            background: accent.chipBg,
            color: accent.stroke,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {offer.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...serif, fontSize: 18, color: C.ink, lineHeight: 1.2 }}>{offer.title}</div>
          <span
            style={{
              display: 'inline-block',
              marginTop: 6,
              fontSize: 11,
              padding: '2px 9px',
              borderRadius: 999,
              background: accent.chipBg,
              color: accent.stroke,
              fontWeight: 500,
            }}
          >
            {offer.tag}
          </span>
        </div>
      </div>

      <p style={{ fontSize: 13, color: C.ink2, lineHeight: 1.6, margin: '14px 0 0' }}>{offer.desc}</p>

      <div style={{ marginTop: 14 }}>
        {/* 그룹 라벨 — 표준 monoCap(12/600/ink3)으로 정렬 (2026-07-12). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: C.ink3, fontWeight: 600 }}>
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
            aria-hidden
          >
            <circle cx="12" cy="8" r="3.2" />
            <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
          </svg>
          이럴 때 추천해요
        </div>
        {offer.forWhom.map((who) => (
          <div
            key={who}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 7, fontSize: 12.5, color: C.ink2, lineHeight: 1.5 }}
          >
            <span style={{ flexShrink: 0, marginTop: 6, width: 4, height: 4, borderRadius: '50%', background: accent.stroke }} />
            {who}
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 3,
          marginTop: 14,
          paddingTop: 12,
          borderTop: `.5px solid ${C.line}`,
          fontSize: 13,
          fontWeight: 500,
          color: accent.stroke,
        }}
      >
        자세히 보기
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 6l6 6-6 6" />
        </svg>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────
 * 서비스 상세 — 소개·진행 병원·체크리스트·진행 단계·후기·FAQ·CTA.
 * 본문(intro·included·steps·faq·reviews)은 목적지별 DestDetail 에서 온다(buildOffers).
 * 통계(누적·만족도) 박스는 검증 가능한 실값이 없어 제거 — 신뢰는 진행 병원 + 실제 후기로.
 * ──────────────────────────────────────────────────────────────────────── */

const starIcon = (size: number, fill: string) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden>
    <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.9 6.2 20.95l1.1-6.45-4.7-4.6 6.5-.95z" />
  </svg>
)

function ServiceDetail({ offer, onBack, onInquire }: { offer: Offer; onBack: () => void; onInquire: () => void }) {
  const { accent } = offer
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div style={{ padding: '0 24px' }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'transparent',
          border: 'none',
          padding: '2px 0 0',
          margin: 0,
          cursor: 'pointer',
          fontFamily: 'inherit',
          color: C.ink,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 6l-6 6 6 6" />
        </svg>
        <span style={{ ...serif, fontSize: 18, color: C.ink }}>{offer.title}</span>
      </button>

      <div style={{ marginTop: 16 }}>
        <span
          style={{
            display: 'inline-block',
            fontSize: 11,
            padding: '2px 9px',
            borderRadius: 999,
            background: accent.chipBg,
            color: accent.stroke,
            fontWeight: 500,
          }}
        >
          {offer.tag}
        </span>
        <p style={{ fontSize: 14.5, lineHeight: 1.7, color: C.ink2, margin: '12px 0 0' }}>{offer.intro}</p>
      </div>

      {offer.highlights && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 16 }}>
          {offer.highlights.map((h) => (
            <div
              key={h.label}
              style={{
                background: C.surface,
                border: `.5px solid ${C.line}`,
                borderRadius: 12,
                padding: '13px 8px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  margin: '0 auto',
                  borderRadius: 10,
                  background: accent.chipBg,
                  color: accent.stroke,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {h.icon}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.ink, marginTop: 8, lineHeight: 1.3 }}>{h.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 화면 구획 제목 = sectionTitle(17/600 잉크) — 준비 '준비 단계'와 같은 위계. */}
      <h2 style={{ ...sectionTitle, margin: '26px 0 12px' }}>이런 걸 대신해 드려요</h2>
      <div style={{ background: C.surface, border: `.5px solid ${C.line}`, borderRadius: 16, padding: '4px 16px' }}>
        {offer.included.map((item, i) => (
          <div
            key={item.label}
            style={{
              display: 'flex',
              gap: 11,
              padding: '12px 0',
              borderBottom: i < offer.included.length - 1 ? `.5px solid ${C.line}` : 'none',
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke={accent.stroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0, marginTop: 1 }}
              aria-hidden
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: C.ink }}>{item.label}</div>
              {item.sub && <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 2 }}>{item.sub}</div>}
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ ...sectionTitle, margin: '28px 0 12px' }}>이렇게 진행돼요</h2>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {offer.steps.map((s, i) => (
          <Fragment key={s}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: accent.chipBg,
                  color: accent.stroke,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                {i + 1}
              </div>
              <div style={{ fontSize: 11.5, color: C.ink2, marginTop: 5 }}>{s}</div>
            </div>
            {i < offer.steps.length - 1 && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke={C.ink3}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginTop: 8, flexShrink: 0 }}
                aria-hidden
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            )}
          </Fragment>
        ))}
      </div>

      <h2 style={{ ...sectionTitle, margin: '26px 0 6px' }}>자주 묻는 질문</h2>
      <div>
        {offer.faq.map((f, i) => {
          const open = openFaq === i
          return (
            <div key={f.q} style={{ borderBottom: `.5px solid ${C.line}` }}>
              <button
                type="button"
                onClick={() => setOpenFaq(open ? null : i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  width: '100%',
                  padding: '13px 2px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  color: C.ink,
                  fontSize: 13.5,
                }}
              >
                {f.q}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={C.ink3}
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {open && (
                <div style={{ margin: '0 2px 13px' }}>
                  <p style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.6, margin: 0 }}>{f.a}</p>
                  {f.link && (
                    <a
                      href={f.link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 7, fontSize: 12.5, fontWeight: 500, color: accent.stroke, textDecoration: 'none' }}
                    >
                      {f.link.label}
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M7 17L17 7" />
                        <path d="M8 7h9v9" />
                      </svg>
                    </a>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {offer.reviews.length > 0 && (
        <>
          <h2 style={{ ...sectionTitle, margin: '26px 0 10px' }}>먼저 경험한 분들</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {offer.reviews.map((r) => (
              <div key={r.name} style={{ background: C.surface, border: `.5px solid ${C.line}`, borderRadius: 14, padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: accent.chipBg,
                      color: accent.stroke,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 500,
                      flexShrink: 0,
                    }}
                  >
                    {r.initial}
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: C.ink }}>{r.name}</span>
                  {r.meta && <span style={{ fontSize: 11, color: C.ink3 }}>· {r.meta}</span>}
                  <span style={{ display: 'inline-flex', gap: 1, marginLeft: 'auto' }}>
                    {[0, 1, 2, 3, 4].map((n) => (
                      <Fragment key={n}>{starIcon(11, accent.stroke)}</Fragment>
                    ))}
                  </span>
                </div>
                <p style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.6, margin: 0 }}>{r.text}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onInquire}
        style={{
          width: '100%',
          marginTop: 22,
          padding: '15px 0',
          borderRadius: 14,
          border: 'none',
          background: accent.stroke,
          color: '#fff',
          fontFamily: 'inherit',
          fontSize: 15,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden>
          <path d="M12 3.5C6.8 3.5 2.5 6.9 2.5 11c0 2.6 1.8 4.9 4.5 6.3-.2.7-.7 2.5-.8 2.9-.1.4.2.55.45.42.3-.16 2.6-1.78 3.55-2.42.55.08 1.12.12 1.7.12 5.2 0 9.5-3.4 9.5-7.6S17.2 3.5 12 3.5z" />
        </svg>
        카카오톡으로 상담하기
      </button>
    </div>
  )
}

export function ServicesView({
  caseId = null,
  dest = null,
}: {
  /** 지금 보고 있는 동물·목적지 — TabHost 가 준비·서류 pane 과 동일하게 내려준다. */
  caseId?: string | null
  dest?: string | null
}) {
  const { cases, profile, userEmail } = useCases()

  const selectedCase = caseId ? cases.find((c) => c.id === caseId) ?? null : null

  // 기본 목적지 = 선택된 동물의 여정 목적지(제공 목록에 있으면). 없으면 전체 union 첫 제공, 최후 일본.
  const registered = destinationsFromCases(cases)
  const defaultDestKo =
    (selectedCase ? offeredDestForCase(selectedCase, dest) : null) ??
    registered.find((d) => OFFERED_KO.includes(d)) ??
    OFFERED_KO[0]
  // 사용자가 시트에서 직접 고른 목적지. 보고 있는 동물·목적지가 바뀌면 그 선택은 무효 —
  // 안 지우면 새 동물 화면에 이전 동물 기준으로 고른 나라가 그대로 남는다.
  const [pickedKo, setPickedKo] = useState<string | null>(null)
  useEffect(() => {
    setPickedKo(null)
  }, [caseId, dest])
  const selectedKo = pickedKo && OFFERED_KO.includes(pickedKo) ? pickedKo : defaultDestKo
  const selected = OFFERED.find((d) => d.ko === selectedKo) ?? { ko: selectedKo, en: '' }

  // 왕복/편도 = 등록값 기본 + 로컬 전환(둘러보기용, 저장 X). 목적지 바뀌면 그 목적지 등록값으로.
  // 선택된 동물을 맨 앞에 두고 읽어, 같은 목적지를 가진 다른 동물의 값에 가려지지 않게 한다.
  const tripCases = selectedCase ? [selectedCase, ...cases.filter((c) => c.id !== selectedCase.id)] : cases
  const defaultTrip = tripTypeForDest(tripCases, selectedKo)
  const [tripOverride, setTripOverride] = useState<{ dest: string; trip: TripType } | null>(null)
  const trip = tripOverride && tripOverride.dest === selectedKo ? tripOverride.trip : defaultTrip

  // 검색 시트
  const [sheetOpen, setSheetOpen] = useState(false)
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return OFFERED_SORTED
    return OFFERED_SORTED.filter((d) => d.ko.includes(q) || d.en.toLowerCase().includes(q))
  }, [query])

  // 문의 — 로그인 상태라 이름·이메일을 이미 앎(폼 X). 카톡 열기 직전 운영자에게 봇 알림.
  const guardian = buildProfileView({
    userEmail,
    customerProfile: profile,
    primaryCase: cases[0] ?? null,
  }).guardian
  // 상세(카드 탭)는 주소에 반영한다(?service=offline). 상태로만 들고 있으면 같은 /services 라
  // '서비스' 탭·뒤로가기가 목록으로 안 돌아온다(탭이 안 먹힘). slug 로 매칭.
  const router = useRouter()
  const openSlug = useSearchParams().get('service')

  // 등록한 반려동물이 0마리면 일반 안내 대신 '시작하기' 한 길만 — 목적지·동물이 있어야
  // 맞춤 서비스를 보여줄 수 있으므로. 동물을 등록하면 아래 일반 화면으로 돌아간다.
  if (cases.length === 0) {
    return (
      <StartHereEmpty
        title="반려동물을 먼저 등록해주세요"
        subtitle="등록하면 여행지에 맞는 서비스를 안내해 드려요"
      />
    )
  }

  function startInquiry() {
    void notifyServiceInquiry({ name: guardian.name, destination: selectedKo, tripType: trip })
    window.open(KAKAO_CHAT_URL, '_blank', 'noopener,noreferrer')
  }

  const offers = buildOffers(selectedKo, trip)
  const openOffer = openSlug ? offers.find((o) => o.slug === openSlug) ?? null : null

  return (
    <div
      className="pm-fade-up pm-noscroll"
      style={{
        background: C.bg,
        color: C.ink,
        minHeight: '100%',
        paddingTop: PAGE_TOP,
        paddingBottom: 80,
        overflow: 'auto',
      }}
    >
      {openOffer ? (
        <ServiceDetail
          offer={openOffer}
          onBack={() => router.push('/services')}
          onInquire={startInquiry}
        />
      ) : (
        <div style={{ padding: '0 24px' }}>
          {/* 제목은 하단 탭 라벨과 일치시킨다 — '맡기기'로 눌러 들어왔는데 '서비스'가 뜨면
              같은 화면인지 헷갈린다. 탭 라벨(bottom-nav TABS)이 이름의 단일 출처. */}
          <h1 style={pageTitle}>맡기기</h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setSheetOpen(true)
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 11px',
                borderRadius: 999,
                border: `0.5px solid ${C.line}`,
                background: C.surface,
                fontFamily: 'inherit',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
                color: C.ink,
              }}
            >
              {selected.ko}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.ink3} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: 2, borderRadius: 999, border: `0.5px solid ${C.line}`, background: C.surface }}>
              {TRIP_OPTIONS.map((o) => {
                const on = trip === o.value
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setTripOverride({ dest: selectedKo, trip: o.value === 'one_way' ? 'one_way' : 'round' })}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 999,
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 12.5,
                      fontWeight: 500,
                      background: on ? C.soft : 'transparent',
                      color: on ? C.accent : C.ink3,
                    }}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {offers.map((o) => (
              <ServiceCard key={o.title} offer={o} onOpen={() => router.push(`/services?service=${o.slug}`)} />
            ))}
          </div>
        </div>
      )}

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="여행지 선택">
        <input
          className="pm-field-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="국가 검색"
          style={{
            width: '100%',
            padding: '12px 14px',
            margin: '4px 0 10px',
            border: `1px solid ${C.line}`,
            borderRadius: 12,
            background: 'transparent',
            fontFamily: 'inherit',
            fontSize: 15,
            color: C.ink,
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 4 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px 0', fontSize: 13, color: C.ink3, textAlign: 'center' }}>
              일치하는 여행지가 없습니다.
            </div>
          ) : (
            filtered.map((d) => {
              const isSel = d.ko === selectedKo
              return (
                <button
                  key={d.ko}
                  type="button"
                  onClick={() => {
                    setPickedKo(d.ko)
                    setSheetOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 12px',
                    margin: '1px 0',
                    borderRadius: 12,
                    background: isSel ? C.soft : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: isSel ? 600 : 400, color: isSel ? C.accent : C.ink }}>
                    {d.ko}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 13, color: C.ink3 }}>{d.en}</span>
                    {isSel && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </BottomSheet>
    </div>
  )
}
