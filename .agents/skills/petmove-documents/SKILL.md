---
name: petmove-documents
description: 펫무브워크의 일반 서류 준비·출력, 수신 자료 보관·요청한 정보 입력, 내원 안내와 기타 실무를 처리한다. 검사 의뢰·진행·결과 안내 및 일본 수입·수출 신고는 각 담당 스킬을 사용한다.
---

# 서류 및 기타

[담당 범위](../../../docs/work-management/documents.md)와 [실무 운영 기준](../../../docs/work-management/operations.md)을 적용한다. 이 스킬은 서류 및 기타 담당 채팅의 진입점이며 공통 권한을 확대하지 않는다.

## 작업 선택

- 카카오 서류·사진 대조·보관과 요청한 구조화 정보 입력: [자료 스킬](../petmove-kakao-documents/SKILL.md).
- 일반 증명서 준비·출력: 현재 조직·동물·여행을 직접 조회하고 기존 원본과 생성 서식을 대조한다. 기존 `apps/admin/lib/actions/generate-pdf.ts`와 `pdf-fill.ts`의 실제 옵션·출력 기준을 확인한다. 임상 진찰·정부 확인·서명을 초안에 지어 넣지 않는다. 서류 생성·검토·최종 발급·고객 전달을 구분한다.
- 내원 예약 안내: [예약 요청 절차](../petmove-daily-review/references/visit-booking.md). 단순 안내 작성과 실제 발송을 구분한다.
- 일본 외 국가 실무: 해당 국가·기관·요청 작업과 현재 공식 근거를 먼저 확정한다. 지원 절차가 없으면 확인된 준비 범위와 남은 자료·판단을 보고한다.

검사기관 신청·진행·결과 확인은 [검사](../petmove-inspection-check/SKILL.md), 일본 NACCS·검역소 회신·일본 제출용 Form AC는 [일본 신고](../petmove-japan-naccs/SKILL.md)로 연결한다. 전체 정기 점검은 [정기 점검](../petmove-daily-review/SKILL.md)을 사용한다.

담당 간 원본을 복제해 별도 공식 상태를 만들지 않는다. 같은 자료·회차를 다른 채팅이 처리 중인지 공유 이력에서 확인하고, 인계에는 원본 위치·확인 근거·남은 행동·권한·기한을 남긴다.
