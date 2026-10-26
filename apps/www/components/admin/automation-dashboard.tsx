"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  addDay,
  CATEGORY_LABEL,
  kstDay,
  kstTime,
  occurrencesForDay,
  RUN_LABEL,
  scheduleLabel,
  type AutomationSchedule,
  type CalendarSnapshot,
  type Category,
} from "@/lib/automation-calendar";
function calendarName(s: AutomationSchedule) {
  if (s.id === "github:backup-db.yml") return "DB 백업";
  if (s.id === "github:send-milestone-pushes.yml") return "앱 알림 확인";
  if (s.name.includes("예약 발행 글")) return "예약 글 35편";
  if (s.name.includes("이메일·검사")) return "이메일·검사 점검";
  return s.name;
}
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
function monthTitle(month: string) {
  return `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`;
}
function shiftMonth(month: string, delta: number) {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}
export function AutomationDashboard({
  initial,
}: {
  initial: CalendarSnapshot;
}) {
  const panel = useRef<HTMLElement>(null);
  function selectDay(day: string) {
    setSelected(day);
    if (window.innerWidth < 1190)
      panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const [snapshot, setSnapshot] = useState(initial);
  const today = kstDay(snapshot.fetched_at);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [category, setCategory] = useState<Category | "all">("all");
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/admin/data/", { cache: "no-store" });
      if (res.status === 401) {
        window.location.assign("/admin/");
        return;
      }
      if (!res.ok)
        throw new Error(
          "일정 새로고침에 실패했습니다. 마지막으로 불러온 기록을 표시합니다.",
        );
      setSnapshot(await res.json());
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "다시 시도해 주세요.");
    } finally {
      setRefreshing(false);
    }
  }
  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const schedules = snapshot.schedules.filter(
    (s) => category === "all" || s.category === category,
  );
  const first = `${month}-01`;
  const gridStart = addDay(first, -new Date(`${first}T00:00:00Z`).getUTCDay());
  const days = useMemo(
    () => Array.from({ length: 42 }, (_, i) => addDay(gridStart, i)),
    [gridStart],
  );
  const events = useMemo(
    () =>
      Object.fromEntries(
        days.map((day) => [
          day,
          schedules.flatMap((s) => {
            const times = occurrencesForDay(s, day);
            return times.length ? [{ s, times }] : [];
          }),
        ]),
      ),
    [days, schedules],
  );
  const selectedEvents =
    events[selected] ??
    schedules.flatMap((s) => {
      const times = occurrencesForDay(s, selected);
      return times.length ? [{ s, times }] : [];
    });
  const selectedRuns = snapshot.runs.filter(
    (r) =>
      kstDay(r.started_at) === selected &&
      schedules.some((s) => s.id === r.schedule_id),
  );
  const todayRuns = snapshot.runs.filter((r) => kstDay(r.started_at) === today);
  const active = snapshot.schedules.filter((s) => s.state === "ACTIVE");
  const upcoming = active
    .flatMap((s) => {
      for (let i = 0; i < 8; i++) {
        const next = occurrencesForDay(s, addDay(today, i)).find(
          (t) => t >= snapshot.fetched_at,
        );
        if (next) return [{ s, next }];
      }
      return [];
    })
    .sort((a, b) => a.next.localeCompare(b.next))
    .slice(0, 3);
  const statusOf = (s: AutomationSchedule) => {
    const run = snapshot.runs.find(
      (r) => r.schedule_id === s.id && kstDay(r.started_at) === selected,
    );
    if (run) return { label: RUN_LABEL[run.state], state: run.state };
    return {
      label:
        selected > today
          ? "예정"
          : selected === today
            ? "예정 · 실행 기록 대기"
            : "실행 기록 없음",
      state: "unreported",
    };
  };
  function changeMonth(delta: number) {
    const next = shiftMonth(month, delta);
    setMonth(next);
    setSelected(`${next}-01`);
  }
  return (
    <main className="pm-admin">
      <aside className="pm-admin-nav">
        <Link href="/" className="pm-admin-brand">
          petmove<span>관리자</span>
        </Link>
        <div className="pm-admin-nav-caption">WORKSPACE</div>
        <a href="/admin/" className="pm-admin-nav-active">
          <span>▦</span> 자동화 달력
        </a>
        <div className="pm-admin-nav-bottom">
          <span className="pm-admin-lock">● 비공개 관리자 화면</span>
          <form action="/admin/logout/" method="post">
            <button>로그아웃 ↗</button>
          </form>
        </div>
      </aside>
      <div className="pm-admin-content">
        <header className="pm-admin-header">
          <div>
            <span className="pm-admin-eyebrow">WORK AUTOMATION</span>
            <h1>
              자동화 달력<span>언제, 어떤 작업이 돌아가는지.</span>
            </h1>
          </div>
          <button
            className="pm-admin-refresh"
            onClick={() => void refresh()}
            disabled={refreshing}
          >
            {refreshing ? "불러오는 중…" : "↻ 새로고침"}
          </button>
        </header>
        {notice && (
          <p role="alert" className="pm-admin-notice">
            {notice}
          </p>
        )}
        <section className="pm-admin-stats" aria-label="자동화 현황">
          <div>
            <span>등록된 활성 작업</span>
            <strong>
              {active.length}
              <small>개</small>
            </strong>
            <p>현재 동기화된 예약 기준</p>
          </div>
          <div>
            <span>오늘 시작된 실행</span>
            <strong>
              {todayRuns.length}
              <small>회</small>
            </strong>
            <p>실제 보고된 기록만 집계</p>
          </div>
          <div>
            <span>확인할 실행</span>
            <strong
              className={
                todayRuns.some((r) =>
                  ["failed", "needs_attention"].includes(r.state),
                )
                  ? "pm-admin-attention"
                  : ""
              }
            >
              {
                todayRuns.filter((r) =>
                  ["failed", "needs_attention"].includes(r.state),
                ).length
              }
              <small>건</small>
            </strong>
            <p>실패 · 사용자 확인 필요</p>
          </div>
        </section>
        <section className="pm-admin-upcoming">
          <span>다음 작업</span>
          {upcoming.length ? (
            upcoming.map(({ s, next }) => (
              <div key={s.id}>
                <i className={`pm-admin-dot ${s.category}`} />
                <b>{s.name}</b>
                <time>
                  {kstDay(next) === today
                    ? "오늘"
                    : kstDay(next).slice(5).replace("-", "/")}{" "}
                  {kstTime(next)}
                </time>
              </div>
            ))
          ) : (
            <p>확인된 다음 예약이 없습니다.</p>
          )}
        </section>
        <div className="pm-admin-workspace">
          <section className="pm-admin-calendar-card">
            <div className="pm-admin-calendar-tools">
              <div className="pm-admin-month">
                <button aria-label="이전 달" onClick={() => changeMonth(-1)}>
                  ‹
                </button>
                <h2>{monthTitle(month)}</h2>
                <button aria-label="다음 달" onClick={() => changeMonth(1)}>
                  ›
                </button>
                <button
                  className="pm-admin-today"
                  onClick={() => {
                    setMonth(today.slice(0, 7));
                    setSelected(today);
                  }}
                >
                  오늘
                </button>
              </div>
              <div className="pm-admin-view">
                <button
                  aria-pressed={view === "calendar"}
                  onClick={() => setView("calendar")}
                >
                  월간
                </button>
                <button
                  aria-pressed={view === "list"}
                  onClick={() => setView("list")}
                >
                  작업 목록
                </button>
              </div>
            </div>
            <div className="pm-admin-filters">
              {(["all", "content", "operations", "system"] as const).map(
                (c) => (
                  <button
                    key={c}
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                  >
                    {c === "all" ? "전체" : CATEGORY_LABEL[c]}
                  </button>
                ),
              )}
              <span>모든 시각은 한국 시간</span>
            </div>
            {view === "calendar" ? (
              <>
                <div className="pm-admin-week">
                  {WEEK.map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <div className="pm-admin-grid">
                  {days.map((day) => (
                    <div
                      className={`pm-admin-day ${day.slice(0, 7) !== month ? "outside" : ""} ${selected === day ? "selected" : ""}`}
                      key={day}
                      onClick={() => selectDay(day)}
                    >
                      <button
                        className={`pm-admin-date ${day === today ? "today" : ""}`}
                        aria-label={`${day} 일정 보기`}
                        aria-pressed={selected === day}
                        onClick={() => selectDay(day)}
                      >
                        {Number(day.slice(8))}
                      </button>
                      <div className="pm-admin-day-events">
                        {(events[day] ?? []).map(({ s, times }) => (
                          <button
                            key={s.id}
                            className={`pm-admin-event ${s.category}`}
                            onClick={() => selectDay(day)}
                            title={`${s.name} · ${s.host} · ${scheduleLabel(s)}`}
                          >
                            <span>
                              {times.length > 4 ? "↻" : kstTime(times[0])}
                            </span>
                            <b>{calendarName(s)}</b>
                            {times.length > 4 && <small>반복</small>}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="pm-admin-task-list">
                {schedules.map((s) => (
                  <article key={s.id}>
                    <i className={`pm-admin-dot ${s.category}`} />
                    <div>
                      <h3>{s.name}</h3>
                      <p>{s.description}</p>
                      <small>
                        {s.host} ·{" "}
                        {s.source === "codex" ? "Codex 예약" : "GitHub Actions"}
                      </small>
                    </div>
                    <div>
                      <b>{scheduleLabel(s)}</b>
                      <span>
                        {s.state === "ACTIVE"
                          ? "활성"
                          : s.state === "PAUSED"
                            ? "일시 중지"
                            : "상태 확인 필요"}
                      </span>
                    </div>
                  </article>
                ))}
                {!schedules.length && (
                  <p className="pm-admin-empty">
                    아직 동기화된 작업이 없습니다.
                  </p>
                )}
              </div>
            )}
            <footer className="pm-admin-calendar-foot">
              <span>
                <i className="pm-admin-dot content" />
                콘텐츠
              </span>
              <span>
                <i className="pm-admin-dot operations" />
                실무 점검
              </span>
              <span>
                <i className="pm-admin-dot system" />
                시스템
              </span>
              <small>같은 날의 짧은 반복 작업은 한 줄로 표시합니다.</small>
            </footer>
          </section>
          <aside ref={panel} className="pm-admin-day-panel">
            <span className="pm-admin-eyebrow">DAY OVERVIEW</span>
            <h2>
              {Number(selected.slice(5, 7))}월 {Number(selected.slice(8))}일{" "}
              <small>
                {WEEK[new Date(`${selected}T00:00:00Z`).getUTCDay()]}요일
              </small>
            </h2>
            <div className="pm-admin-panel-count">
              예정 작업 {selectedEvents.length}개 · 실행 기록{" "}
              {selectedRuns.length}개
            </div>
            <h3>예정된 작업</h3>
            {selectedEvents.length ? (
              selectedEvents.map(({ s, times }) => {
                const status = statusOf(s);
                return (
                  <article className="pm-admin-planned" key={s.id}>
                    <div>
                      <i className={`pm-admin-dot ${s.category}`} />
                      <time>
                        {times.length > 4
                          ? scheduleLabel(s)
                          : times.map(kstTime).join(" · ")}
                      </time>
                      <span className={`pm-admin-status ${status.state}`}>
                        {times.length > 4 && status.state !== 'unreported' ? `최근 ${status.label}` : status.label}
                      </span>
                    </div>
                    <h4>{s.name}</h4>
                    <p>{s.description}</p>
                    <small>
                      {s.host} · {scheduleLabel(s)}
                    </small>
                    <small>
                      예약 확인 {kstDay(s.synced_at).slice(5).replace("-", "/")}{" "}
                      {kstTime(s.synced_at)}
                    </small>
                  </article>
                );
              })
            ) : (
              <p className="pm-admin-empty">확인된 예약이 없습니다.</p>
            )}
            <h3>실제 실행 기록</h3>
            {selectedRuns.length ? (
              <div className="pm-admin-run-list">
                {selectedRuns.slice(0, 30).map((r) => {
                  const s = snapshot.schedules.find(
                    (s) => s.id === r.schedule_id,
                  );
                  return (
                    <article key={r.id}>
                      <div>
                        <span className={`pm-admin-status ${r.state}`}>
                          {RUN_LABEL[r.state]}
                        </span>
                        <time>
                          {kstTime(r.started_at)}
                          {r.ended_at ? ` → ${kstTime(r.ended_at)}` : ""}
                        </time>
                      </div>
                      <h4>{s?.name ?? r.schedule_id}</h4>
                      {r.summary && <p>{r.summary}</p>}
                      {r.source_url && (
                        <a href={r.source_url} target="_blank" rel="noreferrer">
                          실행 기록 열기 ↗
                        </a>
                      )}
                    </article>
                  );
                })}
                {selectedRuns.length > 30 && (
                  <p className="pm-admin-muted">최근 30개 실행을 표시합니다.</p>
                )}
              </div>
            ) : (
              <p className="pm-admin-empty">
                아직 보고된 실행이 없습니다.
                <br />
                기록이 없는 작업을 완료로 표시하지 않습니다.
              </p>
            )}
            <p className="pm-admin-panel-note">
              이 달력은 자동화의 예약과 실행 기록입니다. 예약 시각과 실제 시작
              시각은 다를 수 있습니다. 실행 기록은 최근 62일을 조회합니다.
              고객의 검사·신고 상태는 펫무브워크에서 확인하세요.
            </p>
          </aside>
        </div>
        <footer className="pm-admin-page-foot">
          <span>
            마지막 새로고침 {kstDay(snapshot.fetched_at)}{" "}
            {kstTime(snapshot.fetched_at)} · 1분마다 갱신
          </span>
          <span>예약 변경은 원래 자동화 설정에서 관리합니다.</span>
        </footer>
      </div>
    </main>
  );
}
