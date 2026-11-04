'use client'

import { useRef, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react'
import { kakaoChatUrl, PETMOVE_KAKAO_CHAT_URL } from '@/lib/kakao-chat'
import { isNativePlatform, openExternalUrl } from '@/lib/native/open-external'

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> & {
  href?: string
  onOpen?: () => void
}

/**
 * 웹은 일반 링크의 사용자 제스처를 유지하고, 앱은 기존 Browser 플러그인으로 연다.
 * pf.kakao.com은 OAuth용 allowNavigation에도 매칭되므로 WebView에 맡기면
 * 카카오톡 실행 스킴/인텐트가 막힐 수 있다. 상담 링크는 그 WebView를 벗어나야 한다.
 */
export function KakaoChatLink({ href = PETMOVE_KAKAO_CHAT_URL, onOpen, children, ...props }: Props) {
  const url = kakaoChatUrl(href)
  const opening = useRef(false)
  const [failureUrl, setFailureUrl] = useState<string | null>(null)
  const [copyMessage, setCopyMessage] = useState('')

  async function openChat() {
    if (opening.current) return
    opening.current = true
    setFailureUrl(null)
    setCopyMessage('')
    try {
      // 외부 브라우저를 열었다는 뜻이며, 실제 상담 접수/메시지 발송 완료로 표시하지 않는다.
      await openExternalUrl(url)
    } catch {
      setFailureUrl(url)
    } finally {
      opening.current = false
    }
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    onOpen?.()
    if (!isNativePlatform()) return
    event.preventDefault()
    void openChat()
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopyMessage('상담 링크를 복사했어요.')
    } catch {
      setCopyMessage('아래 주소를 길게 눌러 복사해 주세요.')
    }
  }

  return (
    <>
      <a {...props} href={url} target="_blank" rel="noopener noreferrer" onClick={handleClick}>
        {children}
      </a>
      {failureUrl === url && (
        <div role="status" style={{ padding: '10px 4px', fontSize: 13, lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 6px' }}>상담 연결을 열지 못했어요. 다시 시도하거나 링크를 복사해 주세요.</p>
          <button type="button" onClick={() => void openChat()}>다시 시도</button>{' '}
          <button type="button" onClick={() => void copyLink()}>상담 링크 복사</button>
          <input
            aria-label="카카오톡 상담 주소"
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
            style={{ display: 'block', width: '100%', marginTop: 8, fontSize: 13 }}
          />
          {copyMessage && <p style={{ margin: '6px 0 0' }}>{copyMessage}</p>}
        </div>
      )}
    </>
  )
}
