import { verifySecret } from "@/lib/admin-auth";
import { parseSchedule, parseRun } from "@/lib/automation-calendar";
import { saveCalendar } from "@/lib/automation-store";
export async function POST(request: Request) {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
  };
  if (!verifySecret(token, process.env.AUTOMATION_REPORT_TOKEN_HASH))
    return Response.json(
      { error: "인증이 필요합니다." },
      { status: 401, headers },
    );
  if (Number(request.headers.get("content-length") ?? 0) > 64_000)
    return Response.json(
      { error: "기록 크기를 줄여 주세요." },
      { status: 413, headers },
    );
  try {
    const raw = await request.text();
    if (raw.length > 64_000)
      return Response.json(
        { error: "기록 크기를 줄여 주세요." },
        { status: 413, headers },
      );
    const body = JSON.parse(raw) as { schedules?: unknown[]; runs?: unknown[] };
    if (
      !Array.isArray(body.schedules ?? []) ||
      !Array.isArray(body.runs ?? []) ||
      (body.schedules?.length ?? 0) > 30 ||
      (body.runs?.length ?? 0) > 100
    )
      throw new Error("잘못된 기록 형식입니다.");
    const now = new Date().toISOString();
    const schedules = (body.schedules ?? []).map((s) => parseSchedule(s, now));
    const runs = (body.runs ?? []).map((r) => parseRun(r, now));
    await saveCalendar(schedules, runs);
    return Response.json(
      {
        ok: true,
        schedules: schedules.length,
        runs: runs.length,
        recorded_at: now,
      },
      { headers },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "기록에 실패했습니다.";
    console.error("[automation-calendar] write failed", message);
    return Response.json(
      { error: "기록에 실패했습니다. 로컬 보관 후 다시 전송해 주세요." },
      { status: 400, headers },
    );
  }
}
