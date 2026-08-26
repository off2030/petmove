'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CaseRow } from '@petmove/domain'
import { isDestinationScopedKey, type ReportSlot } from '@petmove/domain'
import { setReportSlotStatus, updateCaseField } from '@/lib/actions/cases'
import { useCases } from '@/components/cases/cases-context'
import { cn } from '@/lib/utils'
import { DateTextField, useConfirm } from '@petmove/ui'
import { DropdownSelect } from '@petmove/ui'

const INITIAL_VISIBLE = 100
const LOAD_MORE_STEP = 100

/**
 * 로컬 상태 반영 콜백. 5번째 destination 은 다중 여행지 케이스에서 scoped key 를
 * by_dest 로 라우팅할 때 전달 (updateLocalCaseField 와 동일 시그니처).
 */
type OnUpdate = (
  caseId: string,
  storage: 'column' | 'data',
  key: string,
  value: unknown,
  destination?: string | null,
) => void

function formatDateDotted(v: string): string {
  if (!v || v.length < 10) return v
  return v.replace(/-/g, '\u00B7')
}

function isUrgentText(v: string): boolean {
  return /^ASAP$/i.test(v.trim())
}

export interface TodoColumn {
  key: string
  label: string
  storage: 'column' | 'data'
  type: 'text' | 'date' | 'select' | 'custom'
  width: number
  options?: Array<{ value: string; label: string }>
  /** Override default value resolution (e.g. read from nested structure) */
  resolveValue?: (row: CaseRow) => string
  /** Fallback value when stored value is empty */
  defaultValue?: string
  /** Only show this column's cell for rows matching this condition */
  condition?: (row: CaseRow) => boolean
  /**
   * Custom cell renderer for `type: 'custom'`. Receives the row and an
   * `onUpdate` helper for persisting changes via the shared local+DB path.
   */
  render?: (row: CaseRow, onUpdate: OnUpdate) => React.ReactNode
  /**
   * 읽기 전용으로 표시하고 셀 클릭 시 행 네비게이션(상세페이지 이동)을 허용.
   * 식별 컬럼(동물명·고객명 등)에 사용.
   */
  readonly?: boolean
  /** 표시 모드 셀에 추가로 붙일 className (예: 경고 색상). */
  cellClass?: (row: CaseRow) => string
}

function getCellValue(row: CaseRow, col: TodoColumn): string {
  if (col.resolveValue) return col.resolveValue(row)
  let v: unknown
  if (col.storage === 'column') {
    v = (row as unknown as Record<string, unknown>)[col.key]
  } else {
    const data = (row.data ?? {}) as Record<string, unknown>
    v = data[col.key]
  }
  if (v != null && String(v) !== '') return String(v)
  return col.defaultValue ?? ''
}

function StatusBadge({ value, options }: { value: string; options: Array<{ value: string; label: string }> }) {
  const opt = options.find((o) => o.value === value)
  if (!opt) {
    return <span className="font-serif italic text-[15px] text-muted-foreground/40">—</span>
  }

  // 상태 색 규칙(2026-08-05 통일): 진행 중 → primary, 완료 → positive,
  // 대기 → tertiary(연회색) 고정. 기한 임박·지연 경고는 날짜 셀(cellClass)만 물들인다 —
  // 상태 글자까지 물들이면 탭마다 대기 색이 달라 보여 위계가 흐려진다(사용자 피드백).
  const isActive = value === 'in_progress' || value === 'testing'
  const isDone = value === 'done'
  const cls = isActive
    ? 'text-primary'
    : isDone
    ? 'text-pmw-positive'
    : 'text-pmw-text-tertiary'

  return (
    <span className={cn('inline-flex items-center font-serif text-[16px]', cls)}>
      <span aria-hidden className="mr-1.5 inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-current align-middle" />
      {opt.label}
    </span>
  )
}

