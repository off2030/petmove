'use client'

import { C as PM } from '@/lib/palette'
import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { readJourneyFeedback } from '@petmove/domain'
import { CaseHeader } from '@/components/cases/case-header'
import { FACES, FaceIcon } from '@/components/feedback/feedback-view'
import { BottomSheet } from '@/components/fields/bottom-sheet'
import { useCases } from '@/components/portal-shell/case-data-provider'
import { monoCap, num, serif } from '@/components/me/settings-shared'
import { CloudIcon, StormCloudIcon } from '@/components/ui/weather-icons'
import { PAGE_TOP, groupLabel, sectionTitle } from '@/lib/tokens'
import { HERO_BLUR_PLACEHOLDERS } from '@/lib/hero-blur-placeholders'
import type { JourneyData, JourneyStage } from '@/lib/journey/scenario'

/** 목적지별 히어로 사진 후보 — public/destinations 에 번들. 각 목적지 배열의 첫 장은
    리드 사진으로 고정하고, 나머지 후보는 매 로드마다 무작위 순서로 보여준다.
    후보가 2장 이상이면 사진을 탭해서도 다음 후보로 넘겨볼 수 있다.
    없는 목적지는 null — 히어로 카드가 사진 밴드 없이 메타 행으로 대체한다.
    2026-07-16 앱 화이트리스트 27개국(아시아 3 + EU 24) 전부 사진 보유 — 새 목적지 열 때만 추가하면 된다. */
