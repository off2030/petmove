export type Category = "content" | "operations" | "system";
export type RunState =
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "needs_attention";
export interface AutomationSchedule {
  id: string;
  name: string;
  category: Category;
  source: "codex" | "github";
  host: string;
  schedule_kind: "rrule" | "cron";
  schedule_expression: string;
  timezone: "Asia/Seoul" | "UTC";
  state: "ACTIVE" | "PAUSED" | "UNKNOWN";
  description: string;
  source_url: string | null;
  synced_at: string;
}
export interface AutomationRun {
  id: string;
  schedule_id: string;
  state: RunState;
  started_at: string;
  ended_at: string | null;
  reported_at: string;
  summary: string;
  source_url: string | null;
}
export interface CalendarSnapshot {
  schedules: AutomationSchedule[];
  runs: AutomationRun[];
  fetched_at: string;
}
export const CATEGORY_LABEL: Record<Category, string> = {
  content: "콘텐츠",
  operations: "실무 점검",
  system: "시스템",
};
export const RUN_LABEL: Record<RunState, string> = {
  running: "실행 중",
  succeeded: "완료",
  failed: "실패",
  skipped: "건너뜀",
  needs_attention: "확인 필요",
};
const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
export function kstDay(instant: string | Date = new Date()): string {
  return new Date(new Date(instant).getTime() + 9 * 3600_000)
    .toISOString()
    .slice(0, 10);
}
export function addDay(day: string, offset: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + offset * 86400_000)
    .toISOString()
    .slice(0, 10);
}
export function kstTime(instant: string): string {
  return new Date(Date.parse(instant) + 9 * 3600_000)
    .toISOString()
    .slice(11, 16);
}
function cronField(
  field: string,
  value: number,
  min: number,
  max: number,
): boolean {
  return field.split(",").some((part) => {
    const [range, stepText] = part.split("/");
    const step = stepText ? Number(stepText) : 1;
    if (!Number.isInteger(step) || step < 1) return false;
    let start = min,
      end = max;
    if (range !== "*") {
      const ends = range.split("-").map(Number);
      start = ends[0];
      end = ends[1] ?? ends[0];
      if (stepText && ends.length === 1) end = max;
    }
    return (
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start >= min &&
      end <= max &&
      value >= start &&
      value <= end &&
      (value - start) % step === 0
    );
  });
}
/** 예정 시각만 계산한다. 과거 예정 시각을 실제 실행으로 간주하지 않는다. */
export function occurrencesForDay(
  schedule: AutomationSchedule,
  day: string,
): string[] {
  if (schedule.state !== "ACTIVE") return [];
  const out: string[] = [];
  if (schedule.schedule_kind === "rrule") {
    const r: Record<string, string> = Object.fromEntries(
      schedule.schedule_expression
        .replace(/^RRULE:/, "")
        .split(";")
        .map((p) => p.split("=")),
    );
    if (!["DAILY", "WEEKLY"].includes(r.FREQ) || Number(r.INTERVAL ?? 1) !== 1)
      return [];
    if (
      r.BYDAY &&
      !r.BYDAY.split(",").includes(
        DAYS[new Date(`${day}T00:00:00Z`).getUTCDay()],
      )
    )
      return [];
    if (!r.BYHOUR || schedule.timezone !== "Asia/Seoul") return [];
    const hours = r.BYHOUR.split(",").map(Number);
    const minutes = (r.BYMINUTE ?? "0").split(",").map(Number);
    for (const h of hours)
      for (const m of minutes) {
        if (
          Number.isInteger(h) &&
          Number.isInteger(m) &&
          h >= 0 &&
          h < 24 &&
          m >= 0 &&
          m < 60
        )
          out.push(
            new Date(
              `${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+09:00`,
            ).toISOString(),
          );
      }
    return out.sort();
  }
  const fields = schedule.schedule_expression.trim().split(/\s+/);
  if (fields.length !== 5) return [];
  for (let h = 0; h < 24; h++)
    for (let m = 0; m < 60; m++) {
      const instant = new Date(
        `${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+09:00`,
      );
      const dom = cronField(fields[2], instant.getUTCDate(), 1, 31);
      const dow =
        cronField(fields[4], instant.getUTCDay(), 0, 7) ||
        (instant.getUTCDay() === 0 && cronField(fields[4], 7, 0, 7));
      const dayMatch =
        fields[2] === "*" ? dow : fields[4] === "*" ? dom : dom || dow;
      if (
        cronField(fields[0], instant.getUTCMinutes(), 0, 59) &&
        cronField(fields[1], instant.getUTCHours(), 0, 23) &&
        cronField(fields[3], instant.getUTCMonth() + 1, 1, 12) &&
        dayMatch
      )
        out.push(instant.toISOString());
    }
  return out;
}
export function scheduleLabel(s: AutomationSchedule): string {
  if (s.schedule_kind === "cron") {
    const times = occurrencesForDay({ ...s, state: "ACTIVE" }, "2026-10-26");
    if (times.length > 24)
      return `하루 ${times.length}회 · ${times.length === 144 ? "10분 간격" : "반복 실행"}`;
    return times.length
      ? `매일 ${times.map(kstTime).join(" · ")}`
      : `UTC ${s.schedule_expression}`;
  }
  const rule: Record<string, string> = Object.fromEntries(
    s.schedule_expression
      .replace(/^RRULE:/, "")
      .split(";")
      .map((p) => p.split("=")),
  );
  const labels: Record<string, string> = {
    MO: "월",
    TU: "화",
    WE: "수",
    TH: "목",
    FR: "금",
    SA: "토",
    SU: "일",
  };
  const days = rule.BYDAY
    ? rule.BYDAY.split(",")
        .map((d) => labels[d] ?? d)
        .join("·")
    : "매일";
  return `${days} ${String(rule.BYHOUR ?? "0").padStart(2, "0")}:${String(rule.BYMINUTE ?? "0").padStart(2, "0")}`;
}
function text(value: unknown, max: number, required = true): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new Error("잘못된 기록 형식입니다.");
  return value.trim();
}
function url(value: unknown): string | null {
  if (value == null) return null;
  const u = new URL(text(value, 400));
  if (
    u.origin !== "https://github.com" ||
    !u.pathname.startsWith("/off2030/petmove/")
  )
    throw new Error("허용되지 않은 기록 링크입니다.");
  return u.href;
}
export function parseSchedule(input: unknown, now: string): AutomationSchedule {
  const s = input as AutomationSchedule;
  if (
    !s ||
    !["content", "operations", "system"].includes(s.category) ||
    !["codex", "github"].includes(s.source) ||
    !["rrule", "cron"].includes(s.schedule_kind) ||
    !["ACTIVE", "PAUSED", "UNKNOWN"].includes(s.state) ||
    !["Asia/Seoul", "UTC"].includes(s.timezone)
  )
    throw new Error("잘못된 예약 형식입니다.");
  if (
    (s.schedule_kind === "cron" && s.timezone !== "UTC") ||
    (s.schedule_kind === "rrule" && s.timezone !== "Asia/Seoul")
  )
    throw new Error("예약의 시간대를 확인해 주세요.");
  return {
    id: text(s.id, 180),
    name: text(s.name, 180),
    category: s.category,
    source: s.source,
    host: text(s.host, 80),
    schedule_kind: s.schedule_kind,
    schedule_expression: text(s.schedule_expression, 400),
    timezone: s.timezone,
    state: s.state,
    description: text(s.description ?? "", 800, false),
    source_url: url(s.source_url),
    synced_at: now,
  };
}
export function parseRun(input: unknown, now: string): AutomationRun {
  const r = input as AutomationRun;
  if (
    !r ||
    !Object.keys(RUN_LABEL).includes(r.state) ||
    !Number.isFinite(Date.parse(r.started_at))
  )
    throw new Error("잘못된 실행 기록입니다.");
  if (
    r.ended_at != null &&
    (!Number.isFinite(Date.parse(r.ended_at)) ||
      Date.parse(r.ended_at) < Date.parse(r.started_at))
  )
    throw new Error("실행 시각을 확인해 주세요.");
  if (r.state === "running" ? r.ended_at != null : r.ended_at == null)
    throw new Error("실행 종료 시각을 확인해 주세요.");
  return {
    id: text(r.id, 200),
    schedule_id: text(r.schedule_id, 180),
    state: r.state,
    started_at: r.started_at,
    ended_at: r.ended_at ?? null,
    reported_at: now,
    summary: text(r.summary ?? "", 600, false),
    source_url: url(r.source_url),
  };
}
