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
import { useOnboarding } from "@/components/onboarding/onboarding-provider"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Loader2,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface MethodSectionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
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
  const { telegramChatId, setTelegramChatId } = useOnboarding()
  const [testStatus, setTestStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle")
  const [testMessage, setTestMessage] = useState("")

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
      } else {
        setTestStatus("error")
        setTestMessage(data.error ?? "Connection failed")
      }
    } catch {
      setTestStatus("error")
      setTestMessage("Network error — could not reach server")
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
        <div className="space-y-3">
          <MethodSection
            title="Method A — @chatIDrobot (easiest)"
            defaultOpen
          >
            <ol className="list-inside list-decimal space-y-1">
              <li>Create a Telegram group for your household</li>
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

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.push("/onboarding/banks")}
          >
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <Button onClick={() => router.push("/onboarding/reminders")}>
            Next
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
