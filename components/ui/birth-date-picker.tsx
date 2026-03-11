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

interface BirthDatePickerProps {
  value: number | null
  onChange: (year: number | null) => void
  id?: string
  placeholder?: string
  disabled?: boolean
  "aria-invalid"?: boolean
  className?: string
}

export function BirthDatePicker({
  value,
  onChange,
  id,
  placeholder = "Select birth date",
  disabled = false,
  "aria-invalid": ariaInvalid,
  className,
}: BirthDatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(
    () => (value != null ? new Date(value, 0, 1) : undefined)
  )

  React.useEffect(() => {
    setSelectedDate(value != null ? new Date(value, 0, 1) : undefined)
  }, [value])

  const defaultDisplayMonth = React.useMemo(
    () => selectedDate ?? new Date(1990, 0),
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
      setSelectedDate(undefined)
      return
    }
    setSelectedDate(date)
    onChange(date.getFullYear())
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          disabled={disabled}
          aria-invalid={ariaInvalid}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selectedDate && "text-muted-foreground",
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
          startMonth={new Date(1940, 0)}
          endMonth={new Date(2010, 11)}
          hideNavigation
          navLayout="after"
          disabled={(date) => {
            const y = date.getFullYear()
            return y < 1940 || y > 2010
          }}
          className="rounded-lg border"
        />
      </PopoverContent>
    </Popover>
  )
}
