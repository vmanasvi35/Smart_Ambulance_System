import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DriverSidebar } from '@/components/driver-sidebar'

export default async function DriverLayout({
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

  if (!profile || profile.role !== 'driver') {
    redirect('/auth/login')
  }

  return (
    <div className="flex min-h-screen bg-background">
      <DriverSidebar profile={profile} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
