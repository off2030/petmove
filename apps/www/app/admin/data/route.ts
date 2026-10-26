import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/admin-auth";
import { loadCalendar } from "@/lib/automation-store";
export const dynamic = "force-dynamic";
export async function GET() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
  };
  if (
    !verifyAdminSession(
      token,
      process.env.WWW_ADMIN_SESSION_SECRET,
      process.env.WWW_ADMIN_ACCESS_KEY_HASH,
    )
  )
    return Response.json(
      { error: "관리자 접속키를 다시 입력해 주세요." },
      { status: 401, headers },
    );
  try {
    return Response.json(await loadCalendar(), { headers });
  } catch {
    return Response.json(
      { error: "일정을 불러오지 못했습니다. 잠시 후 새로고침해 주세요." },
      { status: 503, headers },
    );
  }
}
