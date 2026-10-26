import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  SESSION_SECONDS,
  createAdminSession,
  isSameOrigin,
  verifySecret,
} from "@/lib/admin-auth";
export const runtime = "nodejs";
const attempts = new Map<string, { count: number; until: number }>();
export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return new Response("허용되지 않은 요청입니다.", { status: 403 });
  const hash = process.env.WWW_ADMIN_ACCESS_KEY_HASH,
    secret = process.env.WWW_ADMIN_SESSION_SECRET;
  if (!hash || !secret)
    return new Response("관리자 접속 설정이 필요합니다.", { status: 503 });
  const ip =
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local";
  const now = Date.now();
  if (attempts.size > 1000)
    for (const [id, item] of attempts)
      if (item.until <= now) attempts.delete(id);
  const bucket = attempts.get(ip);
  if (bucket && bucket.until > now && bucket.count >= 8)
    return new Response("잠시 후 다시 시도해 주세요.", {
      status: 429,
      headers: { "Retry-After": "300" },
    });
  if (Number(request.headers.get("content-length") ?? 0) > 2000)
    return new Response(null, { status: 413 });
  const form = await request.formData().catch(() => null);
  const input = form?.get("key");
  if (typeof input !== "string" || !verifySecret(input, hash)) {
    attempts.set(ip, {
      count: bucket && bucket.until > now ? bucket.count + 1 : 1,
      until: bucket && bucket.until > now ? bucket.until : now + 300_000,
    });
    return NextResponse.redirect(
      new URL("/admin/?error=key", request.url),
      303,
    );
  }
  attempts.delete(ip);
  const response = NextResponse.redirect(new URL("/admin/", request.url), 303);
  response.cookies.set(ADMIN_COOKIE, createAdminSession(secret, hash), {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "strict",
    path: "/admin",
    maxAge: SESSION_SECONDS,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
