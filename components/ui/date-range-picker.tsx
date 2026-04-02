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
import { type DateRange } from "react-day-picker"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface DateRangePickerProps {
  value?: DateRange
  onChange?: (range: DateRange | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = "Pick a date range",
  disabled = false,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)
  const defaultDisplayMonth = React.useMemo(
    () => value?.from ?? new Date(),
    [value?.from]
  )
  const [displayMonth, setDisplayMonth] = React.useState(defaultDisplayMonth)

  React.useEffect(() => {
    if (open) setDisplayMonth(defaultDisplayMonth)
  }, [open, defaultDisplayMonth])

  const displayValue = React.useMemo(() => {
    if (!value?.from) return placeholder
    if (value.to && value.from.getTime() !== value.to.getTime()) {
      return `${format(value.from, "MMM d, yyyy")} – ${format(value.to, "MMM d, yyyy")}`
    }
    return format(value.from, "MMM d, yyyy")
  }, [value, placeholder])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value?.from && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {displayValue}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto max-w-none p-0 overflow-visible"
        align="start"
        avoidCollisions={false}
      >
        <Calendar
          mode="range"
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          selected={value}
          onSelect={onChange}
          numberOfMonths={2}
          captionLayout="dropdown"
          startMonth={new Date(1900, 0)}
          endMonth={new Date()}
          disabled={(date) =>
            date > new Date() || date < new Date("1900-01-01")
          }
          className="rounded-lg border"
        />
      </PopoverContent>
    </Popover>
  )
}
