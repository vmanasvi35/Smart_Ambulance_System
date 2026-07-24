import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PoliceSidebar } from '@/components/police-sidebar'
import { PoliceShellProvider } from '@/components/police/shell-context'

export default async function PoliceLayout({
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

  if (!profile || profile.role !== 'police') {
    redirect('/auth/login')
  }

  return (
    <PoliceShellProvider>
      <div className="flex min-h-screen bg-[#060e1a] text-foreground">
        <PoliceSidebar profile={profile} />
        <main className="relative flex-1 overflow-auto">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-20 top-10 h-64 w-64 rounded-full bg-primary/5 blur-[90px]" />
            <div className="absolute right-0 top-40 h-72 w-72 rounded-full bg-emergency/5 blur-[100px]" />
          </div>
          <div className="relative z-10 min-h-full">{children}</div>
        </main>
      </div>
    </PoliceShellProvider>
  )
}
