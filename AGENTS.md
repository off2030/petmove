# 펫무브 업무 스킬

이 저장소의 펫무브 업무 지침은 `.agents/skills/`에서 관리한다. 관련 업무를 요청받으면 해당 `SKILL.md`와 필요한 참조 문서를 읽는다.

- 고객 문의를 네이버 블로그 초안으로 작성: `.agents/skills/petmove-naver-post/SKILL.md`
- 카카오톡에서 블로그용 문의를 선별해 로컬 텍스트로 저장: `.agents/skills/petmove-kakao-inquiries/SKILL.md`
- 일본 NACCS 수입 사전신고·수입검사·수출검역·신고 수정: `.agents/skills/petmove-japan-naccs/SKILL.md`
- 검사기관 신청 대조·검사 신청: `.agents/skills/petmove-inspection-check/SKILL.md`

같은 이름의 개인 스킬이 있으면 이 저장소의 버전을 사용한다. 펫무브 업무 스킬 수정도 저장소 버전에 반영하여 Git으로 공유한다. 확인·초안 요청을 신청 제출 권한으로 해석하지 말고 각 스킬의 업무 범위를 따른다.

검사 조회는 저장소 루트에서 `node scripts/inspection-lookup.mjs <동물이름>`으로 실행한다. 체크아웃 위치를 `C:\dev\petmove`로 고정하지 않는다. 이 스크립트의 데이터베이스 조회는 읽기 전용으로 유지한다.

다른 PC에서는 저장소를 pull한 뒤 이 저장소를 Codex 프로젝트로 연다. 스킬이 표시되지 않으면 Codex를 재시작한다. Node.js와 프로젝트 의존성, Chrome 연결 및 기관 로그인은 각 PC에서 준비한다. 검사 조회용 환경변수는 기존 스크립트가 읽는 `.env.local` 또는 프로세스 환경변수로 별도 설정한다. 비밀키, 로그인 정보, 고객 첨부파일은 스킬에 넣거나 Git에 추가하지 않는다.
