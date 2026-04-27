"use client"

import { useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { AppIcon } from "@/components/ui/app-icon"
import { Copy, ExternalLink } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()

  const [view, setView] = useState<"login" | "signup" | "code">("login")
  const [otp, setOtp] = useState("")
  const [loading, setLoading] = useState(false)
  const [telegramUsername, setTelegramUsername] = useState("")
  const [signupCode, setSignupCode] = useState("")
  const [botUrl, setBotUrl] = useState("")

  const loadingRef = useRef(false)

  const handleVerifyOtp = useCallback(
    async (code?: string) => {
      const value = code ?? otp
      if (value.length !== 6 || loadingRef.current) return
      loadingRef.current = true
      setLoading(true)

      try {
        const res = await fetch("/api/auth/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ otp: value }),
        })

        const data = await res.json()

        if (!res.ok) {
          toast.error(data.error ?? "Invalid OTP")
          setOtp("")
          return
        }

        toast.success("Signed in")
        router.push("/dashboard")
      } catch {
        toast.error("Network error. Please try again.")
        setOtp("")
      } finally {
        setLoading(false)
        loadingRef.current = false
      }
    },
    [otp, router],
  )

  async function handleGenerateCode() {
    setLoading(true)
    try {
      const res = await fetch("/api/auth/signup-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramUsername }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error ?? "Failed to generate code")
        return
      }

      setSignupCode(data.code)
      setBotUrl(data.botUrl ?? "")
      setView("code")
    } catch {
      toast.error("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  function handleCopyCode() {
    navigator.clipboard.writeText(signupCode)
    toast.success("Code copied")
  }

  if (view === "signup") {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center justify-items-center">
            <AppIcon className="size-10" />
            <CardTitle className="text-center text-xl font-semibold tracking-tight">
              Create Account
            </CardTitle>
            <CardDescription className="text-center">
              Enter your Telegram username to get started
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="telegram-username">Telegram Username</Label>
              <div className="relative">
                <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                  @
                </span>
                <Input
                  id="telegram-username"
                  className="h-11 pl-7 text-base md:h-8 md:text-sm"
                  placeholder="johndoe"
                  maxLength={32}
                  value={telegramUsername}
                  onChange={(e) =>
                    setTelegramUsername(
                      e.target.value.replaceAll(/[^a-zA-Z0-9_]/g, "")
                    )
                  }
                  disabled={loading}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Button
                className="h-11 w-full md:h-8"
                onClick={handleGenerateCode}
                disabled={loading || telegramUsername.length < 3}
              >
                {loading ? "Generating..." : "Generate Code"}
              </Button>
            </div>
            <button
              type="button"
              className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => setView("login")}
            >
              Back to Login
            </button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (view === "code") {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center justify-items-center">
            <AppIcon className="size-10" />
            <CardTitle className="text-center text-xl font-semibold tracking-tight">
              Your Signup Code
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center justify-center gap-2">
              <code className="rounded-md bg-muted px-4 py-3 font-mono text-2xl font-bold tracking-widest">
                {signupCode}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyCode}
                title="Copy code"
              >
                <Copy className="size-4" />
              </Button>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium">Next steps:</p>
              <ol className="list-inside list-decimal space-y-1">
                <li>Open the Telegram bot (button below)</li>
                <li>
                  Send <code className="font-mono">/signup</code> to the bot
                </li>
                <li>Paste the code above when the bot asks</li>
                <li>
                  The bot will reply with a 6-digit OTP — come back here to
                  enter it
                </li>
              </ol>
              <p className="text-xs">
                Tip: tapping the button below auto-fills your code, so you can
                skip steps 2–3.
              </p>
            </div>
            {botUrl && (
              <Button asChild className="w-full">
                <a href={botUrl} target="_blank" rel="noopener noreferrer">
                  Open Telegram Bot
                  <ExternalLink className="ml-2 size-4" />
                </a>
              </Button>
            )}
            <button
              type="button"
              className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => {
                setView("login")
                setOtp("")
              }}
            >
              Back to Login (enter OTP)
            </button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center justify-items-center">
          <AppIcon className="size-10" />
          <CardTitle className="text-center text-xl font-semibold tracking-tight">
            fdb-tracker
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label>One-Time Password</Label>
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={otp}
                onChange={setOtp}
                onComplete={handleVerifyOtp}
                disabled={loading}
                autoFocus
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>
          <div className="grid gap-2">
            <Button
              className="h-11 w-full md:h-8"
              onClick={() => handleVerifyOtp()}
              disabled={loading || otp.length !== 6}
            >
              {loading ? "Verifying..." : "Verify"}
            </Button>
          </div>
          <button
            type="button"
            className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => setView("signup")}
          >
            New here? Sign up
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
