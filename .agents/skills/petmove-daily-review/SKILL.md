---
name: petmove-daily-review
description: 로잔동물의료센터 정기 실무 점검에서 검사·신고·서류, 일본 메일과 중단 지시, 검사결과 안내 할 일을 확인하고 누락 검증을 통과한 보고를 만든다. 매일 점검·오늘 실무 점검·세 탭 전체 확인에 사용한다.
---

# 정기 실무 점검

시작 전 저장소 `AGENTS.md`, [업무 구조](../../../docs/work-management/README.md), [실무 운영 기준](../../../docs/work-management/operations.md), [기기·공유 이력](../../../docs/laptop-daily-check-handoff.md)을 읽는다. 업무 PC 월·화·수·금·토 10:30 한국 시간이며 노트북은 명시적 수동 요청만 수행한다.

[세 탭 실행·누락 검증 절차](../petmove-inspection-check/references/daily-three-tabs.md)를 끝까지 수행한다. 임시 선별 요약을 새로 만들지 않고 `scripts/daily-review.mjs`를 사용한다. 현재 UI 조회 함수의 빌드가 실패하면 조회 경로 오류로 보고하고 부분 목록으로 완료하지 않는다.

업무 판단은 [검사](../petmove-inspection-check/SKILL.md), [일본 신고·메일·Form AC](../petmove-japan-naccs/SKILL.md), [결과 안내](../petmove-kakao-results/SKILL.md)를 해당 단계에서 읽는다. 신규 포괄 제출 권한을 만들지 않으며 **기존에 유효하게 지시받은 미완료 작업은 재개 대상으로 추적**한다.

출국 0~14일 전 내원일 미등록, 내원 0~7일 서류 준비 미완료, 검사 5일 이상 waiting, 현재 경고·오류·중단 지시는 필수 보고다. 기보고·새 메일 없음으로 생략하지 않는다. 한국 출국일이 지나도 귀국 전 수출검역을 포함한다.

내원 미예약은 [예약 요청 안내](references/visit-booking.md)의 기존 채팅방·문구를 준비하고 **사용자가 문구를 확인한 뒤 발송**한다. 실제 발송과 내원 예약 등록을 구분해 중복 요청을 막는다.

`render` → 공유 원본 저장·재조회 → `complete`가 통과하기 전에는 전체 완료라고 하지 않는다. 달력 성공 기록도 현재 실행의 `--review-dir` 검증이 필요하다. 최종 사용자 메시지에는 생성된 `report.private.md`의 모든 필수 행을 사용한다. 조용히 끝내는 것은 검증된 필수 보고·변화가 없을 때만 가능하다. 지침 변경 자체는 고객 일괄 실행 지시가 아니다.
