import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = fs.readFileSync('.env.local','utf8')
const g = (k) => { const m = env.match(new RegExp('^'+k+'\s*=\s*"?([^"\r\n]+)"?','m')); return m ? m[1].trim() : null }
const url = g('NEXT_PUBLIC_SUPABASE_URL'), key = g('SUPABASE_SERVICE_ROLE_KEY')
console.log('url', url, '| key', key ? key.slice(0,12)+'…('+key.length+')' : '없음')
const db = createClient(url, key, { auth: { persistSession: false } })
for (const t of ['notifications','apply_drafts','organization_settings','org_auto_fill_rules','cases']) {
  const r = await db.from(t).select('*', { count: 'exact', head: true })
  console.log(t.padEnd(22), r.error ? '✗ ' + (r.error.message || r.error.code || JSON.stringify(r.error)) : `✓ 존재 (행 ${r.count})`)
}
