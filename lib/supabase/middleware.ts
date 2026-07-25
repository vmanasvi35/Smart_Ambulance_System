import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { ensureUserProfile, getDashboardPath } from '@/lib/profiles'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Legacy dispatch login URL → shared auth
  if (request.nextUrl.pathname.startsWith('/dispatch/login')) {
    const url = request.nextUrl.clone()
    url.pathname = user ? '/dispatch' : '/auth/login'
    return NextResponse.redirect(url)
  }

  // Redirect unauthenticated users from protected routes
  if (
    (request.nextUrl.pathname.startsWith('/driver') ||
      request.nextUrl.pathname.startsWith('/police') ||
      request.nextUrl.pathname.startsWith('/dispatch')) &&
    !user
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users from auth pages to their dashboard
  if (request.nextUrl.pathname.startsWith('/auth') && user) {
    const { profile } = await ensureUserProfile(supabase, user)

    if (profile) {
      const url = request.nextUrl.clone()
      url.pathname = getDashboardPath(profile.role)
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
