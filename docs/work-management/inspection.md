# 검사

검사 의뢰·기관 접수 대조·진행 상황·결과 확인·검사결과 고객 안내를 맡는다. 공통 권한과 공식 상태는 [실무 운영 기준](operations.md)을 따른다.

| 업무 | 사용할 스킬 |
| --- | --- |
| 검사 의뢰, 신청서 대조, 기관 진행 확인 | [검사 실무](../../.agents/skills/petmove-inspection-check/SKILL.md) |
| 결과지 원본 대조, 고객 안내 할 일, 지시받은 결과 발송 | [검사결과 안내](../../.agents/skills/petmove-kakao-results/SKILL.md) |
| KSVDL 청구 대조·결제 준비·승인 범위 결제 | [검사비](../../.agents/skills/petmove-ksvdl-payment/SKILL.md) |
| 카카오 검사 자료 보관·요청한 회차 정보 입력 | 필요할 때 [자료 보관·입력](../../.agents/skills/petmove-kakao-documents/SKILL.md) |

이름으로 조회할 때는 저장소 루트에서 `node scripts/inspection-lookup.mjs <동물이름>`을 사용하고 조직·동물·검사 종류·회차를 확정한다. 결과 완료의 실제 근거와 고객에게 알렸는지는 각각 확인한다.

검사 서류가 일본 신고에 쓰이더라도 검사 신청·결과 확인은 이 담당이다. 일본 신고 담당에는 해당 여행에 사용할 원본 위치·회차·확인 근거와 남은 자료를 넘긴다. 검사자료를 보관하기만 하는 요청은 서류 및 기타가 맡을 수 있지만, 같은 회차를 두 채팅에서 동시에 수정하지 않는다.

정기 점검도 이 담당 채팅에서 [점검 스킬](../../.agents/skills/petmove-daily-review/SKILL.md)의 `--scope inspection`으로 수행한다. inspectionMail·resultNotices의 실제 검토와 검사 담당 전체 대상의 누락 검증을 통과해 보고한다. 명시적 수동 세 탭 전체 점검만 `--scope all`을 사용한다.
