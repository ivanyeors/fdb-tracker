"use client"

import * as React from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"

const BIRTH_YEARS = Array.from({ length: 71 }, (_, i) => 2010 - i)
const PLACEHOLDER_VALUE = "__none__"

interface BirthDatePickerProps {
  readonly value: number | null
  readonly onChange: (year: number | null) => void
  readonly id?: string
  readonly placeholder?: string
  readonly disabled?: boolean
  readonly "aria-invalid"?: boolean
  readonly className?: string
}

export function BirthDatePicker({
  value,
  onChange,
  id,
  placeholder = "Select birth year",
  disabled = false,
  "aria-invalid": ariaInvalid,
  className,
}: BirthDatePickerProps) {
  const stringValue = value == null ? PLACEHOLDER_VALUE : value.toString()

  return (
    <Select
      value={stringValue}
      onValueChange={(v) =>
        onChange(v && v !== PLACEHOLDER_VALUE ? Number(v) : null)
      }
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-invalid={ariaInvalid}
        className={cn(
          "w-full justify-start text-left font-normal",
          value == null && "text-muted-foreground",
          className
        )}
      >
        <CalendarIcon className="mr-2 size-4 shrink-0" />
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent align="start">
        <SelectItem value={PLACEHOLDER_VALUE}>{placeholder}</SelectItem>
        {BIRTH_YEARS.map((year) => (
          <SelectItem key={year} value={year.toString()}>
            {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
