"use client"

import { useActionState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { updateHouseholdNotifications } from "../actions"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

type HouseholdNotifications = {
  telegram_bot_token: string | null
  telegram_chat_id: string | null
}

export function NotificationSettingsForm({ data }: { data: HouseholdNotifications }) {
  const [state, action, isPending] = useActionState(updateHouseholdNotifications, {
    success: false,
    error: undefined,
  })

  useEffect(() => {
    if (state.success) {
      toast.success("Notification settings updated successfully")
    } else if (state.error) {
      toast.error(state.error)
    }
  }, [state])

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
              id="telegramChatId"
              name="telegramChatId"
              placeholder="e.g. 123456789 or -100123456789"
              defaultValue={data.telegram_chat_id ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              The internal ID of the user or group where the bot will send messages.
            </p>
          </div>
          
          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