function EditableCell({
  row,
  col,
  onUpdate,
  activeDest,
}: {
  row: CaseRow
  col: TodoColumn
  onUpdate: OnUpdate
  /** 다중 여행지 케이스의 활성 여행지 — scoped key 저장을 by_dest 로 라우팅. */
  activeDest?: string | null
}) {
  const { replaceLocalCaseData, updateLocalCaseField } = useCases()
  const value = getCellValue(row, col)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isDate = col.type === 'date'

  const save = useCallback(
    async (newVal: string) => {
      const trimmed = newVal.trim()
      if (trimmed === value) {
        setEditing(false)
        return
      }
      const saveVal = trimmed === '' ? null : trimmed
      // scoped key(출국일·내원일 등)는 활성 여행지로 by_dest 라우팅. 그 외는 기존 경로.
      const dest = isDestinationScopedKey(col.key) ? (activeDest ?? undefined) : undefined
      onUpdate(row.id, col.storage, col.key, saveVal, dest)
      setEditing(false)
      const result = await updateCaseField(row.id, col.storage, col.key, saveVal, dest)
      // 자동 채움/리셋 결과 반영 — 서버에서 다른 필드(예: export_doc_status)가 바뀌었을 수 있음.
      if (result.ok && result.autoFilled) {
        replaceLocalCaseData(row.id, result.autoFilled.data)
        for (const [k, v] of Object.entries(result.autoFilled.columns ?? {})) {
          updateLocalCaseField(row.id, 'column', k, v)
        }
      }
    },
    [row.id, col.storage, col.key, value, onUpdate, replaceLocalCaseData, updateLocalCaseField, activeDest],
  )

  useEffect(() => {
    if (!editing || isDate) return
    const el = textareaRef.current
    if (!el) return
    el.focus()
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [editing, isDate])

  // Display mode
  if (!editing) {
    const extraCls = col.cellClass?.(row) ?? ''
    const urgent = !isDate && isUrgentText(value)
    const displayCls = isDate
      ? 'font-mono text-[12px] tabular-nums tracking-[0.3px] text-foreground'
      : urgent
      ? 'font-mono text-[12px] uppercase tracking-[1.3px] text-primary'
      : 'font-serif text-[15px] font-medium text-foreground'
    const displayVal = isDate ? formatDateDotted(value) : value
    return (
      <div
        className={cn(
          'w-full px-1 py-1 cursor-text whitespace-pre-wrap min-h-[24px]',
          displayCls,
          extraCls,
        )}
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
      >
        {value ? displayVal : <span className="font-serif italic font-normal text-[15px] text-muted-foreground/40">—</span>}
      </div>
    )
  }

  // Date: editorial calendar (DateTextField) — popover + text input in one.
  if (isDate) {
    return (
      <DateTextField
        autoFocus
        value={value}
        onChange={(v) => save(v)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
        }}
        size="sm"
        className="w-full bg-transparent border-0 border-b border-primary text-base py-1 focus:outline-none"
      />
    )
  }

  // Text: 상세페이지 NoteTextInput 동일 — 박스 textarea + 자동 높이 + Enter 저장 / Shift+Enter 줄바꿈.
  return (
    <textarea
      ref={textareaRef}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        e.target.style.height = 'auto'
        e.target.style.height = e.target.scrollHeight + 'px'
      }}
      onBlur={() => save(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(draft) }
        if (e.key === 'Escape') setEditing(false)
      }}
      className="w-full min-h-[2rem] rounded-md border border-border/80 bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/30 resize-none"
    />
  )
}

function ReadonlyCell({ row, col }: { row: CaseRow; col: TodoColumn }) {
  const value = getCellValue(row, col)
  // 읽기 전용 날짜 — 편집 셀 표시 모드와 동일 포맷(Mono·점 구분자·경고색). 클릭은 행 네비.
  if (col.type === 'date') {
    const extraCls = col.cellClass?.(row) ?? ''
    return (
      <div className={cn('w-full px-1 py-1 min-h-[24px] font-mono text-[12px] tabular-nums tracking-[0.3px] text-foreground', extraCls)}>
        {value
          ? formatDateDotted(value)
          : <span className="font-serif italic font-normal text-[15px] text-muted-foreground/40">—</span>}
      </div>
    )
  }
  // 홈 화면과 동일한 typography — 보호자는 Sans 16px, 반려동물은 Serif Semibold 17px.
  const cls =
    col.key === 'pet_name'
      ? 'font-serif font-semibold text-[17px] leading-tight text-foreground'
      : col.key === 'customer_name'
        ? 'font-sans font-normal text-[14px] leading-tight text-foreground/85'
        : 'font-serif text-[15px] font-medium text-foreground'
  return (
    <div className={cn('w-full px-1 py-1 truncate min-h-[24px]', cls)}>
      {value || <span className="italic font-normal text-muted-foreground/40">—</span>}
    </div>
  )
}

