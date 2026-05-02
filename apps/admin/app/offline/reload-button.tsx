'use client'

export function ReloadButton() {
  return (
    <button
      type="button"
      onClick={() => location.reload()}
      className="rounded-full border border-foreground/30 px-md py-1.5 font-serif text-[13px] hover:bg-muted/40"
    >
      다시 시도
    </button>
  )
}
