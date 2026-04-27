"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useOnboarding, pathWithMode } from "@/components/onboarding/onboarding-provider"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Merge,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface MethodSectionProps {
  readonly title: string
  readonly children: React.ReactNode
  readonly defaultOpen?: boolean
}

function MethodSection({ title, children, defaultOpen }: MethodSectionProps) {
  const [open, setOpen] = useState(defaultOpen ?? false)

  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-muted/50"
        onClick={() => setOpen(!open)}
      >
        {title}
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="border-t px-3 py-2 text-sm text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  )
}

export default function TelegramPage() {
  const router = useRouter()
  const { mode, telegramChatId, setTelegramChatId, skipOnboarding } = useOnboarding()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle")
  const [testMessage, setTestMessage] = useState("")
  const [mergeConflict, setMergeConflict] = useState<{
    publicHouseholdId: string
  } | null>(null)
  const [isMerging, setIsMerging] = useState(false)

  async function testConnection() {
    if (!telegramChatId.trim()) return
    setTestStatus("loading")
    setTestMessage("")

    try {
      const res = await fetch("/api/telegram/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: telegramChatId.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setTestStatus("success")
        setTestMessage("Connection successful!")
        toast.success("Connection successful")
      } else {
        const errMsg = data.error ?? "Connection failed"
        setTestStatus("error")
        setTestMessage(errMsg)
        toast.error(errMsg)
      }
    } catch {
      setTestStatus("error")
      setTestMessage("Network error — could not reach server")
      toast.error("Network error — could not reach server")
    }
  }

  async function handleNext() {
    setError(null)
    setMergeConflict(null)
    setIsLoading(true)
    try {
      const res = await fetch("/api/onboarding/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramChatId }),
      })
      const data = await res.json().catch(() => ({}))

      if (data.conflict) {
        setMergeConflict({ publicHouseholdId: data.publicHouseholdId })
        setIsLoading(false)
        return
      }

      if (!res.ok) throw new Error(data.message ?? data.error ?? "Failed to save")
      toast.success("Telegram settings saved")
      router.push(pathWithMode("/onboarding/reminders", mode))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong"
      setError(msg)
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleMerge() {
    if (!mergeConflict) return
    setIsMerging(true)
    setError(null)
    try {
      const res = await fetch("/api/onboarding/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegramChatId,
          mergePublicHouseholdId: mergeConflict.publicHouseholdId,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Merge failed")
      toast.success("Account merged successfully")
      setMergeConflict(null)
      router.push(pathWithMode("/onboarding/reminders", mode))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Merge failed"
      setError(msg)
      toast.error(msg)
    } finally {
      setIsMerging(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your Telegram channel</CardTitle>
        <CardDescription>
          Enter your Telegram group chat ID to receive notifications.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {mergeConflict && (
          <Alert>
            <Merge className="size-4" />
            <AlertDescription className="space-y-3">
              <p>
                This Telegram channel is already connected to an existing
                account with data. Would you like to merge that account&apos;s
                data (profiles, bank accounts, investments) into your current
                setup?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={handleMerge}
                  disabled={isMerging}
                >
                  {isMerging ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Merge & Continue
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMergeConflict(null)
                    setTelegramChatId("")
                  }}
                  disabled={isMerging}
                >
                  Use Different Chat ID
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    setMergeConflict(null)
                    setIsLoading(true)
                    try {
                      const res = await fetch("/api/onboarding/telegram", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ telegramChatId: "" }),
                      })
                      if (!res.ok) throw new Error("Failed to save")
                      toast.success("Telegram skipped for now")
                      router.push(pathWithMode("/onboarding/reminders", mode))
                    } catch {
                      toast.error("Something went wrong")
                    } finally {
                      setIsLoading(false)
                    }
                  }}
                  disabled={isMerging}
                >
                  Skip Telegram
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <MethodSection
            title="Method A — @chatIDrobot (easiest)"
            defaultOpen
          >
            <ol className="list-inside list-decimal space-y-1">
              <li>Create a Telegram group</li>
              <li>Add @chatIDrobot to the group</li>
              <li>Send any message — bot replies with chat ID</li>
              <li>Copy and paste the ID below</li>
              <li>Remove @chatIDrobot from the group</li>
            </ol>
          </MethodSection>

          <MethodSection title="Method B — Telegram Web">
            <ol className="list-inside list-decimal space-y-1">
              <li>Open web.telegram.org/a and log in</li>
              <li>Open your group — URL shows ID in hash</li>
              <li>Replace #- with -100</li>
            </ol>
          </MethodSection>

          <MethodSection title="Method C — Message link">
            <ol className="list-inside list-decimal space-y-1">
              <li>Right-click message → Copy Message Link</li>
              <li>Take number after /c/ and prepend -100</li>
            </ol>
          </MethodSection>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="chat-id">Chat ID</Label>
          <div className="flex gap-2">
            <Input
              id="chat-id"
              placeholder="e.g. -1001234567890"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={testConnection}
              disabled={!telegramChatId.trim() || testStatus === "loading"}
            >
              {testStatus === "loading" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Test"
              )}
            </Button>
          </div>
          {testStatus === "success" && (
            <p className="flex items-center gap-1.5 text-xs text-green-600">
              <CheckCircle2 className="size-3.5" />
              {testMessage}
            </p>
          )}
          {testStatus === "error" && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <XCircle className="size-3.5" />
              {testMessage}
            </p>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.push(pathWithMode("/onboarding/banks", mode))}
          >
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <Button
            onClick={handleNext}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
            Next
            <ArrowRight data-icon="inline-end" />
          </Button>
          <Button
            variant="link"
            className="text-muted-foreground"
            onClick={async () => {
              setError(null)
              setIsLoading(true)
              try {
                const skipRes = await fetch("/api/onboarding/telegram", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ telegramChatId: "" }),
                })
                if (!skipRes.ok) {
                  const d = await skipRes.json().catch(() => ({}))
                  throw new Error(d.message ?? d.error ?? "Failed to save")
                }
                toast.success("Telegram skipped for now")
                router.push(pathWithMode("/onboarding/reminders", mode))
              } catch (err) {
                const msg = err instanceof Error ? err.message : "Something went wrong"
                setError(msg)
                toast.error(msg)
              } finally {
                setIsLoading(false)
              }
            }}
            disabled={isLoading}
          >
            Skip for now
          </Button>
          <Button
            variant="link"
            className="ml-auto text-muted-foreground"
            onClick={skipOnboarding}
          >
            Skip setup
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