function SelectCell({
  row,
  col,
  onUpdate,
  activeDest,
}: {
  row: CaseRow
  col: TodoColumn
  onUpdate: OnUpdate
  /** 다중/단일 여행지 scoped key 저장을 by_dest 로 라우팅할 활성 여행지. */
  activeDest?: string | null
}) {
  const value = getCellValue(row, col)
  const { replaceLocalCaseData, updateLocalCaseField } = useCases()
  const confirm = useConfirm()
  // 신고 탭 '수입'·'수출' 칸은 목적지 무관 단일 액션([[setReportSlotStatus]])으로 저장한다.
  // 그 목적지가 어느 여정 카드와 이어지는지는 프로파일이 정하고, 연결이 없으면 액션이
  // 수동값(by_dest 스코핑)으로 떨어뜨린다 — 여기에 나라 분기가 있을 이유가 없다.
  //
  // ⛔ 나라별 분기를 다시 만들지 말 것 — 예전엔 일본·태국·필리핀·대만 명단이 여기 박혀
  //   있었고, 명단 밖(하와이)은 '완료'로 바꿔도 앱 카드가 미완료로 남았다(2026-08-21).
  //   destination 전체 문자열("일본, 태국")로 매칭하던 시절엔 두 분기에 동시에 걸려
  //   read/write 가 엇갈리기까지 했다.
  const reportSlot: ReportSlot | null =
    col.key === 'import_import_status' ? 'import' : col.key === 'import_export_status' ? 'export' : null
  async function pick(v: string) {
    if (v === value) return
    if (reportSlot && (v === 'not_started' || v === 'in_progress' || v === 'done')) {
      if (v === 'not_started') {
        const ok = await confirm({
          message: '대기로 되돌리시겠어요?',
          description:
            reportSlot === 'import'
              ? '신고·신청 진행 정보(신청일·완료 표시)가 지워집니다. 보호자가 첨부한 서류나 입력된 허가번호는 그대로 유지됩니다.'
              : '수출검역 진행 정보(신청일·확정·완료 표시)가 지워집니다.',
          okLabel: '대기로 되돌리기',
        })
        if (!ok) return
      }
      const res = await setReportSlotStatus(row.id, reportSlot, v as 'not_started' | 'in_progress' | 'done')
      if (res.ok && res.autoFilled?.data) {
        replaceLocalCaseData(row.id, res.autoFilled.data)
      }
      return
    }
    const dest = isDestinationScopedKey(col.key) ? (activeDest ?? undefined) : undefined
    onUpdate(row.id, col.storage, col.key, v || null, dest)
    const res = await updateCaseField(row.id, col.storage, col.key, v || null, dest)
    if (res.ok && res.autoFilled) {
      replaceLocalCaseData(row.id, res.autoFilled.data)
      for (const [k, nextValue] of Object.entries(res.autoFilled.columns ?? {})) {
        updateLocalCaseField(row.id, 'column', k, nextValue)
      }
    }
  }
  const isActive = value === 'in_progress' || value === 'testing'
  return (
    <DropdownSelect
      value={value}
      options={col.options!}
      onChange={pick}
      portal
      // 검사 탭 진행상태와 동일: 평소엔 차분한 텍스트, hover 시 여백 있는 알약(하이라인 링)+꺾쇠(▼)로
      // '눌러서 바꾸는 드롭다운'임을 신호.
      triggerClassName={cn(
        'group inline-flex items-center -ml-1 px-2.5 py-1 min-h-[24px] text-left',
        'hover:ring-1 hover:ring-inset hover:ring-border/60',
      )}
      triggerProps={{
        'data-status-pill': '',
        ...(isActive ? { 'data-status-active': 'true' } : {}),
      } as React.ButtonHTMLAttributes<HTMLButtonElement>}
      renderTrigger={() => (
        <>
          <StatusBadge value={value} options={col.options!} />
          <span aria-hidden className="not-italic ml-1 text-[10px] leading-none opacity-0 transition-opacity group-hover:opacity-70">▼</span>
        </>
      )}
      renderOption={(o) => {
        const optActive = o.value === 'in_progress' || o.value === 'testing'
        const optDone = o.value === 'done'
        const cls = optActive
          ? 'text-primary'
          : optDone
            ? 'text-pmw-positive'
            : 'text-muted-foreground'
        return (
          <span className={cn('inline-flex items-center font-serif text-[15px]', cls)}>
            <span aria-hidden className="mr-1.5 inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-current" />
            {o.label}
          </span>
        )
      }}
    />
  )
}

