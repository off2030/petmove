#!/usr/bin/env node
/**
 * Migrate payment data from flat keys to array structure.
 * Before: data.payment_amount, data.payment_method
 * After:  data.payments = [{ amount, method, date }]
 */
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
dotenv.config({ path: '.env.local' })

const DRY_RUN = process.argv.includes('--dry-run')

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const allCases = []
let f = 0
while (true) {
  const { data } = await sb.from('cases').select('id, pet_name, customer_name, data').range(f, f + 999)
  if (!data || !data.length) break
  allCases.push(...data)
  if (data.length < 1000) break
  f += 1000
}

let migrated = 0, alreadyArray = 0, noPayment = 0, errors = 0

for (const c of allCases) {
  const d = c.data ?? {}

  // Already migrated?
  if (Array.isArray(d.payments)) {
    alreadyArray++
    continue
  }

  // Has old flat payment data?
  if (!d.payment_amount) {
    noPayment++
    continue
  }

  const record = {
    amount: Number(d.payment_amount),
    method: d.payment_method || null,
    date: null,
  }

  const newData = { ...d, payments: [record] }
  delete newData.payment_amount
  delete newData.payment_method

  if (DRY_RUN) {
    migrated++
    if (migrated <= 10) {
      console.log(`  ${c.pet_name} (${c.customer_name}): ₩${record.amount.toLocaleString()} / ${record.method}`)
    }
    continue
  }

  const { error } = await sb.from('cases').update({ data: newData }).eq('id', c.id)
  if (error) {
    errors++
    console.error(`  오류: ${c.pet_name} - ${error.message}`)
  } else {
    migrated++
  }
}

console.log(`\n총 케이스: ${allCases.length}`)
console.log(`마이그레이션: ${migrated}`)
console.log(`이미 배열: ${alreadyArray}`)
console.log(`결제 없음: ${noPayment}`)
if (errors) console.log(`오류: ${errors}`)
if (DRY_RUN) console.log('\nDRY-RUN. --dry-run 없이 다시 실행하면 적용.')
