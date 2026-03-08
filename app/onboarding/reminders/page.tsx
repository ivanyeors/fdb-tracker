"use client"

import { useRouter } from "next/navigation"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  useOnboarding,
  type PromptScheduleConfig,
} from "@/components/onboarding/onboarding-provider"
import { ArrowLeft, ArrowRight } from "lucide-react"

const PROMPT_LABELS: Record<PromptScheduleConfig["prompt_type"], string> = {
  end_of_month: "End of Month",
  income: "Income Update",
  insurance: "Insurance Update",
  tax: "Tax",
}

const TIMEZONES = [
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "UTC",
] as const

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
] as const

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1)

export default function RemindersPage() {
  const router = useRouter()
  const { promptSchedule, setPromptSchedule } = useOnboarding()

  function updateSchedule(
    index: number,
    field: keyof PromptScheduleConfig,
    value: string,
  ) {
    const updated = [...promptSchedule]
    if (field === "day_of_month" || field === "month_of_year") {
      updated[index] = { ...updated[index], [field]: Number(value) }
    } else if (field === "frequency") {
      updated[index] = {
        ...updated[index],
        frequency: value as PromptScheduleConfig["frequency"],
      }
    } else {
      updated[index] = { ...updated[index], [field]: value }
    }
    setPromptSchedule(updated)
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
                    <Select
                      value={schedule.frequency}
                      onValueChange={(v) => updateSchedule(i, "frequency", v)}
                    >
                      <SelectTrigger id={`freq-${i}`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {isYearlyOnly && (
                  <div className="space-y-1.5">
                    <Label>Frequency</Label>
                    <Input value="Yearly" disabled />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor={`day-${i}`}>Day</Label>
                  <Select
                    value={schedule.day_of_month.toString()}
                    onValueChange={(v) =>
                      updateSchedule(i, "day_of_month", v)
                    }
                  >
                    <SelectTrigger id={`day-${i}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((d) => (
                        <SelectItem key={d} value={d.toString()}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {showMonth && (
                  <div className="space-y-1.5">
                    <Label htmlFor={`month-${i}`}>Month</Label>
                    <Select
                      value={(schedule.month_of_year ?? 1).toString()}
                      onValueChange={(v) =>
                        updateSchedule(i, "month_of_year", v)
                      }
                    >
                      <SelectTrigger id={`month-${i}`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor={`time-${i}`}>Time</Label>
                  <Input
                    id={`time-${i}`}
                    type="time"
                    value={schedule.time}
                    onChange={(e) =>
                      updateSchedule(i, "time", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`tz-${i}`}>Timezone</Label>
                  <Select
                    value={schedule.timezone}
                    onValueChange={(v) => updateSchedule(i, "timezone", v)}
                  >
                    <SelectTrigger id={`tz-${i}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )
        })}

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.push("/onboarding/telegram")}
          >
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <Button onClick={() => router.push("/onboarding/complete")}>
            Next
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
