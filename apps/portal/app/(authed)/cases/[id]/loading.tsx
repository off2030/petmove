import { TabSkeleton } from '@/components/portal-shell/tab-skeleton'

/**
 * 케이스 탭(일정·서류) 전환 로딩 경계. journey ↔ docs 스와이프/탭 전환 시 캐시 미스
 * 왕복 동안 즉시 스켈레톤을 띄워 "멈춤" 체감을 없앤다. 동시에 BottomNav 의 <Link>
 * prefetch 가 동적 라우트에서도 동작하게 만든다(loading 경계까지 prefetch).
 */
export default function CaseTabLoading() {
  return <TabSkeleton rows={4} />
}
