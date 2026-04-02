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
import { toast } from "sonner"
import { AppIcon } from "@/components/ui/app-icon"

export default function LoginPage() {
  const router = useRouter()

  const [otp, setOtp] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleVerifyOtp() {
    setLoading(true)

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? "Invalid OTP")
        return
      }

      toast.success("Signed in")
      router.push("/dashboard")
    } catch {
      toast.error("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const isLoading = loading

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center">
          <AppIcon className="size-10" />
          <CardTitle className="text-center text-xl font-semibold tracking-tight">
            fdb-tracker
          </CardTitle>
          <CardDescription className="text-center">
            Send /otp in your Telegram channel to get your code, then enter it
            below.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="otp">One-Time Password</Label>
            <Input
              id="otp"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              value={otp}
              onChange={(e) =>
                setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              disabled={isLoading}
            />
          </div>
          <div className="grid gap-2">
            <Button
              className="w-full"
              onClick={handleVerifyOtp}
              disabled={isLoading || otp.length !== 6}
            >
              {loading ? "Verifying…" : "Verify"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
