import { createClient } from '@/lib/supabase/server'
import { ensureUserProfile, getDashboardPath } from '@/lib/profiles'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { profile } = await ensureUserProfile(supabase, user)
        return NextResponse.redirect(`${origin}${profile ? getDashboardPath(profile.role) : next}`)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