const DEST_PHOTO_CANDIDATES: Record<string, string[]> = {
  일본: [
    '/destinations/japan-sakura-blossom-macro.webp',
    '/destinations/japan-torii-tunnel.webp',
    '/destinations/japan-bamboo-forest.webp',
    '/destinations/japan-fuji-pagoda-snow.webp',
    '/destinations/japan-fuji-umbrella-field.webp',
  ],
  태국: [
    '/destinations/thailand-aerial-beach-waves.webp',
    '/destinations/thailand-cliff-cove-aerial.webp',
    '/destinations/thailand-elephant-jungle-road.webp',
    '/destinations/thailand-cliff-coast-road.webp',
    '/destinations/thailand-cove-swimmers.webp',
  ],
  필리핀: [
    '/destinations/philippines-beach-two-boats.webp',
    '/destinations/philippines-palm-beach-turquoise.webp',
    '/destinations/philippines-elnido-lagoon.webp',
    '/destinations/philippines-kayak-turquoise.webp',
    '/destinations/philippines-elnido-white-beach.webp',
    '/destinations/philippines-moored-boats-beach.webp',
    '/destinations/philippines-bangka-wake-reef.webp',
    '/destinations/philippines-palm-resort-cove.webp',
  ],
  베트남: [
    // 첫 장 = 논 패치워크 항공뷰(사용자 지정 2026-07-19). 나머지는 파일 순서 유지.
    '/destinations/vietnam-10.jpg',
    '/destinations/vietnam-01.jpg',
    '/destinations/vietnam-03.jpg',
    '/destinations/vietnam-05.jpg',
    '/destinations/vietnam-07.jpg',
    '/destinations/vietnam-08.jpg',
    '/destinations/vietnam-09.jpg',
    '/destinations/vietnam-16.jpg',
    '/destinations/vietnam-17.jpg',
    '/destinations/vietnam-18.jpg',
  ],
  캄보디아: [
    // 첫 장 = 앙코르 사원 회랑 기둥(사용자 지정 2026-07-21). 나머지는 파일 순서 유지.
    '/destinations/cambodia-06.jpg',
    '/destinations/cambodia-01.jpg',
    '/destinations/cambodia-02.jpg',
    '/destinations/cambodia-03.jpg',
    '/destinations/cambodia-04.jpg',
    '/destinations/cambodia-05.jpg',
    '/destinations/cambodia-07.jpg',
    '/destinations/cambodia-09.jpg',
    '/destinations/cambodia-10.jpg',
    '/destinations/cambodia-11.jpg',
    '/destinations/cambodia-12.jpg',
    '/destinations/cambodia-13.jpg',
    '/destinations/cambodia-14.jpg',
    '/destinations/cambodia-15.jpg',
    '/destinations/cambodia-16.jpg',
  ],
  몽골: [
    // 첫 장 = 초원 사원(01, 사용자 지정 2026-07-21). 09(밤하늘 게르) 삭제 — 결번 유지(재번호 X).
    '/destinations/mongolia-01.jpg',
    '/destinations/mongolia-02.jpg',
    '/destinations/mongolia-03.jpg',
    '/destinations/mongolia-04.jpg',
    '/destinations/mongolia-05.jpg',
    '/destinations/mongolia-06.jpg',
    '/destinations/mongolia-07.jpg',
    '/destinations/mongolia-08.jpg',
    '/destinations/mongolia-10.jpg',
    '/destinations/mongolia-11.jpg',
    '/destinations/mongolia-12.jpg',
    '/destinations/mongolia-13.jpg',
    '/destinations/mongolia-14.jpg',
    '/destinations/mongolia-15.jpg',
    '/destinations/mongolia-16.jpg',
  ],
  우즈베키스탄: [
    // 첫 장 = 타일 아치 클로즈업(사용자 지정 2026-07-21). 나머지는 파일 순서 유지.
    // 05(부하라 골목)·11(사막 흙언덕) 삭제 — 결번 유지(재번호 X).
    '/destinations/uzbekistan-02.jpg',
    '/destinations/uzbekistan-01.jpg',
    '/destinations/uzbekistan-03.jpg',
    '/destinations/uzbekistan-04.jpg',
    '/destinations/uzbekistan-06.jpg',
    '/destinations/uzbekistan-07.jpg',
    '/destinations/uzbekistan-08.jpg',
    '/destinations/uzbekistan-09.jpg',
    '/destinations/uzbekistan-10.jpg',
    '/destinations/uzbekistan-12.jpg',
    '/destinations/uzbekistan-13.jpg',
    '/destinations/uzbekistan-14.jpg',
  ],
  캐나다: [
    // 첫 장 = 모레인 호수(05, 사용자 지정 2026-07-21). 나머지는 파일 순서 유지.
    // 07(카누)·13(퀘벡 시가지) 삭제 — 결번 유지(재번호 X).
    '/destinations/canada-05.jpg',
    '/destinations/canada-01.jpg',
    '/destinations/canada-02.jpg',
    '/destinations/canada-03.jpg',
    '/destinations/canada-04.jpg',
    '/destinations/canada-06.jpg',
    '/destinations/canada-08.jpg',
    '/destinations/canada-09.jpg',
    '/destinations/canada-10.jpg',
    '/destinations/canada-11.jpg',
    '/destinations/canada-12.jpg',
    '/destinations/canada-14.jpg',
    '/destinations/canada-15.jpg',
  ],
  대만: [
    // 첫 장 = 타이베이 101 노을(사용자 지정 2026-07-19). 나머지는 파일 순서 유지.
    '/destinations/taiwan-11.webp',
    '/destinations/taiwan-00.webp',
    '/destinations/taiwan-01.webp',
    '/destinations/taiwan-02.webp',
    '/destinations/taiwan-03.webp',
    '/destinations/taiwan-04.webp',
    '/destinations/taiwan-05.webp',
    '/destinations/taiwan-06.webp',
    '/destinations/taiwan-07.webp',
    '/destinations/taiwan-08.webp',
    '/destinations/taiwan-09.webp',
    '/destinations/taiwan-10.webp',
    '/destinations/taiwan-12.webp',
    '/destinations/taiwan-13.webp',
    '/destinations/taiwan-14.webp',
  ],
  중국: [
    '/destinations/china-00.webp',
    '/destinations/china-01.webp',
    '/destinations/china-02.webp',
    '/destinations/china-03.webp',
    '/destinations/china-04.webp',
    '/destinations/china-05.webp',
    '/destinations/china-06.webp',
    '/destinations/china-07.webp',
    '/destinations/china-08.webp',
    '/destinations/china-09.webp',
    '/destinations/china-10.webp',
  ],
  모로코: [
    // 첫 장 = 14(알람브라식 아치 너머 전경, 사용자 지정 2026-07-21). 나머지는 파일 순서 유지.
    // 07(셰프샤우엔 파란 안뜰) 삭제 — 결번 유지(재번호 X).
    '/destinations/morocco-14.jpg',
    '/destinations/morocco-01.jpg',
    '/destinations/morocco-02.jpg',
    '/destinations/morocco-03.jpg',
    '/destinations/morocco-04.jpg',
    '/destinations/morocco-05.jpg',
    '/destinations/morocco-06.jpg',
    '/destinations/morocco-08.jpg',
    '/destinations/morocco-09.jpg',
    '/destinations/morocco-10.jpg',
    '/destinations/morocco-11.jpg',
    '/destinations/morocco-12.jpg',
    '/destinations/morocco-13.jpg',
  ],
  우크라이나: [
    // 첫 장 = 05(건물, 사용자 지정 2026-07-21). 삭제 없음. 나머지는 파일 순서 유지.
    '/destinations/ukraine-05.jpg',
    '/destinations/ukraine-01.jpg',
    '/destinations/ukraine-02.jpg',
    '/destinations/ukraine-03.jpg',
    '/destinations/ukraine-04.jpg',
    '/destinations/ukraine-06.jpg',
    '/destinations/ukraine-07.jpg',
    '/destinations/ukraine-08.jpg',
    '/destinations/ukraine-09.jpg',
  ],
  멕시코: [
    // 첫 장 = 10(칸쿤 해변 항공뷰, 사용자 지정 2026-07-21). 나머지는 파일 순서 유지.
    // 09(시장 노점) 삭제 — 결번 유지(재번호 X).
    '/destinations/mexico-10.jpg',
    '/destinations/mexico-01.jpg',
    '/destinations/mexico-02.jpg',
    '/destinations/mexico-03.jpg',
    '/destinations/mexico-04.jpg',
    '/destinations/mexico-05.jpg',
    '/destinations/mexico-06.jpg',
    '/destinations/mexico-07.jpg',
    '/destinations/mexico-08.jpg',
    '/destinations/mexico-11.jpg',
  ],
  브라질: [
    // 첫 장 = 21(해변 항공뷰, 사용자 지정 2026-07-21). 나머지는 파일 순서 유지.
    // 02·04·09·19·23 삭제 — 결번 유지(재번호 X).
    '/destinations/brazil-21.jpg',
    '/destinations/brazil-01.jpg',
    '/destinations/brazil-03.jpg',
    '/destinations/brazil-05.jpg',
    '/destinations/brazil-06.jpg',
    '/destinations/brazil-07.jpg',
    '/destinations/brazil-08.jpg',
    '/destinations/brazil-10.jpg',
    '/destinations/brazil-11.jpg',
    '/destinations/brazil-12.jpg',
    '/destinations/brazil-13.jpg',
    '/destinations/brazil-14.jpg',
    '/destinations/brazil-15.jpg',
    '/destinations/brazil-16.jpg',
    '/destinations/brazil-17.jpg',
    '/destinations/brazil-18.jpg',
    '/destinations/brazil-20.jpg',
    '/destinations/brazil-22.jpg',
    '/destinations/brazil-24.jpg',
    '/destinations/brazil-25.jpg',
    '/destinations/brazil-26.jpg',
    '/destinations/brazil-27.jpg',
  ],
  말레이시아: [
    // 리드(첫 장) = malaysia-07(해변 항공샷) — 2026-07-23 사용자 지정. malaysia-09(야시장)는 삭제됨.
    '/destinations/malaysia-07.jpg',
    '/destinations/malaysia-01.jpg',
    '/destinations/malaysia-02.jpg',
    '/destinations/malaysia-03.jpg',
    '/destinations/malaysia-04.jpg',
    '/destinations/malaysia-05.jpg',
    '/destinations/malaysia-06.jpg',
    '/destinations/malaysia-08.jpg',
    '/destinations/malaysia-10.jpg',
    '/destinations/malaysia-11.jpg',
  ],
  인도네시아: [
    // 리드(첫 장) = indonesia-02(브로모 화산) — 2026-07-23 사용자 지정. indonesia-10(발리 마을)은 삭제됨.
    '/destinations/indonesia-02.jpg',
    '/destinations/indonesia-01.jpg',
    '/destinations/indonesia-03.jpg',
    '/destinations/indonesia-04.jpg',
    '/destinations/indonesia-05.jpg',
    '/destinations/indonesia-06.jpg',
    '/destinations/indonesia-07.jpg',
    '/destinations/indonesia-08.jpg',
    '/destinations/indonesia-09.jpg',
    '/destinations/indonesia-11.jpg',
  ],
  아르헨티나: [
    // 리드(첫 장) = argentina-16(빙하 벽 클로즈업) — 2026-07-23 사용자 지정.
    // argentina-04(전망대 빙하)·07(피츠로이 도로)·15(빙하 파노라마)는 삭제됨.
    '/destinations/argentina-16.jpg',
    '/destinations/argentina-01.jpg',
    '/destinations/argentina-02.jpg',
    '/destinations/argentina-03.jpg',
    '/destinations/argentina-05.jpg',
    '/destinations/argentina-06.jpg',
    '/destinations/argentina-08.jpg',
    '/destinations/argentina-09.jpg',
    '/destinations/argentina-10.jpg',
    '/destinations/argentina-11.jpg',
    '/destinations/argentina-12.jpg',
    '/destinations/argentina-13.jpg',
    '/destinations/argentina-14.jpg',
    '/destinations/argentina-17.jpg',
  ],
  러시아: [
    // 리드(첫 장) = russia-05(바이칼 얼음) — 2026-07-23 사용자 지정. russia-01(눈 오는 밤거리)은 삭제됨.
    '/destinations/russia-05.jpg',
    '/destinations/russia-02.jpg',
    '/destinations/russia-03.jpg',
    '/destinations/russia-04.jpg',
    '/destinations/russia-06.jpg',
    '/destinations/russia-07.jpg',
    '/destinations/russia-08.jpg',
    '/destinations/russia-09.jpg',
    '/destinations/russia-10.jpg',
    '/destinations/russia-11.jpg',
    '/destinations/russia-12.jpg',
    '/destinations/russia-13.jpg',
    '/destinations/russia-14.jpg',
  ],
  튀르키예: [
    // 리드(첫 장) = turkey-02(파묵칼레 석회붕 테라스) — 2026-07-23 사용자 지정.
    // turkey-03(갈라타 수변)·07(에페소스 도서관)·09(파묵칼레 항공 수영)는 삭제됨.
    '/destinations/turkey-02.jpg',
    '/destinations/turkey-01.jpg',
    '/destinations/turkey-04.jpg',
    '/destinations/turkey-05.jpg',
    '/destinations/turkey-06.jpg',
    '/destinations/turkey-08.jpg',
    '/destinations/turkey-10.jpg',
    '/destinations/turkey-11.jpg',
  ],
  카자흐스탄: [
    // 첫 장 = 07(하즈렛 술탄 모스크, 사용자 지정 2026-07-21). 나머지는 파일 순서 유지.
    // 01·03 삭제 — 결번 유지(재번호 X).
    '/destinations/kazakhstan-07.jpg',
    '/destinations/kazakhstan-02.jpg',
    '/destinations/kazakhstan-04.jpg',
    '/destinations/kazakhstan-05.jpg',
    '/destinations/kazakhstan-06.jpg',
    '/destinations/kazakhstan-08.jpg',
    '/destinations/kazakhstan-09.jpg',
    '/destinations/kazakhstan-10.jpg',
    '/destinations/kazakhstan-11.jpg',
    '/destinations/kazakhstan-12.jpg',
    '/destinations/kazakhstan-13.jpg',
    '/destinations/kazakhstan-14.jpg',
    '/destinations/kazakhstan-15.jpg',
  ],
  // 아랍에미리트 — 2026-07-22 등록(원본 12장 전부, 파일 순서 유지).
  // ⚠️ 키는 **표준 표기 '아랍에미리트'**. 원본 폴더명은 '아랍에미레이트'지만 이 맵은 목적지
  //   토큰(한글 국가명)으로 조회하므로 표기가 어긋나면 사진이 통째로 안 뜬다.
  // 첫 장(리드) = uae-09(모래언덕) — 2026-07-23 사용자 지정. uae-05(사막 차량 행렬)는 삭제됨.
  아랍에미리트: [
    '/destinations/uae-09.jpg',
    '/destinations/uae-01.jpg',
    '/destinations/uae-02.jpg',
    '/destinations/uae-03.jpg',
    '/destinations/uae-04.jpg',
    '/destinations/uae-06.jpg',
    '/destinations/uae-07.jpg',
    '/destinations/uae-08.jpg',
    '/destinations/uae-10.jpg',
    '/destinations/uae-11.jpg',
    '/destinations/uae-12.jpg',
  ],
  프랑스: [
    '/destinations/france-02.webp',
    '/destinations/france-09.webp',
    '/destinations/france-13.webp',
    '/destinations/france-18.webp',
    '/destinations/france-19.webp',
    '/destinations/france-32.webp',
    '/destinations/france-36.webp',
  ],
  네덜란드: [
    '/destinations/netherlands-00.webp',
    '/destinations/netherlands-01.webp',
    '/destinations/netherlands-03.webp',
    '/destinations/netherlands-04.webp',
    '/destinations/netherlands-06.webp',
    '/destinations/netherlands-08.webp',
    '/destinations/netherlands-10.webp',
    '/destinations/netherlands-12.webp',
    '/destinations/netherlands-13.webp',
    '/destinations/netherlands-17.webp',
  ],
  벨기에: [
    '/destinations/belgium-00.webp',
    '/destinations/belgium-01.webp',
    '/destinations/belgium-03.webp',
    '/destinations/belgium-06.webp',
    '/destinations/belgium-07.webp',
    '/destinations/belgium-08.webp',
    '/destinations/belgium-09.webp',
  ],
  불가리아: [
    '/destinations/bulgaria-00.webp',
    '/destinations/bulgaria-01.webp',
    '/destinations/bulgaria-02.webp',
    '/destinations/bulgaria-04.webp',
    '/destinations/bulgaria-05.webp',
    '/destinations/bulgaria-06.webp',
    '/destinations/bulgaria-07.webp',
    '/destinations/bulgaria-08.webp',
    '/destinations/bulgaria-09.webp',
  ],
  독일: [
    '/destinations/germany-02.webp',  // 눈숲 도로 항공
    '/destinations/germany-09.webp',  // 노이슈반슈타인 파란하늘
    '/destinations/germany-11.webp',  // 노이슈반슈타인 항공 새벽안개
    '/destinations/germany-13.webp',  // 소 방목 초원 가을
    '/destinations/germany-16.webp',  // 브란덴부르크 문 전경
    '/destinations/germany-20.webp',  // 초원 가문비나무
    '/destinations/germany-21.webp',  // 브레멘 마르크트 광장 (맑음)
  ],
  이탈리아: [
    '/destinations/italy-00.webp',
    '/destinations/italy-27.webp',
    '/destinations/italy-02.webp',
    '/destinations/italy-04.webp',
    '/destinations/italy-05.webp',
    '/destinations/italy-09.webp',
    '/destinations/italy-11.webp',
    '/destinations/italy-12.webp',
    '/destinations/italy-25.webp',
    '/destinations/italy-28.webp',
  ],
  오스트리아: [
    '/destinations/austria-00.webp',
    '/destinations/austria-02.webp',
    '/destinations/austria-07.webp',
    '/destinations/austria-09.webp',
    '/destinations/austria-11.webp',
    '/destinations/austria-12.webp',
    '/destinations/austria-16.webp',
    '/destinations/austria-18.webp',
    '/destinations/austria-19.webp',
    '/destinations/austria-20.webp',
    '/destinations/austria-22.webp',
    '/destinations/austria-24.webp',
    '/destinations/austria-25.webp',
  ],
  크로아티아: [
    '/destinations/croatia-00.webp',
    '/destinations/croatia-01.webp',
    '/destinations/croatia-02.webp',
    '/destinations/croatia-03.webp',
    '/destinations/croatia-04.webp',
    '/destinations/croatia-06.webp',
    '/destinations/croatia-07.webp',
    '/destinations/croatia-08.webp',
    '/destinations/croatia-09.webp',
  ],
  폴란드: [
    '/destinations/poland-00.webp',
    '/destinations/poland-08.webp',
    '/destinations/poland-11.webp',
    '/destinations/poland-14.webp',
    '/destinations/poland-16.webp',
    '/destinations/poland-19.webp',
    '/destinations/poland-28.webp',
    '/destinations/poland-29.webp',
    '/destinations/poland-33.webp',
    '/destinations/poland-34.webp',
    '/destinations/poland-37.webp',
    '/destinations/poland-39.webp',
  ],
  덴마크: [
    '/destinations/denmark-00.webp',
    '/destinations/denmark-01.webp',
    '/destinations/denmark-02.webp',
    '/destinations/denmark-03.webp',
    '/destinations/denmark-04.webp',
    '/destinations/denmark-05.webp',
    '/destinations/denmark-06.webp',
    '/destinations/denmark-07.webp',
    '/destinations/denmark-08.webp',
    '/destinations/denmark-09.webp',
    '/destinations/denmark-10.webp',
    '/destinations/denmark-11.webp',
  ],
  라트비아: [
    '/destinations/latvia-00.webp',
    '/destinations/latvia-02.webp',
    '/destinations/latvia-03.webp',
    '/destinations/latvia-05.webp',
  ],
  에스토니아: [
    '/destinations/estonia-00.webp',
    '/destinations/estonia-01.webp',
    '/destinations/estonia-02.webp',
    '/destinations/estonia-03.webp',
    '/destinations/estonia-05.webp',
    '/destinations/estonia-06.webp',
    '/destinations/estonia-07.webp',
    '/destinations/estonia-08.webp',
    '/destinations/estonia-09.webp',
  ],
  그리스: [
    '/destinations/greece-00.webp',
    '/destinations/greece-01.webp',
    '/destinations/greece-02.webp',
    '/destinations/greece-03.webp',
    '/destinations/greece-04.webp',
    '/destinations/greece-05.webp',
    '/destinations/greece-06.webp',
    '/destinations/greece-07.webp',
    '/destinations/greece-08.webp',
    '/destinations/greece-09.webp',
    '/destinations/greece-12.webp',
    '/destinations/greece-13.webp',
  ],
  체코: [
    '/destinations/czechia-00.webp',
    '/destinations/czechia-01.webp',
    '/destinations/czechia-02.webp',
    '/destinations/czechia-03.webp',
    '/destinations/czechia-04.webp',
    '/destinations/czechia-05.webp',
    '/destinations/czechia-06.webp',
    '/destinations/czechia-07.webp',
  ],
  포르투갈: [
    '/destinations/portugal-00.webp',
    '/destinations/portugal-01.webp',
    '/destinations/portugal-03.webp',
    '/destinations/portugal-04.webp',
    '/destinations/portugal-05.webp',
    '/destinations/portugal-07.webp',
    '/destinations/portugal-08.webp',
    '/destinations/portugal-09.webp',
    '/destinations/portugal-10.webp',
    '/destinations/portugal-11.webp',
    '/destinations/portugal-12.webp',
    '/destinations/portugal-14.webp',
    '/destinations/portugal-15.webp',
  ],
  키프로스: [
    '/destinations/cyprus-00.webp',
    '/destinations/cyprus-02.webp',  // 보트 정박 만 (탑다운)
    '/destinations/cyprus-05.webp',  // 니시 해변 탑다운
    '/destinations/cyprus-06.webp',  // 지중해풍 건물·파란 덧창
  ],
  헝가리: [
    '/destinations/hungary-00.webp',
    '/destinations/hungary-01.webp',  // 국회의사당 노을 + 유람선
    '/destinations/hungary-02.webp',  // 클래식 노랑 트램 D
    '/destinations/hungary-03.webp',  // 겨울 안개 자유의 다리
    '/destinations/hungary-04.webp',  // 주황 트램 + 국회의사당
    '/destinations/hungary-06.webp',  // 세체니 온천 (흐림·벤치)
    '/destinations/hungary-07.webp',  // 마차시 성당 타일 지붕
    '/destinations/hungary-09.webp',  // 국회의사당 야경
    '/destinations/hungary-11.webp',  // 성 이슈트반 대성당 새벽
  ],
  룩셈부르크: [
    '/destinations/luxembourg-00.webp',
    '/destinations/luxembourg-01.webp',
    '/destinations/luxembourg-02.webp',
    '/destinations/luxembourg-03.webp',
    '/destinations/luxembourg-04.webp',
    '/destinations/luxembourg-05.webp',
    '/destinations/luxembourg-06.webp',
    '/destinations/luxembourg-07.webp',
    '/destinations/luxembourg-09.webp',
    '/destinations/luxembourg-10.webp',
  ],
  루마니아: [
    '/destinations/romania-00.webp',
    '/destinations/romania-01.webp',
    '/destinations/romania-02.webp',
    '/destinations/romania-03.webp',
    '/destinations/romania-05.webp',
    '/destinations/romania-06.webp',
    '/destinations/romania-07.webp',
  ],
  리투아니아: [
    // 02~07 은 슬로베니아 사진이 폴더에 잘못 섞인 것 — 슬로베니아로 이관(2026-07-16).
    '/destinations/lithuania-00.webp',
    '/destinations/lithuania-01.webp',
    '/destinations/lithuania-08.webp',
    '/destinations/lithuania-10.webp',
    '/destinations/lithuania-11.webp',
    '/destinations/lithuania-12.webp',
  ],
  스웨덴: [
    '/destinations/sweden-00.webp',
    '/destinations/sweden-01.webp',
    '/destinations/sweden-03.webp',
    '/destinations/sweden-04.webp',
    '/destinations/sweden-05.webp',
    '/destinations/sweden-06.webp',
    '/destinations/sweden-09.webp',
    '/destinations/sweden-10.webp',
    '/destinations/sweden-11.webp',
    '/destinations/sweden-12.webp',
    '/destinations/sweden-13.webp',
    '/destinations/sweden-14.webp',
    '/destinations/sweden-15.webp',
    '/destinations/sweden-16.webp',
    '/destinations/sweden-18.webp',
    '/destinations/sweden-20.webp',
  ],
  슬로바키아: [
    '/destinations/slovakia-00.webp',
    '/destinations/slovakia-01.webp',
    '/destinations/slovakia-03.webp',
    '/destinations/slovakia-04.webp',
  ],
  슬로베니아: [
    '/destinations/slovenia-00.webp',
    '/destinations/slovenia-01.webp',  // 블레드 호수 (가을 안개)
    '/destinations/slovenia-02.webp',  // 프레드야마 동굴성
    '/destinations/slovenia-03.webp',  // 겨울 호수 설경
    '/destinations/slovenia-04.webp',  // 야스나 호수
    '/destinations/slovenia-05.webp',  // 블레드 호수 (노을)
    '/destinations/slovenia-06.webp',  // 카닌 산장 전망대
  ],
  스페인: [
    '/destinations/spain-00.webp',
    '/destinations/spain-30.webp',
    '/destinations/spain-01.webp',
    '/destinations/spain-03.webp',
    '/destinations/spain-07.webp',
    '/destinations/spain-13.webp',
    '/destinations/spain-16.webp',
    '/destinations/spain-19.webp',
    '/destinations/spain-20.webp',
    '/destinations/spain-35.webp',
    '/destinations/spain-37.webp',
  ],
  영국: [
    '/destinations/uk-05.webp', // 트라팔가 광장 2층버스
    '/destinations/uk-00.webp', // 타워브리지·템스강 항공(노을)
    '/destinations/uk-01.webp', // 웨스트민스터 사원 쌍둥이 탑
    '/destinations/uk-03.webp', // 자연사박물관 내부(고래 뼈대)
    '/destinations/uk-04.webp', // 빨간 공중전화 부스
    '/destinations/uk-06.webp', // 절벽 협곡 도로 항공
  ],
  핀란드: [
    '/destinations/finland-11.webp', // 가을 건물(초록 지붕)
    '/destinations/finland-00.webp', // 헬싱키 대성당
    '/destinations/finland-01.webp', // 눈 내리는 거리·트램(야간)
    '/destinations/finland-04.webp', // 오로라·호수
    '/destinations/finland-06.webp', // 눈숲 오두막·모닥불
    '/destinations/finland-07.webp', // 자작나무 숲(가을 안개)
    '/destinations/finland-08.webp', // 눈숲 오두막 항공(야간)
    '/destinations/finland-09.webp', // 눈밭 인물 실루엣·별
    '/destinations/finland-10.webp', // 다리·수변 야경
    '/destinations/finland-12.webp', // 오디 도서관 목재 곡면
    '/destinations/finland-14.webp', // 자작나무·오로라
    '/destinations/finland-15.webp', // 설경 숲 항공(일출)
  ],
  노르웨이: [
    '/destinations/norway-00.webp', // 레이네 마을(여름, 대표컷)
    '/destinations/norway-02.webp', // 레이네 마을(설경)
    '/destinations/norway-03.webp', // 트롤퉁가 항공
    '/destinations/norway-05.webp', // 오로라·서리나무
    '/destinations/norway-07.webp', // 트롬쇠 야경 항공
    '/destinations/norway-08.webp', // 피오르 마을 선착장
    '/destinations/norway-09.webp', // 오슬로 오페라하우스 지붕(노을·인물)
    '/destinations/norway-10.webp', // 오로라·산·호수(황혼)
    '/destinations/norway-11.webp', // 트롬쇠 야경 항공(다리)
    '/destinations/norway-12.webp', // 레이네 마을(여름·초록)
    '/destinations/norway-13.webp', // 피오르 노을(보라·핑크)
    '/destinations/norway-15.webp', // 개썰매·오로라
    '/destinations/norway-17.webp', // 오슬로 오페라하우스(안개)
  ],
  몰타: [
    '/destinations/malta-02.webp', // 고조 시타델 창문(첫 화면)
    '/destinations/malta-00.webp', // 몰타 국기·드라마틱한 구름
    '/destinations/malta-01.webp', // 코미노 블루라군 항공
    '/destinations/malta-03.webp', // 임디나 대성당 항공(노을)
    '/destinations/malta-04.webp', // 삼자매 도시 항구
    '/destinations/malta-05.webp', // 블루 그로토 항공
    '/destinations/malta-06.webp', // 암초 해안 항공
  ],
  아일랜드: [
    '/destinations/ireland-00.webp', // 모허 절벽·풀 이삭 전경(흐림) — 시작 사진
    '/destinations/ireland-02.webp', // 스켈리그 마이클
    '/destinations/ireland-04.webp', // 절벽 해안 항공(탑다운)
    '/destinations/ireland-05.webp', // 골웨이 컬러풀 하우스(흐림)
    '/destinations/ireland-06.webp', // 파워스코트 폭포
    '/destinations/ireland-08.webp', // 해안 절벽 야생화(들꽃)
  ],
  스위스: [
    '/destinations/switzerland-00.webp', // 마터호른(황혼)
    '/destinations/switzerland-01.webp', // 베르니나 특급 열차·빙하
    '/destinations/switzerland-03.webp', // 푸르카 고개 호텔 벨베데레
    '/destinations/switzerland-04.webp', // 외슈넨 호수(터콰이즈)
    '/destinations/switzerland-05.webp', // 케이블카·설산
    '/destinations/switzerland-06.webp', // 호숫가 샬레·설산
    '/destinations/switzerland-08.webp', // 슈토스 예배당
    '/destinations/switzerland-11.webp', // 구름 위 알프스(노을)
    '/destinations/switzerland-12.webp', // 그린델발트풍 마을·빨간 트럭
    '/destinations/switzerland-13.webp', // 알프스 석조 마을 파노라마
  ],
}

