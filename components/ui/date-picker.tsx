"use client"

import * as React from "react"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { format, parseISO } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface DatePickerProps {
  value: string | null
  onChange: (date: string | null) => void
  id?: string
  placeholder?: string
  disabled?: boolean
  minDate?: Date
  maxDate?: Date
  className?: string
}

export function DatePicker({
  value,
  onChange,
  id,
  placeholder = "Select date",
  disabled = false,
  minDate,
  maxDate,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  const selectedDate = React.useMemo(() => {
    if (!value) return undefined
    try {
      return parseISO(value)
    } catch {
      return undefined
    }
  }, [value])

  const defaultDisplayMonth = React.useMemo(
    () => selectedDate ?? new Date(),
    [selectedDate]
  )
  const [displayMonth, setDisplayMonth] = React.useState(defaultDisplayMonth)

  React.useEffect(() => {
    if (open) setDisplayMonth(defaultDisplayMonth)
  }, [open, defaultDisplayMonth])

  const displayValue = selectedDate
    ? format(selectedDate, "MMM d, yyyy")
    : placeholder

  function handleSelect(date: Date | undefined) {
    if (!date) {
      onChange(null)
      return
    }
    onChange(format(date, "yyyy-MM-dd"))
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
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
          startMonth={minDate ?? new Date(1900, 0)}
          endMonth={maxDate ?? new Date(new Date().getFullYear() + 10, 11)}
          disabled={(date) => {
            if (minDate && date < minDate) return true
            if (maxDate && date > maxDate) return true
            return false
          }}
          className="rounded-lg border"
        />
      </PopoverContent>
    </Popover>
  )
}
