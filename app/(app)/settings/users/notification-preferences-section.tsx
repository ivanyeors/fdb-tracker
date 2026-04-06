"use client"

import { useState, useTransition, useCallback } from "react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  updateNotificationPreference,
  type NotificationType,
} from "@/app/(app)/settings/actions"
import type {
  NotificationPref,
  DefaultSchedule,
} from "./user-settings-form"
import { toast } from "sonner"
import { Clock, ChevronDown, ChevronUp } from "lucide-react"

type Props = {
  profileId: string
  preferences: NotificationPref[]
  defaultSchedules: DefaultSchedule[]
}

const NOTIFICATION_CONFIG: {
  type: NotificationType
  label: string
  description: string
  frequency: "Monthly" | "Yearly" | "Weekly"
  promptType: string
  promptFrequency: string
}[] = [
  {
    type: "end_of_month",
    label: "End-of-month update",
    description: "Prompts to update monthly finances",
    frequency: "Monthly",
    promptType: "end_of_month",
    promptFrequency: "monthly",
  },
  {
    type: "income_monthly",
    label: "Income confirmation",
    description: "Confirms monthly income entry",
    frequency: "Monthly",
    promptType: "income",
    promptFrequency: "monthly",
  },
  {
    type: "insurance_monthly",
    label: "Insurance premiums due",
    description: "Lists active monthly premiums",
    frequency: "Monthly",
    promptType: "insurance",
    promptFrequency: "monthly",
  },
  {
    type: "income_yearly",
    label: "Salary review",
    description: "Reminds to update annual salary",
    frequency: "Yearly",
    promptType: "income",
    promptFrequency: "yearly",
  },
  {
    type: "insurance_yearly",
    label: "Insurance review",
    description: "Review and update insurance policies",
    frequency: "Yearly",
    promptType: "insurance",
    promptFrequency: "yearly",
  },
  {
    type: "tax_yearly",
    label: "Tax assessment",
    description: "Tax calculation and NOA upload prompt",
    frequency: "Yearly",
    promptType: "tax",
    promptFrequency: "yearly",
  },
  {
    type: "seasonality_weekly",
    label: "Market seasonality digest",
    description: "Weekly risk and opportunity events",
    frequency: "Weekly",
    promptType: "seasonality_weekly",
    promptFrequency: "weekly",
  },
]

const HOURS = Array.from({ length: 24 }, (_, i) =>
  `${String(i).padStart(2, "0")}:00`
)

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1)

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
]

type LocalPref = {
  enabled: boolean
  useDefault: boolean
  dayOfMonth: number | null
  monthOfYear: number | null
  time: string | null
}

function getDefaultSchedule(
  config: (typeof NOTIFICATION_CONFIG)[number],
  defaultSchedules: DefaultSchedule[]
): DefaultSchedule | undefined {
  return defaultSchedules.find(
    (s) =>
      s.prompt_type === config.promptType &&
      s.frequency === config.promptFrequency
  )
}

function formatScheduleLabel(
  day: number | null,
  month: number | null,
  time: string | null,
  frequency: string
): string {
  const parts: string[] = []
  if (frequency === "Yearly" && month) {
    parts.push(MONTHS.find((m) => m.value === month)?.label ?? "")
  }
  if (day) {
    parts.push(`day ${day}`)
  }
  if (time) {
    parts.push(`at ${time}`)
  }
  return parts.length > 0 ? parts.join(", ") : "Not scheduled"
}

