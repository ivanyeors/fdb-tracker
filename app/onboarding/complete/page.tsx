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
import { useOnboarding } from "@/components/onboarding/onboarding-provider"
import { CheckCircle2, ArrowRight, Loader2 } from "lucide-react"

export default function CompletePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { profiles, userCount, bankAccounts, telegramChatId } = useOnboarding()

  const profileCount = profiles.filter((p) => p.name.trim()).length || userCount
  const bankCount = bankAccounts.filter((a) => a.bank_name.trim()).length
  const telegramConnected = telegramChatId.trim().length > 0

  async function handleGoToDashboard() {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/onboarding/complete", { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to complete onboarding")
      }
      router.push("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">You&apos;re all set! 🎉</CardTitle>
        <CardDescription>
          Here&apos;s a summary of what you configured.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-green-600" />
            <span>
              <strong>{profileCount}</strong> profile
              {profileCount !== 1 && "s"} configured
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-green-600" />
            <span>
              <strong>{bankCount}</strong> bank account
              {bankCount !== 1 && "s"} added
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-green-600" />
            <span>
              Telegram:{" "}
              {telegramConnected ? (
                <strong>Connected</strong>
              ) : (
                <span className="text-muted-foreground">Not connected</span>
              )}
            </span>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button
          size="lg"
          onClick={handleGoToDashboard}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Completing
            </>
          ) : (
            <>
              Go to Dashboard
              <ArrowRight data-icon="inline-end" />
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
