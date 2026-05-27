import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const envText = readFileSync('.env.local', 'utf8')
const env = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data, error } = await supabase
  .from('cases')
  .select('id, destination, departure_date, data')
  .ilike('pet_name', '%소라%')
  .order('updated_at', { ascending: false })
  .limit(5)

if (error) { console.error(error); process.exit(1) }

for (const c of data) {
  const d = c.data ?? {}
  console.log('=== case', c.id, '| dest:', c.destination, '===')
  console.log('entry_date:', d.entry_date, '| departure_date:', c.departure_date)
  console.log('rabies_dates:', JSON.stringify(d.rabies_dates ?? [], null, 2))
  console.log('rabies_titer_records:', JSON.stringify(d.rabies_titer_records ?? [], null, 2))
  console.log()
}
