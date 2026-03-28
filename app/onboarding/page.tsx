"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowRight, CheckCircle2 } from "lucide-react"
import { useOnboarding } from "@/components/onboarding/onboarding-provider"

export default function WelcomePage() {
  const searchParams = useSearchParams()
  const mode = searchParams.get("mode")
  const href = mode ? `/onboarding/users?mode=${mode}` : "/onboarding/users"
  const { canSkip, isLoading, skipOnboarding } = useOnboarding()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Track finances together</CardTitle>
        <CardDescription>
          A few steps to get started. We&apos;ll set up your profiles, income,
          bank accounts, and Telegram integration.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canSkip && !isLoading && (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>
                We found existing profiles, income, and bank data. You can skip
                setup and go straight to your dashboard.
              </span>
              <Button size="sm" onClick={skipOnboarding}>
                Skip to Dashboard
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <Button asChild size="lg">
          <Link href={href}>
            {canSkip ? "Continue Setup" : "Get Started"}
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
