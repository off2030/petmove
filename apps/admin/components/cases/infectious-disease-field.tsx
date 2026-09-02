'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { SectionLabel } from '@/components/ui/section-label'
import { cn } from '@/lib/utils'
import { updateCaseField } from '@/lib/actions/cases'
import { persistField } from '@/lib/toast-bus'
import { useCases } from './cases-context'
import type { CaseRow } from '@petmove/domain'
import { labColor } from '@/lib/lab-color'
import { allLabOptions, effectiveInfectiousLabs, resolveActiveDestination, resolveInspectionLabs } from '@petmove/domain'
import { stampInspectionActiveDest } from '@/lib/inspection-active-dest'
import { DateTextField } from '@petmove/ui'
import { DropdownSelect } from '@petmove/ui'
import { useSectionEditMode } from './section-edit-mode-context'
import { useConfirm } from '@petmove/ui'
import { InspectionStatusChip } from './inspection-status-chip'
import { infectiousStatusTarget, inspectionStatusKey } from '@/lib/inspection-status'

interface InfectiousRecord {
  date: string | null
  lab: string | null
}

const DATA_KEY = 'infectious_disease_records'

export function InfectiousDiseaseField({ caseId, caseRow, destination }: { caseId: string; caseRow: CaseRow; destination?: string | null }) {
  const { updateLocalCaseField, inspectionConfig, activeDestination } = useCases()
  const editMode = useSectionEditMode()
  const confirm = useConfirm()
  const data = (caseRow.data ?? {}) as Record<string, unknown>
  // 다중 여행지에서 현재 탭 — 검사 탭 활성 여행지 각인 기준.
  const activeDest = resolveActiveDestination(caseRow.destination, activeDestination)
  const stampActiveDest = () =>
    stampInspectionActiveDest(caseId, caseRow.destination, activeDest, updateLocalCaseField)

  // 검사기관 옵션 = 설정의 효과 목록(단일 출처) — 숨김·표시명 수정·커스텀 모두 반영.
  // 표시 라벨은 숨긴 기관까지 lookup(allLabs) — 과거 케이스에 저장된 값 보존.
  const labOptions = effectiveInfectiousLabs(inspectionConfig)
  const allLabs = allLabOptions(inspectionConfig)

  // Read array (backward compat: old flat key)
  function readRecords(): InfectiousRecord[] {
    if (Array.isArray(data[DATA_KEY])) return data[DATA_KEY] as InfectiousRecord[]
    if (data.infectious_disease_test) {
      return [{ date: data.infectious_disease_test as string, lab: 'ksvdl' }]
    }
    return []
  }

  const records = readRecords()
  const [saving, startSave] = useTransition()
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editField, setEditField] = useState<'date' | 'lab' | null>(null)
  const [addingNew, setAddingNew] = useState(false)

  useEffect(() => {
    setEditIdx(null)
    setEditField(null)
    setAddingNew(false)
  }, [caseId])

  async function saveRecords(next: InfectiousRecord[]) {
    const val = next.length > 0 ? next : null
    // Optimistic — 실패해도 값 보존 + '다시 시도' 토스트(persistField).
    updateLocalCaseField(caseId, 'data', DATA_KEY, val)
    // Also clear legacy flat key if it exists
    if (data.infectious_disease_test) {
      updateLocalCaseField(caseId, 'data', 'infectious_disease_test', null)
      updateCaseField(caseId, 'data', 'infectious_disease_test', null).catch(() => {})
    }
    const r = await persistField('전염병 검사', () => updateCaseField(caseId, 'data', DATA_KEY, val))
    if (!r) return

    // If clearing all records, remove from toggleable fields
    if (val === null) {
      const toggleKey = 'vaccine:infectious_disease'
      const currentExtra = (data.extra_visible_fields as string[]) ?? []
      if (currentExtra.includes(toggleKey)) {
        const updated = currentExtra.filter(f => f !== toggleKey)
        const extraVal = updated.length > 0 ? updated : null
        const r2 = await updateCaseField(caseId, 'data', 'extra_visible_fields', extraVal)
        if (r2.ok) updateLocalCaseField(caseId, 'data', 'extra_visible_fields', extraVal)
      }
    }
  }

  async function deleteRecord(idx: number) {
    const target = records[idx]
    const ok = await confirm({
      message: `전염병검사${target?.date ? ` (${target.date})` : ''} 기록을 삭제하시겠습니까?`,
      okLabel: '삭제',
      variant: 'destructive',
    })
    if (!ok) return
    const next = records.filter((_, i) => i !== idx)
    saveRecords(next).catch(() => {})
  }

  function updateRecord(idx: number, field: keyof InfectiousRecord, value: unknown) {
    const next = records.map((rec, i) => i === idx ? { ...rec, [field]: value || null } : rec)
    saveRecords(next).catch(() => {})
    // 검사기관을 이 탭에서 골랐다 = 이 검사는 이 여행지 것 → 검사 탭 여행지 각인.
    if (field === 'lab') stampActiveDest()
  }

  function saveNewRecord(date: string) {
    if (!date) { setAddingNew(false); return }
    // 설정(전염병 규칙)에서 여행지별 검사기관 resolve. 규칙 여러 개면 각 lab별로 기록 생성.
    // 매칭되는 규칙이 없으면 lab 미지정(null) 1건.
    const labs = resolveInspectionLabs(destination, inspectionConfig.infectiousRules)
    const newRows: InfectiousRecord[] = labs.length > 0
      ? labs.map(lab => ({ date, lab }))
      : [{ date, lab: null }]
    const next = [...records, ...newRows]
    setAddingNew(false)
    saveRecords(next).catch(() => {})
    stampActiveDest()
  }

  return (
    <div data-field={DATA_KEY} className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 transition-colors last:border-0">
      <div className="flex items-center gap-[6px] pt-1">
        <SectionLabel>
          전염병검사
        </SectionLabel>
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        {/* 같은 날짜의 기록은 하나의 행으로 묶고 lab 만 옆에 나열한다. */}
        {(() => {
          const groups = groupByDate(records)
          const latestIdx = latestGroupIndex(groups)
          return groups.map((group, gi) => (
          <InfectiousGroup
            key={group.date ?? `null-${group.indices.join('_')}`}
            caseId={caseId}
            caseRow={caseRow}
            showStatus={gi === latestIdx}
            date={group.date}
            indices={group.indices}
            records={records}
            labOptions={labOptions}
            displayLabs={allLabs}
            editIdx={editIdx}
            editField={editField}
            onStartEdit={(idx, f) => { setEditIdx(idx); setEditField(f) }}
            onStopEdit={() => { setEditIdx(null); setEditField(null) }}
            onUpdateField={(idx, f, v) => updateRecord(idx, f, v)}
            onUpdateGroupDate={(newDate) => {
              // 같은 날짜를 공유하는 모든 기록의 date 갱신.
              const next = records.map((r, i) => group.indices.includes(i) ? { ...r, date: newDate || null } : r)
              saveRecords(next).catch(() => {})
              setEditIdx(null); setEditField(null)
            }}
            onDelete={(idx) => deleteRecord(idx)}
            saving={saving}
          />
          ))
        })()}

        {/* 빈 상태 — 다른 필드와 동일한 옅은 — (클릭 시 검사 추가). */}
        {records.length === 0 && !addingNew && (
          editMode ? (
            <button type="button" onClick={() => setAddingNew(true)}
              className="text-left rounded-md px-2 py-1 -mx-2 transition-colors hover:bg-accent/40 hover:ring-1 hover:ring-inset hover:ring-border cursor-pointer text-muted-foreground/40 select-none">
              —
            </button>
          ) : (
            <span className="text-muted-foreground/40 select-none px-2 py-1 -mx-2 inline-block" aria-hidden>—</span>
          )
        )}

        {addingNew && (
          <DateInput
            initial=""
            onSave={saveNewRecord}
            onCancel={() => setAddingNew(false)}
          />
        )}
      </div>
    </div>
  )
}

