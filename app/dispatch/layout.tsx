import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getDashboardPath } from '@/lib/profiles'

export default async function DispatchLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'dispatcher') {
    redirect(profile?.role ? getDashboardPath(profile.role) : '/auth/login')
  }

  return <>{children}</>
}
