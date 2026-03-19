"use client"

import * as React from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { cn } from "@/lib/utils"

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan",
  "02": "Feb",
  "03": "Mar",
  "04": "Apr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Aug",
  "09": "Sep",
  "10": "Oct",
  "11": "Nov",
  "12": "Dec",
}

function formatMonthYear(monthStr: string): string {
  const [year, month] = monthStr.split("-")
  return `${MONTH_LABELS[month ?? ""] ?? month} ${year}`
}


interface MonthYearPickerProps {
  value: string | null
  onChange: (value: string | null) => void
  availableMonths?: string[]
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function MonthYearPicker({
  value,
  onChange,
  availableMonths,
  placeholder = "Select month",
  disabled = false,
  className,
}: MonthYearPickerProps) {
  const [open, setOpen] = React.useState(false)
  const [displayYear, setDisplayYear] = React.useState(() => {
    if (value) {
      const [y] = value.split("-")
      return parseInt(y ?? String(new Date().getFullYear()), 10)
    }
    return new Date().getFullYear()
  })

  React.useEffect(() => {
    if (open && value) {
      const [y] = value.split("-")
      setDisplayYear(parseInt(y ?? String(new Date().getFullYear()), 10))
    }
  }, [open, value])

  const { minYear, maxYear } = React.useMemo(() => {
    if (!availableMonths || availableMonths.length === 0) {
      const now = new Date()
      return {
        minYear: now.getFullYear() - 2,
        maxYear: now.getFullYear() + 1,
      }
    }
    const years = availableMonths.map((m) => parseInt(m.split("-")[0] ?? "0", 10))
    return {
      minYear: Math.min(...years),
      maxYear: Math.max(...years),
    }
  }, [availableMonths])

  const canGoPrev = displayYear > minYear
  const canGoNext = displayYear < maxYear

  const isMonthAvailable = React.useCallback(
    (year: number, month: number) => {
      const monthStr = `${year}-${String(month).padStart(2, "0")}-01`
      if (!availableMonths || availableMonths.length === 0) return true
      return availableMonths.includes(monthStr)
    },
    [availableMonths]
  )

  const handleMonthSelect = (year: number, month: number) => {
    const monthStr = `${year}-${String(month).padStart(2, "0")}-01`
    if (availableMonths && availableMonths.length > 0 && !availableMonths.includes(monthStr)) {
      return
    }
    onChange(monthStr)
    setOpen(false)
  }

  const displayValue = value ? formatMonthYear(value) : placeholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-[140px] justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{displayValue}</span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={!canGoPrev}
              onClick={() => setDisplayYear((y) => y - 1)}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <span className="min-w-[4rem] text-center text-sm font-medium">{displayYear}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={!canGoNext}
              onClick={() => setDisplayYear((y) => y + 1)}
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(Object.entries(MONTH_LABELS) as [string, string][]).map(([num, label]) => {
              const monthNum = parseInt(num, 10)
              const available = isMonthAvailable(displayYear, monthNum)
              const monthStr = `${displayYear}-${num}-01`
              const isSelected = value === monthStr
              return (
                <Button
                  key={num}
                  variant={isSelected ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!available}
                  onClick={() => handleMonthSelect(displayYear, monthNum)}
                >
                  {label}
                </Button>
              )
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