/** Fisher–Yates 셔플 — 원본 불변, 새 배열 반환. */
function shuffleArray<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

type HeroPhotoState = { destination: string; candidates: string[]; index: number }

function buildHeroPhotoState(destination: string): HeroPhotoState {
  const base = DEST_PHOTO_CANDIDATES[destination] ?? []
  return {
    destination,
    candidates: base.length > 1 ? [base[0], ...shuffleArray(base.slice(1))] : base,
    index: 0,
  }
}

/** 히어로 사진 크롭 위치 — 200px 고정 높이 박스라 세로 사진은 object-fit: cover 로
    위/아래가 크게 잘린다. 기본은 정중앙, 위/아래 중 살려야 할 피사체가 있는 사진만
    개별 지정(사용자 확인 후 추가). */
const HERO_PHOTO_POSITION: Record<string, string> = {
  '/destinations/norway-17.webp': 'top', // 오슬로 오페라하우스(안개) — 지붕 위쪽이 잘리지 않게
  '/destinations/malta-00.webp': 'bottom', // 몰타 국기·건물 문장 — 하단 피사체가 잘리지 않게
  '/destinations/switzerland-03.webp': 'bottom', // 푸르카 고개 호텔·도로 U턴 — 하단이 최대한 보이게
  '/destinations/japan-fuji-umbrella-field.webp': 'bottom',
  '/destinations/japan-fuji-pagoda-snow.webp': 'top',
  '/destinations/japan-sakura-blossom-macro.webp': 'top',
  '/destinations/thailand-cliff-coast-road.webp': 'top',
  '/destinations/france-19.webp': 'bottom',
  '/destinations/france-09.webp': 'center 70%',
  '/destinations/france-18.webp': 'center 30%',
  '/destinations/germany-02.webp': 'top',
  '/destinations/germany-21.webp': 'top',
  '/destinations/italy-04.webp': 'bottom',
  '/destinations/italy-11.webp': 'bottom',
  '/destinations/italy-12.webp': 'top',
  '/destinations/italy-25.webp': 'top',
  '/destinations/cyprus-06.webp': 'bottom',
  '/destinations/belgium-08.webp': 'bottom',
  '/destinations/denmark-04.webp': 'top',
  '/destinations/romania-02.webp': 'top',
  '/destinations/romania-05.webp': 'top',
  '/destinations/sweden-01.webp': 'bottom',
  '/destinations/sweden-03.webp': 'top',
  '/destinations/belgium-09.webp': 'bottom',
  '/destinations/netherlands-12.webp': 'top',
  '/destinations/austria-02.webp': 'bottom',
  '/destinations/austria-07.webp': 'bottom',
  '/destinations/austria-09.webp': 'top',
  '/destinations/austria-12.webp': 'bottom',
  '/destinations/austria-19.webp': 'top',
  '/destinations/austria-20.webp': 'top',
  '/destinations/austria-25.webp': 'top',
}