export function NotificationPreferencesSection({
  profileId,
  preferences,
  defaultSchedules,
}: Props) {
  const prefMap = new Map(
    preferences.map((p) => [p.notification_type, p])
  )

  const [localState, setLocalState] = useState<Record<string, LocalPref>>(
    () => {
      const state: Record<string, LocalPref> = {}
      for (const config of NOTIFICATION_CONFIG) {
        const pref = prefMap.get(config.type)
        const hasCustomSchedule =
          pref &&
          (pref.day_of_month !== null ||
            pref.time !== null ||
            pref.month_of_year !== null)
        state[config.type] = {
          enabled: pref?.enabled ?? true,
          useDefault: !hasCustomSchedule,
          dayOfMonth: pref?.day_of_month ?? null,
          monthOfYear: pref?.month_of_year ?? null,
          time: pref?.time ?? null,
        }
      }
      return state
    }
  )

  const [expandedType, setExpandedType] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const enabledCount = Object.values(localState).filter(
    (s) => s.enabled
  ).length

  const save = useCallback(
    (type: NotificationType, pref: LocalPref) => {
      startTransition(async () => {
        const schedule = pref.useDefault
          ? {
              dayOfMonth: null,
              monthOfYear: null,
              time: null,
              timezone: null,
            }
          : {
              dayOfMonth: pref.dayOfMonth,
              monthOfYear: pref.monthOfYear,
              time: pref.time,
              timezone: "Asia/Singapore",
            }
        const result = await updateNotificationPreference(
          profileId,
          type,
          pref.enabled,
          schedule
        )
        if (result.error) {
          toast.error(result.error)
        }
      })
    },
    [profileId]
  )

  function handleToggle(type: NotificationType, checked: boolean) {
    const prev = localState[type]!
    const next = { ...prev, enabled: checked }
    setLocalState((s) => ({ ...s, [type]: next }))
    save(type, next)
  }

  function handleUseDefault(type: NotificationType, useDefault: boolean) {
    const prev = localState[type]!
    const next = { ...prev, useDefault }
    if (useDefault) {
      next.dayOfMonth = null
      next.monthOfYear = null
      next.time = null
    } else {
      // Pre-fill from default schedule
      const config = NOTIFICATION_CONFIG.find((c) => c.type === type)!
      const defaultSched = getDefaultSchedule(config, defaultSchedules)
      if (defaultSched) {
        next.dayOfMonth = defaultSched.day_of_month
        next.monthOfYear = defaultSched.month_of_year
        next.time = defaultSched.time
      }
    }
    setLocalState((s) => ({ ...s, [type]: next }))
    save(type, next)
  }

  function handleScheduleChange(
    type: NotificationType,
    field: "dayOfMonth" | "monthOfYear" | "time",
    value: number | string | null
  ) {
    const prev = localState[type]!
    const next = { ...prev, [field]: value }
    setLocalState((s) => ({ ...s, [type]: next }))
    save(type, next)
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
        Choose which Telegram reminders this profile receives and when.
      </p>

      {(Object.entries(grouped) as [string, typeof NOTIFICATION_CONFIG][]).map(
        ([group, items]) => (
          <div key={group} className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {group}
            </p>
            {items.map((config) => {
              const pref = localState[config.type]!
              const isExpanded = expandedType === config.type
              const defaultSched = getDefaultSchedule(
                config,
                defaultSchedules
              )
              const showSchedule =
                config.frequency !== "Weekly" && pref.enabled
              const effectiveDay = pref.useDefault
                ? defaultSched?.day_of_month ?? null
                : pref.dayOfMonth
              const effectiveMonth = pref.useDefault
                ? defaultSched?.month_of_year ?? null
                : pref.monthOfYear
              const effectiveTime = pref.useDefault
                ? defaultSched?.time ?? null
                : pref.time

              return (
                <div
                  key={config.type}
                  className="rounded-lg border"
                >
                  <div className="flex items-center justify-between gap-4 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`notif-${profileId}-${config.type}`}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {config.label}
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {config.description}
                      </p>
                      {showSchedule && pref.enabled && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          <span>
                            {pref.useDefault ? "Default: " : "Custom: "}
                            {formatScheduleLabel(
                              effectiveDay,
                              effectiveMonth,
                              effectiveTime,
                              config.frequency
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {showSchedule && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            setExpandedType(isExpanded ? null : config.type)
                          }
                        >
                          {isExpanded ? (
                            <ChevronUp className="size-4" />
                          ) : (
                            <ChevronDown className="size-4" />
                          )}
                        </Button>
                      )}
                      <Switch
                        id={`notif-${profileId}-${config.type}`}
                        checked={pref.enabled}
                        onCheckedChange={(checked) =>
                          handleToggle(config.type, checked)
                        }
                        disabled={isPending}
                      />
                    </div>
                  </div>

                  {isExpanded && showSchedule && (
                    <div className="border-t px-3 py-3 space-y-3 bg-muted/30">
                      <div className="flex items-center gap-3">
                        <Switch
                          id={`default-${profileId}-${config.type}`}
                          checked={pref.useDefault}
                          onCheckedChange={(checked) =>
                            handleUseDefault(config.type, checked)
                          }
                          disabled={isPending}
                        />
                        <Label
                          htmlFor={`default-${profileId}-${config.type}`}
                          className="text-sm cursor-pointer"
                        >
                          Use default schedule
                        </Label>
                        {pref.useDefault && defaultSched && (
                          <span className="text-xs text-muted-foreground">
                            (
                            {formatScheduleLabel(
                              defaultSched.day_of_month,
                              defaultSched.month_of_year,
                              defaultSched.time,
                              config.frequency
                            )}
                            )
                          </span>
                        )}
                        {pref.useDefault && !defaultSched && (
                          <span className="text-xs text-muted-foreground">
                            (no family schedule configured)
                          </span>
                        )}
                      </div>

                      {!pref.useDefault && (
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              Day of month
                            </Label>
                            <Select
                              value={
                                pref.dayOfMonth
                                  ? String(pref.dayOfMonth)
                                  : "any"
                              }
                              onValueChange={(v) =>
                                handleScheduleChange(
                                  config.type,
                                  "dayOfMonth",
                                  v === "any" ? null : Number(v)
                                )
                              }
                              disabled={isPending}
                            >
                              <SelectTrigger className="w-[100px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="any">Any</SelectItem>
                                {DAYS_OF_MONTH.map((d) => (
                                  <SelectItem key={d} value={String(d)}>
                                    {d}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {config.frequency === "Yearly" && (
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">
                                Month
                              </Label>
                              <Select
                                value={
                                  pref.monthOfYear
                                    ? String(pref.monthOfYear)
                                    : "any"
                                }
                                onValueChange={(v) =>
                                  handleScheduleChange(
                                    config.type,
                                    "monthOfYear",
                                    v === "any" ? null : Number(v)
                                  )
                                }
                                disabled={isPending}
                              >
                                <SelectTrigger className="w-[130px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="any">Any</SelectItem>
                                  {MONTHS.map((m) => (
                                    <SelectItem
                                      key={m.value}
                                      value={String(m.value)}
                                    >
                                      {m.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              Time
                            </Label>
                            <Select
                              value={pref.time ?? "any"}
                              onValueChange={(v) =>
                                handleScheduleChange(
                                  config.type,
                                  "time",
                                  v === "any" ? null : v
                                )
                              }
                              disabled={isPending}
                            >
                              <SelectTrigger className="w-[100px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="any">Any</SelectItem>
                                {HOURS.map((h) => (
                                  <SelectItem key={h} value={h}>
                                    {h}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
