'use client'

/**
 * 여행지 칩 — 규칙 목록(검사·증명서 등)에서 국가 나열용.
 *
 * 모양·크기는 공용 `SettingsChip` 을 그대로 쓴다. 여기 남은 건 "여행지"라는
 * 의미와 "+N개국" 표기뿐 — 치수를 자체로 들고 있지 않는다 (2026-08-06 크기 규격화).
 */

import { SettingsChip } from './settings-layout'

export function DestinationPill({ name }: { name: string }) {
  return <SettingsChip>{name}</SettingsChip>
}

export function OverflowPill({ count }: { count: number }) {
  return <SettingsChip tone="plain">+{count}개국</SettingsChip>
}
