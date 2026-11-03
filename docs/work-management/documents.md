# 서류 및 기타

수신 서류·사진 대조와 보관, 요청한 정보 입력, 일반 증명서 준비·출력, 내원·서류 준비 안내와 검사·일본 신고에 속하지 않는 실무를 맡는다. 시작점은 [서류 및 기타 스킬](../../.agents/skills/petmove-documents/SKILL.md), 공통 권한은 [실무 운영 기준](operations.md)이다.

| 업무 | 적용 절차 |
| --- | --- |
| 카카오 수신 자료 대조·다운로드·Work 보관, 요청한 값 입력 | [자료 보관·입력](../../.agents/skills/petmove-kakao-documents/SKILL.md) |
| 일반 증명서·서류 준비·출력 | 현재 Work·첨부 원본과 저장소의 기존 서식·PDF 생성 함수를 대조 |
| 내원 예약 필요·서류 준비 미완료, 지시받은 고객 안내 | [예약 요청 안내](../../.agents/skills/petmove-daily-review/references/visit-booking.md)와 공통 권한 |
| 일본 외 국가의 서류·기관 요청 | 국가·기관·작업을 확정하고 현재 공식 절차를 확인. 일본 스킬을 임의 전용하지 않음 |

검사 의뢰·진행·검사결과 판정 및 결과 안내는 [검사](inspection.md), 일본 검역소 회신·Form AC 제출·일본 수입/수출 신청은 [일본 수입신고](japan.md)가 맡는다. 일반 자료 보관을 검사·신고 완료로 처리하지 않는다.

여러 업무가 섞이면 현재 요청의 산출물을 기준으로 담당을 정한다. 자료 수신·보관은 이 담당, 그 자료를 이용한 기관 제출은 해당 담당이 맡으며 원본 위치와 대조 근거를 이어받는다. 기능 오류·개선은 [개발](development.md), 블로그 글은 [콘텐츠](content.md)로 구분한다.

정기 점검은 이 채팅에서 [점검 스킬](../../.agents/skills/petmove-daily-review/SKILL.md)의 `--scope documents`로 수행하며 documentSources·visitBookings의 실제 검토와 서류 및 기타 담당 전체 대상의 누락 검증을 통과해 보고한다. 일본 여행의 일반 내원·최종 서류 준비도 여기서 확인하되 검역소 Form AC 제출을 중복 실행하지 않는다.
