import { NextResponse } from 'next/server'
import { createClient } from '@petmove/auth'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}

export async function GET(request: Request) {
  return POST(request)
}
