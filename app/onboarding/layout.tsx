"use client"

import { Suspense } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider"
import { ProgressBar } from "@/components/onboarding/progress-bar"
import type { OnboardingMode } from "@/components/onboarding/onboarding-provider"

const STEP_MAP: Record<string, number> = {
  "/onboarding": 1,
  "/onboarding/users": 2,
  "/onboarding/profiles": 3,
  "/onboarding/income": 4,
  "/onboarding/cpf": 5,
  "/onboarding/banks": 6,
  "/onboarding/telegram": 7,
  "/onboarding/reminders": 8,
  "/onboarding/investments": 9,
  "/onboarding/loans": 10,
  "/onboarding/insurance": 11,
  "/onboarding/tax-reliefs": 12,
  "/onboarding/complete": 13,
}

const REQUIRED_STEPS = 8
const OPTIONAL_STEPS = 4
const TOTAL_STEPS = 13

function OnboardingLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentStep = STEP_MAP[pathname] ?? 1
  const mode = (
    searchParams.get("mode") === "new-family"
      ? "new-family"
      : searchParams.get("mode") === "resume"
        ? "resume"
        : "first-time"
  ) as OnboardingMode
  const isOptionalFlow = pathname.startsWith("/onboarding/optional")

  if (isOptionalFlow) {
    return (
      <div className="flex min-h-svh flex-col items-center px-4 py-8">
        <div className="w-full max-w-2xl space-y-8">{children}</div>
      </div>
    )
  }

  return (
    <OnboardingProvider mode={mode}>
      <div className="flex min-h-svh flex-col items-center px-4 py-8">
        <div className="w-full max-w-2xl space-y-8">
          <ProgressBar
            currentStep={currentStep}
            totalSteps={TOTAL_STEPS}
            requiredSteps={REQUIRED_STEPS}
            optionalSteps={OPTIONAL_STEPS}
          />
          {children}
        </div>
      </div>
    </OnboardingProvider>
  )
}

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={<div className="flex min-h-svh items-center justify-center">Loading...</div>}>
      <OnboardingLayoutInner>{children}</OnboardingLayoutInner>
    </Suspense>
  )
}
