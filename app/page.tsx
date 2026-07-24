import { LandingNavbar } from '@/components/landing/navbar'
import { LandingHero } from '@/components/landing/hero'
import { LandingAbout } from '@/components/landing/about'
import { LandingFeatures } from '@/components/landing/features'
import { LandingWorkflow } from '@/components/landing/workflow'
import { LandingTechnology } from '@/components/landing/technology'
import { LandingImpact } from '@/components/landing/impact'
import { LandingFooter } from '@/components/landing/footer'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#060e1a] text-foreground">
      <LandingNavbar />
      <main>
        <LandingHero />
        <LandingAbout />
        <LandingFeatures />
        <LandingWorkflow />
        <LandingTechnology />
        <LandingImpact />
      </main>
      <LandingFooter />
    </div>
  )
}
