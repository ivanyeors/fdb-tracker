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
  readonly value: string | null
  readonly onChange: (date: string | null) => void
  readonly id?: string
  readonly placeholder?: string
  readonly disabled?: boolean
  readonly minDate?: Date
  readonly maxDate?: Date
  /** Calendar end month when `maxDate` is not set (default: Dec 31 of current year + 50). */
  readonly endYearOffset?: number
  /** Show a typeable ISO field (YYYY-MM-DD) synced with the calendar on blur. */
  readonly showIsoInput?: boolean
  readonly className?: string
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

export function DatePicker({
  value,
  onChange,
  id,
  placeholder = "Select date",
  disabled = false,
  minDate,
  maxDate,
  endYearOffset = 50,
  showIsoInput = false,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [isoDraft, setIsoDraft] = React.useState(value ?? "")
  React.useEffect(() => {
    setIsoDraft(value ?? "")
  }, [value])

  const defaultEndMonth = React.useMemo(
    () => new Date(new Date().getFullYear() + endYearOffset, 11),
    [endYearOffset],
  )

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

  function commitIsoDraft() {
    const t = isoDraft.trim()
    if (t === "") {
      onChange(null)
      return
    }
    if (!ISO_RE.test(t)) return
    const parsed = parseISO(t)
    if (Number.isNaN(parsed.getTime())) return
    if (minDate && parsed < minDate) return
    const cap = maxDate ?? defaultEndMonth
    if (parsed > cap) return
    onChange(t)
  }

  return (
    <div className={cn("space-y-2", showIsoInput && "w-full")}>
      {showIsoInput ? (
        <input
          type="text"
          inputMode="numeric"
          placeholder="YYYY-MM-DD"
          disabled={disabled}
          value={isoDraft}
          onChange={(e) => setIsoDraft(e.target.value)}
          onBlur={() => commitIsoDraft()}
          className={cn(
            "border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none",
            "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            disabled && "cursor-not-allowed opacity-50",
          )}
          aria-label="Date as YYYY-MM-DD"
        />
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start text-left font-normal",
              !value && "text-muted-foreground",
              className,
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
            endMonth={maxDate ?? defaultEndMonth}
            disabled={(date) => {
              if (minDate && date < minDate) return true
              if (maxDate && date > maxDate) return true
              return false
            }}
            className="rounded-lg border"
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
