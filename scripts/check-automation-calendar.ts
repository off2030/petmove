import assert from "node:assert/strict";
import {
  occurrencesForDay,
  parseRun,
  parseSchedule,
  kstTime,
  kstDay,
  type AutomationSchedule,
} from "../apps/www/lib/automation-calendar";
import {
  createAdminSession,
  verifyAdminSession,
  verifySecret,
  sha256,
  isSameOrigin,
  SESSION_SECONDS,
} from "../apps/www/lib/admin-auth";
const now = "2026-10-26T04:00:00Z";
const base: AutomationSchedule = {
  id: "test",
  name: "테스트",
  category: "system",
  source: "github",
  host: "GitHub",
  schedule_kind: "cron",
  schedule_expression: "0 17 * * *",
  timezone: "UTC",
  state: "ACTIVE",
  description: "",
  source_url: null,
  synced_at: now,
};
assert.deepEqual(occurrencesForDay(base, "2026-10-26"), [
  "2026-10-25T17:00:00.000Z",
]);
const frequent = occurrencesForDay(
  { ...base, schedule_expression: "3,13,23,33,43,53 * * * *" },
  "2026-10-26",
);
assert.equal(frequent.length, 144);
assert.equal(kstTime(frequent[0]), "00:03");
assert.equal(kstTime(frequent.at(-1)!), "23:53");
assert.equal(
  occurrencesForDay({ ...base, schedule_expression: "0 4 * * 7" }, "2026-11-01")
    .length,
  1,
);
assert.equal(
  occurrencesForDay(
    { ...base, schedule_expression: "0 4 * * 1-7" },
    "2026-11-01",
  ).length,
  1,
);
const weekly = {
  ...base,
  source: "codex" as const,
  timezone: "Asia/Seoul" as const,
  schedule_kind: "rrule" as const,
  schedule_expression: "FREQ=WEEKLY;BYDAY=MO,TU,WE,FR,SA;BYHOUR=13;BYMINUTE=0",
};
assert.deepEqual(occurrencesForDay(weekly, "2026-10-26"), [
  "2026-10-26T04:00:00.000Z",
]);
assert.deepEqual(occurrencesForDay(weekly, "2026-10-29"), []);
assert.deepEqual(
  occurrencesForDay({ ...weekly, state: "PAUSED" }, "2026-10-26"),
  [],
);
assert.equal(kstDay("2026-10-25T17:00:00Z"), "2026-10-26");
const clean = parseSchedule(
  { ...base, prompt: "never expose", secret: "never expose" },
  now,
);
assert.equal("prompt" in clean, false);
assert.equal("secret" in clean, false);
assert.throws(() =>
  parseSchedule(
    { ...base, source_url: "https://github.com.evil.test/off2030/petmove/" },
    now,
  ),
);
assert.throws(() =>
  parseSchedule({ ...base, source_url: "https://github.com/other/repo/" }, now),
);
assert.throws(() =>
  parseRun(
    {
      id: "x",
      schedule_id: "test",
      state: "succeeded",
      started_at: now,
      ended_at: null,
    },
    now,
  ),
);
assert.throws(() =>
  parseRun(
    {
      id: "x",
      schedule_id: "test",
      state: "running",
      started_at: now,
      ended_at: now,
    },
    now,
  ),
);
assert.throws(() =>
  parseRun(
    {
      id: "x",
      schedule_id: "test",
      state: "failed",
      started_at: now,
      ended_at: "2026-10-25T00:00:00Z",
    },
    now,
  ),
);
const key = "test-key-only",
  hash = sha256(key),
  secret = "unit-test-session-secret-of-at-least-32-characters",
  stamp = Date.parse(now);
assert.ok(verifySecret(key, hash));
assert.ok(!verifySecret("wrong", hash));
assert.ok(!verifySecret(key, undefined));
const session = createAdminSession(secret, hash, stamp);
assert.ok(verifyAdminSession(session, secret, hash, stamp));
assert.ok(!verifyAdminSession(session + "x", secret, hash, stamp));
assert.ok(!verifyAdminSession(session, secret, sha256("rotated"), stamp));
assert.ok(
  !verifyAdminSession(
    session,
    "another-session-secret-of-at-least-32-characters",
    hash,
    stamp,
  ),
);
assert.ok(
  !verifyAdminSession(session, secret, hash, stamp + SESSION_SECONDS * 1000),
);
assert.ok(!verifyAdminSession(undefined, secret, hash, stamp));
assert.ok(
  isSameOrigin(
    new Request("https://www.petmove.co.kr/admin/login/", {
      headers: { origin: "https://www.petmove.co.kr" },
    }),
  ),
);
assert.ok(
  !isSameOrigin(
    new Request("https://www.petmove.co.kr/admin/login/", {
      headers: { origin: "https://evil.test" },
    }),
  ),
);
assert.ok(!isSameOrigin(new Request("https://www.petmove.co.kr/admin/login/")));
console.log(
  "자동화 달력: 한국 시간·반복 일정·입력 검증·접속키·세션·교차 출처 차단 검증 통과",
);
