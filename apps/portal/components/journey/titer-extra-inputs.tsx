'use client'


import { C } from '@/lib/palette'
import { useState } from 'react'
import { DateTextField } from '@petmove/ui'
import {
  getTiterLabOptions,
  isKnownTiterLab,
  isSameTiterLab,
  usesTiterReceivedDate,
} from '@petmove/domain'
import { OptionList } from './field-selects'

/**
 * 광견병 항체 검사(2회차+) step 입력 — 가변 길이 배열 + 추가/삭제.
 *
 * 1회차 (TiterInputs) 와 필드 구성은 동일하지만, 추가 검사는 회차가 정해져 있지 않아
 * 사용자가 카드를 추가/삭제할 수 있다. 각 카드 헤더에 "광견병 항체 검사(N차)" + 삭제 아이콘,
 * 마지막에 + 버튼.
 *
 * 저장 형식은 case.data.rabies_titer_records[index] (index >= 1) — 펫무브워크
 * RabiesTiterField 와 동일 키. value 는 IU/mL 없이 수치만 (server action 이 단위 제거).
 */

export interface TiterExtraEntry {
  date: string
  lab: string
  value: string
  /**
   * 검체가 검사기관에 도착한 날. 대기 일수의 규정 기준일이 채혈일이 아니라 도착일인
   * 목적지(호주·괌·하와이)에서만 입력칸이 뜬다 — domain usesTiterReceivedDate 파생.
   * **선택 입력**이라 비워도 완료된다. 비면 채혈일로 대신 판정한다.
   */
  received_date: string
}

const CUSTOM_LAB = '__custom__'

export function TiterExtraInputs({
  entries,
  onChange,
  onRemove,
  onAdd,
  destinationKey,
  startRound = 2,
}: {
  entries: TiterExtraEntry[]
  onChange: (index: number, key: keyof TiterExtraEntry, next: string) => void
  onRemove: (index: number) => void
  onAdd: () => void
  /** 목적지(정규화 키) — 검사기관 선택지를 목적지별로 분기. */
  destinationKey?: string | null
  /**
   * 첫 카드의 회차 번호. 기본 2 — '추가 검사' 별도 카드는 2회차부터 담기 때문.
   * 본 검사 카드가 목록을 통째로 다루는 목적지(일본·대만 외)는 1을 넘긴다.
   */
  startRound?: number
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {entries.map((entry, i) => (
        <ExtraCard
          key={i}
          entry={entry}
          roundNumber={i + startRound}
          destinationKey={destinationKey}
          onChange={(key, next) => onChange(i, key, next)}
          onRemove={() => onRemove(i)}
        />
      ))}
      <button
        type="button"
        onClick={onAdd}
        style={{
          marginTop: 4,
          padding: '12px 0',
          borderRadius: 14,
          border: `1px dashed ${C.line}`,
          background: 'transparent',
          color: C.ink2,
          fontFamily: 'inherit',
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        + 검사 기록 추가
      </button>
    </div>
  )
}

function ExtraCard({
  entry,
  roundNumber,
  destinationKey,
  onChange,
  onRemove,
}: {
  entry: TiterExtraEntry
  roundNumber: number
  destinationKey?: string | null
  onChange: (key: keyof TiterExtraEntry, next: string) => void
  onRemove: () => void
}) {
  // 검사기관 선택지 — 목적지별(@petmove/domain) + '기타' 마지막에 덧붙임. (TiterInputs 와 동일.)
  const LAB_OPTIONS = [...getTiterLabOptions(destinationKey), { value: CUSTOM_LAB, label: '기타' }]
  // 코드 목록에 없으면 직접 입력 모드. 사용자가 방금 '직접 입력' 선택했지만
  // 아직 미입력인 경우(form.lab === '') 도 같은 모드. (TiterInputs 와 동일 로직.)
  const [pickedCustom, setPickedCustom] = useState(false)
  const isCustomStored = entry.lab !== '' && !isKnownTiterLab(entry.lab)
  const customMode = isCustomStored || (pickedCustom && entry.lab === '')
  const selectedLab = customMode ? CUSTOM_LAB : entry.lab

  function handleLabSelect(next: string) {
    if (next === CUSTOM_LAB) {
      setPickedCustom(true)
      if (isKnownTiterLab(entry.lab)) onChange('lab', '')
    } else {
      setPickedCustom(false)
      onChange('lab', next)
    }
  }

  const cardStyle: React.CSSProperties = {
    background: C.surface,
    border: `.5px solid ${C.line}`,
    borderRadius: 16,
    padding: '4px 16px',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    color: C.ink,
    fontWeight: 500,
  }
  const fieldBox: React.CSSProperties = {
    padding: '10px 12px',
    border: `1px solid ${C.line}`,
    borderRadius: 10,
    background: 'var(--pm-surface)',
    fontFamily: 'inherit',
    fontSize: 15,
    color: C.ink,
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={cardStyle}>
      <div
        style={{
          padding: '12px 0 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>
          {/* 1차는 차수를 붙이지 않는다 — 광견병 백신 목록과 같은 규칙(rabies-extra-inputs). */}
          {roundNumber === 1 ? '광견병 항체 검사' : `광견병 항체 검사 ${roundNumber}차`}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="삭제"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 999,
            border: 0,
            background: 'transparent',
            color: C.ink3,
            cursor: 'pointer',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
        </button>
      </div>

      <div style={{ padding: '14px 0', borderTop: `.5px solid ${C.line}` }}>
        <div style={labelStyle}>채혈일</div>
        <div style={{ marginTop: 8 }}>
          <DateTextField
            value={entry.date}
            onChange={(v) => onChange('date', v)}
            placeholder="YYYY-MM-DD"
            block
          />
        </div>
      </div>

      {usesTiterReceivedDate(destinationKey) && (
        <div style={{ padding: '14px 0', borderTop: `.5px solid ${C.line}` }}>
          <div style={labelStyle}>검체 도착일</div>
          <div style={{ fontSize: 12, color: C.ink3, marginTop: 2 }}>
            검체가 검사기관에 도착한 날 · 선택 입력
          </div>
          <div style={{ marginTop: 8 }}>
            <DateTextField
              value={entry.received_date}
              onChange={(v) => onChange('received_date', v)}
              placeholder="YYYY-MM-DD"
              block
            />
          </div>
        </div>
      )}

      <div style={{ padding: '14px 0', borderTop: `.5px solid ${C.line}` }}>
        <div style={labelStyle}>검사기관</div>
        {/* APQA 변형(seoul/eu/hq)은 같은 '농림축산검역본부'로 보고 선택 표시. */}
        <OptionList
          options={LAB_OPTIONS}
          isSelected={(v) => isSameTiterLab(selectedLab, v)}
          onSelect={handleLabSelect}
        />
        {customMode && (
          <input
            type="text"
            value={entry.lab}
            onChange={(e) => onChange('lab', e.target.value)}
            placeholder="검사기관명을 입력하세요"
            style={{ ...fieldBox, marginTop: 8, width: '100%' }}
          />
        )}
      </div>

      <div style={{ padding: '14px 0', borderTop: `.5px solid ${C.line}` }}>
        <div style={labelStyle}>검사결과</div>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="text"
            inputMode="decimal"
            value={entry.value}
            onChange={(e) => onChange('value', e.target.value)}
            placeholder="예: 0.5"
            style={{ ...fieldBox, flex: 1, minWidth: 0 }}
          />
          <span style={{ fontSize: 14, color: C.ink2, flexShrink: 0 }}>IU/mL</span>
        </div>
      </div>
    </div>
  )
}
