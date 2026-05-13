import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PoliceSidebar } from '@/components/police-sidebar'

export default async function PoliceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'police') {
    redirect('/auth/login')
  }

  return (
    <div className="flex min-h-screen bg-background">
      <PoliceSidebar profile={profile} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
