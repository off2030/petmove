import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // 기존 공개 화면의 HTML 이동·기기 감지 패턴은 별도 개선 대상으로 경고만 유지한다.
  {
    files: [
      "app/docs/pet-transport-quote/page.tsx",
      "components/site-footer.tsx",
      "components/site-header.tsx",
    ],
    rules: { "@next/next/no-html-link-for-pages": "warn" },
  },
  {
    files: [
      "components/app-link.tsx",
      "components/download-redirect.tsx",
      "components/lab/lab-home.tsx",
    ],
    rules: { "react-hooks/set-state-in-effect": "warn" },
  },
  globalIgnores([".next*/**", "out/**", "next-env.d.ts", "node_modules/**"]),
]);
