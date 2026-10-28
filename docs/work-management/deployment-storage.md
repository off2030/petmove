# Vercel 배포 저장공간 관리

2026-10-28 petmove 팀의 최근 30일 Usage 표시값은 Deployment Storage 10.68GB였으며 홈페이지 7.53GB, 보호자 앱 2.93GB, 펫무브워크 218.75MB였다. 이 값은 배포 산출물의 보관량을 집계한 것이며 고객 DB·첨부파일 용량과 다르다.

## 보관 정책

세 프로젝트(`petmove-www`, `petmove`, `petmovework`)에 개별 적용했다.

| 종류 | 보관기간 |
| --- | --- |
| Production | 1주 |
| Pre-Production, Errored, Canceled | 1일 |

실제 설정 위치는 각 프로젝트 Settings → Build and Deployment → Deployment Retention Policy다. 다른 프로젝트 및 팀 기본값은 바꾸지 않았다. Vercel 정책은 운영 alias가 연결된 배포 및 Hobby의 최근 정상 Production 배포 3개를 자동 정리에서 제외한다. 따라서 장기간 배포가 없어도 현재 운영본과 최근 복구용 버전은 보존된다. 별도 일괄 삭제 작업은 사용하지 않는다.

보관기간 만료 후 정리와 Usage 집계에는 지연이 있다. 30일 집계값이 즉시 0으로 떨어지는 것으로 판단하지 않는다. 확인할 때 같은 기간과 프로젝트로 Deployment Storage와 Functions Storage를 함께 비교한다.

## 배포 경로

세 앱은 `.github/workflows/deploy-{admin,portal,www}.yml`의 GitHub Actions로 배포한다. 홈페이지에 남아 있던 Vercel Git 연결을 해제하여 이중 배포와 문서만 변경한 배포를 중단했다. Git 연결을 다시 켜면 Actions와 중복되지 않는지 먼저 확인한다.

홈페이지의 공유 런타임 코드는 `@petmove/domain/transport-partners` 하나다. 독립 export와 해당 파일만 배포 조건에 포함하므로 신고·검사·증명서 로직만 바뀌면 홈페이지는 배포되지 않는다. 새 공유 코드를 홈페이지에 추가할 때 관련 전이 의존성도 배포 조건에 반영한다. `node scripts/check-deployment-scopes.mjs`가 누락을 막는다. 보호자 앱과 펫무브워크가 함께 쓰는 도메인·인증·UI 변경은 두 앱 모두 배포해야 한다.

## 홈페이지 이미지

큰 PNG 20개를 무손실 WebP로 변환했다. 해상도·알파·디코딩 픽셀을 원본과 대조하며, 기존 이미지 주소는 308 리디렉션으로 유지한다. 내부 참조는 새 주소를 직접 사용한다. 원본은 Git 이력에서 복구할 수 있다.

변환 전후 `apps/www/public` 전체 파일 합계는 92,128,794 → 64,003,364바이트(30.5% 감소)다. 이는 로컬 정적 파일 측정값이며 Vercel의 전체 배포 용량과 동일한 수치는 아니다. `node scripts/check-www-assets.mjs`가 70MB 예산·호환 주소·파일 존재 여부를 검사한다. 추가 이미지가 필요하면 예산을 무조건 늘리지 않고 압축 가능한 파일을 먼저 점검한다.

새 PNG 최적화는 `node scripts/optimize-www-images.mjs`로 예상 결과를 확인하고 `--apply`로 적용한다. 이후 생성된 `apps/www/data/optimized-image-redirects.json`에 따라 내부 참조를 갱신하고 검사·빌드·이미지 표시를 확인한다.

공식 근거: [배포 보관 정책](https://vercel.com/docs/deployment-retention), [저장공간 최적화](https://vercel.com/docs/deployment-storage/optimize).
