// 브라우저 + 서버 양쪽에서 import 가능한 클라이언트만.
// next/headers 의존하는 createClient 는 ./server 서브패스로 분리 — client component 가
// @petmove/auth 를 통째로 import 해도 next/headers 가 client bundle 에 끌려가지 않도록.
export { supabaseBrowser } from './browser'
export { createAdminClient } from './admin'
