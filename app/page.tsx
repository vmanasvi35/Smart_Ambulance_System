import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Ambulance, Shield, MapPin, Bell, Clock, Navigation, Zap, Radio } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <header className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="container relative mx-auto px-4 py-16 sm:py-24">
          <div className="flex flex-col items-center text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Ambulance className="h-10 w-10" />
            </div>
            <h1 className="mb-4 max-w-3xl text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Smart Ambulance Coordination System
            </h1>
            <p className="mb-8 max-w-2xl text-pretty text-lg text-muted-foreground">
              Real-time emergency ambulance tracking and police coordination platform. 
              Ensuring faster response times and efficient route management during critical emergencies.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button asChild size="lg">
                <Link href="/auth/login">
                  Sign In
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/auth/signup">
                  Create Account
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-bold text-foreground">Platform Features</h2>
          <p className="text-muted-foreground">
            Comprehensive tools for emergency response coordination
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="glass-card border-border/50">
            <CardHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MapPin className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg">Live Tracking</CardTitle>
              <CardDescription>
                Real-time GPS tracking of all active ambulances on an interactive map
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="glass-card border-border/50">
            <CardHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Navigation className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg">Route Assessment</CardTitle>
              <CardDescription>
                Police can assess and update route conditions in real-time
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="glass-card border-border/50">
            <CardHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-500/10 text-yellow-500">
                <Bell className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg">Alert System</CardTitle>
              <CardDescription>
                Instant alerts for traffic, network failures, and route changes
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="glass-card border-border/50">
            <CardHeader>
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
                <Clock className="h-6 w-6" />
              </div>
              <CardTitle className="text-lg">ETA Calculation</CardTitle>
              <CardDescription>
                Automatic estimation of arrival times with traffic consideration
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Roles Section */}
      <section className="border-y border-border bg-card/30 py-16">
        <div className="container mx-auto px-4">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-bold text-foreground">User Roles</h2>
            <p className="text-muted-foreground">
              Specialized dashboards for different user types
            </p>
          </div>

          <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
            <Card className="glass-card border-border/50">
              <CardHeader>
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Ambulance className="h-8 w-8" />
                </div>
                <CardTitle>Ambulance Drivers</CardTitle>
                <CardDescription>
                  Manage trips, track routes, and coordinate with emergency services
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    Create and manage emergency trips
                  </li>
                  <li className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    View real-time route conditions
                  </li>
                  <li className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    Receive alerts from police coordination
                  </li>
                  <li className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    Track trip history and statistics
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="glass-card border-border/50">
              <CardHeader>
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <Shield className="h-8 w-8" />
                </div>
                <CardTitle>Police Coordinators</CardTitle>
                <CardDescription>
                  Monitor all ambulances and provide real-time route assistance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-accent" />
                    Control room with live map view
                  </li>
                  <li className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-accent" />
                    Update route conditions instantly
                  </li>
                  <li className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-accent" />
                    Send alerts to ambulance drivers
                  </li>
                  <li className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-accent" />
                    Monitor all active drivers
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-16">
        <Card className="glass-card border-border/50">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary animate-pulse-emergency">
              <Ambulance className="h-8 w-8" />
            </div>
            <h3 className="mb-4 text-2xl font-bold text-foreground">
              Ready to Get Started?
            </h3>
            <p className="mb-6 max-w-md text-muted-foreground">
              Join the network and help save lives through better coordination and faster response times.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button asChild size="lg">
                <Link href="/auth/signup">
                  Create Account
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/auth/login">
                  Sign In
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Smart Ambulance Coordination System</p>
          <p className="mt-1">Emergency Response Platform</p>
        </div>
      </footer>
    </div>
  )
}
