'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AuthShell } from '@/components/auth/auth-shell'
import { Ambulance, Loader2, Radio, Shield, Truck } from 'lucide-react'
import type { UserRole } from '@/lib/types'

export default function SignUpPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('driver')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Driver-specific fields
  const [age, setAge] = useState('')
  const [hospital, setHospital] = useState('')
  const [experienceYears, setExperienceYears] = useState('')
  const [drivingLicense, setDrivingLicense] = useState('')

  // Police-specific fields
  const [policeId, setPoliceId] = useState('')
  const [policeStation, setPoliceStation] = useState('')
  const [badgeNumber, setBadgeNumber] = useState('')

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Validate role-specific fields
    if (role === 'driver') {
      if (!age || !hospital || !experienceYears || !drivingLicense) {
        setError('Please fill in all driver details')
        setLoading(false)
        return
      }
    } else if (role === 'police') {
      if (!policeId || !policeStation || !badgeNumber) {
        setError('Please fill in all police details')
        setLoading(false)
        return
      }
    }

    const userMetadata: any = {
      full_name: fullName,
      role,
    }

    // Add role-specific metadata
    if (role === 'driver') {
      userMetadata.age = parseInt(age)
      userMetadata.hospital = hospital
      userMetadata.experience_years = parseInt(experienceYears)
      userMetadata.driving_license = drivingLicense
    } else if (role === 'police') {
      userMetadata.police_id = policeId
      userMetadata.police_station = policeStation
      userMetadata.badge_number = badgeNumber
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo:
          process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ??
          `${window.location.origin}/auth/callback`,
        data: userMetadata,
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <AuthShell>
        <Card className="glass-card w-full border-white/10 shadow-xl shadow-black/25">
          <CardHeader className="text-center">
            <div className="glow-icon-success mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success ring-1 ring-success/30">
              <Ambulance className="h-8 w-8" />
            </div>
            <CardTitle className="text-xl">Check Your Email</CardTitle>
            <CardDescription>
              {"We've sent a confirmation link to"} <strong>{email}</strong>. Please verify your email to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => router.push('/auth/login')}
              className="glow-cta w-full bg-emergency text-white hover:bg-emergency/90"
            >
              Return to Login
            </Button>
          </CardContent>
        </Card>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <div className="w-full space-y-8">
        <div className="flex flex-col items-center gap-4">
          <div className="glow-icon-emergency flex h-16 w-16 items-center justify-center rounded-2xl bg-emergency/15 text-emergency ring-1 ring-emergency/40">
            <Ambulance className="h-8 w-8" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Join the Network</h1>
            <p className="text-muted-foreground">Create your account to get started</p>
          </div>
        </div>

        <Card className="glass-card border-white/10 shadow-xl shadow-black/25">
          <CardHeader>
            <CardTitle className="text-xl">Create Account</CardTitle>
            <CardDescription>
              Sign up as a driver, police coordinator, or dispatcher
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignUp} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="border-white/10 bg-white/5"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="border-white/10 bg-white/5"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="border-white/10 bg-white/5"
                />
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                  <SelectTrigger className="border-white/10 bg-white/5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="driver">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4" />
                        <span>Ambulance Driver</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="police">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        <span>Police Coordinator</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="dispatcher">
                      <div className="flex items-center gap-2">
                        <Radio className="h-4 w-4" />
                        <span>Dispatcher</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {role === 'driver' && (
                <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <h3 className="text-sm font-medium text-foreground">Driver Details</h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="age">Age</Label>
                      <Input
                        id="age"
                        type="number"
                        placeholder="25"
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        required
                        min="18"
                        max="70"
                        className="border-white/10 bg-white/5"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="experienceYears">Experience (Years)</Label>
                      <Input
                        id="experienceYears"
                        type="number"
                        placeholder="3"
                        value={experienceYears}
                        onChange={(e) => setExperienceYears(e.target.value)}
                        required
                        min="0"
                        max="50"
                        className="border-white/10 bg-white/5"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="hospital">Hospital</Label>
                    <Select value={hospital} onValueChange={setHospital} required>
                      <SelectTrigger className="border-white/10 bg-white/5">
                        <SelectValue placeholder="Select your hospital" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Manipal Hospital">Manipal Hospital</SelectItem>
                        <SelectItem value="Apollo Hospital">Apollo Hospital</SelectItem>
                        <SelectItem value="Fortis Hospital">Fortis Hospital</SelectItem>
                        <SelectItem value="Columbia Asia Hospital">Columbia Asia Hospital</SelectItem>
                        <SelectItem value="Narayana Health">Narayana Health</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="drivingLicense">Driving License Number</Label>
                    <Input
                      id="drivingLicense"
                      type="text"
                      placeholder="KA01 20240001234"
                      value={drivingLicense}
                      onChange={(e) => setDrivingLicense(e.target.value)}
                      required
                      className="border-white/10 bg-white/5"
                    />
                  </div>
                </div>
              )}

              {role === 'police' && (
                <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <h3 className="text-sm font-medium text-foreground">Police Details</h3>

                  <div className="space-y-2">
                    <Label htmlFor="policeId">Police ID Number</Label>
                    <Input
                      id="policeId"
                      type="text"
                      placeholder="POL123456"
                      value={policeId}
                      onChange={(e) => setPoliceId(e.target.value)}
                      required
                      className="border-white/10 bg-white/5"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="policeStation">Police Station</Label>
                    <Input
                      id="policeStation"
                      type="text"
                      placeholder="Koramangala Police Station"
                      value={policeStation}
                      onChange={(e) => setPoliceStation(e.target.value)}
                      required
                      className="border-white/10 bg-white/5"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="badgeNumber">Badge Number</Label>
                    <Input
                      id="badgeNumber"
                      type="text"
                      placeholder="B12345"
                      value={badgeNumber}
                      onChange={(e) => setBadgeNumber(e.target.value)}
                      required
                      className="border-white/10 bg-white/5"
                    />
                  </div>
                </div>
              )}

              <Button
                type="submit"
                className="glow-cta w-full bg-emergency text-white hover:bg-emergency/90"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link
                href="/auth/login"
                className="text-primary transition-colors hover:text-primary/80 hover:underline"
              >
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </AuthShell>
  )
}
