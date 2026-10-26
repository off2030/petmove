#!/usr/bin/env node
/** 예약 메타데이터·실행 기록만 전송한다. 고객/동물/검사/신고 데이터는 읽지 않는다. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
const STATE = path.join(HOME, "automation-calendar");
const CONFIG = path.join(STATE, "reporter.json");
const args = process.argv.slice(2),
  command = args[0] ?? "sync";
function option(name, fallback = "") {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback;
}
function config() {
  const local = fs.existsSync(CONFIG)
    ? JSON.parse(fs.readFileSync(CONFIG, "utf8"))
    : {};
  const token = process.env.AUTOMATION_REPORT_TOKEN ?? local.reportToken;
  if (!token)
    throw new Error(
      "달력 연결 설정이 없습니다. docs/work-management/automation-calendar.md를 확인하세요.",
    );
  return {
    token,
    base:
      process.env.AUTOMATION_CALENDAR_URL ??
      local.baseUrl ??
      "https://www.petmove.co.kr/api/internal/automation-calendar/",
    hostId: local.hostId ?? "work-pc",
    host: local.hostLabel ?? "업무 PC",
  };
}
/** 현재 예약 파일의 기본 문자열·배열만 읽는다. prompt 는 전송 대상이 아니다. */
function readToml(file) {
  const result = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([a-z_]+)\s*=\s*(.*)$/);
    if (!match || match[1] === "prompt") continue;
    try {
      result[match[1]] = JSON.parse(match[2]);
    } catch {
      /* 알 수 없는 TOML 필드는 건드리지 않는다. */
    }
  }
  return result;
}
function localSchedules(c) {
  const dir = path.join(HOME, "automations");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => {
      const file = path.join(dir, d.name, "automation.toml");
      if (!fs.existsSync(file)) return [];
      const a = readToml(file);
      if (!a.id || !a.rrule) return [];
      // 이 저장소의 펫무브 예약만. 다른 프로젝트나 개인 예약을 웹에 올리지 않는다.
      if (!String(a.name ?? "").includes("펫무브")) return [];
      const content =
        String(a.name).includes("발행") || String(a.name).includes("콘텐츠");
      return [
        {
          id: `codex:${c.hostId}:${a.id}`,
          name: a.name,
          category: content ? "content" : "operations",
          source: "codex",
          host: c.host,
          schedule_kind: "rrule",
          schedule_expression: a.rrule,
          timezone: "Asia/Seoul",
          state: a.status ?? "UNKNOWN",
          source_url: null,
          description: content
            ? "실제 예약 발행 수를 확인하고 필요한 글을 작성·예약합니다."
            : "이메일·검사 대기와 기존 미완료 업무를 확인합니다.",
        },
      ];
    });
}
function githubSchedules() {
  return fs
    .readdirSync(path.join(ROOT, ".github", "workflows"))
    .filter((f) => /\.ya?ml$/.test(f))
    .flatMap((file) => {
      const text = fs.readFileSync(
        path.join(ROOT, ".github", "workflows", file),
        "utf8",
      );
      const crons = [...text.matchAll(/^\s*- cron:\s*['"]([^'"]+)['"]/gm)].map(
        (m) => m[1],
      );
      if (!crons.length) return [];
      const name = text.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? file;
      const friendly =
        file === "backup-db.yml"
          ? "데이터베이스 백업"
          : file === "send-milestone-pushes.yml"
            ? "보호자 앱 알림 확인"
            : name;
      return crons.map((cron, i) => ({
        id: `github:${file}${i ? `:${i}` : ""}`,
        name: friendly,
        category: "system",
        source: "github",
        host: "GitHub",
        schedule_kind: "cron",
        schedule_expression: cron,
        timezone: "UTC",
        state: "ACTIVE",
        source_url: `https://github.com/off2030/petmove/actions/workflows/${file}`,
        description:
          file === "backup-db.yml"
            ? "데이터베이스를 백업하고 비공개 Drive에 보관합니다."
            : "완료된 준비 단계의 알림을 확인하고 보호자 앱에 전달합니다.",
      }));
    });
}
function githubHistory(schedules) {
  const runs = [];
  for (const s of schedules) {
    const file = s.id.slice("github:".length).split(":")[0];
    try {
      const jobs = JSON.parse(
        execFileSync(
          "gh",
          [
            "run",
            "list",
            "--repo",
            "off2030/petmove",
            "--workflow",
            file,
            "--limit",
            "15",
            "--json",
            "databaseId,status,conclusion,startedAt,updatedAt,url",
          ],
          { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        ),
      );
      const workflow = JSON.parse(
        execFileSync(
          "gh",
          ["api", `repos/off2030/petmove/actions/workflows/${file}`],
          { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        ),
      );
      s.state = workflow.state === "active" ? "ACTIVE" : "PAUSED";
      for (const job of jobs) {
        if (job.status === "queued" || !job.startedAt) continue;
        const done = job.status === "completed";
        const state = done
          ? job.conclusion === "success"
            ? "succeeded"
            : ["cancelled", "skipped", "neutral"].includes(job.conclusion)
              ? "skipped"
              : "failed"
          : "running";
        runs.push({
          id: `github:${job.databaseId}`,
          schedule_id: s.id,
          state,
          started_at: job.startedAt,
          ended_at: done ? job.updatedAt : null,
          summary: "GitHub Actions 실행 기록",
          source_url: job.url,
        });
      }
    } catch {
      console.warn(
        `[automation-calendar] ${file}: GitHub 기록을 가져오지 못했습니다. 예약만 동기화합니다.`,
      );
    }
  }
  return runs;
}
async function send(c, payload, queue = true) {
  try {
    const response = await fetch(c.base, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`기록 서버 응답 ${response.status}`);
    const saved = await response.json();
    if (saved.ok !== true) throw new Error("저장 확인 응답이 없습니다.");
    return saved;
  } catch (error) {
    if (queue && !process.env.GITHUB_ACTIONS) {
      fs.mkdirSync(path.join(STATE, "outbox"), { recursive: true });
      fs.writeFileSync(
        path.join(STATE, "outbox", `${Date.now()}-${randomUUID()}.json`),
        JSON.stringify(payload),
      );
      error.queued = true;
    }
    throw error;
  }
}
async function flush(c) {
  const dir = path.join(STATE, "outbox");
  if (!fs.existsSync(dir)) return;
  for (const file of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    const full = path.join(dir, file);
    await send(c, JSON.parse(fs.readFileSync(full, "utf8")), false);
    fs.unlinkSync(full);
  }
}
async function sync(c, history = true) {
  const gh = githubSchedules(),
    schedules = [...localSchedules(c), ...gh];
  const runs = history ? githubHistory(gh) : [];
  await send(c, { schedules, runs });
  console.log(
    `[automation-calendar] 예약 ${schedules.length}개 · 실제 실행 ${runs.length}개 저장 확인`,
  );
}
function runFile(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("예약 ID를 확인하세요.");
  return path.join(STATE, `run-${id}.json`);
}
async function main() {
  const c = config();
  fs.mkdirSync(STATE, { recursive: true });
  if (command === "sync") {
    await flush(c);
    await sync(c);
    return;
  }
  if (command === "start") {
    const id = option("id"),
      file = runFile(id);
    await flush(c).catch(() => {});
    const schedules = localSchedules(c),
      schedule = schedules.find((s) => s.id === `codex:${c.hostId}:${id}`);
    if (!schedule)
      throw new Error("현재 기기의 펫무브 예약을 찾을 수 없습니다.");
    if (fs.existsSync(file))
      throw new Error(
        "이전 실행의 종료 기록이 남아 있습니다. 기존 실행을 확인한 후 finish로 정리해 주세요.",
      );
    const run = {
      id: `codex:${c.hostId}:${id}:${randomUUID()}`,
      schedule_id: schedule.id,
      state: "running",
      started_at: new Date().toISOString(),
      ended_at: null,
      summary: "자동화 실행 시작",
      source_url: null,
    };
    fs.writeFileSync(file, JSON.stringify(run));
    await send(c, { schedules, runs: [run] });
    console.log(`[automation-calendar] 시작 기록 저장 확인 (${id})`);
    return;
  }
  if (command === "finish") {
    const id = option("id"),
      file = runFile(id),
      state = option("status", "succeeded");
    if (!["succeeded", "failed", "skipped", "needs_attention"].includes(state))
      throw new Error("종료 상태를 확인하세요.");
    if (!fs.existsSync(file))
      throw new Error("시작 기록이 없어 실행 시각을 추정하지 않습니다.");
    const run = JSON.parse(fs.readFileSync(file, "utf8"));
    Object.assign(run, {
      state,
      ended_at: new Date().toISOString(),
      summary: option("summary", "자동화 실행 종료").slice(0, 600),
    });
    try {
      await send(c, { runs: [run] });
      console.log(
        `[automation-calendar] 종료 기록 저장 확인 (${id}, ${state})`,
      );
    } catch (error) {
      if (error.queued) fs.unlinkSync(file);
      throw error;
    }
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
    return;
  }
  if (command === "github") {
    const schedules = githubSchedules(),
      file = option("workflow"),
      schedule = schedules.find((s) => s.id === `github:${file}`);
    if (!schedule || !process.env.GITHUB_RUN_ID)
      throw new Error("GitHub 실행 문맥이 필요합니다.");
    const jobs = githubHistory(schedules);
    const id = `github:${process.env.GITHUB_RUN_ID}`;
    let run = jobs.find((r) => r.id === id);
    if (!run)
      run = {
        id,
        schedule_id: schedule.id,
        state: "running",
        started_at: new Date().toISOString(),
        ended_at: null,
        summary: "GitHub Actions 실행",
        source_url: `https://github.com/off2030/petmove/actions/runs/${process.env.GITHUB_RUN_ID}`,
      };
    if (option("phase") === "finish") {
      run.state =
        process.env.CALENDAR_RUN_STATUS === "success"
          ? "succeeded"
          : ["cancelled", "skipped"].includes(process.env.CALENDAR_RUN_STATUS)
            ? "skipped"
            : "failed";
      run.ended_at = new Date().toISOString();
      run.summary = "GitHub Actions 작업 종료";
    }
    await send(c, {
      schedules,
      runs: [...jobs.filter((r) => r.id !== id), run],
    });
    console.log("[automation-calendar] GitHub 실행 기록 저장 확인");
    return;
  }
  throw new Error(
    "sync, start --id, finish --id --status --summary, github 명령을 사용하세요.",
  );
}
main().catch((error) => {
  console.error(`[automation-calendar] ${error.message}`);
  process.exitCode = 1;
});
