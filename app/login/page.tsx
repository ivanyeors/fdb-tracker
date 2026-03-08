"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function LoginPage() {
  const router = useRouter()

  const [householdId, setHouseholdId] = useState("")
  const [otp, setOtp] = useState("")
  const [step, setStep] = useState<1 | 2>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRequestOtp() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Failed to send OTP")
        return
      }

      setStep(2)
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId, otp }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Invalid OTP")
        return
      }

      router.push("/dashboard")
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-xl font-semibold tracking-tight">
            fdb-tracker
          </CardTitle>
          <CardDescription className="text-center">
            {step === 1
              ? "Enter your household ID to sign in"
              : "Enter the OTP sent to your Telegram"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 1 ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="household-id">Household ID</Label>
                <Input
                  id="household-id"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={householdId}
                  onChange={(e) => setHouseholdId(e.target.value)}
                  disabled={loading}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleRequestOtp}
                disabled={loading || !householdId.trim()}
              >
                {loading ? "Sending…" : "Request OTP"}
              </Button>
            </>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="otp">One-Time Password</Label>
                <Input
                  id="otp"
                  placeholder="000000"
                  maxLength={6}
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  disabled={loading}
                />
              </div>
              <Button
                className="w-full"
                onClick={handleVerifyOtp}
                disabled={loading || otp.length !== 6}
              >
                {loading ? "Verifying…" : "Verify"}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep(1)
                  setOtp("")
                  setError(null)
                }}
                disabled={loading}
              >
                Back
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
