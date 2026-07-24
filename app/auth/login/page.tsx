'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthShell } from '@/components/auth/auth-shell'
import { Ambulance, Loader2 } from 'lucide-react'
import { ensureUserProfile, getDashboardPath } from '@/lib/profiles'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    if (data.user) {
      const { profile, error: profileError } = await ensureUserProfile(supabase, data.user)

      if (profileError || !profile) {
        setError(profileError?.message ?? 'Could not set up your profile. Please try again.')
        setLoading(false)
        return
      }

      router.push(getDashboardPath(profile.role))
    }
  }

  return (
    <AuthShell>
      <div className="w-full space-y-8">
        <div className="flex flex-col items-center gap-4">
          <div className="glow-icon-emergency flex h-16 w-16 items-center justify-center rounded-2xl bg-emergency/15 text-emergency ring-1 ring-emergency/40">
            <Ambulance className="h-8 w-8" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Smart Ambulance System</h1>
            <p className="text-muted-foreground">Emergency Coordination Platform</p>
          </div>
        </div>

        <Card className="glass-card border-white/10 shadow-xl shadow-black/25">
          <CardHeader>
            <CardTitle className="text-xl">Sign In</CardTitle>
            <CardDescription>Enter your credentials to access the dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

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
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="border-white/10 bg-white/5"
                />
              </div>

              <Button
                type="submit"
                className="glow-cta w-full bg-emergency text-white hover:bg-emergency/90"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              {"Don't have an account? "}
              <Link
                href="/auth/signup"
                className="text-primary transition-colors hover:text-primary/80 hover:underline"
              >
                Sign up
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </AuthShell>
  )
}
