'use client'

/**
 * 영문명 First/Last 합성 행 — 케이스 상세의 customer-name-row 와 동일 패턴 (이름은 단일 행).
 * IME 입력 중에는 한글 자모 통과시키고 composition end 시점에 필터·대문자화 후 commit.
 *
 * company-section(발급자 본인 영문명) 과 org-info-form(조직 영문명) 에 각자 복제돼
 * 있던 것을 공용화 (2026-08-06). 키 타입은 제네릭이라 양쪽 그대로 수용.
 */

import { useRef } from 'react'
import { cn } from '@/lib/utils'
import { SettingsField } from './settings-layout'

/** 영문만 남기고 한글 자모/완성형 제거. */
export function filterKorean(str: string): string {
  return str.replace(/[ㄱ-ㅎㅏ-ㅣ가-힣]/g, '')
}

/** 단어 첫 글자 대문자화. "john doe" → "John Doe". */
export function capitalizeWords(str: string): string {
  return str.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

export function EnglishNameSplitRow<K extends string>({
  label = '영문명',
  firstKey,
  lastKey,
  firstValue,
  lastValue,
  isAdmin,
  saving,
  onChange,
  onCommit,
  onCancel,
  firstPlaceholder,
  lastPlaceholder,
}: {
  label?: string
  firstKey: K
  lastKey: K
  firstValue: string
  lastValue: string
  isAdmin: boolean
  saving: boolean
  onChange: (key: K, v: string) => void
  onCommit: (key: K) => void
  onCancel: (key: K) => void
  firstPlaceholder?: string
  lastPlaceholder?: string
}) {
  const firstComposing = useRef(false)
  const lastComposing = useRef(false)

  function handleFirstChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (firstComposing.current) {
      onChange(firstKey, e.target.value)
      return
    }
    onChange(firstKey, capitalizeWords(filterKorean(e.target.value)))
  }
  function handleLastChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (lastComposing.current) {
      onChange(lastKey, e.target.value)
      return
    }
    onChange(lastKey, capitalizeWords(filterKorean(e.target.value)))
  }
  function handleFirstCompositionEnd(e: React.CompositionEvent<HTMLInputElement>) {
    firstComposing.current = false
    const raw = (e.target as HTMLInputElement).value
    onChange(firstKey, capitalizeWords(filterKorean(raw)))
  }
  function handleLastCompositionEnd(e: React.CompositionEvent<HTMLInputElement>) {
    lastComposing.current = false
    const raw = (e.target as HTMLInputElement).value
    onChange(lastKey, capitalizeWords(filterKorean(raw)))
  }
  function makeKeyDown(key: K) {
    return (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      if (e.key === 'Escape') onCancel(key)
    }
  }

  const inputCls = cn(
    'flex-1 min-w-0 bg-transparent font-serif text-[15px] leading-snug text-foreground border-0 px-0 py-1 min-h-[28px] focus:outline-none focus:ring-0 placeholder:text-muted-foreground/30',
    saving && 'opacity-60',
    !isAdmin && 'cursor-default',
  )

  return (
    <SettingsField label={label}>
      <div className="flex items-baseline gap-md">
        <input
          type="text"
          value={firstValue}
          onChange={handleFirstChange}
          onCompositionStart={() => { firstComposing.current = true }}
          onCompositionEnd={handleFirstCompositionEnd}
          onBlur={() => onCommit(firstKey)}
          onKeyDown={makeKeyDown(firstKey)}
          placeholder={isAdmin ? (firstPlaceholder || 'First (이름)') : ''}
          readOnly={!isAdmin}
          className={inputCls}
        />
        <span className="text-muted-foreground/30 select-none shrink-0">·</span>
        <input
          type="text"
          value={lastValue}
          onChange={handleLastChange}
          onCompositionStart={() => { lastComposing.current = true }}
          onCompositionEnd={handleLastCompositionEnd}
          onBlur={() => onCommit(lastKey)}
          onKeyDown={makeKeyDown(lastKey)}
          placeholder={isAdmin ? (lastPlaceholder || 'Last (성)') : ''}
          readOnly={!isAdmin}
          className={inputCls}
        />
      </div>
    </SettingsField>
  )
}
