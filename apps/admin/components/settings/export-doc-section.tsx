'use client'

import { SectionHeader } from '@/components/ui/section-header'
import { TodoColumnsToggle } from './todo-columns-toggle'

/**
 * 설정 → 서류 탭. 증명서 버튼 생성 규칙은 "상세" 탭으로 이전됨 — 이 탭은
 * 서류 탭 테이블에 표시되는 컬럼 선택만 담당.
 */
export function ExportDocSection() {
  return (
    <div className="max-w-5xl pb-2xl">
      <header className="pb-xl">
        <SectionHeader>서류</SectionHeader>
        <p className="pmw-st__sec-lead mt-2">
          서류 탭 테이블에 표시되는 항목을 관리합니다. 증명서 버튼 구성은 "상세" 탭으로 이동했어요.
        </p>
      </header>

      <TodoColumnsToggle
        tabId="export_doc"
        title="서류 탭 표시 컬럼"
        description="서류 탭 테이블에 표시할 컬럼을 선택합니다. 모두 체크가 기본값."
      />
    </div>
  )
}
