"use client"

import * as React from "react"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface ScheduleDatePickerProps {
  readonly dayOfMonth: number
  readonly monthOfYear: number | null
  readonly onChange: (day: number, month: number | null) => void
  readonly showMonth: boolean
  readonly id?: string
  readonly className?: string
}

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function ScheduleDatePicker({
  dayOfMonth,
  monthOfYear,
  onChange,
  showMonth,
  id,
  className,
}: ScheduleDatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const now = new Date()
  const year = now.getFullYear()
  const monthIndex = showMonth && monthOfYear != null ? monthOfYear - 1 : now.getMonth()
  const lastDay = getLastDayOfMonth(year, monthIndex + 1)
  const clampedDay = Math.min(Math.max(1, dayOfMonth), lastDay)

  const selectedDate = React.useMemo(() => {
    return new Date(year, monthIndex, clampedDay)
  }, [year, monthIndex, clampedDay])

  const [displayMonth, setDisplayMonth] = React.useState(selectedDate)

  React.useEffect(() => {
    if (open) setDisplayMonth(selectedDate)
  }, [open, selectedDate])

  const displayValue = showMonth
    ? format(selectedDate, "MMM d")
    : `Day ${dayOfMonth}`

  function handleSelect(date: Date | undefined) {
    if (!date) return
    const day = date.getDate()
    const month = showMonth ? date.getMonth() + 1 : null
    onChange(day, month)
    setOpen(false)
  }

  const startMonth = new Date(year, 0, 1)
  const endMonth = new Date(year, 11, 31)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            className
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {displayValue}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 overflow-visible" align="start">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={selectedDate}
          onSelect={handleSelect}
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          startMonth={startMonth}
          endMonth={endMonth}
          numberOfMonths={1}
          className="rounded-lg border"
        />
      </PopoverContent>
    </Popover>
  )
}
