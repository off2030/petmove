import { TabSkeleton } from '@/components/portal-shell/tab-skeleton'

/**
 * (authed) 영역 전역 로딩 폴백 — /me·/services·/cases 등 더 가까운 loading 경계가 없는
 * 라우트의 전환·첫 진입 시 스켈레톤을 띄운다. TopBar·BottomNav 는 레이아웃에 있어 유지되고
 * 본문 영역만 교체된다.
 */
export default function AuthedLoading() {
  return <TabSkeleton rows={3} />
}
