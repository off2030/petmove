"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  normalizeCoOwner,
  coOwnerEnglishName,
  readCoOwner,
  type CaseRow,
  type CoOwnerName,
} from "@petmove/domain";
import { useConfirm } from "@petmove/ui";
import { updateCaseField } from "@/lib/actions/cases";
import { persistField } from "@/lib/toast-bus";
import { SectionLabel } from "@/components/ui/section-label";
import { useCases } from "./cases-context";
import { CopyButton } from "./copy-button";
import { useSectionEditMode } from "./section-edit-mode-context";

const EMPTY: CoOwnerName = { name_ko: "", first_name_en: "", last_name_en: "" };
export function CoOwnerNameRow({
  caseRow,
  onDone,
}: {
  caseRow: CaseRow;
  onDone: () => void;
}) {
  const stored = readCoOwner(caseRow.data);
  const displayEnglish =
    stored && (stored.first_name_en || stored.last_name_en)
      ? coOwnerEnglishName(stored)
      : "";
  const [editing, setEditing] = useState(!stored);
  const [draft, setDraft] = useState<CoOwnerName>(stored ?? EMPTY);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const { updateLocalCaseField } = useCases();
  const editMode = useSectionEditMode();
  const confirm = useConfirm();
  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);
  function edit() {
    if (!editMode || saving) return;
    setDraft(stored ?? EMPTY);
    setError("");
    setEditing(true);
  }
  function cancel() {
    if (saving) return;
    setEditing(false);
    setError("");
    onDone();
  }
  function save(value: CoOwnerName | null = draft) {
    let next: CoOwnerName | null;
    try {
      next = normalizeCoOwner(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : "이름을 확인해 주세요.");
      return;
    }
    if (JSON.stringify(next) === JSON.stringify(stored)) {
      cancel();
      return;
    }
    setError("");
    startSaving(async () => {
      const result = await persistField("공동 보호자", async () => {
        const saved = await updateCaseField(
          caseRow.id,
          "data",
          "co_owner",
          next,
        );
        if (saved.ok) {
          updateLocalCaseField(caseRow.id, "data", "co_owner", next);
          setEditing(false);
          onDone();
        }
        return saved;
      });
      if (!result)
        setError("저장하지 못했습니다. 입력값을 확인하고 다시 저장해 주세요.");
    });
  }
  async function remove() {
    if (
      await confirm({
        message: "공동 보호자를 삭제할까요?",
        description:
          "기존 보호자 이름은 유지되며, 이후 생성하는 서류에는 기존 보호자만 표시됩니다.",
        okLabel: "삭제",
      })
    )
      save(null);
  }
  return (
    <div
      data-field="co_owner"
      className="grid grid-cols-1 md:grid-cols-[180px_1fr] items-start gap-md py-2.5 border-b border-border/80 last:border-0"
    >
      <SectionLabel
        className="pt-1"
        onClick={editMode ? edit : undefined}
        title="공동 보호자 이름 편집"
      >
        공동 보호자
      </SectionLabel>
      <div className="min-w-0">
        {editing ? (
          <form
            className="flex flex-wrap items-center gap-sm"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
              if (e.key === "Enter" && e.nativeEvent.isComposing)
                e.preventDefault();
            }}
          >
            <input
              ref={input}
              aria-label="공동 보호자 한글 이름"
              placeholder="한글이름"
              value={draft.name_ko}
              maxLength={120}
              disabled={saving}
              onChange={(e) => setDraft({ ...draft, name_ko: e.target.value })}
              className="h-8 w-32 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none"
            />
            <span className="text-muted-foreground/30 select-none">|</span>
            <input
              aria-label="공동 보호자 영문 이름"
              placeholder="First"
              value={draft.first_name_en}
              maxLength={120}
              disabled={saving}
              onChange={(e) =>
                setDraft({ ...draft, first_name_en: e.target.value })
              }
              className="h-8 w-28 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none"
            />
            <input
              aria-label="공동 보호자 영문 성"
              placeholder="Last"
              value={draft.last_name_en}
              maxLength={120}
              disabled={saving}
              onChange={(e) =>
                setDraft({ ...draft, last_name_en: e.target.value })
              }
              className="h-8 w-28 rounded-md border border-border/80 bg-background px-2 text-base focus-visible:outline-none"
            />
            <button
              type="submit"
              disabled={saving}
              className="shrink-0 whitespace-nowrap inline-flex h-7 items-center justify-center rounded border px-2 text-[11px] border-pmw-accent bg-pmw-accent/15 text-pmw-accent-strong hover:bg-pmw-accent/25 disabled:opacity-50"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              취소
            </button>
            {error && (
              <p role="alert" className="w-full text-xs text-destructive">
                {error}
              </p>
            )}
          </form>
        ) : (
          <div className="flex flex-wrap items-baseline gap-[10px] min-w-0">
            <button
              type="button"
              onClick={edit}
              disabled={!editMode}
              className="rounded-md px-2 py-1 -mx-2 font-serif text-[17px] font-medium text-muted-foreground hover:bg-accent/40"
            >
              {stored?.name_ko || "—"}
            </button>
            <span className="text-muted-foreground/30 select-none">|</span>
            <span className="group/co inline-flex items-baseline">
              <button
                type="button"
                onClick={edit}
                disabled={!editMode}
                className="rounded-md px-2 py-1 -mx-2 font-serif italic text-[17px] text-foreground hover:bg-accent/40"
              >
                {displayEnglish || "—"}
              </button>
              <CopyButton
                value={displayEnglish}
                className="ml-1 opacity-0 group-hover/co:opacity-100"
              />
            </span>
            {editMode && (
              <button
                type="button"
                onClick={() => void remove()}
                disabled={saving}
                aria-label="공동 보호자 삭제"
                className="ml-auto text-[11px] text-muted-foreground hover:text-destructive"
              >
                삭제
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
