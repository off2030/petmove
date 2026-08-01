'use client'

// 복사 시 출처 자동 첨부 — 본문을 일정 길이 이상 복사하면 클립보드 끝에
// 출처(펫무브 + 페이지 URL)를 붙인다. 전화번호·병원명 같은 짧은 복사와
// 입력창 안에서의 복사는 건드리지 않는다. 드래그 방지 대신 쓰는 소프트한 장치.
import { useEffect } from 'react'

const MIN_LENGTH = 100

export function CopyAttribution() {
  useEffect(() => {
    function onCopy(e: ClipboardEvent) {
      if (!e.clipboardData) return
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
      const sel = document.getSelection()
      if (!sel || sel.isCollapsed) return
      const text = sel.toString()
      if (text.trim().length < MIN_LENGTH) return

      const url = location.href
      e.clipboardData.setData('text/plain', `${text}\n\n출처: 펫무브 · ${url}`)
      // 서식 붙여넣기(워드·에디터류)에도 출처가 따라가도록 HTML 플레이버 병행.
      const container = document.createElement('div')
      for (let i = 0; i < sel.rangeCount; i++) container.appendChild(sel.getRangeAt(i).cloneContents())
      e.clipboardData.setData(
        'text/html',
        `${container.innerHTML}<p>출처: 펫무브 · <a href="${url}">${url}</a></p>`,
      )
      e.preventDefault()
    }
    document.addEventListener('copy', onCopy)
    return () => document.removeEventListener('copy', onCopy)
  }, [])
  return null
}
