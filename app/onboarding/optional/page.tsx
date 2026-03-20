"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { CheckCircle2, Loader2 } from "lucide-react"
import { toast } from "sonner"

export default function OptionalPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const profileId = searchParams.get("profileId")
  const [status, setStatus] = useState<"loading" | "ready" | "complete" | "error">("loading")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profileId) {
      setStatus("error")
      setError("Missing profile")
      return
    }
    setStatus("ready")
  }, [profileId])

  async function handleComplete() {
    if (!profileId) return
    setStatus("loading")
    setError(null)
    try {
      const res = await fetch("/api/onboarding/optional-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to complete")
      }
      setStatus("complete")
      toast.success("Setup complete")
      router.push("/dashboard")
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong"
      setError(msg)
      toast.error(msg)
      setStatus("ready")
    }
  }

  if (status === "error" || !profileId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Complete Setup</CardTitle>
          <CardDescription>
            {error ?? "Invalid or missing profile. Please select a profile from the sidebar."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => router.push("/dashboard")}>Go to Dashboard</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Complete Optional Setup</CardTitle>
        <CardDescription>
          Add investments, loans, insurance, and tax reliefs from the dashboard
          to get full calculations. You can mark this step as done to hide the
          reminder.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          <p>
            Optional financial data (investments, loans, insurance, tax reliefs)
            can be added from the Dashboard pages after setup.
          </p>
          <p className="mt-2">
            Click below to mark this profile&apos;s optional setup as complete
            and remove it from the sidebar.
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Go to Dashboard
          </Button>
          <Button onClick={handleComplete} disabled={status === "loading"}>
            {status === "loading" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Completing
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" />
                Mark as complete
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