/** 이름 + 와/과 — 마지막 글자 받침 유무로 결정. 한글 음절이 아니면(영문 등) '와' 기본. */
function withWaGwa(name: string): string {
  if (!name) return name
  const last = name.charCodeAt(name.length - 1)
  if (last >= 0xac00 && last <= 0xd7a3) {
    return (last - 0xac00) % 28 !== 0 ? `${name}과` : `${name}와`
  }
  return `${name}와`
}

/** 'YYYY-MM-DD' → 'YYYY년 M월 D일'. 형식이 아니면 원문. 완료 배너 도착일 표기용. */
function formatKoreanDate(iso: string): string {
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  const [y, m, d] = parts
  return `${y}년 ${Number(m)}월 ${Number(d)}일`
}

/** 'YYYY-MM-DD' 두 날짜 → 'YYYY년 M월 D일 ~ M월 D일' (같은 해면 연도 1회). 왕복 완료 기간용. */
function formatDateRange(startIso: string, endIso: string): string {
  const sy = startIso.slice(0, 4)
  const ey = endIso.slice(0, 4)
  const end = sy === ey ? formatKoreanDate(endIso).replace(/^\d+년\s*/, '') : formatKoreanDate(endIso)
  return `${formatKoreanDate(startIso)} ~ ${end}`
}

/**
 * Calm 디자인 시스템의 여정 화면.
 *
 * 시각 소스: docs/portal-preview/timeline.jsx (TimelineCalm) — Stone 팔레트는 portal-only
 * 라 인라인 style 로 유지. 디자인 freeze 단계에서 portal-preview JSX 가 truth, 이 코드는
 * 그것을 비교적 충실히 옮긴 것.
 */