/* ── 같은 날짜끼리 묶기. 빈 날짜(null)는 각자 독립 그룹. ── */
function groupByDate(records: InfectiousRecord[]): { date: string | null; indices: number[] }[] {
  const result: { date: string | null; indices: number[] }[] = []
  records.forEach((rec, i) => {
    if (!rec.date) {
      result.push({ date: null, indices: [i] })
      return
    }
    const existing = result.find((g) => g.date === rec.date)
    if (existing) existing.indices.push(i)
    else result.push({ date: rec.date, indices: [i] })
  })
  return result
}

/**
 * 진행상태 칩을 붙일 **최신 회차** 그룹의 인덱스.
 * 날짜가 가장 늦은 그룹. 날짜 없는 기록('')은 가장 낮게 쳐서, 전부 비어 있으면
 * 마지막(=가장 최근에 추가된) 그룹을 고른다.
 */
function latestGroupIndex(groups: { date: string | null }[]): number {
  let best = -1
  let bestDate = ''
  groups.forEach((g, i) => {
    const d = g.date ?? ''
    if (best === -1 || d >= bestDate) { best = i; bestDate = d }
  })
  return best
}

/* ── 한 행: 날짜 + (같은 날짜의 모든) lab 들 ── */

function InfectiousGroup({
  caseId, caseRow, showStatus, date, indices, records, labOptions, displayLabs, editIdx, editField,
  onStartEdit, onStopEdit, onUpdateField, onUpdateGroupDate, onDelete, saving,
}: {
  caseId: string
  caseRow: CaseRow
  /** 최신 회차 그룹에만 진행상태 칩을 붙인다 — 옛 회차는 '완료' 반복이라 줄만 길어진다. */
  showStatus: boolean
  date: string | null
  indices: number[]
  records: InfectiousRecord[]
  labOptions: { value: string; label: string }[]
  /** 표시 라벨 lookup — 숨긴 기관 포함(과거 데이터 라벨 보존). */
  displayLabs: { value: string; label: string }[]
  editIdx: number | null
  editField: 'date' | 'lab' | null
  onStartEdit: (idx: number, f: 'date' | 'lab') => void
  onStopEdit: () => void
  onUpdateField: (idx: number, f: keyof InfectiousRecord, v: unknown) => void
  onUpdateGroupDate: (v: string) => void
  onDelete: (idx: number) => void
  saving: boolean
}) {
  const editMode = useSectionEditMode()
  const { inspectionConfig } = useCases()
  const dateDisplay = date || '—'
  // date 행 편집은 그룹의 첫 인덱스를 기준으로 표시.
  const dateEditingIdx = indices[0]
  const dateIsEditing = editIdx === dateEditingIdx && editField === 'date'

  // 진행상태는 검사기관별. 단 뉴질랜드처럼 여러 기관이 한 상태를 공유하는 묶음은
  // 마지막 기관 뒤에서 한 번만 그린다 (같은 상태가 칩 여러 개로 중복되지 않도록).
  const statusTargets = indices.map((idx) => {
    const lab = records[idx]?.lab
    return lab ? infectiousStatusTarget(caseRow, lab, inspectionConfig.infectiousRules) : null
  })
  const statusKeys = statusTargets.map((t) => (t ? inspectionStatusKey(t) : null))
  const isLastOfStatus = (n: number) =>
    statusKeys[n] !== null && statusKeys.lastIndexOf(statusKeys[n]) === n

  return (
    <div className="group/item flex items-baseline gap-[10px] min-w-0 overflow-x-auto whitespace-nowrap scrollbar-hide">
      {/* Date — 그룹당 1번만 표시 */}
      {editMode && dateIsEditing ? (
        <DateInput
          initial={date || ''}
          onSave={(v) => {
            if (!v) { indices.forEach(onDelete); onStopEdit(); return }
            onUpdateGroupDate(v)
          }}
          onCancel={onStopEdit}
        />
      ) : editMode ? (
        <button type="button" onClick={() => onStartEdit(dateEditingIdx, 'date')}
          className={cn('text-left rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground transition-colors hover:bg-accent/60 cursor-pointer', dateDisplay === '—' && 'font-sans text-base font-normal tracking-normal text-muted-foreground/60')}>
          {dateDisplay}
        </button>
      ) : (
        <span className={cn('inline-block rounded-md px-2 py-1 -mx-2 font-mono text-[15px] tracking-[0.3px] text-foreground', dateDisplay === '—' && 'font-sans text-base font-normal tracking-normal text-muted-foreground/40')}>
          {dateDisplay}
        </span>
      )}

      {/* Labs — | 로 구분하여 나열 */}
      {indices.map((idx, n) => {
        const rec = records[idx]
        const labObj = displayLabs.find(l => l.value === rec.lab)
        const labDisplay = labObj?.label || rec.lab || '—'
        const labTone = labColor(rec.lab)
        const labIsEditing = editIdx === idx && editField === 'lab'
        // 저장된 값이 선택지에 없으면(설정에서 삭제된 기관 등) 옵션에 동적 추가 — 값 소실 방지.
        const inOptions = !rec.lab || labOptions.some(l => l.value === rec.lab)
        const rowOptions = inOptions
          ? [{ value: '', label: '—' }, ...labOptions]
          : [{ value: '', label: '—' }, ...labOptions, { value: rec.lab as string, label: labDisplay }]
        return (
          <span key={idx} className="group/lab inline-flex items-baseline gap-[10px]">
            <span className="text-muted-foreground/30 select-none">|</span>
            {editMode ? (
              <DropdownSelect
                value={rec.lab ?? ''}
                options={rowOptions}
                onChange={(v) => onUpdateField(idx, 'lab', v || null)}
                triggerClassName={cn(
                  'text-left',
                  labTone
                    ? cn('inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[1px] whitespace-nowrap hover:opacity-80', labTone.bg, labTone.text)
                    : cn('text-base rounded-md px-2 py-1 -mx-2 hover:bg-accent/60', labDisplay === '—' && 'text-muted-foreground/60'),
                )}
                renderTrigger={() => labDisplay}
              />
            ) : (
              <span
                className={cn(
                  'inline-block transition-all',
                  labTone
                    ? cn('items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[1px] whitespace-nowrap', labTone.bg, labTone.text)
                    : cn('text-base rounded-md px-2 py-1 -mx-2', labDisplay === '—' && 'text-muted-foreground/40'),
                )}>
                {labDisplay}
              </span>
            )}
            {showStatus && isLastOfStatus(n) && statusTargets[n] && (
              <InspectionStatusChip
                caseId={caseId}
                caseRow={caseRow}
                target={statusTargets[n]}
                date={date}
              />
            )}
            {editMode && (
              <button
                type="button"
                onClick={() => onDelete(idx)}
                title="삭제"
                className="shrink-0 inline-flex items-center justify-center rounded-md p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/lab:opacity-70 hover:!opacity-100"
              >
                <Trash2 size={13} />
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}

/* ── Sub-field inputs ── */

function DateInput({ initial, onSave, onCancel }: {
  initial: string; onSave: (v: string) => void; onCancel: () => void
}) {
  return (
    <DateTextField
      autoFocus
      value={initial}
      onChange={(v) => onSave(v)}
      onBlur={onCancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      skipClearConfirm
      className="h-8 w-40 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none"
    />
  )
}

// LabDropdown 제거 — DropdownSelect 통일.
