import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/admin-auth";
import { loadCalendar } from "@/lib/automation-store";
import { AutomationDashboard } from "@/components/admin/automation-dashboard";
import "@/styles/admin.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "펫무브 관리자 · 자동화 달력",
  robots: { index: false, follow: false },
  alternates: { canonical: "/admin/" },
};
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  const authed = verifyAdminSession(
    token,
    process.env.WWW_ADMIN_SESSION_SECRET,
    process.env.WWW_ADMIN_ACCESS_KEY_HASH,
  );
  if (!authed) {
    const query = await searchParams;
    return (
      <main className="pm-admin-login">
        <Link className="pm-admin-brand" href="/">
          petmove<span>관리자</span>
        </Link>
        <section className="pm-admin-login-card">
          <span className="pm-admin-eyebrow">PRIVATE WORKSPACE</span>
          <h1>
            자동화 작업을
            <br />
            한눈에 확인하세요.
          </h1>
          <p>
            관리자 접속키를 입력하면 예약 일정과 실행 기록을 볼 수 있습니다.
          </p>
          <form action="/admin/login/" method="post">
            <label htmlFor="admin-key">관리자 접속키</label>
            <input
              id="admin-key"
              name="key"
              type="password"
              autoComplete="current-password"
              required
              maxLength={300}
              placeholder="접속키 입력"
            />
            {query.error && (
              <p role="alert" className="pm-admin-error">
                접속키가 맞지 않습니다. 다시 확인해 주세요.
              </p>
            )}
            <button type="submit">
              관리자 화면 열기 <span>↗</span>
            </button>
          </form>
          <small>
            접속은 8시간 동안 유지됩니다. 공용 기기에서는 사용 후 로그아웃해
            주세요.
          </small>
        </section>
        <p className="pm-admin-login-foot">PETMOVE · AUTOMATION CALENDAR</p>
      </main>
    );
  }
  let snapshot;
  try {
    snapshot = await loadCalendar();
  } catch {
    return (
      <main className="pm-admin-login">
        <section className="pm-admin-login-card">
          <h1>
            일정을 불러오지
            <br />
            못했습니다.
          </h1>
          <p>
            연결 상태를 확인한 뒤 새로고침해 주세요. 기록이 없다고 추정해서
            표시하지 않습니다.
          </p>
          <a href="/admin/">새로고침 ↻</a>
        </section>
      </main>
    );
  }
  return <AutomationDashboard initial={snapshot} />;
}
