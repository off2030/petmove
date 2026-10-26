import { NextResponse } from "next/server";
import { ADMIN_COOKIE, isSameOrigin } from "@/lib/admin-auth";
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const res = NextResponse.redirect(new URL("/admin/", request.url), 303);
  res.cookies.set(ADMIN_COOKIE, "", {
    path: "/admin",
    maxAge: 0,
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "strict",
  });
  return res;
}
