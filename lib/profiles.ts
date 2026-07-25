import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { UserRole } from '@/lib/types'

type ProfileRoute = {
  role: UserRole
}

function getExplicitUserRole(user: User): UserRole | null {
  const appMetadataRole = user.app_metadata?.role
  if (appMetadataRole === 'police') return 'police'
  if (appMetadataRole === 'driver') return 'driver'
  if (appMetadataRole === 'dispatcher') return 'dispatcher'

  const userMetadataRole = user.user_metadata?.role
  if (userMetadataRole === 'police') return 'police'
  if (userMetadataRole === 'driver') return 'driver'
  if (userMetadataRole === 'dispatcher') return 'dispatcher'

  return null
}

function getUserRole(user: User): UserRole {
  return getExplicitUserRole(user) ?? 'driver'
}

function getFullName(user: User) {
  const fullName = user.user_metadata?.full_name

  if (typeof fullName === 'string' && fullName.trim()) {
    return fullName.trim()
  }

  return user.email?.split('@')[0] ?? 'User'
}

export function getDashboardPath(role: UserRole) {
  if (role === 'police') return '/police/dashboard'
  if (role === 'dispatcher') return '/dispatch'
  return '/driver/dashboard'
}

export async function ensureUserProfile(
  supabase: SupabaseClient,
  user: User,
): Promise<{ profile: ProfileRoute | null; error: Error | null }> {
  const { data: existingProfile, error: selectError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (selectError) {
    return { profile: null, error: selectError }
  }

  const explicitRole = getExplicitUserRole(user)

  if (existingProfile && explicitRole && existingProfile.role !== explicitRole) {
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({ role: explicitRole })
      .eq('id', user.id)
      .select('role')
      .single()

    if (updateError) {
      return { profile: null, error: updateError }
    }

    return { profile: updatedProfile as ProfileRoute, error: null }
  }

  if (existingProfile) {
    return { profile: existingProfile as ProfileRoute, error: null }
  }

  const { data: createdProfile, error: insertError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        full_name: getFullName(user),
        email: user.email ?? '',
        role: getUserRole(user),
        updated_at: new Date().toISOString(),
        // Driver-specific fields
        age: user.user_metadata?.age,
        hospital: user.user_metadata?.hospital,
        experience_years: user.user_metadata?.experience_years,
        driving_license: user.user_metadata?.driving_license,
        // Police-specific fields
        police_id: user.user_metadata?.police_id,
        police_station: user.user_metadata?.police_station,
        badge_number: user.user_metadata?.badge_number,
      },
      { onConflict: 'id' },
    )
    .select('role')
    .single()

  if (insertError) {
    return { profile: null, error: insertError }
  }

  return { profile: createdProfile as ProfileRoute, error: null }
}
