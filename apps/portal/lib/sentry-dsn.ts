/**
 * Sentry DSN (petmove/portal 프로젝트) — 코드에 폴백으로 둔다.
 *
 * DSN 은 비밀이 아니다 — 클라이언트 번들에 원래 노출되는 값이고(이벤트 수신 주소일 뿐,
 * 읽기 권한이 없다), admin 처럼 Vercel 환경변수로 관리하려면 대시보드 접근이 필요해서
 * 배포 파이프라인(GitHub Actions → vercel deploy)만으로 굴러가도록 폴백을 코드에 박는다.
 * 환경변수(NEXT_PUBLIC_SENTRY_DSN / SENTRY_DSN)가 설정되면 그쪽이 우선.
 */
export const SENTRY_DSN_FALLBACK =
  'https://e1527c93549fbfea5c296a6486744ce4@o4511279538372609.ingest.us.sentry.io/4511833337495552'
