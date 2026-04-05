"use client"

import { useState, useTransition } from "react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  updateNotificationPreference,
  type NotificationType,
} from "@/app/(app)/settings/actions"
import { toast } from "sonner"

type NotificationPreference = {
  notification_type: string
  enabled: boolean
}

type Props = {
  profileId: string
  preferences: NotificationPreference[]
}

const NOTIFICATION_CONFIG: {
  type: NotificationType
  label: string
  description: string
  frequency: "Monthly" | "Yearly" | "Weekly"
}[] = [
  {
    type: "end_of_month",
    label: "End-of-month update",
    description: "Prompts to update monthly finances",
    frequency: "Monthly",
  },
  {
    type: "income_monthly",
    label: "Income confirmation",
    description: "Confirms monthly income entry",
    frequency: "Monthly",
  },
  {
    type: "insurance_monthly",
    label: "Insurance premiums due",
    description: "Lists active monthly premiums",
    frequency: "Monthly",
  },
  {
    type: "income_yearly",
    label: "Salary review",
    description: "Reminds to update annual salary",
    frequency: "Yearly",
  },
  {
    type: "insurance_yearly",
    label: "Insurance review",
    description: "Review and update insurance policies",
    frequency: "Yearly",
  },
  {
    type: "tax_yearly",
    label: "Tax assessment",
    description: "Tax calculation and NOA upload prompt",
    frequency: "Yearly",
  },
  {
    type: "seasonality_weekly",
    label: "Market seasonality digest",
    description: "Weekly risk and opportunity events",
    frequency: "Weekly",
  },
]

export function NotificationPreferencesSection({
  profileId,
  preferences,
}: Props) {
  const prefMap = new Map(
    preferences.map((p) => [p.notification_type, p.enabled])
  )

  const [localState, setLocalState] = useState<Record<string, boolean>>(() => {
    const state: Record<string, boolean> = {}
    for (const config of NOTIFICATION_CONFIG) {
      state[config.type] = prefMap.get(config.type) ?? true
    }
    return state
  })

  const [isPending, startTransition] = useTransition()

  const enabledCount = Object.values(localState).filter(Boolean).length

  function handleToggle(type: NotificationType, checked: boolean) {
    const previousValue = localState[type]
    setLocalState((prev) => ({ ...prev, [type]: checked }))

    startTransition(async () => {
      const result = await updateNotificationPreference(
        profileId,
        type,
        checked
      )
      if (result.error) {
        setLocalState((prev) => ({ ...prev, [type]: previousValue! }))
        toast.error(result.error)
      }
    })
  }

  const grouped = {
    Monthly: NOTIFICATION_CONFIG.filter((c) => c.frequency === "Monthly"),
    Yearly: NOTIFICATION_CONFIG.filter((c) => c.frequency === "Yearly"),
    Weekly: NOTIFICATION_CONFIG.filter((c) => c.frequency === "Weekly"),
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium">Notifications</h4>
        <Badge variant="secondary" className="text-xs">
          {enabledCount} of {NOTIFICATION_CONFIG.length} enabled
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Choose which Telegram reminders this profile receives.
      </p>

      {(Object.entries(grouped) as [string, typeof NOTIFICATION_CONFIG][]).map(
        ([group, items]) => (
          <div key={group} className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {group}
            </p>
            {items.map((config) => (
              <div
                key={config.type}
                className="flex items-center justify-between gap-4 rounded-lg border p-3"
              >
                <div className="space-y-0.5">
                  <Label
                    htmlFor={`notif-${profileId}-${config.type}`}
                    className="text-sm font-medium cursor-pointer"
                  >
                    {config.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {config.description}
                  </p>
                </div>
                <Switch
                  id={`notif-${profileId}-${config.type}`}
                  checked={localState[config.type]}
                  onCheckedChange={(checked) =>
                    handleToggle(config.type, checked)
                  }
                  disabled={isPending}
                />
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
