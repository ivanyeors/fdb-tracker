"use client"

import { usePathname } from "next/navigation"
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider"
import { ProgressBar } from "@/components/onboarding/progress-bar"

const STEP_MAP: Record<string, number> = {
  "/onboarding": 1,
  "/onboarding/users": 2,
  "/onboarding/profiles": 3,
  "/onboarding/income": 4,
  "/onboarding/banks": 5,
  "/onboarding/telegram": 6,
  "/onboarding/reminders": 7,
  "/onboarding/complete": 8,
}

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const currentStep = STEP_MAP[pathname] ?? 1

  return (
    <OnboardingProvider>
      <div className="flex min-h-svh flex-col items-center px-4 py-8">
        <div className="w-full max-w-2xl space-y-8">
          <ProgressBar currentStep={currentStep} />
          {children}
        </div>
      </div>
    </OnboardingProvider>
  )
}