export function TodoTable({
  cases,
  columns,
  onUpdate,
  rowClass,
  activeDestById,
}: {
  cases: CaseRow[]
  columns: TodoColumn[]
  onUpdate: OnUpdate
  rowClass?: (row: CaseRow) => string
  /** caseId → 활성 여행지. scoped key 편집을 by_dest 로 라우팅하는 데 사용. */
  activeDestById?: Map<string, string | null>
}) {
  const [visible, setVisible] = useState(INITIAL_VISIBLE)
  const sentinelRef = useRef<HTMLTableRowElement>(null)

  // Reset visible count when cases or columns change
  useEffect(() => {
    setVisible(INITIAL_VISIBLE)
  }, [cases.length, columns])

  // Infinite scroll
  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visible < cases.length) {
          setVisible((v) => Math.min(v + LOAD_MORE_STEP, cases.length))
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [visible, cases.length])

  const visibleCases = cases.slice(0, visible)
  const { openCase } = useCases()

  return (
    <table className="w-full border-collapse table-fixed">
      <thead className="sticky top-0 z-10 bg-background">
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              className="text-left font-sans font-normal text-[12px] uppercase tracking-[0.08em] text-muted-foreground px-2 py-2.5 whitespace-nowrap border-b border-border/80"
              style={{ width: col.width, minWidth: col.width }}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {visibleCases.map((row) => (
          <tr
            key={row.id}
            className={cn(
              'border-b border-dashed border-border/80 hover:bg-accent/40 transition-colors cursor-pointer',
              rowClass?.(row),
            )}
            onClick={() => openCase(row.id)}
          >
            {columns.map((col) => {
              // readonly 셀은 행 클릭(네비게이션) 허용, 그 외 편집 셀은 클릭 전파 차단.
              const tdProps = col.readonly
                ? {}
                : { onClick: (e: React.MouseEvent) => e.stopPropagation() }
              return (
                <td
                  key={col.key}
                  className="px-2 py-4"
                  style={{ width: col.width, minWidth: col.width }}
                  {...tdProps}
                >
                  {col.condition && !col.condition(row) ? (
                    <span className="font-serif italic text-[15px] text-muted-foreground/30 px-1">—</span>
                  ) : col.type === 'custom' && col.render ? (
                    col.render(row, onUpdate)
                  ) : col.readonly ? (
                    <ReadonlyCell row={row} col={col} />
                  ) : col.type === 'select' && col.options ? (
                    <SelectCell row={row} col={col} onUpdate={onUpdate} activeDest={activeDestById?.get(row.id) ?? null} />
                  ) : (
                    <EditableCell row={row} col={col} onUpdate={onUpdate} activeDest={activeDestById?.get(row.id) ?? null} />
                  )}
                </td>
              )
            })}
          </tr>
        ))}
        {visible < cases.length && (
          <tr ref={sentinelRef}>
            <td colSpan={columns.length} className="text-center font-mono text-[11px] tracking-[0.3px] text-muted-foreground/50 py-2">
              <span className="tabular-nums">{visible}</span>
              <span className="mx-1">/</span>
              <span className="tabular-nums">{cases.length}</span>
              <span className="font-serif italic ml-1">건</span>
            </td>
          </tr>
        )}
        {cases.length === 0 && (
          <tr>
            <td colSpan={columns.length} className="text-center font-serif italic text-[15px] text-muted-foreground py-2xl">
              데이터가 없습니다
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
