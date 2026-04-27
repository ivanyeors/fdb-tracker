"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { updateHouseholdNotifications } from "../actions"
import { toast } from "sonner"
import { CheckCircle2, CircleX, Loader2 } from "lucide-react"

type HouseholdNotifications = {
  telegram_bot_token: string | null
  telegram_chat_id: string | null
}

export function NotificationSettingsForm({ data }: { readonly data: HouseholdNotifications }) {
  const [state, action, isPending] = useActionState(updateHouseholdNotifications, {
    success: false,
    error: undefined,
  })
  const [isTesting, setIsTesting] = useState(false)
  const [testStatus, setTestStatus] = useState<"idle" | "success" | "error">("idle")
  const [testMessage, setTestMessage] = useState("")
  const botTokenRef = useRef<HTMLInputElement>(null)
  const chatIdRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state.success) {
      toast.success("Notification settings updated successfully")
    } else if (state.error) {
      toast.error(state.error)
    }
  }, [state])

  async function handleTestConnection() {
    const botToken = botTokenRef.current?.value?.trim()
    const chatId = chatIdRef.current?.value?.trim()
    if (!botToken || !chatId) {
      setTestStatus("error")
      setTestMessage("Enter Bot Token and Chat ID first")
      return
    }
    setIsTesting(true)
    setTestStatus("idle")
    setTestMessage("")
    try {
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramBotToken: botToken, telegramChatId: chatId }),
      })
      const json = await res.json()
      if (json.success) {
        setTestStatus("success")
        setTestMessage("Test message sent! Check your Telegram group or channel.")
        toast.success("Connection successful")
      } else {
        setTestStatus("error")
        setTestMessage(json.error ?? "Test failed")
        toast.error(json.error ?? "Test failed")
      }
    } catch {
      setTestStatus("error")
      setTestMessage("Could not reach server")
      toast.error("Could not reach server")
    } finally {
      setIsTesting(false)
    }
  }


  return (
    <Card>
      <CardHeader>
        <CardTitle>Telegram Notifications</CardTitle>
        <CardDescription>
          Configure your Telegram bot to receive daily/monthly summaries and use the bot for tracking.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="telegramBotToken">Bot Token</Label>
            <Input
              ref={botTokenRef}
              id="telegramBotToken"
              name="telegramBotToken"
              type="password"
              placeholder="1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ"
              defaultValue={data.telegram_bot_token ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              Obtain this by chatting with @BotFather on Telegram.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="telegramChatId">Chat ID</Label>
            <Input
              ref={chatIdRef}
              id="telegramChatId"
              name="telegramChatId"
              placeholder="e.g. -100123456789 for groups"
              defaultValue={data.telegram_chat_id ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              Same format for groups and channels (e.g. -1001234567890).
            </p>
          </div>

          <Alert>
            <AlertTitle>Groups & channels</AlertTitle>
            <AlertDescription>
              <ul className="mt-2 list-inside list-disc space-y-1">
                <li>
                  <strong>Groups:</strong> Add @chatIDrobot, send a message to get the ID, then remove the bot.
                </li>
                <li>
                  <strong>Channels:</strong> Add your bot as an <strong>administrator</strong> with permission to post messages. Get the channel ID the same way (e.g. forward a channel message to @userinfobot).
                </li>
              </ul>
            </AlertDescription>
          </Alert>
          
          <div className="space-y-4 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isTesting}
                onClick={handleTestConnection}
              >
                {isTesting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Test Connection
              </Button>
            </div>
            {testStatus === "success" && (
              <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                <CheckCircle2 className="size-4 shrink-0" />
                {testMessage}
              </div>
            )}
            {testStatus === "error" && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <CircleX className="size-4 shrink-0" />
                {testMessage}
              </div>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
