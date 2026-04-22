import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listAllOrgs } from '@/lib/actions/super-admin'
import { SuperAdminApp } from '@/components/super-admin/super-admin-app'

export const dynamic = 'force-dynamic'

export default async function SuperAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/super-admin')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.is_super_admin) redirect('/cases')

  const result = await listAllOrgs()
  const orgs = result.ok ? result.value : []

  return <SuperAdminApp initialOrgs={orgs} />
}
