import { OnboardingNavbar } from "@/components/onboarding/onboarding-navbar"

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen auth-bg">
      <OnboardingNavbar />
      <main className="px-4 py-12">{children}</main>
    </div>
  )
}
