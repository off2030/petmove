import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const caseId = req.nextUrl.searchParams.get('caseId')
  if (!caseId) return NextResponse.json({ entries: [] })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('case_history')
    .select('*')
    .eq('case_id', caseId)
    .order('changed_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ entries: [], error: error.message })
  return NextResponse.json({ entries: data })
}