export function TimelineCalm({
  data,
  caseId,
  activeDest,
  canFinishJourney = false,
  finishing = false,
  onFinishJourney,
}: {
  data: JourneyData
  caseId: string
  /** 활성 목적지(?dest=) — step 상세 링크에 붙여 다중 목적지에서 선택 목적지를 유지. */
  activeDest?: string | null
  /** 완료된 이 여정을 '지난 여정'으로 내릴 수 있는지(다중 목적지 + 완료). 완료 카드 아래 버튼 노출. */
  canFinishJourney?: boolean
  /** 마무리 처리 중(버튼 비활성). */
  finishing?: boolean
  /** '여정 마무리하기' 클릭 — 페이지가 finishJourney + 되돌리기 토스트를 담당. */
  onFinishJourney?: () => void
}) {
  const { stages, trip, pet, nextStages, caseAlerts, journeyComplete, journeyCompleteDate } = data
  // step 상세로 넘어갈 때 활성 목적지를 유지하기 위한 쿼리. 단일 목적지면 빈 문자열.
  const destQuery = activeDest ? `?dest=${encodeURIComponent(activeDest)}` : ''
  // 행 링크 — 보통은 step 상세, 서류 체크리스트(linkToDocs)는 서류 페이지로 직행.
  const stageHref = (s: JourneyStage) =>
    s.linkToDocs
      ? `/cases/${caseId}/docs${destQuery}`
      : `/cases/${caseId}/journey/${s.id}${destQuery}`
  const total = stages.length
  const done = stages.filter((s) => s.state === 'done').length
  const pct = done / total
  // '다음 할 일' 스텝 배지 번호 — 전체 일정에서의 1-based 위치. 아래 타임라인 번호와 연결.
  const nextStageNo =
    nextStages.length > 0 ? stages.findIndex((s) => s.id === nextStages[0].id) + 1 : 0

  // Stone palette — scoped to this view (globals.css 의 --pm-* 와 같은 값, 인라인 fidelity).
  const C = {
    ...PM,
    line: 'rgb(var(--pm-ink-rgb) / .07)',
  } as const

  // 주의가 발생한 stage 들 — 실패한 비-info 체크(실제 문제)가 있는 경우만.
  const warnedStages = stages.filter((s) => (s.failedChecks ?? 0) > 0)
  // 주의 스트립 항목 — 케이스 차원(caseAlerts: 견종·마릿수 등)과 단계 차원(warnedStages:
  // 절차 검증 어긋남)을 한 스트립으로 합친다. stage 의 desc 는 주의 발생 시 첫 주의
  // 메시지를 담는다(scenario 의 failedMsg 우선 규칙).
  const warnItems: { id: string; title: string; message: string | undefined; href?: string }[] = [
    ...caseAlerts.map((a) => ({ id: a.id, title: a.title, message: a.message ?? undefined })),
    ...warnedStages.map((s) => ({
      id: s.id,
      title: s.label,
      // warnMessage — '설명문 표시' 토글과 무관하게 항상 있는 주의 본문(desc 는 토글로 비워짐).
      message: s.warnMessage,
      href: stageHref(s),
    })),
  ]
  // 안내 stage 들 — info 체크가 있거나, advisory step(추가 백신·추가 검사)이 미완료인 경우.
  // advisory 는 면역이 아직 유효한 '미래 만료 대비' reminder — 문제(주의)가 아니라
  // 차분한 안내 톤으로 묶는다. 이미 주의로 잡힌 stage 는 제외(한 stage = 한 배너).
  // 또한 '다음 할 일' 카드에 같은 stage 가 노출되면 거기에 안내가 인라인으로 붙으므로
  // 별도 '안내' 카드로 중복 노출하지 않는다.
  const warnedIds = new Set(warnedStages.map((s) => s.id))
  const nextStageIds = new Set(nextStages.map((s) => s.id))
  const infoStages = stages.filter(
    (s) =>
      !warnedIds.has(s.id) &&
      !nextStageIds.has(s.id) &&
      ((s.infoChecks ?? 0) > 0 || (!!s.advisory && s.state !== 'done')),
  )
  const firstInfoStage = infoStages[0] ?? null

  // 전체 일정을 물리적 위치 기준 구간으로 나눈다 — 한국(출국 준비)·일본·한국(귀국).
  // 'departure'(출국·도착) 앞에서 일본 구간이, 'kr-import-quarantine' 앞에서 한국 귀국
  // 구간이 시작된다. 해당 step 이 없으면 그 구간은 생기지 않는다(편도·단순 케이스).
  const stageZones = (() => {
    const departureIdx = stages.findIndex((s) => s.id === 'departure')
    const krReturnIdx = stages.findIndex((s) => s.id === 'kr-import-quarantine')
    const cuts: { index: number; caption: string | null }[] = [{ index: 0, caption: null }]
    if (departureIdx > 0) {
      cuts.push({ index: departureIdx, caption: `${withRo(trip.toCity)} 떠나요` })
      if (krReturnIdx > departureIdx) {
        cuts.push({ index: krReturnIdx, caption: `${withRo(trip.fromCity)} 돌아와요` })
      }
    }
    return cuts.map((cut, ci) => {
      const next = cuts[ci + 1]
      return {
        caption: cut.caption,
        rows: stages
          .slice(cut.index, next ? next.index : stages.length)
          .map((stage, k) => ({ stage, index: cut.index + k })),
      }
    })
  })()

  // 타이포 정의는 settings-shared 단일 출처(serif·num·monoCap import) — 2026-07-12 통합.

  // 히어로 날씨 칩 탭 → 목록 바텀시트 (여러 건일 때. 1건이고 이동 가능하면 바로 이동).
  const [warnSheetOpen, setWarnSheetOpen] = useState(false)
  const [infoSheetOpen, setInfoSheetOpen] = useState(false)

  // 상태 창(히어로 카드) = 나-2 확정 — 진행 바까지 사진 안으로 들어간 풀 포토.
  // 티켓 노치 = 우측 정중앙 확정. (2026-07-11 실기기 비교 후 확정, dev 스위처 제거.)

  // 후보 표시 순서 — 첫 장 고정 + 나머지는 목적지 진입마다 무작위.
  const [heroPhotoState, setHeroPhotoState] = useState<HeroPhotoState>(() =>
    buildHeroPhotoState(trip.toCity),
  )
  let activeHeroPhotoState = heroPhotoState
  if (heroPhotoState.destination !== trip.toCity) {
    activeHeroPhotoState = buildHeroPhotoState(trip.toCity)
    setHeroPhotoState(activeHeroPhotoState)
  }
  const heroPhotoCandidates = activeHeroPhotoState.candidates
  const heroPhotoIndex = activeHeroPhotoState.index
  const heroPhoto = heroPhotoCandidates[heroPhotoIndex] ?? null
  // 사진 후보 여러 장을 고르는 동안의 임시 비교용 — 탭하면 바로 다음 후보로 넘긴다.
  // (앱은 keep-alive 라 자동 회전은 새로고침 때만 도는데, 비교엔 즉시 전환이 필요.)
  // 사진 후보 검수 중엔 true, 스토어 스크린샷 등 정적 캡처 작업 땐 false.
  const HERO_TAP_SWITCHER = true
  const cycleHeroPhoto = () =>
    setHeroPhotoState((state) => {
      const current = state.destination === trip.toCity ? state : buildHeroPhotoState(trip.toCity)
      const length = current.candidates.length
      if (length <= 1) return current.index === 0 ? current : { ...current, index: 0 }
      return { ...current, index: (current.index + 1) % length }
    })

  // 다목적지 전환 — 헤더의 라우트(한국 ⇄ 일본) 버튼을 없애고 히어로의 목적지 칩이 담당.
  // 목적지 2개 이상이면 칩에 꺾쇠가 붙고, 탭하면 바텀시트로 활성 목적지를 바꾼다.
  const { cases } = useCases()
  const case_ = cases.find((c) => c.id === caseId) ?? null
  const destTokens = (case_?.destination ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  const multiDest = destTokens.length > 1
  const [destSheetOpen, setDestSheetOpen] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeDestResolved = activeDest ?? searchParams.get('dest') ?? destTokens[0] ?? ''

  // 여정 완료 미리보기 — 개발 전용 (?pmDemoComplete=1). 실데이터 없이 완료 화면을 확인.
  const demoComplete =
    process.env.NODE_ENV !== 'production' && searchParams.get('pmDemoComplete') === '1'
  const complete = journeyComplete || demoComplete

  // 이미 남긴 만족도 — 소감 카드의 얼굴 행에서 해당 얼굴만 틴트 표시.
  const savedRating =
    readJourneyFeedback(case_?.data, trip.toCity, destTokens[0] ?? null)?.rating ?? null

  // 날씨 칩 탭 — 1건이고 이동 가능한 단계면 바로 그 단계로, 그 외엔 목록 바텀시트.
  const onWarnChip = () => {
    if (warnItems.length === 1 && warnItems[0].href) router.push(warnItems[0].href)
    else setWarnSheetOpen(true)
  }
  const onInfoChip = () => {
    if (infoStages.length === 1) router.push(stageHref(infoStages[0]))
    else setInfoSheetOpen(true)
  }
  const tripTypeRaw = (case_?.data as Record<string, unknown> | null | undefined)?.trip_type
  const tripTypeByDest =
    tripTypeRaw && typeof tripTypeRaw === 'object' && !Array.isArray(tripTypeRaw)
      ? (tripTypeRaw as Record<string, 'round' | 'one_way'>)
      : {}

  function selectDest(dest: string) {
    setDestSheetOpen(false)
    const params = new URLSearchParams(searchParams.toString())
    params.set('dest', dest)
    // pane 라우트 — replaceState 만으로 TabHost 가 dest 를 다시 내려준다(서버 왕복 0).
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`)
  }

  // 사진 위 목적지·D-day 칩 공통 스타일 — 반투명 흰 배경(사진은 테마 무관 고정이라 하드코딩).
  const destChipStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 600,
    color: '#212124',
    lineHeight: 1.4,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    border: 'none',
  }

  const dDayLabel = formatDDay(trip.daysLeft)
  // 링 둘째 줄 '상태' — 출국일 있으면 D-day(카운트다운), 없으면 'N일째' 카운트업(생성일 기준).
  // 항상 '단계' 줄 아래 별도 줄로, 한 단계 짙게(ink2) 강조 — 가장 actionable 한 정보.
  // (출국일 없을 때 일본 prep 힌트(trip.prep)는 잠시 보류 — 되돌릴 땐 아래 한 줄만 복구.)
  const prepCountupLabel = trip.elapsedDays != null ? `${trip.elapsedDays}일째` : null
  const ringStatus = dDayLabel ?? prepCountupLabel
  // 사진 하단 오버레이 우측 — '10월 11일 출국'. 연도는 생략(출국은 대개 1년 이내).
  const departText = trip.departureDate
    ? `${formatKoreanDate(trip.departureDate).replace(/^\d+년\s*/, '')} 출국`
    : null

  // 완료 배너 날짜 — 왕복은 출발~도착(귀국) 범위, 편도는 도착일만.
  const arrivalText = journeyCompleteDate ? formatKoreanDate(journeyCompleteDate) : ''
  const journeyDateText =
    trip.tripType === 'round' && trip.departureDate && journeyCompleteDate
      ? formatDateRange(trip.departureDate, journeyCompleteDate)
      : arrivalText

  // 티켓 노치 배지 — 가로가 세로보다 긴 라운드 사각 + 우측(텍스트 쪽)에만 반원 컷아웃.
  // 좌측은 세로 레일이 붙는 쪽이라 온전히 두고, 우측만 '뜯겨 열린' 효과를 준다.
  // 컷아웃은 배지가 놓이는 면의 배경색(notchBg)으로 채워 펀칭된 것처럼 보이게 한다.
  // 일반 함수로 호출(컴포넌트 태그로 안 씀) — 매 렌더마다 재정의돼도 리마운트 걱정 없음.
  const renderTicketBadge = (opts: {
    bg: string
    color: string
    notchBg: string
    border?: string
    height?: number
    fontSize?: number
    fontWeight?: number
    children: React.ReactNode
  }) => {
    const height = opts.height ?? 22
    const width = height + 5
    const notchSize = height >= 26 ? 9 : 8
    return (
      <span
        style={{
          position: 'relative',
          width,
          height,
          borderRadius: height >= 26 ? 8 : 6,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: opts.bg,
          color: opts.color,
          border: opts.border ?? 'none',
          ...num,
          fontSize: opts.fontSize ?? 11,
          ...(opts.fontWeight != null ? { fontWeight: opts.fontWeight } : {}),
        }}
      >
        {opts.children}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: -notchSize / 2,
            width: notchSize,
            height: notchSize,
            borderRadius: '50%',
            background: opts.notchBg,
            // 노치 = 우측 정중앙 확정.
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        />
      </span>
    )
  }

  // 일정 한 행 — 동그라미(번호·상태) + 항목명 + 날짜. index 는 전체 일정 기준 0-based.
  // 카드 면 없이 세로 레일(타임라인)로 잇는다 — 완료 구간은 진한 선, 남은 구간은 흐린 선.
  // first/last 는 소속 구간(zone) 내 위치(레일 시작·끝), prevDone 은 직전 행 완료 여부
  // (윗선 채움 판단).
  const renderStageRow = (
    s: JourneyStage,
    index: number,
    opts: { first: boolean; last: boolean; prevDone: boolean },
  ) => {
    const isDone = s.state === 'done'
    const isCurr = s.state === 'current'
    // advisory(추가 백신·추가 검사) 가 미완료면 본 흐름의 다음 단계는 못 가리지만 미래
    // 만료 대비 reminder 이므로 안내 톤으로 표시 — 보호자가 인지하되 '문제'는 아니다.
    const hasWarn = (s.failedChecks ?? 0) > 0
    const hasInfo = (s.infoChecks ?? 0) > 0 || (!!s.advisory && !isDone)
    // 날짜가 내일 이후 — 상태(done/current/upcoming) 무관하게 '예정 28·01·03' 칩으로 명시.
    // advisory(추가 백신·검사)로 좌측 i·안내문은 그대로 두되, 미래 날짜가 있으면 우측 칩은
    // '예정 [날짜]'로(아래 칩 분기에서 hasInfo 보다 hasFutureDate 를 우선).
    const hasFutureDate = isFuture(s.date)
    // 마감 라벨 + 날짜가 있는 미완 step (사전 신고 등). 과거/미래 무관하게 항상 표시 —
    // 마감일은 단순 '예정 일자'가 아니라 보호자가 인지해야 할 시점이고, 지난 경우엔
    // warn 색으로 'overdue' 신호를 줘야 한다.
    const showDeadlinePill = s.dateLabel === '마감' && !!s.date && !isDone
    const isOverdueDeadline = showDeadlinePill && !hasFutureDate
    // 세로 레일 — 완료(지나온 길)는 진하게, 남은 길은 흐리게. 위 반절은 직전 행,
    // 아래 반절은 이 행의 완료 상태를 따른다.
    const railDone = 'rgb(var(--pm-ink-rgb) / .28)'
    const railTodo = 'rgb(var(--pm-ink-rgb) / .09)'
    // 간격 실험(2026-07-11): 제목만 나열될 때 텍스트 나열이 답답하다는 피드백 —
    // 18→23(행 사이 ~36→46px), 설명문 행도 13→15로 반 단계.
    const padY = s.desc ? 15 : 23
    return (
      <Link
        key={s.id}
        href={stageHref(s)}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
          // 보조줄(desc) 없는 행은 제목 한 줄이라 빽빽해진다 — 설명문 숨김 모드 등에서
          // 세로 여백을 키워 호흡을 준다. 보조줄 있는 행은 기존 간격 유지.
          padding: `${padY}px 0`,
          textDecoration: 'none',
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        {!opts.first && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: 10,
              top: 0,
              height: padY,
              width: 2,
              background: opts.prevDone && isDone ? railDone : railTodo,
            }}
          />
        )}
        {!opts.last && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: 10,
              top: padY + 22,
              bottom: 0,
              width: 2,
              background: isDone ? railDone : railTodo,
            }}
          />
        )}
        {renderTicketBadge({
          // 우선순위: 주의(실제 문제) > done(완료 체크) > current(다음 할 일 톤) > 안내 > upcoming.
          // current 와 안내가 동시이면 current 톤 유지 — 보호자의 다음 액션이 시각의 무게중심.
          // 안내는 우측 칩 + 별도 카드로 보조 노출.
          bg: hasWarn ? C.warn : isDone ? C.sage : isCurr ? C.accent : hasInfo ? C.info : C.cardList,
          border: !hasWarn && !isDone && !isCurr && !hasInfo ? `1px solid rgb(var(--pm-ink-rgb) / .14)` : undefined,
          color: hasWarn || isDone || isCurr || hasInfo ? C.surface : C.ink3,
          // 노치는 이 배지가 놓인 카드 면(zone 카드, C.cardList)의 색으로 뚫어야 펀칭 효과가 난다.
          notchBg: C.cardList,
          children: hasWarn ? (
            <StormCloudIcon size={13} strokeWidth={2.3} label="주의" />
          ) : isDone ? (
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : isCurr ? (
            index + 1
          ) : hasInfo ? (
            <CloudIcon size={13} strokeWidth={2.3} label="안내" />
          ) : (
            index + 1
          ),
        })}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              // 동그라미(22px)와 같은 높이로 baseline center 정렬 — label 의 line-height
              // 를 22 로 맞춰 row 자체가 22 가 되도록.
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              minHeight: 22,
            }}
          >
            <div
              style={{
                fontSize: 16,
                lineHeight: '22px',
                // 제목은 주의·안내 무관하게 상태(진행/완료/예정)만 따른다 — 색·굵기 신호는
                // 배지 아이콘 + 우측 상태 라벨이 전담(2026-07-12 주의·안내 표시 전수 통일).
                color: isCurr ? C.ink : isDone ? C.ink2 : C.ink3,
                fontWeight: isCurr ? 600 : 500,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {s.label}
            </div>
            <div
              style={{
                ...monoCap,
                // 작은 글자는 accentInk — 밝은 accent 원색은 12px 대비가 모자란다.
                color: hasWarn ? C.warn : hasInfo ? C.info : isCurr ? C.accentInk : C.ink3,
                fontWeight: hasWarn ? 700 : hasInfo ? 600 : isCurr ? 700 : 500,
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              {hasWarn ? (
                '주의'
              ) : s.inProgress ? (
                '진행 중'
              ) : hasFutureDate ? (
                // 미래 날짜가 있으면 우측 칩은 '예정/마감 [날짜]'를 안내보다 우선 — advisory(추가
                // 백신 등)에 추가접종을 잡아둬도 '안내' 대신 잡아둔 예정일을 보여준다. (마감 라벨은
                // dateLabel 로 그대로 — 사전 신고 마감일 등.)
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 6,
                    // 연한 브랜드 틴트 + 진한 브랜드 글자 — 테두리 없이 면으로만(잔장식 정리).
                    background: C.soft,
                    color: C.accentInk,
                    fontWeight: 600,
                  }}
                >
                  {s.dateLabel ?? '예정'} {formatStageDate(s)}
                </span>
              ) : hasInfo ? (
                '안내'
              ) : showDeadlinePill ? (
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: isOverdueDeadline ? C.warnBg : C.soft,
                    color: isOverdueDeadline ? C.warn : C.accentInk,
                    fontWeight: 600,
                  }}
                >
                  마감 {formatStageDate(s)}
                </span>
              ) : isCurr ? (
                '예정'
              ) : (
                formatStageDate(s)
              )}
            </div>
          </div>
          {s.desc && (
            <div style={{ fontSize: 12, color: C.ink3, marginTop: 2, lineHeight: 1.4 }}>{s.desc}</div>
          )}
        </div>
      </Link>
    )
  }

  return (
    <div
      className="pm-fade-up pm-noscroll"
      style={{
        background: C.bg,
        color: C.ink,
        minHeight: '100%',
        // 섹션 리듬 32 (여백 중시 톤) / 라벨→콘텐츠 12. 하단은 nav 여백이 더해져 24 유지.
        paddingTop: PAGE_TOP,
        paddingBottom: 24,
        overflow: 'auto',
      }}
    >
      <div style={{ padding: '0 24px' }}>
        {/* Header */}
        <CaseHeader
          caseId={caseId}
          tab="journey"
          petName={pet.name}
          petNameEn={pet.nameEn}
          ink3={C.ink3}
        />

        {/* 상태 창 + 다음 할 일 카드 — 히어로를 둘로 분리(나안).
            상태 창: 사진(목적지 칩 + 날씨 칩 + D-day·출국일 오버레이) + 세그먼트 진행 바.
            다음 할 일: 별도 카드, 스텝 배지로 아래 타임라인과 연결.
            여정 완료 후에도 상태 창(사진)은 유지 — 원 설계(2026-06-02)대로 '다음 할 일'
            자리만 완료 배너로 바뀐다(리디자인 때 사진까지 가려지던 회귀를 복원, 2026-07-13). */}
          <>
          <div
            style={{
              marginTop: 32,
              borderRadius: 16,
              overflow: 'hidden',
              background: C.cardSoft,
              boxShadow: 'var(--pm-card-rim)',
            }}
          >
            {heroPhoto && (
              <div style={{ position: 'relative', height: 200 }}>
                {/* next/image — 화면 크기에 맞는 responsive 사이즈 자동 서빙 + priority 로
                    다른 리소스보다 먼저 받게 힌트 + blur placeholder 로 로딩 중 빈 카드 방지
                    (2026-07-17, 실기기 첫 로드 체감 지연 개선). */}
                <Image
                  key={heroPhoto}
                  src={heroPhoto}
                  alt=""
                  fill
                  priority
                  sizes="(min-width: 672px) 672px, 100vw"
                  placeholder={HERO_BLUR_PLACEHOLDERS[heroPhoto] ? 'blur' : 'empty'}
                  blurDataURL={HERO_BLUR_PLACEHOLDERS[heroPhoto]}
                  onClick={
                    HERO_TAP_SWITCHER && heroPhotoCandidates.length > 1
                      ? cycleHeroPhoto
                      : undefined
                  }
                  style={{
                    objectFit: 'cover',
                    objectPosition: HERO_PHOTO_POSITION[heroPhoto] ?? 'center',
                    cursor:
                      HERO_TAP_SWITCHER && heroPhotoCandidates.length > 1
                        ? 'pointer'
                        : undefined,
                  }}
                />
                {/* 사진 후보 여러 장 고르는 동안의 임시 리뷰용 — 탭하면 다음 후보로,
                    점으로 현재 위치 표시. 하나로 확정되면 후보를 1장으로 줄이고 함께 제거. */}
                {HERO_TAP_SWITCHER && heroPhotoCandidates.length > 1 && (
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      top: 14,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      display: 'flex',
                      gap: 4,
                      padding: '4px 8px',
                      borderRadius: 999,
                      background: 'rgba(0,0,0,.28)',
                    }}
                  >
                    {heroPhotoCandidates.map((_, i) => (
                      <span
                        key={i}
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: i === heroPhotoIndex ? '#FFFFFF' : 'rgba(255,255,255,.4)',
                        }}
                      />
                    ))}
                  </div>
                )}
                {/* 하단 한정 그라데이션 스크림 — '원본 밝기 유지' 원칙의 부분 양보(하단 76px).
                    흰 오버레이(D-day·진행 바)가 사진 밝기와 무관하게 항상 성립하게 한다.
                    빈 칸 색 단방향 실험(흰38%↔검22%)이 사진에 따라 서로 반대로 무너져 채택. */}
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 76,
                    background:
                      'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.34) 100%)',
                  }}
                />
                {multiDest ? (
                  <button
                    type="button"
                    onClick={() => setDestSheetOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={destSheetOpen}
                    aria-label="여행지 전환"
                    className="pm-pressable"
                    style={{
                      ...destChipStyle,
                      position: 'absolute',
                      // 인셋 16 — 하단 오버레이(left 16)와 좌측 라인 통일 + 카드 라운드(16)와 조화.
                      top: 14,
                      left: 16,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {trip.toCity}
                    <span style={{ opacity: 0.6 }}>
                      · {trip.tripType === 'round' ? '왕복' : '편도'}
                    </span>
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      style={{
                        flexShrink: 0,
                        transform: destSheetOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform .18s',
                      }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                ) : (
                  <span style={{ ...destChipStyle, position: 'absolute', top: 14, left: 16 }}>
                    {trip.toCity}
                    <span style={{ opacity: 0.6 }}>
                      · {trip.tripType === 'round' ? '왕복' : '편도'}
                    </span>
                  </span>
                )}
                {/* 날씨 칩 — 여행지 하늘에 뜬 오늘의 날씨. 주의(뇌우)·안내(구름)가 있으면
                    우상단에 요약 칩만(내용은 탭 → 해당 단계 or 바텀시트).
                    여정 완료 후엔 둘 다 숨김(2026-07-12 사용자 확정) — 완료 화면은 도장에 집중. */}
                {!complete && (warnItems.length > 0 || infoStages.length > 0) && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 14,
                      right: 16,
                      display: 'flex',
                      gap: 6,
                    }}
                  >
                    {warnItems.length > 0 && (
                      <button
                        type="button"
                        onClick={onWarnChip}
                        className="pm-pressable"
                        aria-label={`주의 ${warnItems.length}건 보기`}
                        style={{
                          ...destChipStyle,
                          gap: 5,
                          // 사진 위 칩은 테마 무관 고정(destChipStyle 관례) — 다크의 밝은
                          // warn(#FACC15)이 흰 칩 위에서 씻기지 않게 라이트 값을 하드코딩.
                          color: '#EAB308',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <StormCloudIcon size={13} />
                        주의 {warnItems.length}
                      </button>
                    )}
                    {infoStages.length > 0 && (
                      <button
                        type="button"
                        onClick={onInfoChip}
                        className="pm-pressable"
                        aria-label={`안내 ${infoStages.length}건 보기`}
                        style={{
                          ...destChipStyle,
                          gap: 5,
                          // 사진 위 칩 고정 색 — info 라이트 값(맑은 슬레이트).
                          color: '#4B8CBF',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <CloudIcon size={13} />
                        안내 {infoStages.length}
                      </button>
                    )}
                  </div>
                )}
                {/* 하단 오버레이(나-2 확정) — 진행 바까지 사진 안으로.
                    스크림 대신 옅은 텍스트 섀도 — 밝은 사진에서도 읽히되 원본 밝기는 유지. */}
                <div
                  style={{
                    position: 'absolute',
                    left: 16,
                    right: 16,
                    bottom: 12,
                    textShadow: '0 1px 14px rgba(0,0,0,.45)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: 8,
                    }}
                  >
                    {complete ? (
                      // 완료 후엔 카운트업 대신 상태 문구(2026-07-12 사용자 확정 ②안).
                      <span style={{ ...serif, fontSize: 30, lineHeight: 1, color: '#FFFFFF' }}>
                        여정 완료
                      </span>
                    ) : (
                      ringStatus && (
                        <span style={{ ...serif, fontSize: 30, lineHeight: 1, color: '#FFFFFF' }}>
                          {ringStatus}
                        </span>
                      )
                    )}
                    <span
                      style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.92)' }}
                    >
                      {/* 완료 미리보기(demo)는 단계 데이터가 그대로라 카운트·바를 가득 채워
                          실제 완료 모습으로 보정한다(실제 완료는 원래 전부 done). */}
                      {[departText, `${demoComplete ? total : done}/${total}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 3, marginTop: 9 }}>
                      {stages.map((s) => (
                        <span
                          key={s.id}
                          aria-hidden
                          style={{
                            flex: 1,
                            height: 5,
                            borderRadius: 2,
                            // 하단 스크림이 바닥을 어둡게 보장 — 흰 채움/흰 반투명 빈 칸이
                            // 사진 밝기와 무관하게 성립한다.
                            background:
                              s.state === 'done' || demoComplete
                                ? '#FFFFFF'
                                : 'rgba(255,255,255,.42)',
                          }}
                        />
                      ))}
                  </div>
                </div>
                {/* 도착 도장 — 여정 완료 시 사진에 여권 스탬프처럼 직접 찍는다(별도 완료
                    배너 대체). 칩(상단)과 하단 오버레이 사이 우측, 살짝 기울인 이중 링. */}
                {complete && (
                  <div
                    aria-label="여정 완료"
                    role="img"
                    style={{
                      position: 'absolute',
                      top: 20,
                      right: 18,
                      width: 96,
                      height: 96,
                      borderRadius: '50%',
                      border: '2.5px solid rgba(255,255,255,.85)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transform: 'rotate(-11deg)',
                      color: '#FFFFFF',
                      filter: 'drop-shadow(0 1px 8px rgba(0,0,0,.3))',
                    }}
                  >
                    <div
                      style={{
                        width: 82,
                        height: 82,
                        borderRadius: '50%',
                        border: '1px solid rgba(255,255,255,.65)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                        textAlign: 'center',
                      }}
                    >
                      {/* 왕복의 완료 = 한국 귀국 — 목적지 사진 위 '도착'은 뜻이 어긋나 '귀국'으로.
                          편도(이주)만 '도착'. (2026-07-12 사용자 지적) */}
                      <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.04em' }}>
                        {trip.tripType === 'round' ? '귀국' : '도착'}
                      </span>
                      <span style={{ fontSize: 10, letterSpacing: '0.22em', fontWeight: 600 }}>
                        {trip.tripType === 'round' ? 'RETURNED' : 'ARRIVED'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 본문(세그먼트 바) — 나-2(풀 포토, 사진 있음)에선 바가 사진 안으로
                들어가 본문이 없다. 사진 없는 목적지만 본문 세그먼트 바를 그린다. */}
            {!heroPhoto && (
            <div style={{ padding: heroPhoto ? '14px 18px 16px' : '16px 18px' }}>
              {/* 사진 없으면 목적지·D-day 를 본문 첫 줄에 — 사진의 칩·오버레이 대체.
                  날씨 칩도 같은 줄 우측에(사진판과 동일 역할, 카드 위라 틴트 필 스타일). */}
              {!heroPhoto && (
                <div
                  style={{
                    marginBottom: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  {multiDest ? (
                    <button
                      type="button"
                      onClick={() => setDestSheetOpen(true)}
                      aria-haspopup="dialog"
                      aria-expanded={destSheetOpen}
                      aria-label="여행지 전환"
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: C.ink2,
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        fontFamily: 'inherit',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: 'pointer',
                      }}
                    >
                      {trip.toCity}
                      {!complete && ringStatus ? ` · ${ringStatus}` : ''}
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                        style={{
                          flexShrink: 0,
                          transform: destSheetOpen ? 'rotate(180deg)' : 'none',
                          transition: 'transform .18s',
                        }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.ink2 }}>
                      {trip.toCity}
                      {!complete && ringStatus ? ` · ${ringStatus}` : ''}
                    </span>
                  )}
                  {!complete && (warnItems.length > 0 || infoStages.length > 0) && (
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {warnItems.length > 0 && (
                        <button
                          type="button"
                          onClick={onWarnChip}
                          className="pm-pressable"
                          aria-label={`주의 ${warnItems.length}건 보기`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '4px 10px',
                            borderRadius: 999,
                            border: 'none',
                            background: C.warnBg,
                            color: C.warn,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          <StormCloudIcon size={13} />
                          주의 {warnItems.length}
                        </button>
                      )}
                      {infoStages.length > 0 && (
                        <button
                          type="button"
                          onClick={onInfoChip}
                          className="pm-pressable"
                          aria-label={`안내 ${infoStages.length}건 보기`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '4px 10px',
                            borderRadius: 999,
                            border: 'none',
                            background: C.infoBg,
                            color: C.info,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          <CloudIcon size={13} />
                          안내 {infoStages.length}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* 준비 진행 세그먼트 바 — 일정 1개 = 1칸, 아래 타임라인의 축소판. */}
              <div style={{ display: 'flex', gap: 3 }}>
                {stages.map((s) => (
                  <span
                    key={s.id}
                    aria-hidden
                    style={{
                      flex: 1,
                      height: 6,
                      borderRadius: 2,
                      background:
                        s.state === 'done' || demoComplete
                          ? C.accent
                          : 'rgb(var(--pm-ink-rgb) / .08)',
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 12, color: complete ? C.sage : C.ink3, fontWeight: complete ? 600 : 400 }}>
                  {complete ? '여정 완료' : '진행률'}
                </span>
                <span style={{ ...num, fontSize: 12, color: C.ink }}>
                  {demoComplete ? total : done}/{total}
                </span>
              </div>
            </div>
            )}
          </div>

          {/* 다음 할 일 카드 — 상태 창과 분리. 스텝 배지가 아래 타임라인 번호와 연결.
              여정 완료 후엔 이 자리를 완료 배너가 대신한다. */}
          {!complete && nextStages.length > 0 && (
            <div
              style={{
                marginTop: 10,
                borderRadius: 16,
                background: C.cardSoft,
                boxShadow: 'var(--pm-card-rim)',
                padding: '15px 18px',
              }}
            >
              {nextStages.length > 0 && (
                <>
                  <Link
                    href={stageHref(nextStages[0])}
                    className="pm-pressable"
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <span style={{ marginTop: 1 }}>
                      {renderTicketBadge({
                        height: 27,
                        fontSize: 13,
                        fontWeight: 600,
                        bg: C.accent,
                        color: '#FFFFFF',
                        // 이 배지는 다음 할 일 카드(C.cardSoft) 위에 놓인다 — 노치는 그 배경색으로.
                        notchBg: C.cardSoft,
                        children: nextStageNo,
                      })}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.ink3 }}
                      >
                        다음 할 일
                      </span>
                      <h3
                        style={{
                          ...serif,
                          margin: '2px 0 0',
                          fontSize: 19,
                          lineHeight: 1.2,
                          color: C.ink,
                          fontWeight: 500,
                          textWrap: 'balance' as React.CSSProperties['textWrap'],
                        }}
                      >
                        {nextStages[0].label}
                      </h3>
                      {(nextStages[0].cardDesc ?? nextStages[0].desc) && (
                        <p
                          style={{
                            margin: '5px 0 0',
                            fontSize: 13,
                            lineHeight: 1.55,
                            color: 'rgb(var(--pm-ink-rgb) / .65)',
                          }}
                        >
                          {nextStages[0].cardDesc ?? nextStages[0].desc}
                        </p>
                      )}
                      {nextStages[0].infoMessage &&
                        ((nextStages[0].infoChecks ?? 0) > 0 || nextStages[0].advisory) &&
                        nextStages[0].infoMessage !== (nextStages[0].cardDesc ?? nextStages[0].desc) && (
                          <p
                            style={{
                              margin: '8px 0 0',
                              fontSize: 13,
                              lineHeight: 1.55,
                              color: C.info,
                              whiteSpace: 'pre-line',
                            }}
                          >
                            {nextStages[0].infoMessage}
                          </p>
                        )}
                    </span>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ color: C.ink3, flexShrink: 0, marginTop: 7 }}
                      aria-hidden
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </Link>
                  {/* 이어서 — 둘째 할 일부터는 압축 행. */}
                  {nextStages.slice(1).map((stage) => (
                    <Link
                      key={stage.id}
                      href={stageHref(stage)}
                      className="pm-pressable"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: `.5px solid ${C.line}`,
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.ink2 }}>
                        {stage.label}
                      </span>
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ color: C.ink3, flexShrink: 0 }}
                        aria-hidden
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </Link>
                  ))}
                </>
              )}

            </div>
          )}
          </>

        {/* 주의·안내 목록 바텀시트 — 날씨 칩이 여러 건일 때 연다. 항목 구조는 상세 카드와
            동일(제목+본문), 단계 항목은 탭하면 해당 단계로 이동. */}
        <BottomSheet open={warnSheetOpen} onClose={() => setWarnSheetOpen(false)} title="주의">
          <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 8 }}>
            {warnItems.map((item, i) => {
              const body = (
                <>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{item.title}</div>
                  {item.message && (
                    <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.55, color: C.ink2 }}>
                      {item.message}
                    </p>
                  )}
                </>
              )
              const rowStyle: React.CSSProperties = {
                display: 'block',
                textAlign: 'left',
                padding: '14px 4px',
                borderTop: i === 0 ? 'none' : `.5px solid ${C.line}`,
                textDecoration: 'none',
                color: 'inherit',
              }
              return item.href ? (
                <Link
                  key={item.id}
                  href={item.href}
                  className="pm-pressable"
                  style={rowStyle}
                  onClick={() => setWarnSheetOpen(false)}
                >
                  {body}
                </Link>
              ) : (
                <div key={item.id} style={rowStyle}>
                  {body}
                </div>
              )
            })}
          </div>
        </BottomSheet>
        <BottomSheet open={infoSheetOpen} onClose={() => setInfoSheetOpen(false)} title="안내">
          <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 8 }}>
            {infoStages.map((s, i) => (
              <Link
                key={s.id}
                href={stageHref(s)}
                className="pm-pressable"
                style={{
                  display: 'block',
                  textAlign: 'left',
                  padding: '14px 4px',
                  borderTop: i === 0 ? 'none' : `.5px solid ${C.line}`,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
                onClick={() => setInfoSheetOpen(false)}
              >
                <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{s.label}</div>
                {s.infoMessage && (
                  <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.55, color: C.ink2 }}>
                    {s.infoMessage}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </BottomSheet>

        {/* 목적지 전환 바텀시트 — 히어로 목적지 칩(다목적지)에서 연다. UI 는 헤더 시절과 동일. */}
        {multiDest && (
          <BottomSheet
            open={destSheetOpen}
            onClose={() => setDestSheetOpen(false)}
            title="여행지"
          >
            <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 4 }}>
              {destTokens.map((t) => {
                const isActive = t === activeDestResolved
                const arrow = (tripTypeByDest[t] ?? 'round') === 'round' ? '⇄' : '→'
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => selectDest(t)}
                    aria-pressed={isActive}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      width: '100%',
                      padding: '15px 0',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '.5px solid var(--pm-line)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 16,
                        color: isActive ? C.ink : C.ink2,
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      <span>{trip.fromCity}</span>
                      <span style={{ color: C.ink3 }}>{arrow}</span>
                      <span>{t}</span>
                    </span>
                    {isActive && (
                      <svg
                        width="17"
                        height="17"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={C.ink}
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                        style={{ flexShrink: 0 }}
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          </BottomSheet>
        )}

        {/* 여정 완료 — 별도 배너 없이 히어로 사진에 도착 도장을 직접 찍는다(2026-07-12
            사용자 확정, 중복 제거). 경로=목적지 칩, 기간=좌하단 날짜가 이미 담당.
            아래엔 소감 카드와 '여정 마무리하기'만 남는다. */}
        {complete && (
          <>
          {/* 소감 카드 — 버튼 대신 만족도 얼굴 5개를 카드에 직접(원탭 = 첫 답변, 2026-07-12
              사용자 확정). 얼굴은 의견 페이지와 같은 모노톤 라인 얼굴, 좋은 순. 탭하면 그
              만족도가 선택된 채(?rating=) 의견 페이지가 열려 글은 선택으로 잇는다.
              이미 남긴 만족도가 있으면 그 얼굴만 하늘 틴트로 표시. */}
          <div
            style={{
              marginTop: 14,
              padding: 22,
              borderRadius: 16,
              background: C.cardSoft,
              boxShadow: 'var(--pm-card-rim)',
            }}
          >
            <h3
              style={{
                ...serif,
                margin: 0,
                fontSize: 18,
                lineHeight: 1.25,
                color: 'var(--pm-ink)',
                fontWeight: 500,
                textWrap: 'balance' as React.CSSProperties['textWrap'],
              }}
            >
              {withWaGwa(pet.name)}의 여정, 어떠셨나요?
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: C.ink3 }}>
              얼굴을 눌러 알려주세요
            </p>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                marginTop: 16,
                maxWidth: 320,
              }}
            >
              {FACES.map((f) => {
                // 기본 = '아주 좋아요' 선택 표시(2026-07-12 사용자 확정) — 이미 남긴
                // 만족도가 있으면 그 얼굴로 대체. 페이지의 기본 선택(initialShown)과 짝.
                const selected = (savedRating ?? 5) === f.level
                return (
                  <Link
                    key={f.level}
                    href={`/cases/${caseId}/feedback?dest=${encodeURIComponent(trip.toCity)}&rating=${f.level}`}
                    className="pm-pressable"
                    aria-label={f.label}
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: selected ? C.accent : C.ink3,
                      background: selected ? C.soft : 'transparent',
                    }}
                  >
                    <FaceIcon level={f.level} size={38} />
                  </Link>
                )
              })}
            </div>
          </div>

          {/* 여정 마무리하기 — 다중 목적지 중 이 여정이 완료됐을 때만. 누르면 '지난 여정'으로
              내리고 다른 진행 중 여정으로 전환. 소감은 내리기 전(위 카드)에 남긴다. design §6. */}
          {canFinishJourney && (
            <div
              style={{
                marginTop: 14,
                padding: 20,
                borderRadius: 16,
                background: C.cardSoft,
                boxShadow: 'var(--pm-card-rim)',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: C.ink2,
                }}
              >
                이 여정을 마무리하면 <b style={{ color: C.ink }}>지난 여정</b>으로 정리되고, 진행
                중인 다른 여정으로 넘어가요.
              </p>
              <button
                type="button"
                onClick={onFinishJourney}
                disabled={finishing}
                className="pm-pressable"
                style={{
                  marginTop: 14,
                  width: '100%',
                  padding: '12px 0',
                  borderRadius: 14,
                  border: `.5px solid color-mix(in srgb, var(--pm-sage) 45%, transparent)`,
                  background: 'var(--pm-surface)',
                  color: 'var(--pm-ink)',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: '-0.005em',
                  cursor: finishing ? 'default' : 'pointer',
                  opacity: finishing ? 0.6 : 1,
                }}
              >
                {finishing ? '마무리하는 중…' : '여정 마무리하기'}
              </button>
            </div>
          )}
          </>
        )}

        {/* 단계 리스트 — 한국(출국 준비)·일본·한국(귀국) 구간별 카드 + 카드 안 세로
            레일(타임라인). 카드 없는 버전과 비교 중 (2026-07-11). */}
        <h3 style={{ ...sectionTitle, margin: '32px 0 12px' }}>준비 단계</h3>
        {stageZones.flatMap((zone, zi) => {
          const list = (
            <div
              key={`zone-${zi}`}
              style={{
                background: C.cardList,
                borderRadius: 16,
                boxShadow: 'var(--pm-card-rim)',
                padding: '4px 16px',
              }}
            >
              {zone.rows.map(({ stage, index }, k) =>
                renderStageRow(stage, index, {
                  first: k === 0,
                  last: k === zone.rows.length - 1,
                  prevDone: k > 0 && zone.rows[k - 1].stage.state === 'done',
                }),
              )}
            </div>
          )
          // caption 이 있는 구간(일본·귀국)은 '이동' 노드로 잇는다 — 단계 동그라미들과
          // 같은 세로축에 비행기 아이콘, 옆에 캡션. 소제목이 아니라 여정 경로 위에서
          // 실제로 건너가는 마디로 읽히도록.
          if (!zone.caption) return [list]
          return [
            <div
              key={`zone-${zi}-cap`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                margin: '24px 0',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 22,
                  height: 22,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: C.ink3,
                }}
              >
                {/* 통통한 비행기 — 각진 픽토그램 대신 둥근 조인트·두툼한 몸통 실루엣(iOS 계열).
                    크기는 15 유지, 살짝 들린 기수로 이륙 느낌. */}
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 512 512"
                  fill="currentColor"
                  style={{ transform: 'rotate(-18deg)' }}
                >
                  <path d="M186.62 464H160a16 16 0 0 1-14.57-22.6l64.46-142.25L113.1 297l-35.3 42.77C71.07 348.23 65.7 352 52 352H34.08a17.66 17.66 0 0 1-14.7-7.06c-2.38-3.21-4.72-8.65-2.44-16.41l19.82-71c.15-.53.33-1.06.53-1.58a.38.38 0 0 0 0-.15 14.82 14.82 0 0 1-.53-1.59l-19.84-71.45c-2.15-7.61.2-12.93 2.56-16.06a16.83 16.83 0 0 1 13.6-6.7H52c10.23 0 20.16 4.59 26 12l34.57 42.05 97.32-1.44-64.44-142A16 16 0 0 1 160 48h26.91a25 25 0 0 1 19.35 9.8l125.05 152 57.77-1.52c4.23-.23 15.95-.31 18.66-.31C463 208 496 225.94 496 256c0 9.46-3.78 27-29.07 38.16-14.93 6.6-34.85 9.94-59.21 9.94-2.68 0-14.37-.08-18.66-.31l-57.76-1.54-125.36 152a25 25 0 0 1-19.32 9.75z" />
                </svg>
              </span>
              {/* 구간 caption = 라벨 위계로 통일(2026-07-13) — 보호자·알림과 같은 groupLabel(ink3).
                  이전엔 이 캡션만 ink2 로 진했음(색 불일치). 비행기 아이콘은 장식이라 ink3 유지. */}
              <span style={groupLabel}>{zone.caption}</span>
            </div>,
            list,
          ]
        })}
      </div>
    </div>
  )
}

