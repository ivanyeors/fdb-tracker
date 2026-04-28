"use client"

import { Suspense } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider"
import { ProgressBar } from "@/components/onboarding/progress-bar"
import type { OnboardingMode } from "@/components/onboarding/onboarding-provider"
import { Skeleton } from "@/components/ui/skeleton"

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

function OnboardingLayoutInner({ children }: { readonly children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentStep = STEP_MAP[pathname] ?? 1
  const modeParam = searchParams.get("mode")
  const mode = (() => {
    if (modeParam === "new-family") return "new-family"
    if (modeParam === "resume") return "resume"
    return "first-time"
  })() as OnboardingMode
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
  readonly children: React.ReactNode
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh flex-col items-center px-4 py-8">
          <div className="w-full max-w-2xl space-y-8">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-2 w-full" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-32 w-full rounded-lg" />
              <Skeleton className="h-10 w-32" />
            </div>
          </div>
        </div>
      }
    >
      <OnboardingLayoutInner>{children}</OnboardingLayoutInner>
    </Suspense>
  )
}
