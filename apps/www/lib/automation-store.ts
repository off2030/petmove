import type {
  AutomationSchedule,
  AutomationRun,
  CalendarSnapshot,
} from "./automation-calendar";
function config() {
  const base = process.env.SUPABASE_URL;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  const key = process.env.AUTOMATION_CALENDAR_DB_KEY;
  if (!base || !publishable || !key)
    throw new Error("자동화 달력 저장소가 연결되지 않았습니다.");
  return {
    base,
    headers: {
      apikey: publishable,
      Authorization: `Bearer ${publishable}`,
      "x-calendar-key": key,
      "Content-Type": "application/json",
    },
  };
}
async function request(
  table: "schedules" | "runs",
  query: string,
  options: RequestInit = {},
) {
  const c = config();
  const res = await fetch(
    `${c.base}/rest/v1/automation_calendar_${table}${query}`,
    {
      ...options,
      headers: { ...c.headers, ...options.headers },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) throw new Error(`자동화 달력 저장소 응답 오류 (${res.status})`);
  return res;
}
export async function loadCalendar(): Promise<CalendarSnapshot> {
  const since = new Date(Date.now() - 62 * 86400_000).toISOString();
  async function readRuns() {
    const runs: AutomationRun[] = [];
    // PostgREST의 기본 1,000행 제한으로 오래된 실행이 조용히 누락되지 않게 페이지를 읽는다.
    for (let offset = 0; ; offset += 1000) {
      const response = await request(
        "runs",
        `?select=*&started_at=gte.${encodeURIComponent(since)}&order=started_at.desc,id.desc&limit=1000&offset=${offset}`,
      );
      const page: AutomationRun[] = await response.json();
      runs.push(...page);
      if (page.length < 1000) return runs;
    }
  }
  const [s, runs] = await Promise.all([
    request("schedules", "?select=*&order=source.asc,name.asc"),
    readRuns(),
  ]);
  return {
    schedules: await s.json(),
    runs,
    fetched_at: new Date().toISOString(),
  };
}
export async function saveCalendar(
  schedules: AutomationSchedule[],
  runs: AutomationRun[],
): Promise<void> {
  const opts = {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  };
  if (schedules.length)
    await request("schedules", "?on_conflict=id", {
      ...opts,
      body: JSON.stringify(schedules),
    });
  if (runs.length)
    await request("runs", "?on_conflict=id", {
      ...opts,
      body: JSON.stringify(runs),
    });
}
