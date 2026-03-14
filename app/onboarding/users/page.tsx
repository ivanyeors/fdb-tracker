"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useOnboarding, pathWithMode } from "@/components/onboarding/onboarding-provider"
import { cn } from "@/lib/utils"
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react"

const COUNTS = [1, 2, 3, 4, 5, 6] as const

export default function UsersPage() {
  const router = useRouter()
  const { mode, userCount, setUserCount, setFamilyId, skipOnboarding, isLoading: stateLoading } = useOnboarding()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleNext() {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/onboarding/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, userCount }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Failed to save")
      if (data.familyId) setFamilyId(data.familyId)
      router.push(pathWithMode("/onboarding/profiles", mode))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  if (stateLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>How many people will be tracking?</CardTitle>
        <CardDescription>
          Select the number of people who will track their finances.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {COUNTS.map((count) => (
            <Button
              key={count}
              variant={userCount === count ? "default" : "outline"}
              size="lg"
              className={cn("min-w-12", userCount === count && "ring-2 ring-primary/50")}
              onClick={() => setUserCount(count)}
            >
              {count}
            </Button>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => router.push(pathWithMode("/onboarding", mode))}>
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <Button onClick={handleNext} disabled={isLoading}>
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
            Next
            <ArrowRight data-icon="inline-end" />
          </Button>
          <Button
            variant="link"
            className="ml-auto text-muted-foreground"
            onClick={skipOnboarding}
          >
            Skip for now
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
