/** GitHub Actions에서만 실행. 비밀값은 출력하지 않고 Vercel production 환경변수로 전달한다. */
import { spawnSync } from "node:child_process";
if (!process.env.GITHUB_ACTIONS)
  throw new Error("GitHub Actions에서 실행하세요.");
const mapping = {
  WWW_ADMIN_ACCESS_KEY_HASH: "WWW_ADMIN_ACCESS_KEY_HASH",
  WWW_ADMIN_SESSION_SECRET: "WWW_ADMIN_SESSION_SECRET",
  AUTOMATION_REPORT_TOKEN_HASH: "AUTOMATION_REPORT_TOKEN_HASH",
  AUTOMATION_CALENDAR_DB_KEY: "AUTOMATION_CALENDAR_DB_KEY",
  SUPABASE_URL: "WWW_SUPABASE_URL",
  SUPABASE_PUBLISHABLE_KEY: "WWW_SUPABASE_PUBLISHABLE_KEY",
};
for (const [name, source] of Object.entries(mapping)) {
  const value = process.env[source];
  if (!value) throw new Error(`필수 GitHub secret 누락: ${source}`);
  const result = spawnSync(
    "vercel",
    [
      "env",
      "add",
      name,
      "--environment",
      "production",
      "--force",
      "--yes",
      "--token",
      process.env.VERCEL_TOKEN,
    ],
    { input: value, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
  if (result.status !== 0) {
    console.error(`Vercel 환경변수 설정 실패: ${name}`);
    process.exit(1);
  }
  console.log(`Vercel 환경변수 설정 확인: ${name}`);
}
