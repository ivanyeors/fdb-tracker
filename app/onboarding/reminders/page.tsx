"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScheduleDatePicker } from "@/components/ui/schedule-date-picker"
import { ButtonSelect } from "@/components/ui/button-select"
import {
  useOnboarding,
  pathWithMode,
  type PromptScheduleConfig,
} from "@/components/onboarding/onboarding-provider"
import { ArrowLeft, ArrowRight, Clock2Icon, Loader2 } from "lucide-react"
import { toast } from "sonner"

const PROMPT_LABELS: Record<PromptScheduleConfig["prompt_type"], string> = {
  end_of_month: "End of Month",
  income: "Income Update",
  insurance: "Insurance Update",
  tax: "Tax",
}

export default function RemindersPage() {
  const router = useRouter()
  const { mode, promptSchedule, setPromptSchedule, familyId, skipOnboarding } = useOnboarding()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    setPromptSchedule((prev) => prev.map((s) => ({ ...s, timezone: tz })))
  }, [setPromptSchedule])

  function updateSchedule(
    index: number,
    field: keyof PromptScheduleConfig,
    value: string,
  ) {
    setPromptSchedule((prev) => {
      const updated = [...prev]
      if (field === "day_of_month") {
        updated[index] = { ...updated[index], day_of_month: Number(value) }
      } else if (field === "month_of_year") {
        updated[index] = {
          ...updated[index],
          month_of_year: value === "" ? null : Number(value),
        }
      } else if (field === "frequency") {
        updated[index] = {
          ...updated[index],
          frequency: value as PromptScheduleConfig["frequency"],
        }
      } else {
        updated[index] = { ...updated[index], [field]: value }
      }
      return updated
    })
  }

  function updateScheduleDate(
    index: number,
    day: number,
    month: number | null,
  ) {
    setPromptSchedule((prev) => {
      const updated = [...prev]
      updated[index] = {
        ...updated[index],
        day_of_month: day,
        month_of_year: month,
      }
      return updated
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reminder Schedule</CardTitle>
        <CardDescription>
          Configure when you&apos;d like to receive prompts for each category.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {promptSchedule.map((schedule, i) => {
          const isYearlyOnly = schedule.prompt_type === "tax"
          const showMonth =
            schedule.frequency === "yearly" || isYearlyOnly

          return (
            <div key={schedule.prompt_type} className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-medium">
                {PROMPT_LABELS[schedule.prompt_type]}
              </p>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {!isYearlyOnly && (
                  <div className="space-y-1.5">
                    <Label htmlFor={`freq-${i}`}>Frequency</Label>
                    <ButtonSelect
                      value={schedule.frequency}
                      onValueChange={(v) => updateSchedule(i, "frequency", v)}
                      options={[
                        { value: "monthly", label: "Monthly" },
                        { value: "yearly", label: "Yearly" },
                      ]}
                    />
                  </div>
                )}

                {isYearlyOnly && (
                  <div className="space-y-1.5">
                    <Label>Frequency</Label>
                    <Input value="Yearly" disabled />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor={`schedule-date-${i}`}>
                    {showMonth ? "Date" : "Day"}
                  </Label>
                  <ScheduleDatePicker
                    dayOfMonth={schedule.day_of_month}
                    monthOfYear={schedule.month_of_year}
                    onChange={(day, month) =>
                      updateScheduleDate(i, day, month)
                    }
                    showMonth={showMonth}
                    id={`schedule-date-${i}`}
                  />
                </div>

                <Field className="space-y-1.5">
                  <FieldLabel htmlFor={`time-${i}`}>Time</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id={`time-${i}`}
                      type="time"
                      step="1"
                      value={schedule.time}
                      onChange={(e) =>
                        updateSchedule(i, "time", e.target.value)
                      }
                      className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                    />
                    <InputGroupAddon>
                      <Clock2Icon className="text-muted-foreground" />
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
              </div>
            </div>
          )
        })}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => router.push(pathWithMode("/onboarding/telegram", mode))}
          >
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <Button
            onClick={async () => {
              setError(null)
              setIsLoading(true)
              try {
                const res = await fetch("/api/onboarding/reminders", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ mode, familyId, promptSchedule }),
                })
                const data = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(data.message ?? data.error ?? "Failed to save")
                toast.success("Reminder schedule saved")
                router.push(pathWithMode("/onboarding/investments", mode))
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
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : null}
            Next
            <ArrowRight data-icon="inline-end" />
          </Button>
          <Button
            variant="link"
            className="ml-auto text-muted-foreground"
            onClick={skipOnboarding}
          >
            Skip for now
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