function formatDDay(daysLeft: number | null): string | null {
  if (daysLeft == null) return null
  if (daysLeft > 0) return `D-${daysLeft}`
  if (daysLeft === 0) return 'D-DAY'
  return `D+${-daysLeft}`
}

function formatStageDate(stage: JourneyStage): string {
  if (!stage.date) return '—'
  // 'YYYY-MM-DD' → 항상 'YY·MM·DD'. 연도가 같든 다르든 일관 표기.
  const parts = stage.date.split('-')
  if (parts.length !== 3) return '—'
  const [yyyy, mm, dd] = parts
  return `${yyyy.slice(2)}·${mm}·${dd}`
}

/** 주어진 YYYY-MM-DD 가 오늘 이후(내일~)인지. 디바이스 로컬 기준. */
function isFuture(iso: string | null): boolean {
  if (!iso) return false
  const d = new Date()
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return iso > today
}

/** 한글 단어에 '으로/로' 조사를 붙인다 — 받침 없음·ㄹ받침은 '로', 그 외는 '으로'. */
function withRo(word: string): string {
  const last = word.charCodeAt(word.length - 1)
  if (Number.isNaN(last) || last < 0xac00 || last > 0xd7a3) return `${word}로`
  const jong = (last - 0xac00) % 28
  return jong === 0 || jong === 8 ? `${word}로` : `${word}으로`
}
